# Instrumenting a reactive pipeline

## The real Micrometer metrics

For Reactor 3.7.5/core-micrometer 1.2.5, use the project's compatible `reactor-core-micrometer` and
`.tap(Micrometer.metrics(registry))`. The older `.metrics()` operator is deprecated. Meter
names are not derivable by analogy from the operator that produced them; `%s` is the name
given via `.name(...)`, defaulting to `reactor`.

| Metric                | Type                        | What it measures                                                                                                                               |
| --------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `%s.subscribed`       | Counter                     | How many times a subscriber subscribed to this sequence                                                                                        |
| `%s.malformed.source` | Counter                     | Signals that violate the Reactive Streams protocol (`onNext` after `onComplete`/`onError`). Above zero is always a bug, never normal operation |
| `%s.requested`        | DistributionSummary         | Request amounts observed for explicitly named Flux subscriptions; unbounded demand is local to that point                                      |
| `%s.onNext.delay`     | Timer                       | Flux subscription-to-first-value and subsequent inter-emission gaps, not individual item latency                                               |
| `%s.flow.duration`    | Timer with termination tags | Flux/empty Mono lifetime to observed termination/cancellation; valued Mono records at onNext; external cleanup/work can continue               |

```java
Flux.range(1, 1000)
    .name("order-export")          // sets the %s prefix
    .tag("environment", "production")
    .tap(Micrometer.metrics(registry))
    .subscribe();
```

`reactor.flow.demand` and `reactor.flow.request.size` are plausible-sounding fabrications.
This listener does not supply them. Missing series can reflect absent instrumentation,
ineligible sequence types/names or exporter naming, not zero traffic. An alert's treatment
of absence depends on its expression/configuration. Check names and missing-series behavior.

`requested` is created only for an explicitly named Flux with a non-default prefix in this
version, not Mono or unnamed Flux. `onNext.delay` is Flux-only and includes subscription to
first value, then successive value gaps. Neither metric is outstanding demand, buffered bytes
or per-item processing latency. Instrument those boundaries separately and check exporter
name/unit transformations before interpreting missing series. For valued Mono, this listener
records flow duration at `onNext`; it is not a measurement of later cleanup completion.

## Three debugging tools, three different problems

```java
Flux.range(1, 100)
    .checkpoint("after-range")
    .map(x -> x / 0)
    .checkpoint("after-map")
    .subscribe(v -> {}, e -> log.error("failed", e));
```

`checkpoint("label")` adds a lightweight local assembly marker; stack-capturing overloads cost
more. It enriches errors propagated through that checkpoint, not errors from every location.

`Hooks.onOperatorDebug()` is the global equivalent: it captures the full assembly stack trace
at assembly sites after installation. Its cost can be substantial; measure the actual workload
and prefer focused checkpoints when they supply the needed evidence.

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
Netty event loop — can silently stall it. Reactor's own blocking terminal APIs instead reject
marked non-blocking threads; arbitrary library calls may have no such check.

```java
// Partial setup: import reactor.blockhound.BlockHound; use a compatible test JVM.
public static void main(String[] args) {
    BlockHound.install();   // once, at startup; instruments via ByteBuddy
}
```

Classpath presence alone does not install instrumentation. In BlockHound 1.0.11.RELEASE,
`BlockHound.install()` loads `BlockHoundIntegration` services, including Reactor's shipped
integration; `-javaagent` installation also loads them. A bare `BlockHound.builder()` does
not load the SPI integrations unless requested. An existing test-framework integration may
already own installation: inspect that setup before adding another.

BlockHound instruments a known method set; native/library gaps and JDK compatibility mean a
clean run is evidence within its coverage, not proof of absence. The pinned release documents
`-XX:+AllowRedefinitionToAddDeleteMethods` for its JDK 13+ setup. That flag is not a compatibility
guarantee for every later JDK: verify the actual BlockHound/JDK build, installation mode and
required flags, then use positive detection controls on the application's schedulers.

BlockHound combines an instrumented **call type** — file I/O, `Thread.sleep`, certain locks —
with whether the current thread is marked non-blocking. A blocking JDBC call inside
`Schedulers.boundedElastic()` is expected and normally should not fire because those threads
permit blocking. An unexpected result can mean a scheduler marker, integration, JDK support,
or exemption differs from the assumed environment.

## Instrumenting drops

The two real mechanisms have different scopes, and the difference matters.

```java
// GLOBAL: signals Reactor routes as dropped, such as onNext after termination.
// Not a counter for every deliberate overflow/drop. Avoid logging raw payloads.
Hooks.onNextDropped(dropped -> recordLateSignal(dropped.getClass()));

// LOCAL: only drops from this specific Flux.
fast.doOnRequest(n -> log.debug("requested: {}", n))
    .onBackpressureDrop(dropped -> recordOverflow(dropped.getClass()))
    .subscribe(slowSubscriber);
```

