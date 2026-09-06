# The comparison, dimension by dimension

| Dimension                      | Virtual threads (thread-per-request)                                             | Reactive (Reactive Streams / Reactor)                                        |
| ------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Programming model              | sequential statements; ordinary control flow                                     | operator pipeline; control flow is data flow                                 |
| Blocking I/O                   | intended for supported blocking operations; carrier usually unmounts             | isolate from event loops; arbitrary blocking can stall one                   |
| Non-blocking I/O               | used underneath, invisible to the code                                           | used directly and visibly                                                    |
| Backpressure                   | only where a bounded resource is declared                                        | demand protocol; separate bounds needed for buffers and admission            |
| Cancellation                   | interruption when wired to task ownership; cooperative                           | `Subscription.cancel()`; cleanup/underlying work cancellation must cooperate |
| Error propagation              | `try`/`catch`, with a stack trace that names the request                         | `onError` signals; stack traces need `onOperatorDebug`/checkpoints           |
| Composition                    | method calls; owned fan-out with version-compatible APIs                         | operators: `zip`, `merge`, `window`, `retryWhen`, `timeout`                  |
| Time-shaped operations         | manual (timers, buffers, schedulers)                                             | first-class (`debounce`, `sample`, `bufferTimeout`, `window`)                |
| Debugging                      | breakpoints, stack traces, thread dump per request                               | operator debugging with real overhead; no per-request thread                 |
| Profiling                      | stack attribution subject to profiler support; not request correlation by itself | cost attributed to loop threads and operators, not to requests               |
| Memory per in-flight request   | continuation stack plus request state (workload-dependent)                       | subscription, operator, context and buffered state                           |
| Memory per **idle** connection | parked stack when a thread is dedicated to it                                    | subscription/operator state; measure the concrete chain                      |
| CPU-bound work                 | no benefit; ceiling is the core count                                            | no benefit; same ceiling                                                     |
| Ecosystem                      | blocking libraries; verify thread-local caches and native/pinning behavior       | Netty, R2DBC, reactive Kafka/Mongo/Redis clients                             |
| Operational complexity         | familiar control flow; downstream pools and admission still need tuning          | schedulers, prefetch, demand, operator semantics                             |
| Where teams get it wrong       | forgetting to re-declare the limit the pool used to impose                       | a blocking call, or an operator that silently unbounds a buffer              |

There is no row where one model wins on every workload, which is why the decision is per
boundary rather than per organisation.

## Memory, with numbers instead of adjectives

The often-quoted "virtual threads cost a few hundred bytes" describes an initial or narrow
measurement, not a capacity constant. A parked virtual thread retains its continuation stack
and reachable request state. Illustrative ranges are hypotheses, not sizing inputs:

```text
Shallow request handler, few frames        ≈ 1 KB or less
Typical framework request (filters, ORM)   ≈ several KB
Deep stack with a large ORM operation      ≈ tens of KB
```

Multiply a measured retained-size distribution by target concurrency, then include request
payloads, buffers and GC headroom. At very high connection cardinality, differences between
a concrete reactive operator graph and a concrete parked stack can decide machine size; the
direction and crossover cannot be asserted without measurement.

Two second-order effects to keep in mind:

- Suspended stacks are **heap** objects (`StackChunk`) and are scanned by the GC. Many
  concurrently suspended virtual threads shift GC cost; see `virtual-threads-internals`.
- Both models retain payloads and shared buffers. Count shared objects once and avoid
  double-counting payloads already in retained-size measurements; unbounded buffering can
  dominate either model's memory.

Measure both at your target concurrency before letting this dimension decide anything.

## Where backpressure comes from

Reactive Streams bounds onNext signals by requested demand on each subscription.
An operator can request unbounded upstream and buffer while still complying downstream.
Inspect prefetch, flatMap concurrency, queue bytes and hot-source overflow separately.

Imperative code can use bounded queues, pull-based reads and semaphore admission. A
semaphore bounds holders, not waiters; cap waiting requests or reject with a deadline.
Neither scheduler capacity nor a connection pool alone bounds all retained request state.

## Failure shape under overload

| Overload arrives         | Virtual threads                                                      | Reactive                                                                                   |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Requests exceed capacity | in-flight count grows; heap grows with suspended stacks              | cooperative upstream may slow; hot sources and buffers need explicit limits                |
| Bound reached            | configured wait/reject/timeout policy; unbounded retention risks OOM | configured wait/error/drop/latest policy; unbounded retention also risks OOM               |
| Dependency slows         | more concurrent waiters, each holding its resources                  | slowing demand may propagate; in-flight operations and hot sources can continue            |
| Symptom on a dashboard   | heap and thread count rise; latency rises                            | queue/buffer gauges and overflow/discard metrics rise; `onErrorDropped` alone is not proof |
| Worst realistic outcome  | OOM from unbounded in-flight work                                    | OOM from unbounded retention or data loss from an inappropriate drop strategy              |

Neither shape is better in the abstract. Both are survivable if the bound was chosen and
instrumented, and both are outages if it was inherited.

## Hybrids that work

- **Streaming endpoints reactive, everything else blocking.** Use the existing server's supported streaming adapter or an explicit separate
  reactive boundary. MVC can stream too; adding both starters does not create two independent
  endpoint execution models automatically. The boundary is the
  endpoint, which is easy to document and to reason about.
- **A reactive pipeline whose blocking leaves run on virtual threads.** Reactor's
  `boundedElastic` on virtual threads keeps one legacy blocking call from starving the event
  loops when the call is scheduled there. The virtual-thread implementation retains
  scheduler caps and queued-task bounds.
  It still needs downstream-specific admission and cancellation/resource cleanup.
- **A blocking service consuming a reactive client at its edge**, converted once with
  `block()` on a permitted blocking thread (virtual or platform), outside an event loop.
  Preserve deadlines, empty-result/error behavior and context; cancellation may not abort
  remote work. Do not collect an unbounded stream into a request result.

## Hybrids that do not

- Blocking calls inside operators without deliberate isolation from non-blocking threads.
- `spring.threads.virtual.enabled=true` on a WebFlux application, expecting it to make
  blocking safe. It does not: the event loops are still event loops.
- Two models on the same request path, chosen per class by whoever wrote it.
- Rewriting incrementally without a boundary — a half-migrated pipeline is both models'
  costs and neither model's benefits.

## Writing the decision down

Whatever is chosen, record four things where the code lives: the workload shape that decided
it, where the concurrency bound comes from, what happens at that bound, and what evidence
would reopen the decision. A choice with no falsifier is a preference, and it will be
re-litigated by the next team every eighteen months.

## Sources

- [Reactive Streams specification](https://www.reactive-streams.org/) — demand and asynchronous boundaries; boundedness must be designed across the pipeline.
- [Reactor 3.7.2 Schedulers API](https://projectreactor.io/docs/core/3.7.2/api/reactor/core/scheduler/Schedulers.html) — virtual boundedElastic is available from Reactor 3.6.0 on Java 21+, retaining caps.
