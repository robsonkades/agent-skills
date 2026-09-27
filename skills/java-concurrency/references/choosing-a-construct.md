# Choosing a concurrency construct

## Selection matrix

| Requirement                       | Prefer when                                                      | Avoid/augment when                                                                       |
| --------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| direct synchronous call           | sequential ownership is clearest                                 | concurrency needed and independent work exists                                           |
| virtual thread per task           | blocking style, high waiting concurrency, supported blockers     | CPU-heavy work, hidden unbounded resource demand, incompatible native/framework behavior |
| managed executor                  | long-lived scheduling/queue/isolation/lifecycle                  | lexical request fan-out better fits a scope                                              |
| structured task scope             | child lifetime/failure/cancel is lexical and target API accepted | daemon/background work or preview policy disallows API                                   |
| `CompletableFuture`               | callback adaptation or true stage/value graph                    | sequential blocking flow becomes harder to debug                                         |
| ForkJoin/parallel stream          | fine-grained CPU-decomposable work                               | blocking, unmanaged common-pool interference, poor granularity                           |
| Reactive Streams                  | continuing stream needs demand propagation/operators             | finite request/value flow without stream semantics                                       |
| bounded queue/channel             | explicit producer-consumer handoff                               | queue hides overload or ordering/ownership is undefined                                  |
| semaphore/limiter                 | cap concurrent use of one scarce resource                        | rate/window, per-tenant share or distributed quota is required                           |
| lock/atomic/concurrent collection | shared invariant genuinely needs it                              | immutable snapshot/confinement is simpler                                                |

## Questions that disqualify a design

```text
Who owns tasks after the requester times out?
Which exact resource bounds concurrency, and what happens at the bound?
Can cancellation reach blocking/native/remote work, and are side effects reversible?
Which executor/thread runs each callback/operator, including inline, rejection and error paths?
Which resources must remain on their owning Java thread, and can callbacks reenter the caller?
Can a task hold a worker or permit while waiting for another task that needs the same capacity?
How are context and security identity installed and removed?
What is the ordering unit and can retries/parallelism violate it?
How does shutdown drain, cancel, persist or abandon work?
Which metric distinguishes queueing, active work, saturation and orphan work?
```

## Common combinations

```text
virtual threads + resource-local semaphore/connection pool
structured scope + deadline + cooperative cancellation + scoped context
executor + bounded queue + rejection + lifecycle health
reactive demand + bounded blocking bridge + explicit scheduler
ForkJoin CPU phase + separate blocking I/O phase
concurrent collection + atomic compound operation + invariant test
```

An executor submission is not necessarily a thread handoff. A direct executor such as
`Runnable::run` executes on the caller; supplying it to a `CompletableFuture` `Async` method does
not establish background execution. Non-async continuations can also run inline. Inspect the
actual executor/provider, caller-held locks and unfinished invariants before relying on deferred
execution. Route stage placement to `completablefuture-composition`, rejection paths to
`executors-and-task-lifecycle`, and reentrant/shared-object contracts to `java-thread-safety-contracts`.

Check dependency waits as well as independent-task throughput. In a bounded executor, all workers
can block awaiting children that are queued to that same executor; idle CPU then does not imply
spare execution capacity. Prefer sequential execution when overlap adds no value, or compose
completion without blocking a worker. If separate execution capacity is justified, prove that it
breaks the wait cycle and preserves total admission bounds. More workers alone do not remove the
dependency. The same issue can occur when a parent holds the last permit needed by its child.
Verify the wait graph under saturation; route lifecycle and queue policy to
`executors-and-task-lifecycle`, stage composition to `completablefuture-composition`, and incident
evidence to `concurrency-diagnostics`. Do not assume every executor has identical join behavior.

For thread-affine APIs, distinguish transferable immutable input from a live resource bound to
its owning Java thread. Offload only the parts allowed by that resource's contract and return
continuations through its required execution mechanism. Copying tenant/MDC context does not move
a thread-bound session or transaction. If affinity is unknown, inspect the provider/framework
contract before selecting a worker model; thread safety and context propagation are separate questions.

Boundaries must preserve deadline, cancellation, context and error semantics. A future completed by
a virtual-thread task does not automatically propagate cancellation to that task; a reactive
wrapper around blocking I/O does not make the I/O nonblocking.

Reactive demand limits item delivery per subscription, not total retained bytes or completion of
work dispatched by `onNext`. Requesting another item immediately after submitting a task can leave
unbounded tasks in flight while respecting the demand protocol. Inspect prefetch, buffers, item
sizes, fan-out and the point where demand is replenished; require separate bounds where needed.
Route operator and blocking-bridge details to `reactive-backpressure`.

The base `CompletableFuture.cancel(true)` completes the value exceptionally without interrupting
its supplier. Provider-returned futures can differ: Java 25's default `HttpClient.sendAsync`
returns futures whose `cancel(true)` attempts to cancel the exchange, with no immediate-release
guarantee. Inspect the actual handle/provider contract. `orTimeout` does not universally stop
underlying work. A bridge must retain the task/call handle, propagate cancellation, handle
completion races and account for work that ignores interruption or has already caused effects.
Route the mechanics to `cancellation-and-interruption` and
`completablefuture-composition`; do not equate a cancelled handle with a released resource.

When structured-concurrency preview is disallowed, an executor alone is not an equivalent
task group. Name who tracks children, observes every failure, cancels siblings, and waits for
termination or explicitly transfers ownership of remaining work. Do not close a shared executor
per request. A scope or executor close can wait for non-cooperative work, so a response timeout
does not itself bound cleanup latency; inspect actual cancellation support before promising it.

For virtual threads plus a semaphore, identify both the permit bound and the waiting population.
Release permits only after successful acquisition and hold them until the protected work really
ends, even if the caller's result handle has already timed out.

Fair acquisition alone does not disqualify a semaphore. `Semaphore(n, true)` orders waiting
acquisitions at internal FIFO points; untimed `tryAcquire` can still barge. This does not promise
completion order or a fair share per tenant. Inspect the acquisition method and required fairness
unit; route primitive details to `concurrent-collections-and-synchronizers` and tenant/admission
policy to `concurrency-limiting-and-bulkheads`.

## Decision record

```text
construct and owner:
alternatives rejected:
task/resource/state lifetime:
admission/queue/overload:
deadline/cancel/error/partial result:
execution resource and blocking policy:
context propagation:
JDK/framework constraints:
tests and observability:
```

## Authoritative references

- [Java `java.util.concurrent`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/package-summary.html)
- [Executor execution contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Executor.html)
- [ThreadPoolExecutor queueing and internal dependencies](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html)
- [Flow API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Flow.html)
- [Flow subscription demand](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Flow.Subscription.html)
- [Semaphore fairness and acquisition](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Semaphore.html)
- [CompletableFuture cancellation and timeouts](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CompletableFuture.html)
- [Java 25 HttpClient exchange cancellation](https://docs.oracle.com/en/java/javase/25/docs/api/java.net.http/java/net/http/HttpClient.html)
- [ExecutorService lifecycle](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ExecutorService.html)
- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
- [Reactive Streams specification](https://github.com/reactive-streams/reactive-streams-jvm)
