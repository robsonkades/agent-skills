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

Concurrency and flow control answer different, related questions: how work executes or
occupies resources, and how much pending work may accumulate. Concurrency alone does not
establish memory growth. Track admitted arrivals, actual departures and retained items/bytes
at the same boundary over time; sustained excess retained input can grow backlog, while a
finite burst may drain. A local limit may move waiting work to producers or another stage.

## Workflow

Inspect the project's Java release, Reactor/BOM and Micrometer versions, scheduler settings
and source/client cancellation contracts first. Examples target Reactor 3.7.5 with
reactor-core-micrometer 1.2.5; core snippets are partial Java 8+ code, JFR uses Java 11+,
virtual threads require Java 21+. Structured concurrency remains version-sensitive/preview
on JDK 25. Adapt to the existing stack without upgrading it just to use an example.

Use the steps needed for the question or changed pipeline contract. Preserve an adequate
existing operator, admission policy and evidence; a narrow explanation or supported no-change
review need not add instrumentation, migrate concurrency models or run a full test campaign.

1. **Separate execution constraints from pending inventory.** Inspect thread/carrier and
   downstream-resource availability alongside retained work, rates and queue bounds.
   Constraints can interact; no ceiling alone does not explain an observed throughput limit.
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
6. **Check demand and inventory evidence, not just latency.** Requested amounts, dropped
   items and observed malformed signals answer different questions from queued bytes,
   active work and admission/completion rates. Add instrumentation where evidence is missing.
   See `references/instrumenting-backpressure.md`.
7. **Trace the resulting bounds end to end.** A local bound can protect a stage, but inspect
   where rejected, delayed or cancelled work goes next. Return a per-subscription and shared
   resource budget and overflow/cleanup policy for changed bounds, with relevant slow-consumer
   and cancellation checks actually run versus pending. For a narrow review, return the
   supported keep/change decision and its material limits.

## Rules

- Never let a Reactor-to-virtual-threads migration (or the reverse) drop a concurrency limit
  without an explicit replacement. `flatMap(..., maxConcurrency)` removed in favour of
  starting a thread per record has no ceiling at all; the substitute is a `Semaphore`, a
  bounded queue, or consumer `pause()`/`resume()`.
- `onBackpressureBuffer(maxSize, onOverflow)` **without** a `BufferOverflowStrategy` calls
  `onOverflow` and then **terminates with an overflow error after buffered values drain**
  in the pinned version. With no demand, downstream may not see the error yet. It is not drop-and-
  continue. If drop-and-continue is the intent, pass `DROP_LATEST` or `DROP_OLDEST`
  explicitly, or use plain `onBackpressureDrop()`. Keep the two-argument form when its
  notify/error/drain and recovery contract is intended and adequate.
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
  `reactor.flow.request.size` are not supplied by this listener in these versions. A query
  for an absent meter is not evidence of zero traffic; inspect exporter names, instrumentation
  and the dashboard/alert's missing-series behavior.
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
- Under sustained retained input above departures, bound admission at a source that can
  actually slow down, or choose explicit rejection/drop or durable transfer. Bounded local
  admission cannot preserve indefinitely growing external offered work in finite resources:
  identify where unaccepted work waits or is disposed of, including producer waiters.
  Durable queueing moves the capacity/retention bound to storage; partitioning can raise
  service capacity. An unbounded heap buffer cannot absorb a sustained deficit indefinitely.

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
