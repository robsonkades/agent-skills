# Draining work that is not an HTTP request

`server.shutdown=graceful` drains the HTTP connector and nothing else. Every other unit of
in-flight work needs its own stop, and each one fails differently when it does not get it.

## Spring's stop ordering, and the trap in it

For a normal synchronous context close, the broad order is below; explicit bean dependencies
can override phase ordering, and asynchronous listeners need separate lifetime coordination:

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

- Spring listener containers participate in `SmartLifecycle`, but whether an in-flight
  record/batch finishes and commits depends on acknowledgement mode, transactions, listener
  concurrency, container version and shutdown timeout. Test the configured mode and keep its
  bound inside the pod grace budget; otherwise expect redelivery after forced termination.
- Work starting at the committed next offset is eligible for replay while records remain retained and
  the next consumer resumes from that offset. It may be new work or duplicate side effects.
  Committing ahead of asynchronous processing can lose work despite an orderly close.
  Verify acknowledgement placement and retention; repeat-safe processing belongs to
  `idempotency` and `delivery-semantics`.
- Do not assume shutdown can exceed `max.poll.interval.ms` safely. If processing prevents
  timely polling beyond the configured interval, the consumer can lose group membership;
  static membership and protocol/version choices affect timing but do not remove the need to
  finish or hand off predictably.
- For an owned raw `KafkaConsumer`, setting a stop flag and calling its thread-safe
  `wakeup()` from another thread is a normal shutdown mechanism. The owning thread handles
  the expected `WakeupException`, resolves completed offsets according to the processing
  contract and closes within a deadline. Do not call other consumer operations concurrently.
  Thread interruption can abort clean shutdown; it is not equivalent to this protocol.

## `@Scheduled` jobs

- On shutdown a scheduled job must not **start** a new run, and the run in progress must be
  waited for. Set `spring.task.scheduling.shutdown.await-termination: true` with
  `spring.task.scheduling.shutdown.await-termination-period` inside the grace budget — the
  same pair exists under `spring.task.execution.shutdown.*` for `@Async`. These settings
  apply to the corresponding auto-configured implementation; verify custom executors and
  virtual-thread-backed schedulers separately, including when new submissions are rejected.
- Waiting for completion does not require interruptibility if the job finishes within the
  deadline. With wait-for-completion enabled, Spring can deliberately avoid interrupting
  running tasks; an interrupt check alone then never notices shutdown. Choose finish-in-budget
  or a separately published cancellation/deadline signal checked between chunks. If using
  interruption, ensure the shutdown path actually issues it:

```java
// Partial Java 17-compatible sketch; shutdown must actually interrupt this worker.
for (List<Row> chunk : chunks) {
    if (Thread.currentThread().isInterrupted()) {
        break;                    // leave a resumable checkpoint, do not throw away progress
    }
    process(chunk);
}
```

- A lease-based lock needs expiry, renewal and stale-owner protection; SIGKILL cannot run
  application cleanup. Session/transaction locks may instead be released by their owner
  service on disconnect, so inspect the actual mechanism. TTL alone does not prevent an old
  worker from writing after another worker acquires the lease; use fencing where needed.

## Executors you own

```text
Pseudocode for an owned executor, with a total shutdown deadline:
  refuse new tasks with shutdown()
  await termination for the first allowance
  if still running: shutdownNow(); record/recover returned queued work
  await only the remaining allowance; report whether termination actually occurred
  if interrupted while waiting:
    shutdownNow(); record/recover queued work; restore the caller interrupt flag
    report incomplete termination rather than claiming a successful drain
```

Do not close dependencies still used by surviving tasks as though the drain succeeded.
Decide escalation and recovery within the pod deadline; interruption is a request, not proof
that a worker stopped.

- `shutdownNow()` **loses work**: the returned list is tasks that were accepted and never ran.
  If they mattered, they should not have lived only in a queue — persist the intent first and
  let recovery re-drive it. Discarding the returned list is the anti-pattern.
- `shutdownNow()` only _interrupts_. A task blocked on a socket read with no timeout, or in a
  tight computation that never checks the flag, keeps running until SIGKILL. Read timeouts
  are a shutdown concern, not only a latency one.
- Java 19+ made `ExecutorService` `AutoCloseable`, and `close()` waits for termination
  **without a bound** (falling back to `shutdownNow()` if the closing thread is interrupted).
  That is fine in a try-with-resources around a known task set; inside a shutdown path with a
  grace period it can wait until SIGKILL if work never ends. Use the bounded protocol above.
- `Executors.newVirtualThreadPerTaskExecutor()` (Java 21+) has the same semantics. Virtual threads are
  cheap to have and no cheaper to drain: each one is still blocked work.

## Queue workers with leases

A worker that took a lease (SQS visibility timeout, a database row locked with an expiry)
should, in order: stop taking new items; finish or explicitly release the current one; then
exit. Choose finish versus release from remaining work, idempotency, lease extension and
redelivery cost. Explicit release can reduce delay, but immediate redelivery can also create
a retry storm during a fleet rollout.

## Proving the drain works

A configuration review does not prove this. Two techniques that do:

**In-process, fast, runs in CI.** Boot the app on a random port with graceful shutdown on,
start a request against an endpoint that blocks, wait until the handler has actually entered,
then close the context from another thread:

1. Wait with a deadline for a latch proving the slow handler entered.
2. Close the context on another thread and retain its completion future.
3. Observe shutdown/readiness refusal, then release the handler's blocking latch.
4. Assert the original request completes successfully, and await context closure with a
   deadline. In cleanup, always release the latch and join or terminate owned test work.
5. Check new admission according to the actual server and protocol: rejection can be a
   connection failure or an HTTP response (for example, older Undertow behavior). Do not
   assert one universal exception type or race a new request against shutdown initiation.

This tests the local server drain under the specified timing, not endpoint propagation,
persistent-connection behavior through an ingress, or non-HTTP task completion.

**Out of process, closer to the truth.** Run the real image under Testcontainers and stop it
with an explicit SIGTERM-then-SIGKILL timeout matching
`terminationGracePeriodSeconds`. Then assert the _downstream_ state: no consumer lag left
uncommitted beyond what redelivery covers, no half-written row, no lease still held. If the
container had to be SIGKILLed, investigate stuck work, missing signal forwarding and teardown
ordering as well as an insufficient budget. Forced-kill fault tests should instead verify
recovery and replay without claiming graceful completion.

For the rolling update as a whole, use an **open-loop** client running
through a real deploy, counting non-2xx responses and resets. A closed-loop client throttles
itself against the outage and under-reports it; that is `coordinated-omission`.

## Sources

- [KafkaConsumer shutdown](https://kafka.apache.org/42/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html): owning-thread operations, wakeup and bounded close; check the deployed client version.
- [Spring Framework 6.2 executor lifecycle](https://github.com/spring-projects/spring-framework/blob/v6.2.15/spring-context/src/main/java/org/springframework/scheduling/concurrent/ExecutorConfigurationSupport.java): wait-for-completion, interruption and lifecycle interaction. Custom executors and virtual-thread-backed schedulers need their own effective configuration check.
