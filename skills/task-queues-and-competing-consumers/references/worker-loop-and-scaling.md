# The worker loop, and what the pool scales on

## The loop

Three properties distinguish a correct competing-consumer loop from the naive one: the
concurrency permit is acquired **before** the fetch, the ack is after the side effect, and
shutdown stops the fetch before it stops the work.

Pseudocode for a pull consumer; receive/renew/ack operations are broker-specific:

```text
poller owns each permit until a handler explicitly accepts it
while intake is open:
  acquire one permit interruptibly
  try bounded receive of at most one delivery
  if receive fails or returns empty: release permit in finally; classify/back off; continue
  unknown receive outcome may leave a broker-side delivery hidden until recovery
  under lifecycle gate shared with shutdown:
    if intake closed: retain delivery for bounded return/recovery; release permit
    otherwise transfer delivery + permit only after successful handler submission
  on submission rejection: try bounded recovery; release permit exactly once in finally

handler owns accepted delivery + permit:
  start bounded, observable lease renewal where the broker supports it
  execute repeat-safe effect
  record effect success, then attempt ack/delete
  distinguish effect failure, ack failure/unknown outcome, and renewal cleanup failure
  do not issue a second nack just because cleanup failed after confirmed ack
  stop/join renewal and release permit in outer finally, even when recovery calls fail

shutdown:
  atomically close intake through lifecycle gate
  cancel/wake bounded receive and wait for poller exit; resolve any fetched delivery
  close handler submission and drain to a shared monotonic deadline
  at deadline request cooperative cancellation and stop renewal as policy requires
  report still-running handlers; recover unstarted deliveries through broker semantics
  release delivery early only with old-work overlap covered by the effect contract
```

Reserve one permit per delivered item for batch receive. For push consumers, align broker
credit/prefetch with bounded dispatch instead. Serialize ack on its owning channel/session where
the client requires it; JMS session-wide acknowledgement is not a per-message operation.

Why each line is the way it is:

- **`tryAcquire` before `receive`.** Fetching first and then blocking on a permit means the
  message is leased while it waits, and the lease clock is already running. The wait is inside
  the timeout budget rather than outside it.
- **`Semaphore`, not a bounded executor queue.** A bounded `ThreadPoolExecutor` queue also caps
  the work, but the messages sitting in it are leased and invisible to the broker: depth reads
  zero while the process holds a backlog. The permit leaves unclaimed work where the depth and
  age metrics can see it. Sizing the limit is `concurrency-limiting-and-bulkheads`.
- **Executor choice** follows the deployed baseline and work. Java 21+ virtual threads can
  suit blocking I/O but do not bound demand; platform pools remain valid. CPU-heavy work needs
  bounded execution; `thread-sizing-and-virtual-threads` owns that choice.
- **The drain budget** must be smaller than the platform's grace period, or the process is
  killed mid-handler with leases still running; `kubernetes-service-lifecycle` owns the
  arithmetic and the `preStop` ordering.

`shutdownNow()` requests interruption; handlers may continue and queued tasks may never start.
No-ack recovery depends on broker durability, retention, channel/lease state and DLQ policy.
An external effect may already have committed even when its acknowledgement outcome is unknown.

## The autoscaling signal

| Signal                                 | What it tracks                                           | Verdict                                              |
| -------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| **Oldest-message-age / time-in-queue** | Latency proxy; may be approximate/reset/poison-dominated | SLO signal; combine with backlog and rates           |
| Visible + in-flight depth              | Stock and hidden work                                    | Capacity/recovery input, not sufficient alone        |
| Arrival and successful drain rate      | Offered load and effective service                       | Predicts whether backlog grows and catch-up time     |
| Service-time distribution              | Per-item demand and task mix                             | Converts rate to required concurrency                |
| In-flight count vs safe limit          | Worker/downstream saturation                             | Prevents scaling beyond the dependency's capacity    |
| Worker CPU                             | CPU demand only                                          | Useful for CPU-bound tasks, misleading alone for I/O |

No single signal is a stable autoscaler. Age is denominated like the SLO, but can remain high
after capacity is added, disappear during redelivery, or reflect one poison message. Depth needs
arrival/drain rate to become catch-up time. Consequences:

- **Set the scaling target to a fraction of the deadline.** Items due within 60 s with a 5 s
  handler need a target well below 55 s — the controller needs room to add workers and for
  those workers to start.
- Alert on SLO age and **diagnose** with visible/in-flight depth, redelivery, extension count,
  accepted/completed rate and handler phase. Add scale-up prediction and cooldown/hysteresis;
  cap replicas at downstream capacity. Test the controller with step, burst, poison-item and
  dependency-slowdown traces to avoid oscillation or an overload feedback loop.

## Priority and ageing

Strict priority is a starvation machine: while high-priority arrivals sustain at or above
capacity, the low class is never served, and the queue's own metrics look healthy because the
high class drains fine. Bound it explicitly, and state the bound:

- **Ageing** — promote an item to the next class once its time-in-queue exceeds a stated
  threshold. This bounds promotion time only if the promotion mechanism runs promptly; actual
  service delay also needs bounded competing demand and reserved capacity. Inspect broker support.
- **Weighted shares** — dedicate a fraction of workers to each class (say 80/20). The low class
  receives a worker share, not necessarily 20% of item throughput: service costs and shared
  dependencies matter. Bound its admitted demand to establish a useful waiting-time guarantee.
- **Per-class observability** needs age/backlog/completion metrics by class. Separate queues/pools
  are one option; an instrumented shared priority queue can also expose them.

## Testing

Use isolated worker processes and test queues; never halt the test runner or an unapproved
production process. LocalStack emulates SQS and does not establish real SQS guarantees.

- **Kill a worker mid-lease.** Use a broker-specific fixture (RabbitMQ/Postgres container, SQS emulator,
  or authorized SQS test queue), stating its fidelity. Block the handler on a latch after its side
  effect but before the ack, then `Runtime.getRuntime().halt(1)` the worker. Assert redelivery
  through the configured visibility/channel/claim mechanism, using available redelivery evidence and **one** applied side effect
  downstream. That last assertion is what fails when the handler is not repeat-safe.
- **Overrun the lease deliberately.** In a visibility-based fixture, use timeout 2 s and a
  first handler held for 5 s; explicitly observe a second delivery and control its progress.
  Assert one durable outcome, not exactly two invocations. This is the duplicate-work window as a
  regression test — it fails the day someone adds an increment.

Also assert shutdown behaviour: send N messages, close the worker while they are in flight, and
reconcile logical IDs after bounded recovery across effects, visible/in-flight/delayed deliveries,
retry queues and DLQ. A temporarily invisible item is not proof of loss or premature ack.

Add broker-specific cases: partial batch-ack/visibility failures, stale receipt handle, duplicate
inside the nominal visibility period where the broker permits it, FIFO group head-of-line
blocking, extension outage, DLQ transfer and redrive under tenant quotas. Observe eventual state;
do not assert exactly one handler invocation when the contract only promises one durable effect.

Also inject receive exceptions, submission rejection, shutdown during receive, renewal failure,
ack-success followed by cleanup failure, and cancellation-resistant handlers. Assert no leaked
permit, no unowned delivery and no false claim of handler termination.
