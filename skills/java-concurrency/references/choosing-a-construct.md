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
Which executor/thread runs each callback/operator, including error paths?
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
- [Flow API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Flow.html)
- [Flow subscription demand](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Flow.Subscription.html)
- [Semaphore fairness and acquisition](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Semaphore.html)
- [CompletableFuture cancellation and timeouts](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CompletableFuture.html)
- [Java 25 HttpClient exchange cancellation](https://docs.oracle.com/en/java/javase/25/docs/api/java.net.http/java/net/http/HttpClient.html)
- [ExecutorService lifecycle](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ExecutorService.html)
- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
- [Reactive Streams specification](https://github.com/reactive-streams/reactive-streams-jvm)
