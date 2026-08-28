---
name: opentelemetry-performance
description: >
  OpenTelemetry as a performance instrument and as a performance cost: head-based versus
  tail-based sampling and what each hides of the tail, span attributes versus Baggage and
  what each costs, context propagation across executors, CompletableFuture and virtual
  threads, and measuring the agent's own overhead. Use when a trace shows an orphan root
  span, when a child span appears disconnected after `Thread.ofVirtual().start(...)` or
  `CompletableFuture.runAsync`, when a backend shows `unknown_service:java`, when spans leak
  because `end()` is not in a finally, when a slow trace was sampled away, when tail-based
  sampling drops traces across Collector replicas, or when someone quotes a published
  agent-overhead number. Does not cover the statistics of the numbers a trace produces
  (latency-statistics), profiles as opposed to traces (continuous-profiling), or
  interpreting the tail the traces reveal (tail-latency-analysis).
---

# OpenTelemetry Performance

## Purpose

Get traces that answer performance questions, at a cost you have measured. Two things
decide whether tracing earns its overhead: whether the trace is intact across every thread
boundary the request crosses, and whether the sampling strategy keeps the traces that
matter. Both fail silently — a broken context produces a valid-looking trace that is simply
fragmented, and head-based sampling discards a trace before anyone knows it became
interesting.

The specific failure this prevents is the confident conclusion drawn from an incomplete
trace: latency attributed to the last visible span because the expensive work happened in
an orphaned subtree, or a tail investigation run against traces from which the tail was
sampled out.

## Workflow

1. **Find out what is already instrumented.** Run with `-Dotel.javaagent.debug=true` before
   writing any manual span. Supported I/O libraries — Spring MVC, JDBC drivers, Kafka
   clients, HTTP clients — are already covered, and duplicating them adds cost and noise.
2. **Pick the right instrument for the gap.** Pure business logic with no I/O is the
   legitimate custom-span case; a business count or distribution is a metric, not a span;
   context that must cross services is Baggage, context local to one span is an attribute.
3. **Handle every thread boundary explicitly.** Capture `Context.current()` **before** the
   boundary and call `makeCurrent()` **inside** it. Nothing propagates on its own outside a
   library the agent already wraps.
4. **Choose sampling for the question being asked.** Uniform volume reduction is
   head-based; capturing rare error or high-latency traces is tail-based in the Collector,
   with the routing requirement that entails.
5. **Fix the identity and the configuration source.** Set `service.name` explicitly, and
   check that `-Dotel.*` and `OTEL_*` are not setting the same field to different values.
6. **Measure the agent's overhead here.** Same load test with and without
   `-javaagent`, comparing p50, p99 and average CPU. A published percentage is a
   hypothesis about someone else's library mix.

## Rules

- Hold `Tracer` and `Meter` in `static final` fields. `GlobalOpenTelemetry.getTracer(...)`
  on every request is a lookup on every request.
- Put `span.end()` in `finally`, with `recordException` and `setStatus(StatusCode.ERROR, …)`
  in the `catch`. An `end()` written after the work inside a `try` block does not run when
  the work throws.
- `Context` is immutable — `with(...)` returns a new instance. That is what makes it safe to
  capture `Context.current()` into a variable and restore it across several thread
  boundaries.
- The default `ContextStorage` is a plain `ThreadLocal` with **no inheritance**. A virtual
  thread from `Thread.ofVirtual().start(...)`, a raw `ExecutorService`, and
  `CompletableFuture.runAsync` all start from `Context.root()`; `Span.current()` there
  returns `Span.getInvalid()` and the new span becomes an orphan root. It compiles, runs and
  produces a trace — a fragmented one.
- Virtual threads change nothing about this rule. They only change where people assume it is
  already handled.
- A `traceparent` has a 32-hex-character `trace-id` (128 bits) and a 16-hex-character
  `parent-id` (64 bits). An abbreviated id such as `00-abc123-xyz456-01` is not a valid
  header and no implementation produces or accepts it.
- Never put PII or secrets in Baggage. It propagates via headers to every downstream
  service, including ones behind a gateway that you do not control. Attributes stay local
  to the span.
- Baggage adds bytes to every downstream request and grows with the number of entries.
  Attributes cost nothing extra on the wire — they travel inside the span already exported.
- Tail-based sampling requires every span of a trace to reach the same Collector replica.
  With several replicas behind a plain load balancer, each sees a fragment and decides
  inconsistently; put a load-balancing exporter that routes by trace-ID hash in front of the
  `tail_sampling` processor. `decision_wait` alone does not fix this.
- Head-based sampling must be `ParentBased` so children inherit the root's decision. Its
  structural risk is discarding a trace that only becomes interesting later — a late error.
- Config precedence is `-Dotel.*` > `OTEL_*` env var > `.properties` file > defaults, and a
  conflict between two sources is resolved silently, with no warning. Check both before
  concluding why `service.name` is wrong.
- Never accept `unknown_service:java` in production. Set `service.name` and `service.version`
  on the `Resource`.
- Instrument the **publish** side of messaging with an explicit `SpanKind.PRODUCER` span, not
  only the `CONSUMER` side. Without it, the time and failures of `send()` are invisible.
  Removing the producer span does not break `propagator.inject` — that depends only on
  `Context.current()` — it removes visibility.
- `gaugeBuilder(...).ofLongs().buildWithCallback(...)` returns `ObservableLongGauge`. There
  is no generic `ObservableGauge<Long>` in `io.opentelemetry.api.metrics`.
- Custom business attributes (`order.id`, `order.tenant`) are **not** OpenTelemetry Semantic
  Conventions. Semantic Conventions are a specific, versioned registry
  (`io.opentelemetry.semconv`, e.g. `http.request.method`, `db.system.name`); domain
  attributes follow only your own naming convention.
- Pass `-javaagent` on the command line. A `ClassFileTransformer` registered from `premain`
  cannot transform classes already loaded, so attaching later loses coverage from boot.
- Report agent overhead only from your own measurement. It scales with how many libraries
  are instrumented and how many spans are emitted, so a published figure does not transfer.

## References

- [Instrumentation patterns](references/instrumentation-patterns.md) — static `Tracer` and
  `Meter` setup, the correct span lifecycle, explicit context capture across virtual
  threads and `CompletableFuture`, Kafka `PRODUCER`/`CONSUMER` inject and extract, and
  correlating a span with GC time. Read when writing or reviewing instrumentation code.
- [Sampling, configuration and overhead](references/sampling-and-config.md) — head versus
  tail sampling, attributes versus Baggage, the `tail_sampling` Collector configuration and
  its routing prerequisite, the agent configuration precedence table, a decision table for
  when custom instrumentation is warranted, and the overhead measurement procedure. Read
  when choosing a sampling strategy, debugging agent configuration, or being asked what
  tracing costs.
