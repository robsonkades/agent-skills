---
name: reactive-backpressure
description: >
  Backpressure in reactive and asynchronous pipelines: Reactive Streams request semantics,
  operators that reshape demand, bounded buffers and overflow strategies, blocking
  inside a non-blocking pipeline, and measuring where demand is actually being throttled.
  Use when memory grows in proportion to time under load, when a sequence terminates with an
  unexpected overflow error, when onBackpressureBuffer is used with no size or no
  BufferOverflowStrategy, when a refactor replaced a Reactor pipeline with unbounded task
  submission and the concurrency limit vanished, when block() or a JDBC call sits inside a
  pipeline, or when a dashboard queries a Reactor metric name that returns no series. Does
  not cover the queueing arithmetic behind a bounded buffer (littles-law-and-queueing), the
  thread-per-request alternative (thread-sizing-and-virtual-threads), or the scheduler
  underneath parallel operators (executors-and-task-lifecycle).
---

# Reactive Backpressure

## Purpose

Decide how much pending work a pipeline is allowed to accumulate, and make that decision
explicit somewhere a reader can find it. The failure this skill prevents is the silent
regression to an unbounded queue: a concurrency limit that disappears during a refactor, or
an `onBackpressureBuffer` whose real behaviour is not the one its name suggests.

Concurrency and flow control are orthogonal axes. Concurrency answers "how does the system
run many units of work without one blocked unit stopping the others". Flow control answers
"how much pending work may accumulate before someone must act". A system can have excellent
concurrency and no flow control at all — and that combination is exactly how memory grows
linearly with time under load.

## Workflow

Inspect the project's Java release, Reactor/BOM and Micrometer versions, scheduler settings
and source/client cancellation contracts first. Examples target Reactor 3.7.5 with
reactor-core-micrometer 1.2.5; core snippets are partial Java 8+ code, JFR uses Java 11+,
virtual threads require Java 21+. Structured concurrency remains version-sensitive/preview
on JDK 25. Adapt to the existing stack without upgrading it just to use an example.

1. **Classify the problem on the right axis first.** Is throughput limited because threads
   or carriers are scarce (concurrency), or because pending work has no ceiling (flow
   control)? The remedies do not substitute for each other.
2. **Check the workload signals for real backpressure.** A sustained rate mismatch, a need
   to propagate flow control across a process or protocol boundary, or multiple stages with
   different sustainable rates each strengthen the case. They are decision signals, not a
   theorem that all must hold. See `references/flow-control-choices.md`.
3. **Name the admission-control point.** Something upstream must know how to slow down — a
   `Subscription.request(n)` the publisher honours, a Kafka `pause()`/`resume()`, a
   `Semaphore` before dispatching work. If the source cannot slow down, explicitly choose
   bounded rejection/drop or durable transfer; also bound producers waiting for admission.
4. **Choose the overflow strategy from the data's semantics**, not from the operator name.
   Losing the newest, the oldest, everything, or failing loudly are four different product
   decisions.
5. **Isolate every blocking call.** Reactor's own blocking terminal APIs fail on marked
   non-blocking threads, but arbitrary JDBC, file or vendor calls may merely stall the event
   loop. Push them to a bounded elastic scheduler or a deliberately bounded executor, and
   use BlockHound as a test aid rather than as proof that every blocking path is covered.
6. **Instrument demand, not just latency.** The requested amount, dropped items and
   protocol violations are the signals that show where flow control is or is not in force.
   See `references/instrumenting-backpressure.md`.
7. **Trace the resulting bounds end to end.** A local bound can protect a stage, but inspect
   where rejected, delayed or cancelled work goes next. Return a per-subscription and shared
   resource budget, overflow/cleanup policy and evidence that slow-consumer and cancellation
   tests respect them.

## Rules

- Never let a Reactor-to-virtual-threads migration (or the reverse) drop a concurrency limit
  without an explicit replacement. `flatMap(..., maxConcurrency)` removed in favour of
  starting a thread per record has no ceiling at all; the substitute is a `Semaphore`, a
  bounded queue, or consumer `pause()`/`resume()`.
