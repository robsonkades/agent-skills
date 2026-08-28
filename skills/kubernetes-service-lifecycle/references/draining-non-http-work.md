# Draining work that is not an HTTP request

`server.shutdown=graceful` drains the HTTP connector and nothing else. Every other unit of
in-flight work needs its own stop, and each one fails differently when it does not get it.

## Spring's stop ordering, and the trap in it

Closing the context runs, in this order:

1. publish `ContextClosedEvent`;
2. stop `Lifecycle` / `SmartLifecycle` beans, **descending** by phase;
3. destroy singletons — `@PreDestroy`, `DisposableBean`;
4. close the bean factory.

Two consequences:

- **A `@EventListener(ContextClosedEvent.class)` runs before the drain, not after.** Closing
  an HTTP client, a `DataSource` or a producer from that listener pulls it out from under
  requests that are still being served. Put teardown in `@PreDestroy` (step 3) or in a
  `SmartLifecycle.stop()` with a phase below the components that still need it.
- The web server and the messaging listener containers are `SmartLifecycle` beans in high
  phases, so they stop early in the descending order — while ordinary singletons such as the
  `DataSource` are still alive. That is what makes a final in-flight batch able to commit.
  A bare `new Thread(...)` you started yourself participates in none of this and will simply
  be killed.

## Kafka consumers

The requirement is: stop fetching, finish the records already polled, commit their offsets,
then leave the group.

- Spring's listener containers are `SmartLifecycle`, so context close stops them; the
  container finishes the in-flight batch and commits before `stop()` returns. Give it a
  shutdown timeout that fits inside the pod's grace budget — if the container is still
  stopping when the grace period ends, SIGKILL takes the uncommitted offsets with it.
- Uncommitted offsets are **not** lost work: they are redelivered to another consumer. They
  are duplicate work. The guarantee is at-least-once and the handler must be repeat-safe —
  that is `idempotency`, and the ack-placement reasoning is `delivery-semantics`.
- Never do slow shutdown work inside the poll loop's thread. Blocking it past
  `max.poll.interval.ms` (default 300000 ms) makes the broker treat the consumer as dead and
  rebalance, which produces exactly the duplicates the shutdown was trying to avoid.
- Calling `wakeup()` or interrupting the consumer without committing first converts an
  orderly stop into a redelivery. It is a valid last resort, not the plan.

## `@Scheduled` jobs

- On shutdown a scheduled job must not **start** a new run, and the run in progress must be
  waited for. Set `spring.task.scheduling.shutdown.await-termination: true` with
  `spring.task.scheduling.shutdown.await-termination-period` inside the grace budget — the
  same pair exists under `spring.task.execution.shutdown.*` for `@Async`.
- Waiting only works if the job is interruptible in practice. A job that loops over a million
  rows with no cancellation check will be waited for, time out, and then be killed mid-batch.
  Give long jobs a cooperative check between chunks:

```java
// Conceptual: cancellation the shutdown path can actually act on.
for (List<Row> chunk : chunks) {
    if (Thread.currentThread().isInterrupted()) {
        break;                    // leave a resumable checkpoint, do not throw away progress
    }
    process(chunk);
}
```

- If the job holds a lease-based distributed lock, the lock **must** have a TTL. A pod killed
  by SIGKILL never releases it, and a lock with no expiry blocks the job on every replica
  until someone clears it by hand.

## Executors you own

```java
// Conceptual: the only correct shape for a bounded shutdown.
pool.shutdown();                                   // refuse new tasks; queued tasks still run
if (!pool.awaitTermination(15, TimeUnit.SECONDS)) {
    List<Runnable> abandoned = pool.shutdownNow(); // interrupt running, drop the queue
    log.warn("dropping {} queued tasks", abandoned.size());
    pool.awaitTermination(5, TimeUnit.SECONDS);    // threads that ignore interrupts
}
```

- `shutdownNow()` **loses work**: the returned list is tasks that were accepted and never ran.
  If they mattered, they should not have lived only in a queue — persist the intent first and
  let recovery re-drive it. Discarding the returned list is the anti-pattern.
- `shutdownNow()` only _interrupts_. A task blocked on a socket read with no timeout, or in a
  tight computation that never checks the flag, keeps running until SIGKILL. Read timeouts
  are a shutdown concern, not only a latency one.
- Java 19+ made `ExecutorService` `AutoCloseable`, and `close()` waits for termination
  **without a bound** (falling back to `shutdownNow()` if the closing thread is interrupted).
  That is fine in a try-with-resources around a known task set; inside a shutdown path with a
  grace period it is an unbounded wait ending in SIGKILL. Use the explicit two-stage shape
  above there.
- `Executors.newVirtualThreadPerTaskExecutor()` has the same semantics. Virtual threads are
  cheap to have and no cheaper to drain: each one is still blocked work.

## Queue workers with leases

A worker that took a lease (SQS visibility timeout, a database row locked with an expiry)
should, in order: stop taking new items; finish or explicitly release the current one; then
exit. Releasing is better than finishing when the item is large — the lease returns to the
queue immediately instead of waiting for the timeout, which turns a redelivery delay of
minutes into one of milliseconds.

## Proving the drain works

A configuration review does not prove this. Two techniques that do:

**In-process, fast, runs in CI.** Boot the app on a random port with graceful shutdown on,
start a request against an endpoint that blocks, wait until the handler has actually entered,
then close the context from another thread:

```java
// Conceptual sketch: assert the in-flight request survives, and new ones are refused.
CompletableFuture<ResponseEntity<String>> inFlight =
        CompletableFuture.supplyAsync(() -> client.getForEntity("/slow", String.class));
handlerEntered.await();                       // a latch the /slow handler counts down
CompletableFuture.runAsync(context::close);
assertThat(inFlight.get(30, SECONDS).getStatusCode()).isEqualTo(HttpStatus.OK);
assertThatThrownBy(() -> client.getForEntity("/slow", String.class)).isInstanceOf(...);
```

The assertion that matters is the first one: the in-flight request completed with 200 after
shutdown began. Asserting on log lines proves nothing.

**Out of process, closer to the truth.** Run the real image under Testcontainers and stop it
with an explicit SIGTERM-then-SIGKILL timeout matching
`terminationGracePeriodSeconds`. Then assert the _downstream_ state: no consumer lag left
uncommitted beyond what redelivery covers, no half-written row, no lease still held. If the
container had to be SIGKILLed, the budget is wrong — which is the finding.

For the rolling update as a whole, the only honest test is an **open-loop** client running
through a real deploy, counting non-2xx responses and resets. A closed-loop client throttles
itself against the outage and under-reports it; that is `coordinated-omission`.
