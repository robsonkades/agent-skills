# Resources across async, pooled and shutdown boundaries

## The lexical scope stops being the lifetime

`try`-with-resources ties release to the _block_, which is correct only while the block also
bounds the _use_. Every asynchronous construct breaks that assumption in the same way:

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

1. **Make the scope wait.** Acquire _inside_ the async task instead, so the borrow is short
   and the scope that opens is the scope that closes:
   ```java
   return CompletableFuture.supplyAsync(() -> {
       try (Connection c = pool.get()) { return query(c, id); }
   }, ioExecutor);
   ```
2. **Move ownership to a completion protocol.** Only when the resource genuinely must span stages.
   Return the dependent stage that performs release and preserve close failures. Do not assume
   `whenComplete(close)` is enough: cancellation may complete a `CompletableFuture` callback while
   an underlying task that ignores/does not receive cancellation still uses the resource.
3. **Use structured concurrency**, where the scope's `close` waits for forked threads;
   forks, so a resource held for the duration of the block really is held for the duration of
   the work. See structured-concurrency for the lifetime guarantee and its limits.

The same defect appears with `executor.submit(() -> use(resource))` after the enclosing
try-with-resources block, and with a `Stream` returned from inside a block that closed the
file it reads.

## ExecutorService and StructuredTaskScope in try-with-resources

Both are `AutoCloseable`, but their lifecycle contracts differ:

- `ExecutorService.close()` (Java 19+) initiates an orderly shutdown and blocks until all
  submitted tasks complete. There is no timeout parameter. If a task hangs, the enclosing
  block hangs — the failure looks like a stuck request with no error. Interrupting the
  waiting thread escalates to `shutdownNow`, waits for the running tasks, and re-asserts the
  interrupt on return.
- Java 25's preview `StructuredTaskScope.close()` cancels unfinished subtasks, waits for every
  forked thread, and then reports missing `join()`/structural misuse. Correct code calls `join()`
  once to obtain the configured Joiner outcome; `close` is cleanup/confinement, not a replacement
  for result handling. A configured scope timeout cancels work, but uninterruptible subtasks can
  still delay close.

Use the `try`-with-resources form when the block owns the work and the tasks are bounded by
a timeout of their own. When the executor is long-lived — a shared pool held in a field, an
application-scoped scheduler — it is not a block-scoped resource at all, and its shutdown
belongs to the application lifecycle (see below), not to a `try`.

## Pools: the resource is the borrow, not the object

A pooled `Connection`, an HTTP connection lease, a Netty `ByteBuf` from a pooled allocator —
`close`/`release` returns it. Two consequences:

- **Holding time is the capacity input.** By Little's Law, concurrent borrows equal arrival
  rate times hold time; a borrow held across an unrelated remote call multiplies the pool
  size needed by the ratio of the two latencies. connection-pool-sizing and
  littles-law-and-queueing own the arithmetic; the code-level rule is to acquire as late and
  release as early as the transaction allows.
- **A leak presents as exhaustion, not as memory growth.** The symptom is
  `Connection is not available, request timed out after 30000ms` under load, with a heap that
  looks fine. Enable the pool's own leak detection (HikariCP's `leakDetectionThreshold` logs
  the acquiring stack trace when a borrow outlives the threshold) before reaching for a heap
  dump—it reports the acquisition site of a long-held borrow. Treat it as a lead, not proof: a
  legitimate long transaction can exceed the threshold and a returned connection may be reported
  before the detector observes its return.

A borrow that must survive a request boundary is not a pooled resource any more; that is
session state, and session-state-strategies covers where it should actually live.

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
2. Drain in-flight work with a bound: `shutdown()` then `awaitTermination(timeout)`; on expiry,
   capture tasks never started, invoke `shutdownNow()`, and wait again with a final bound while
   recording tasks that ignore interruption.
3. Close resources in reverse acquisition order — consumers before the connections they use,
   connections before the pool.
4. Only then let the process exit.

A JVM shutdown hook runs on an unspecified thread with no ordering between hooks and no
guaranteed completion — the process may be killed while a hook runs, and `SIGKILL` skips
hooks entirely. Treat hooks as a best-effort last resort for closing OS resources, never as
the mechanism that guarantees a flush of data you cannot lose; that guarantee belongs to a
durable store or an idempotent retry on the next start.

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