- `onBackpressureBuffer(maxSize, onOverflow)` **without** a `BufferOverflowStrategy` calls
  `onOverflow` and then **terminates with an overflow error after buffered values drain**
  in the pinned version. With no demand, downstream may not see the error yet. It is not drop-and-
  continue. If drop-and-continue is the intent, pass `DROP_LATEST` or `DROP_OLDEST`
  explicitly, or use plain `onBackpressureDrop()`.
- Never place argument-free `onBackpressureBuffer()` after a source that can outpace or
  ignore downstream demand without proving a finite bound. Hot/cold and backpressure-aware/
  unaware are different axes: some hot publishers honour per-subscriber demand, while a
  cold source can still be materialised into an unbounded collection.
- The pinned `Flux` API has no `doOnDrop`. Use the local overflow/drop callback for that
  policy, `doOnDiscard` where the operator supports cleanup, and `Hooks.onNextDropped` for
  dropped signals such as late emissions. These mechanisms are not interchangeable.
- Do not call `block()` from an operator callback or a non-blocking scheduler. Reactor rejects
  its blocking terminal APIs on default `single`/`parallel` threads, and other scheduler
  cycles can deadlock. A single conversion at an imperative boundary on a virtual or
  otherwise block-capable thread is a different, explicit interop decision.
- Never make a blocking call on `Schedulers.parallel()` or a Netty event loop. Wrap it in
  `Mono.fromCallable(...).subscribeOn(Schedulers.boundedElastic())` or a virtual-thread
  executor with explicit admission limits. `Mono.just(blockingCall())` evaluates eagerly;
  scheduling it afterwards cannot move the call. Use a supplier/callable and validate
  BlockHound compatibility before enabling it in test/staging.
- `collectList()` or a `collect()` accumulator growing with input retains the whole result
  before emitting it, removing incremental consumption. This remains protocol-compliant;
  require a proven finite item/byte bound. A constant-size accumulator has a different
  memory contract, though it still waits for source completion.
- The modern `reactor-core-micrometer` metrics from
  `.tap(Micrometer.metrics(registry))` include `%s.subscribed`, `%s.malformed.source`,
  `%s.requested`, `%s.onNext.delay` and `%s.flow.duration`; the older `.metrics()` operator
  is deprecated. `reactor.flow.demand` and
  `reactor.flow.request.size` are not supplied by these versions — a dashboard querying them matches no
  series, and the silence reads as "no traffic" instead of "wrong metric".
- A `%s.requested` sample at `Long.MAX_VALUE` means that subscriber requested unbounded
  demand at the instrumented point. It does not prove the whole system lacks admission
  control: a broker, connection pool or upstream protocol may still bound it. A non-zero
  `%s.malformed.source` identifies a malformed signal seen by that listener; zero does not
  certify every protocol rule. Requested samples are not current backlog or active calls.
- `reactor.util.concurrent.Queues` exposes only `reactor.bufferSize.small` (default 256) and
  `reactor.bufferSize.x` (default 32). `reactor.bufferSize.large` does not exist; setting it
  has no effect and reports nothing.
- For a custom backpressure JFR signal, instrument the local callback that owns the policy,
  enable the event before subscribing and keep the recording alive through the capture.
  Follow `references/instrumenting-backpressure.md`; a global dropped-signal hook is incomplete.
- Under sustained `λ > μ`, source admission is the only in-memory option that both bounds
  backlog and keeps every item. Durable spill/queueing can preserve data by moving the bound
  to disk and recovery time; partitioning can raise `μ`; a drop policy accepts measurable
  loss. An unbounded heap buffer only postpones failure.

## References

- [Flow control choices](references/flow-control-choices.md) — the concurrency-versus-flow-
  control table, the three conditions that make reactive backpressure the right answer, the
  scenario-by-scenario comparison against thread-per-request, the full overflow strategy
  table with each operator's real signature and behaviour, and prefetch and maxConcurrency
  tuning. Read when choosing where to apply flow control or which overflow policy a stream
  should have.
- [Instrumenting backpressure](references/instrumenting-backpressure.md) — the real
  Micrometer metric names and what each one reveals, `checkpoint()` versus
  `ReactorDebugAgent` versus `Hooks.onOperatorDebug()`, BlockHound setup and its detection
  model, the drop-to-JFR bridge, and the pre-production and incident checklists. Read when
  instrumenting a pipeline or investigating one that is misbehaving.
