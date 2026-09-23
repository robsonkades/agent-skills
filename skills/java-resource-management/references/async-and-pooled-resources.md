# Resources across async, pooled and shutdown boundaries

## The lexical scope stops being the lifetime

Code below is partial Java 21 pseudocode showing ownership. `pool`, `query`, `Report` and
`ioExecutor` are application placeholders; real JDBC acquisition/query/close throw checked
SQLExceptions that a Supplier must translate with the original cause. Do not copy the lambda
as a complete JDBC adapter or assume it supplies transaction/cancellation policy.

`try`-with-resources ties release to the _block_, which is correct only while the block also
bounds the _use_. An asynchronous task can outlive that block:

```java
// Broken: the connection closes when the method returns, not when the stage completes.
CompletableFuture<Report> build(String id) {
    try (Connection c = pool.get()) {
        return CompletableFuture.supplyAsync(() -> query(c, id));
    }
}
```

Under a fast test this often passes — the supplier may run before the close. Under load it
fails intermittently with a closed-resource error, and the stack trace points at the
supplier, not at the `try`. Three legitimate fixes, in order of preference:

1. **Move acquisition into the task.** Acquire _inside_ the async task, so the borrow is short
   and the scope that opens is the scope that closes:
   ```java
   return CompletableFuture.supplyAsync(() -> {
       try (Connection c = pool.get()) { return query(c, id); }
   }, ioExecutor);
   ```
2. **Move ownership to a completion protocol.** Only when the resource genuinely must span stages.
   Keep cleanup and its failure observation under the lifetime owner's control; expose a separate
   caller result with an explicit cancellation policy. In OpenJDK 21's base `CompletableFuture`,
   cancelling or completing the dependent returned by `whenComplete` before its action starts can
   skip that action entirely. Conversely, cancelling the source can run cleanup before underlying
   use stops. A private cleanup stage must therefore follow an owner-controlled signal of actual
   use termination, not merely the exposed future's completion. Handle synchronous startup failure
   after acquisition too. If cleanup is dispatched, executor rejection also needs a release path.
   Verify that caller cancellation neither skips release nor releases during live use, and that
   the owner observes close failure even after the caller has stopped waiting.
3. **Use structured concurrency**, placing the task scope inside the resource scope so all
   resource-using subtasks finish before the resource closes. Reversing close order is still
   unsafe. See structured-concurrency for the lifetime guarantee and its limits.

The same defect appears with `executor.submit(() -> use(resource))` after the enclosing
try-with-resources block, and with a `Stream` returned from inside a block that closed the
file it reads.

## ExecutorService and StructuredTaskScope in try-with-resources

Both are `AutoCloseable`, but their lifecycle contracts differ:

- Default `ExecutorService.close()` (Java 19+) initiates an orderly shutdown and waits for
  termination. There is no timeout parameter. If a task hangs, the enclosing
  block hangs — the failure looks like a stuck request with no error. Interrupting the
  waiting thread escalates to `shutdownNow`, waits for the running tasks, and re-asserts the
  interrupt on return. Queued tasks may never start and their submitted Futures can remain
  incomplete; termination and result settlement are separate responsibilities. Inspect
  implementation overrides and retain the owner of those handles.
- Java 25's preview `StructuredTaskScope.close()` cancels unfinished subtasks, waits for every
  forked thread, and then reports missing `join()`/structural misuse. Correct code calls `join()`
  once to obtain the configured Joiner outcome; `close` is cleanup/confinement, not a replacement
  for result handling. A configured scope timeout cancels work, but uninterruptible subtasks can
  still delay close.

Use the `try`-with-resources form when the block owns the executor and waiting for its actual
termination fits the lifecycle. A caller timeout alone does not bound task termination or close.
When the executor is long-lived — a shared pool held in a field, an
application-scoped scheduler — it is not a block-scoped resource at all, and its shutdown
belongs to the application lifecycle (see below), not to a `try`.

## Pools: the resource is the borrow, not the object

A pooled `Connection` or HTTP connection lease ends a borrow through its release contract;
the pool may reuse or discard the physical resource. For a reference-counted Netty `ByteBuf`,
release decrements the count; deallocation occurs at zero, so retained slices/duplicates matter.
Do not infer exclusive ownership or immediate reuse from the word "pooled." Two consequences:

- **Holding time contributes to occupancy.** For a stable matching borrow population,
  mean concurrent borrows equal effective borrow throughput times mean hold time. At unchanged
  throughput, doubling mean hold doubles mean occupancy, not necessarily the pool size needed
  for a latency SLO. Offered requests and waiting-for-acquisition time are different boundaries.
  connection-pool-sizing and
  littles-law-and-queueing own the arithmetic; the code-level rule is to acquire as late and
  release as early as the transaction allows.