`doOnDrop` does not exist on the pinned `Flux` API. The upside of that
particular mistake is that it does not compile. A two-argument `onBackpressureBuffer` does
compile; its notify/error/drain contract must be intentional rather than mistaken for a
drop-and-continue policy.

### Bridging drops into JFR

For a backpressure policy event, emit a custom JFR event from the **local
overflow/drop callback that owns the policy**. A global `Hooks.onNextDropped` hook catches
signals Reactor classifies as dropped; it is not a complete counter for every operator's
explicit overflow callback.

```java
// Partial Java 11+ snippet; imports jdk.jfr.* and reactor.core.publisher.Flux.
@Label("Reactor Item Dropped")
@Category({"Reactor", "Backpressure"})
@Description("An onNext signal was dropped by backpressure overflow")
class ReactorDroppedEvent extends Event {
    String flowName;
    String itemType;
}

Flux<WorkItem> controlled = source.onBackpressureDrop(dropped -> {
    ReactorDroppedEvent event = new ReactorDroppedEvent();
    if (!event.shouldCommit()) return;
    event.flowName = "order-export";
    event.itemType = dropped.getClass().getSimpleName();
    event.commit();
});

```

Enable the custom event before subscribing to `controlled`, and keep the recording/stream
alive through workload completion and event delivery. `startAsync()` followed by leaving a
try-with-resources block immediately closes a RecordingStream. Use a zero threshold for
these untimed commits and measure event volume; do not rely on a duration threshold as a
drop-rate limiter: a positive threshold can filter the instant events entirely. Keep a direct
bounded-label counter when complete drop accounting matters. The event callback records
telemetry; resource release still follows the discard/ownership policy.

## Pre-production checklist

Apply the relevant checks to changed bounds, policies or instrumentation; reuse adequate
existing evidence for a narrow review. This is not a mandatory tool rollout.

- Every source that can outpace or ignore demand has a documented finite queue/admission
  point and overflow policy. Do not use "hot" as a proxy for those properties.
- Each affected `onBackpressureBuffer(maxSize, onOverflow)` matches the intended notify/error/drain
  and recovery policy; an explicit drop strategy is needed only when drop-and-continue is intended.
- No migration between concurrency models removed a limit (`maxConcurrency`, a semaphore, a
  bounded queue) without an explicit equivalent replacement.
- Growing collection accumulators have a proven finite item/byte budget; their completion-only
  output is compatible with the consumer's streaming contract.
- BlockHound setup is compatible with the target JDK/library versions; positive controls
  demonstrate detection on the application's non-blocking schedulers.
- Every Micrometer name used in a dashboard or alert was checked against the real metric
  list, not invented by analogy.
- Every blocking call in a reactive pipeline is isolated on `boundedElastic()` or a dedicated
  virtual-thread executor — never on `Schedulers.parallel()`.

## Incident checklist

- Do repeated inventory/retention observations show growing buffers or suspended tasks?
  Check admission and actual completion rates; retained completed objects can also indicate
  a leak, and a single snapshot cannot establish growth over time.
- Did the sequence terminate with an unexpected error? Inspect the actual exception/cause and
  operator boundary. If it is an overflow, check demand and the selected local policy, including
  a two-argument buffer's delayed error; overflow alone does not prove a source violation.
- Have BlockHound or a wall-clock profiler found accidental blocking? Record coverage and
  sampling limitations; a clean run does not rule out unobserved paths.
- Which execution/resource constraints and retained-work bounds explain the observations?
  They can interact; classify the evidence before choosing a remedy.
- If the fix reduces input throughput, was it applied at the source as real admission
  control, or only at an intermediate point that moves the accumulation elsewhere in the
  pipeline?

## Sources

- [Micrometer meter listener, Reactor 3.7.5](https://github.com/reactor/reactor-core/blob/v3.7.5/reactor-core-micrometer/src/main/java/reactor/core/observability/micrometer/MicrometerMeterListener.java)
- [Reactor 3.7.5 drop implementation](https://github.com/reactor/reactor-core/blob/v3.7.5/reactor-core/src/main/java/reactor/core/publisher/FluxOnBackpressureDrop.java)
- [JDK 25 Event contract](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.jfr/jdk/jfr/Event.html)
- [BlockHound 1.0.11.RELEASE installation and SPI](https://github.com/reactor/BlockHound/blob/1.0.11.RELEASE/agent/src/main/java/reactor/blockhound/BlockHound.java)
- [BlockHound 1.0.11.RELEASE documented setup](https://github.com/reactor/BlockHound/blob/1.0.11.RELEASE/README.md)
