# Instrumenting a reactive pipeline

## The real Micrometer metrics

For modern Reactor, add `reactor-core-micrometer` and use
`.tap(Micrometer.metrics(registry))`. The older `.metrics()` operator is deprecated. Meter
names are not derivable by analogy from the operator that produced them; `%s` is the name
given via `.name(...)`, defaulting to `reactor`.

| Metric                | Type                                                 | What it measures                                                                                                                                              |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `%s.subscribed`       | Counter                                              | How many times a subscriber subscribed to this sequence                                                                                                       |
| `%s.malformed.source` | Counter                                              | Signals that violate the Reactive Streams protocol (`onNext` after `onComplete`/`onError`). Above zero is always a bug, never normal operation                |
| `%s.requested`        | DistributionSummary                                  | The amount asked for per `request(n)` call. A histogram parked at `Long.MAX_VALUE` means demand is effectively unbounded and no admission control is in force |
| `%s.onNext.delay`     | Timer                                                | Time between consecutive `onNext` emissions — a direct proxy for throughput and for where per-item latency sits                                               |
| `%s.flow.duration`    | Distribution summary, tagged with termination status | Duration of the whole sequence, from `subscribe()` to termination or cancellation                                                                             |

```java
Flux.range(1, 1000)
    .name("order-export")          // sets the %s prefix
    .tag("environment", "production")
    .tap(Micrometer.metrics(registry))
    .subscribe();
```

`reactor.flow.demand` and `reactor.flow.request.size` are plausible-sounding fabrications.
They match no series, and an alert built on them stays silent forever — which reads as "no
traffic" rather than "wrong metric name". Check any library metric name against the
implementation before wiring an alert to it.

## Three debugging tools, three different problems

```java
Flux.range(1, 100)
    .checkpoint("after-range")
    .map(x -> x / 0)
    .checkpoint("after-map")
    .subscribe(v -> {}, e -> log.error("failed", e));
```

`checkpoint()` is local and cheap — you pay only at the points you annotated, and the error's
stack trace names them.

`Hooks.onOperatorDebug()` is the global equivalent: it captures the full assembly stack trace
of _every_ operator in the application, at an overhead high enough to be unusable in
production under load.

```java
ReactorDebugAgent.init();                   // instruments classes loaded from here on
ReactorDebugAgent.processExistingClasses(); // and retro-instruments those already loaded
```

`ReactorDebugAgent` (`io.projectreactor:reactor-tools`) instruments assembly sites at class
load and generally costs less at subscription time than `onOperatorDebug()`. It is still an
agent/instrumentation choice: quantify startup, compatibility and runtime overhead on the
actual JDK before enabling it fleet-wide.

## BlockHound

A blocking call on a thread Reactor expects to be non-blocking — `Schedulers.parallel()`, a
Netty event loop — throws nothing by default. It just degrades throughput silently, because
that thread stops processing other items while it waits.

```java
public static void main(String[] args) {
    BlockHound.install();   // once, at startup; instruments via ByteBuddy
}
```

`reactor-core` ships a `BlockHoundIntegration` discovered automatically through
`ServiceLoader` as soon as the `blockhound` artefact is on the classpath, so Reactor's own
known blocking points are integrated without manual registration. BlockHound instruments a
known method set; native/library gaps and JDK compatibility mean a clean run is evidence,
not proof of absence. On JDK 13+ its documented setup also requires
`-XX:+AllowRedefinitionToAddDeleteMethods` for affected releases.

BlockHound combines an instrumented **call type** — file I/O, `Thread.sleep`, certain locks —
with whether the current thread is marked non-blocking. A blocking JDBC call inside
`Schedulers.boundedElastic()` is expected and normally should not fire because those threads
permit blocking. An unexpected result can mean a scheduler marker, integration, JDK support,
or exemption differs from the assumed environment.

## Instrumenting drops

The two real mechanisms have different scopes, and the difference matters.

```java
// GLOBAL: catches drops from ANY Flux in the process, including those from
// onBackpressureDrop() without its own consumer and Reactor-internal races.
Hooks.onNextDropped(dropped -> log.warn("dropped somewhere in the process: {}", dropped));

// LOCAL: only drops from this specific Flux.
fast.doOnRequest(n -> log.debug("requested: {}", n))
    .onBackpressureDrop(dropped -> log.warn("dropped by this flow: {}", dropped))
    .subscribe(slowSubscriber);
```

`doOnDrop` does not exist on `Flux` in any version of `reactor-core`. The upside of that
particular mistake is that it does not compile; the dangerous version of the same conceptual
error is the two-argument `onBackpressureBuffer`, which compiles and behaves differently from
what the name suggests.

### Bridging drops into JFR

Reactor emits no native backpressure JFR event, so emit a custom event from the **local
overflow/drop callback that owns the policy**. A global `Hooks.onNextDropped` hook catches
signals Reactor classifies as dropped; it is not a complete counter for every operator's
explicit overflow callback.

```java
@Label("Reactor Item Dropped")
@Category({"Reactor", "Backpressure"})
@Description("An onNext signal was dropped by backpressure overflow")
class ReactorDroppedEvent extends Event {
    String flowName;
    String itemType;
}

Flux<Event> controlled = source.onBackpressureDrop(dropped -> {
    ReactorDroppedEvent event = new ReactorDroppedEvent();
    event.flowName = "order-export";
    event.itemType = dropped.getClass().getSimpleName();
    event.commit();
});

try (RecordingStream rs = new RecordingStream()) {
    rs.enable(ReactorDroppedEvent.class);
    rs.onEvent(ReactorDroppedEvent.class.getName(),
        e -> metrics.increment("reactor.drops", "type", e.getString("itemType")));
    rs.startAsync();
}
```

This is an instant event, not a duration event, so a threshold does not apply to it.

## Pre-production checklist

- Every source that can outpace or ignore demand has a documented finite queue/admission
  point and overflow policy. Do not use "hot" as a proxy for those properties.
- Every `onBackpressureBuffer(maxSize, onOverflow)` was reviewed for a missing
  `BufferOverflowStrategy`, and its real behaviour — buffer-then-error, not drop-and-continue
  — was checked against what the team intended.
- No migration between concurrency models removed a limit (`maxConcurrency`, a semaphore, a
  bounded queue) without an explicit equivalent replacement.
- No chain that needs end-to-end backpressure uses `collectList` or `collect` before the
  point where the final consumer would apply flow control.
- `BlockHound.install()` is active in test and staging, covering the application's
  non-blocking schedulers.
- Every Micrometer name used in a dashboard or alert was checked against the real metric
  list, not invented by analogy.
- Every blocking call in a reactive pipeline is isolated on `boundedElastic()` or a dedicated
  virtual-thread executor — never on `Schedulers.parallel()`.

## Incident checklist

- Does a heap dump or JFR show pending items growing in proportion to time under load —
  explicit buffer size, or the count of live suspended tasks? That is absent flow control,
  not a leak of one particular object.
- Did the sequence terminate with an unexpected error? Check for an `onBackpressureBuffer`
  with no `BufferOverflowStrategy` before investigating anything else.
- Have BlockHound or a wall-clock profiler ruled out accidental blocking on a non-blocking
  thread as the cause of the degradation?
- Is this a concurrency incident (too few threads or carriers) or a flow-control incident
  (unbounded pending work)? Answer that before choosing a remedy.
- If the fix reduces input throughput, was it applied at the source as real admission
  control, or only at an intermediate point that moves the accumulation elsewhere in the
  pipeline?