- **A lease leak can present as exhaustion without obvious heap growth.** One symptom is
  `Connection is not available, request timed out after 30000ms` under load, with a heap that
  looks fine. Reuse existing metrics and acquisition evidence; if insufficient, consider the
  pool's leak detection before a heap dump. HikariCP's `leakDetectionThreshold` reports the
  acquisition site when an outstanding borrow exceeds the configured threshold. Treat it as a lead, not proof: a
  legitimate long transaction can exceed the threshold and a returned connection may be reported
  before the detector observes its return.

A borrow can outlive a request while remaining a pool lease, but it needs a new explicit owner
and termination policy. Do not retain database connections as conversational session state;
session-state-strategies covers alternative state placement.

## Virtual threads remove the accidental limit

When each platform-thread task acquired one resource, a fixed pool of 200 also accidentally capped
concurrent acquisitions near 200. `Executors.newVirtualThreadPerTaskExecutor()` removes that thread
cap without increasing downstream/file limits. Work may move from executor queueing to thousands of
tasks blocked at a connection pool/semaphore, changing memory, fairness and tail latency.

The bound has to become explicit and local to the resource: the pool's own maximum, a
`Semaphore` around the acquisition, or a bulkhead per dependency. concurrency-limiting-and-bulkheads
covers choosing between them; thread-sizing-and-virtual-threads covers what changed and why.

## Shutdown

At shutdown, resources must be released _after_ the work using them stops, and the ordering
is the part that is usually missing:

1. Stop accepting new work (readiness off, listener closed) — kubernetes-service-lifecycle
   owns the traffic side.
2. As the executor owner, drain with a bound: `shutdown()` then `awaitTermination(timeout)`;
   on expiry, retain the never-started tasks returned by `shutdownNow()` and wait again with a
   final bound while recording tasks that ignore interruption. Preserve original Future/wrapper
   identities and settle or recover their results deliberately; executors-and-task-lifecycle
   owns that protocol.
3. If tasks still run, do not proceed as though draining succeeded: report the surviving work
   and follow an explicit escalation policy. Resource closure may be a documented cancellation
   mechanism only if its contract supports concurrent close/use; otherwise keep dependencies
   alive until use ends or terminate the process according to the shutdown policy.
4. Close resources in reverse acquisition order — consumers before the connections they use,
   connections before the pool.
5. Complete normal shutdown only after release, distinguishing it from forced termination.

JVM shutdown starts the registered hook threads in unspecified order and lets them run
concurrently. Completion is not guaranteed under forced termination; `SIGKILL` skips hooks.
Treat hooks as best-effort cleanup, not a guarantee that accepted data is durably flushed.
Recovery requires an actual durable record and acknowledgement/recovery contract; an idempotent
retry alone cannot recover an intent that was never retained. delivery-semantics and idempotency
cover those conditional recovery concerns.

## Diagnostic sequence

| Symptom                                | Evidence to collect                                                   | Distinguish/remediate                                                            |
| -------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| pool timeouts with normal heap         | active/idle/waiter metrics, borrow duration, acquisition stack        | leak versus legitimate long transaction versus undersized/slow dependency        |
| file-descriptor exhaustion             | process FD count/type, open stacks/JFR events, request correlation    | leaked streams/files versus sockets or expected concurrency                      |
| shutdown never completes               | thread dump, queued/running tasks, interrupt status, dependency calls | non-interruptible task versus missing deadlines versus wrong lifecycle ordering  |
| closed-resource errors only under load | future cancellation/completion timeline and actual task termination   | lexical scope ended early or completion callback closed during still-running use |

## Authoritative references

- [ExecutorService.close contract, Java SE 25](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ExecutorService.html#close()>)
- [StructuredTaskScope preview contract, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/StructuredTaskScope.html)
- [JEP 505: Structured Concurrency, fifth preview](https://openjdk.org/jeps/505)
- [CompletableFuture cancellation contract, Java SE 25](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CompletableFuture.html#cancel(boolean)>)
- [OpenJDK 21+35 CompletableFuture: dependent completion and uniWhenComplete](https://github.com/openjdk/jdk/blob/jdk-21%2B35/src/java.base/share/classes/java/util/concurrent/CompletableFuture.java)
- [Runtime shutdown hooks, Java SE 25](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Runtime.html#addShutdownHook(java.lang.Thread)>)
- [Netty 4.1 reference-counted release](https://netty.io/4.1/api/io/netty/util/ReferenceCounted.html)
- [HikariCP leak-detection setting](https://github.com/brettwooldridge/HikariCP#frequently-used)
