---
name: reactive-backpressure
description: >
  Backpressure in reactive and asynchronous pipelines: Reactive Streams request semantics,
  the operators that break the protocol, bounded buffers and overflow strategies, blocking
  inside a non-blocking pipeline, and measuring where demand is actually being throttled.
  Use when memory grows in proportion to time under load, when a sequence terminates with an
  unexpected overflow error, when onBackpressureBuffer is used with no size or no
  BufferOverflowStrategy, when a refactor replaced a Reactor pipeline with unbounded task
  submission and the concurrency limit vanished, when block() or a JDBC call sits inside a
  pipeline, or when a dashboard queries a Reactor metric name that returns no series. Does
  not cover the queueing arithmetic behind a bounded buffer (littles-law-and-queueing), the
  thread-per-request alternative (thread-sizing-and-virtual-threads), or the scheduler
  underneath parallel operators (forkjoinpool-and-work-stealing).
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

1. **Classify the problem on the right axis first.** Is throughput limited because threads
   or carriers are scarce (concurrency), or because pending work has no ceiling (flow
   control)? The remedies do not substitute for each other.
2. **Check the three conditions for real backpressure.** A sustained rate mismatch, a need
   to propagate flow control across a process or protocol boundary, and multiple stages with
   different sustainable rates. With none of them present, a reactive pipeline is usually
   the wrong tool. See `references/flow-control-choices.md`.
3. **Name the admission-control point.** Something upstream must know how to slow down — a
   `Subscription.request(n)` the publisher honours, a Kafka `pause()`/`resume()`, a
   `Semaphore` before dispatching work. Without one, only an unbounded buffer exists.
4. **Choose the overflow strategy from the data's semantics**, not from the operator name.
   Losing the newest, the oldest, everything, or failing loudly are four different product
   decisions.
5. **Isolate every blocking call.** Blocking on a non-blocking scheduler degrades throughput
   silently and throws nothing. Push it to a bounded elastic scheduler or a dedicated
   executor, and let BlockHound find the ones review missed.
6. **Instrument demand, not just latency.** The requested amount, dropped items and
   protocol violations are the signals that show where flow control is or is not in force.
   See `references/instrumenting-backpressure.md`.
7. **Fix at the source.** A correction applied mid-pipeline moves the accumulation
   somewhere else rather than removing it.

## Rules

- Never let a Reactor-to-virtual-threads migration (or the reverse) drop a concurrency limit
  without an explicit replacement. `flatMap(..., maxConcurrency)` removed in favour of
  starting a thread per record has no ceiling at all; the substitute is a `Semaphore`, a
  bounded queue, or consumer `pause()`/`resume()`.
- `onBackpressureBuffer(maxSize, onOverflow)` **without** a `BufferOverflowStrategy` calls
  `onOverflow` and then **terminates the sequence with an error**. It is not drop-and-
  continue. If drop-and-continue is the intent, pass `DROP_LATEST` or `DROP_OLDEST`
  explicitly, or use plain `onBackpressureDrop()`.
- Never ship `onBackpressureBuffer()` with no arguments on a hot source. It grows until OOM.
  Every hot source — Kafka, WebSocket, anything producing before a subscriber exists — needs
  an explicit overflow strategy.
- `doOnDrop` does not exist on `Flux` or anywhere in `reactor-core`, in any version. The two
  real forms are `Hooks.onNextDropped(consumer)` (global, whole process) and
  `onBackpressureDrop(consumer)` (local, this `Flux`). They have different scopes and are not
  interchangeable.
- Never call `block()` inside a pipeline. Beyond the style objection it can deadlock: the
  blocked thread may be the one the inner `Mono` needs. Keep the chain asynchronous to the
  end.
- Never make a blocking call on `Schedulers.parallel()` or a Netty event loop. Wrap it in
  `Mono.fromCallable(...).subscribeOn(Schedulers.boundedElastic())` or a virtual-thread
  executor, and keep `BlockHound.install()` active in test and staging.
- Do not materialise a sequence that needs end-to-end backpressure. `collectList()` or
  `collect()` before the point where the consumer would apply flow control discards the
  backpressure the source was already honouring.
- The real Micrometer metrics from `.metrics()` are `%s.subscribed`, `%s.malformed.source`,
  `%s.requested`, `%s.onNext.delay` and `%s.flow.duration`. `reactor.flow.demand` and
  `reactor.flow.request.size` have never existed — a dashboard querying them matches no
  series, and the silence reads as "no traffic" instead of "wrong metric".
- A `%s.requested` histogram sitting at `Long.MAX_VALUE` means demand is effectively
  unbounded and no admission control is in force. A non-zero `%s.malformed.source` is always
  a bug, never normal operation.
- `reactor.util.concurrent.Queues` exposes only `reactor.bufferSize.small` (default 256) and
  `reactor.bufferSize.x` (default 32). `reactor.bufferSize.large` does not exist; setting it
  has no effect and reports nothing.
- Reactor emits no native JFR events. Bridging backpressure into JFR requires a custom event
  committed inside `Hooks.onNextDropped` — and it is an instant event, so a duration
  threshold does not apply to it.
- Under `λ > μ` sustained, only admission control at the source both bounds memory and keeps
  every item. A bounded buffer with a drop policy stabilises output at `μ` with measurable
  loss; an unbounded buffer only chooses how long until OOM.

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
