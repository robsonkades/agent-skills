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
  contract and closes under the remaining shutdown budget. A close timeout alone is not a
  total wall-clock bound: the cited Kafka 4.2 API excludes offset-commit and rebalance callback
  execution from that timeout. Bound callback work too, verify the deployed client's contract,
  and account for it in the pod budget. `wakeup()` cannot interrupt `close()`.
  Do not call other consumer operations concurrently. Thread interruption can abort clean
  shutdown; it is not equivalent to this protocol.

## `@Scheduled` jobs

- On shutdown stop admitting new scheduled runs, then decide whether the current run must
  finish or may be cancelled and resumed/replayed under its work contract. For finish-in-budget,
  set `spring.task.scheduling.shutdown.await-termination: true` with
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

- `shutdownNow()` returns queued tasks that never commenced execution and attempts to stop
  active tasks; it does not await their termination. Account for the returned work according to
  its contract: intentional cancellation can be correct, while accepted durable work needs
  persisted intent and recovery. Settle owned result handles too; returned `Runnable` objects
  may be executor wrappers, and removal from a queue does not universally complete a `Future`.
- Stopping active tasks is best effort, commonly through interruption. A tight computation
  that ignores the signal can keep running. Blocking I/O depends on the actual API, socket
  implementation and thread type: an ordinary non-channel `Socket` read on a platform thread
  is not reliably stopped by interruption alone; use a finite read timeout or an owner-controlled
  close/abort where supported. A blocking `SocketChannel` operation is interruptible and closes
  its channel. On Java 21+, reading the system-default `Socket` input stream on a virtual
  thread is also interruptible: interruption closes the socket and throws `SocketException`.
  Channel-backed streams use the channel's interruption semantics. Verify the client's actual
  path and partial-operation effects; use `cancellation-and-interruption` for cancellation design.
- Java 19+ made `ExecutorService` `AutoCloseable`, and `close()` waits for termination
  **without a bound** (requesting `shutdownNow()` if the closing thread is interrupted, then
  continuing to wait and restoring interrupt status before returning).
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

A configuration review can identify a risk without proving a drain. Select the tests below
for the lifecycle behavior being changed; reuse equivalent existing evidence. Each test supports
only its exercised work, timing and failure conditions.

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
through a real deploy, counting unexpected responses, timeouts and resets against the request
contract. A closed-loop client throttles
itself against the outage and under-reports it; that is `coordinated-omission`.

## Sources

- [KafkaConsumer shutdown](https://kafka.apache.org/42/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html): owning-thread operations, wakeup and close-timeout exclusions; check the deployed client version and bound callbacks separately.
- [Spring Framework 6.2 executor lifecycle](https://github.com/spring-projects/spring-framework/blob/v6.2.15/spring-context/src/main/java/org/springframework/scheduling/concurrent/ExecutorConfigurationSupport.java): wait-for-completion, interruption and lifecycle interaction. Custom executors and virtual-thread-backed schedulers need their own effective configuration check.
- [Java 21 Socket input streams](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/net/Socket.html): channel-backed and default virtual-thread interruption; owned close and read timeout semantics.
- [Java 21 SocketChannel](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/nio/channels/SocketChannel.html): interruption and channel closure for blocking operations.
- [Java 25 ExecutorService](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ExecutorService.html): shutdown attempts versus termination and unbounded `close()`; `close()` was added in Java 19.
