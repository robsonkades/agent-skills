# The worker loop, and what the pool scales on

## The loop

This recipe reserves capacity **before** the fetch, acknowledges after a repeat-safe effect,
and stops intake before draining work. Other bounded intake mechanisms can be valid; choose
acknowledgement placement from the required loss/duplicate policy (`delivery-semantics`).

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
  stop/join renewal and release permit in the actual handler's outer finally
  do not release running-work capacity merely because its Future reports cancellation

shutdown:
  atomically close intake through lifecycle gate
  cancel/wake bounded receive and wait for poller exit; resolve any fetched delivery
  close handler submission and drain to a shared monotonic deadline
  at deadline request cooperative cancellation and stop renewal as policy requires
  report still-running handlers; recover unstarted deliveries through broker semantics
  release delivery early only with old-work overlap covered by the effect contract
```

The permit above counts local active work. An unknown receive or failed return can still leave
broker-side work outstanding after that permit is released. Track that uncertainty under a
separate finite recovery budget and pause further intake when the budget is exhausted; a
local permit count alone does not bound all broker-side in-flight deliveries.

Reserve one permit per delivered item for batch receive. For push consumers, align broker
credit/prefetch with bounded dispatch instead. Serialize ack on its owning channel/session where
the client requires it; JMS session-wide acknowledgement is not a per-message operation.
RabbitMQ 4.2 AMQP 0-9-1 QoS prefetch does not limit `basic.get` polling; use the limit that
actually governs the selected delivery API. Changing prefetch with deliveries already in
flight can temporarily exceed the new count.

Why each line is the way it is:

- **`tryAcquire` before `receive`.** Fetching first and then blocking on a permit means the
  message is leased while it waits, and the lease clock is already running. The wait is inside
  the timeout budget rather than outside it.
- **Account for local buffering.** A semaphore with no prefetch leaves unclaimed work at the
  broker. A bounded `ThreadPoolExecutor` queue can also be adequate when running tasks, queued
  deliveries, unresolved receives and rejection recovery have explicit finite bounds. Queued
  messages are already leased; include that wait in exposure and report local backlog even
  when broker visible depth falls. Broker credit/prefetch is another supported control.
  Sizing the limit is `concurrency-limiting-and-bulkheads`.
- **Executor choice** follows the deployed baseline and work. Java 21+ virtual threads can
  suit blocking I/O but do not bound demand; platform pools remain valid. CPU-heavy work needs
  bounded execution; `thread-sizing-and-virtual-threads` owns that choice.
- **The drain budget** must be smaller than the platform's grace period, or the process is
  killed mid-handler with leases still running; `kubernetes-service-lifecycle` owns the
  arithmetic and the `preStop` ordering.

`Future.cancel(true)` can report cancellation before the handler exits. `shutdownNow()` requests
interruption; handlers may continue and queued tasks may never start. Reconcile those queued
deliveries separately; release running-work capacity on actual termination, including cleanup
failure paths. `executors-and-task-lifecycle` owns executor task lifecycle.
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

A single normalized metric can be a valid control input with an established workload/capacity
relationship. AWS's SQS target-tracking example uses visible backlog per InService instance and
an acceptable backlog estimated from latency divided by mean processing time. This estimate
does not prove a tail-latency guarantee, account for all hidden work, or establish stability for
a different task mix. Keep independent diagnostic/SLO signals and startup, scale-in and
downstream-capacity guards. Age can remain high after capacity is added, disappear during
redelivery, or reflect one poison message. Depth needs service/rate assumptions to become a
catch-up estimate. Consequences for a scaling change:

- **Budget the response delay.** Items due within 60 s with a 5 s handler leave at most 55 s
  for queueing and other phases. Reserve measured detection, provisioning and startup time
  where the controller relies on adding workers; the target follows those budgets, not a
  universal fraction of the deadline.
- Alert on SLO age and **diagnose** with visible/in-flight depth, redelivery, extension count,
  accepted/completed rate and handler phase. Add scale-up prediction and cooldown/hysteresis;
  cap replicas at downstream capacity. Select representative step, burst, poison-item or
  dependency-slowdown controls for the changed assumptions and claimed response. Existing
  adequate controller evidence need not be replaced by a full new campaign.

## Priority and ageing

Strict priority can starve low-priority work when higher-priority eligible work stays
backlogged. An average arrival rate at or above capacity alone does not prove the absence of
every service gap. State each class's contract: reserve service when promised, or explicitly
accept best-effort starvation, expiry/drop and their observability. For service guarantees:

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
Select cases for the changed delivery/effect/recovery contract; a narrow source explanation or
adequate existing design can close with relevant evidence and explicit limits.

- **Kill a worker mid-lease.** Use a broker-specific fixture (RabbitMQ/Postgres container, SQS emulator,
  or authorized SQS test queue), stating its fidelity. Block the handler on a latch after its side
  effect but before the ack, then `Runtime.getRuntime().halt(1)` the worker. Assert redelivery
  through the configured visibility/channel/claim mechanism, using available redelivery
  evidence. Assert **one** applied effect when that is the contract; otherwise check the
  expressly accepted duplicate/loss policy. A repeated handler invocation is not itself a
  repeated durable effect.
- **Overrun the lease deliberately.** In a visibility-based fixture, use timeout 2 s and a
  first handler held for 5 s; explicitly observe a second delivery and control its progress.
  For a one-effect contract, assert one durable outcome, not exactly two invocations. This is the duplicate-work window as a
  regression test — it fails the day someone adds an increment.

For a shutdown claim, send N messages, close the worker while they are in flight, and
reconcile logical IDs after bounded recovery across effects, visible/in-flight/delayed deliveries,
retry queues and DLQ. A temporarily invisible item is not proof of loss or premature ack.

Add applicable broker-specific cases: partial batch-ack/visibility failures, stale receipt handle, duplicate
inside the nominal visibility period where the broker permits it, FIFO group head-of-line
blocking, extension outage, DLQ transfer and redrive under tenant quotas. Observe eventual state;
do not assert exactly one handler invocation when the contract only promises one durable effect.

For changed worker ownership paths, inject relevant receive exceptions, submission rejection, shutdown during receive, renewal failure,
ack-success followed by cleanup failure, and cancellation-resistant handlers. Assert no leaked
permit, no unowned delivery and no false claim of handler termination.

## Primary references

- [AWS scaling from SQS](https://docs.aws.amazon.com/autoscaling/ec2/userguide/as-using-sqs-queue.html) — backlog per InService instance and its workload assumptions.
- [ThreadPoolExecutor, Java 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html) — bounded queues and rejection behavior.
- [Future, Java 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Future.html) and [ExecutorService, Java 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ExecutorService.html) — cancellation, interruption and termination. Match the deployed JDK; these controls do not require adopting virtual threads.
