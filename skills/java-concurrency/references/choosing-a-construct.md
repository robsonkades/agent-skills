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
| semaphore/limiter                 | cap concurrent use of one scarce resource                        | rate/window/fairness/distributed limit is required                                       |
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
- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
- [Reactive Streams specification](https://github.com/reactive-streams/reactive-streams-jvm)
