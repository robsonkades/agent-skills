# The worker loop, and what the pool scales on

## The loop

Three properties distinguish a correct competing-consumer loop from the naive one: the
concurrency permit is acquired **before** the fetch, the ack is after the side effect, and
shutdown stops the fetch before it stops the work.

```java
// Conceptual: error classification and the DLQ decision are poison-messages-and-dlq's.
final class Worker implements AutoCloseable {
    private final Semaphore permits;                 // one per resource, not per queue
    private final ExecutorService handlers;          // virtual threads: the work is I/O-bound
    private final Queue queue;
    private volatile boolean polling = true;

    Worker(Queue queue, int maxInFlight) {
        this.queue = queue;
        this.permits = new Semaphore(maxInFlight);
        this.handlers = Executors.newVirtualThreadPerTaskExecutor();
    }

    void run() throws InterruptedException {
        while (polling) {
            // Acquire first: this, not the executor's queue, is what bounds in-flight leases.
            if (!permits.tryAcquire(1, TimeUnit.SECONDS)) continue;
            var message = queue.receive(Duration.ofSeconds(20));   // long poll, one message
            if (message == null) { permits.release(); continue; }
            handlers.submit(() -> {
                try (var lease = LeaseKeeper.start(queue, message)) {
                    handler.apply(message);          // must be repeat-safe — idempotency
                    queue.delete(message);           // ack after the side effect
                } catch (Exception e) {
                    queue.nack(message, backoffFor(message.deliveryCount()));
                } finally {
                    permits.release();
                }
            });
        }
    }

    @Override public void close() throws InterruptedException {
        polling = false;                             // 1. stop taking new work
        handlers.shutdown();                         // 2. let in-flight work finish
        if (!handlers.awaitTermination(drainBudget(), TimeUnit.SECONDS)) {
            handlers.shutdownNow();                  // 3. interrupt; leases lapse and redeliver
        }
    }
}
```

Why each line is the way it is:

- **`tryAcquire` before `receive`.** Fetching first and then blocking on a permit means the
  message is leased while it waits, and the lease clock is already running. The wait is inside
  the timeout budget rather than outside it.
- **`Semaphore`, not a bounded executor queue.** A bounded `ThreadPoolExecutor` queue also caps
  the work, but the messages sitting in it are leased and invisible to the broker: depth reads
  zero while the process holds a backlog. The permit leaves unclaimed work where the depth and
  age metrics can see it. Sizing the limit is `concurrency-limiting-and-bulkheads`.
- **Virtual threads** are right here only because the handler blocks on I/O. A CPU-bound handler
  wants a fixed pool sized to cores; `thread-sizing-and-virtual-threads` owns that choice.
- **The drain budget** must be smaller than the platform's grace period, or the process is
  killed mid-handler with leases still running; `kubernetes-service-lifecycle` owns the
  arithmetic and the `preStop` ordering.

`shutdownNow()` interrupting a handler is not data loss here: the lease was never acked, so the
message is redelivered. It _is_ a duplicate-work window, which is why the handler is repeat-safe.

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
  threshold. That threshold _is_ the starvation bound. Implement it as a scheduled promotion or
  an age-ordered scan; no broker does it for you.
- **Weighted shares** — dedicate a fraction of workers to each class (say 80/20). The low class
  then drains at 20% of capacity regardless of high-class arrivals: simpler to reason about
  than ageing, at the cost of high-class throughput at peak.
- **A queue per class with its own pool** is what makes either policy observable, because each
  class gets its own age metric. One queue with a priority field hides the starving class
  inside an aggregate.

## Testing

Two fault-injecting tests. Neither is a happy path.

- **Kill a worker mid-lease.** Testcontainers with the real broker (LocalStack for SQS,
  RabbitMQ, or Postgres for a database queue). Block the handler on a latch after its side
  effect but before the ack, then `Runtime.getRuntime().halt(1)` the worker. Assert redelivery
  after the timeout, `deliveryCount > 1` on the second delivery, and **one** applied side effect
  downstream. That last assertion is what fails when the handler is not repeat-safe.
- **Overrun the lease deliberately.** Timeout 2 s, handler 5 s: assert both deliveries complete
  and the observable outcome is still singular. This is the duplicate-work window as a
  regression test — it fails the day someone adds an increment.

Also assert shutdown behaviour: send N messages, close the worker while they are in flight, and
check that `N` items are either completed or still visible in the queue. `N − k` is data loss
and means the ack moved ahead of the side effect.

Add broker-specific cases: partial batch-ack/visibility failures, stale receipt handle, duplicate
inside the nominal visibility period where the broker permits it, FIFO group head-of-line
blocking, extension outage, DLQ transfer and redrive under tenant quotas. Observe eventual state;
do not assert exactly one handler invocation when the contract only promises one durable effect.
