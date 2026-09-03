# The comparison, dimension by dimension

| Dimension                      | Virtual threads (thread-per-request)                                 | Reactive (Reactive Streams / Reactor)                              |
| ------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Programming model              | sequential statements; ordinary control flow                         | operator pipeline; control flow is data flow                       |
| Blocking I/O                   | intended for supported blocking operations; carrier usually unmounts | isolate from event loops; arbitrary blocking can stall one         |
| Non-blocking I/O               | used underneath, invisible to the code                               | used directly and visibly                                          |
| Backpressure                   | only where a bounded resource is declared                            | built into the protocol — and breakable by operator choice         |
| Cancellation                   | interruption; cooperative; structural inside a scope                 | `Subscription.cancel()`, propagated by the operators               |
| Error propagation              | `try`/`catch`, with a stack trace that names the request             | `onError` signals; stack traces need `onOperatorDebug`/checkpoints |
| Composition                    | method calls; `StructuredTaskScope` for fan-out                      | operators: `zip`, `merge`, `window`, `retryWhen`, `timeout`        |
| Time-shaped operations         | manual (timers, buffers, schedulers)                                 | first-class (`debounce`, `sample`, `bufferTimeout`, `window`)      |
| Debugging                      | breakpoints, stack traces, thread dump per request                   | operator debugging with real overhead; no per-request thread       |
| Profiling                      | flame graph attributes cost to the request's stack                   | cost attributed to loop threads and operators, not to requests     |
| Memory per in-flight request   | continuation stack plus request state (workload-dependent)           | subscription, operator, context and buffered state                 |
| Memory per **idle** connection | parked stack when a thread is dedicated to it                        | subscription/operator state; measure the concrete chain            |
| CPU-bound work                 | no benefit; ceiling is the core count                                | no benefit; same ceiling                                           |
| Ecosystem                      | all blocking libraries, which is most of them                        | Netty, R2DBC, reactive Kafka/Mongo/Redis clients                   |
| Operational complexity         | familiar; the pool tuning that used to exist is gone                 | schedulers, prefetch, demand, operator semantics                   |
| Where teams get it wrong       | forgetting to re-declare the limit the pool used to impose           | a blocking call, or an operator that silently unbounds a buffer    |

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
- The reactive model's per-connection saving evaporates the moment each connection buffers
  application data. An unbounded buffer per subscriber is far more expensive than a stack.

Measure both at your target concurrency before letting this dimension decide anything.

## Where backpressure comes from

```text
Reactive:      consumer requests N  →  producer sends at most N
               Correct only if every operator in the chain preserves demand.
               Broken by: unbounded onBackpressureBuffer, oversized publishOn
               queues, high flatMap concurrency, unbounded Sinks.

Virtual threads: the caller blocks until a bounded resource is available
               Correct only if a bounded resource exists on the path.
               Broken by: replacing a pool with an unbounded virtual-thread
               executor and declaring nothing in its place.
```

Both are "backpressure by construction" claims that fail the same way — by a single
component in the chain being unbounded. The difference is where you look: an operator list in
one case, a resource inventory in the other.

## Failure shape under overload

| Overload arrives         | Virtual threads                                         | Reactive                                                      |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------- |
| Requests exceed capacity | in-flight count grows; heap grows with suspended stacks | demand throttles upstream; buffers fill to their bound        |
| Bound reached            | rejection _if_ a limit exists, otherwise OOM            | overflow strategy fires: error, drop, or latest               |
| Dependency slows         | more concurrent waiters, each holding its resources     | demand slows automatically; buffers absorb the difference     |
| Symptom on a dashboard   | heap and thread count rise; latency rises               | queue/buffer gauges rise; `onErrorDropped` or overflow errors |
| Worst realistic outcome  | OOM from unbounded in-flight work                       | silent data loss from a drop strategy nobody chose            |

Neither shape is better in the abstract. Both are survivable if the bound was chosen and
instrumented, and both are outages if it was inherited.

## Hybrids that work

- **Streaming endpoints reactive, everything else blocking.** Spring MVC with virtual threads
  for CRUD, WebFlux (or a separate service) for SSE and WebSocket. The boundary is the
  endpoint, which is easy to document and to reason about.
- **A reactive pipeline whose blocking leaves run on virtual threads.** Reactor's
  `boundedElastic` on virtual threads keeps one legacy blocking call from starving the event
  loops — provided something still bounds the concurrency, because that flag removes the
  scheduler's own cap.
- **A blocking service consuming a reactive client at its edge**, converted once with
  `block()` **on a virtual thread** and never inside a pipeline. Ugly, honest, and correct.

## Hybrids that do not

- Blocking calls inside operators, "just this once".
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
