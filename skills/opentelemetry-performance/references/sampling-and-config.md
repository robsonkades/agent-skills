# Sampling, configuration and overhead

## When custom instrumentation is warranted

| Situation                                                                               | Decision                                                                                                |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| I/O (HTTP, DB, messaging) already covered by a supported library                        | Do not instrument by hand — confirm with `-Dotel.javaagent.debug=true` that the library is instrumented |
| Pure business logic (calculation, validation, loop) with no I/O                         | A custom span is the legitimate case — this is where hidden cost hides                                  |
| Business context that must be correlated across spans                                   | Span attribute for local visibility, Baggage when it has to cross services                              |
| A business count or distribution with no need for an individual trace                   | A custom metric (`Counter`, `Histogram`, `Gauge`), not a span                                           |
| The operation crosses a thread boundary (virtual thread, `CompletableFuture`, executor) | Capture `Context.current()` before the boundary; never assume automatic propagation                     |

## Head-based versus tail-based sampling

| Criterion                   | Head-based                                                          | Tail-based                                                                   |
| --------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| When the decision is made   | At the start, on the root span                                      | After the trace (or a window of it) completes                                |
| Information available       | Trace ID and root-span attributes only                              | The full trace: duration, errors, child spans                                |
| Where it runs               | Application SDK (`Sampler`)                                         | OpenTelemetry Collector (`tail_sampling` processor)                          |
| Buffer overhead             | None — immediate decision                                           | High — the Collector holds every span until it decides                       |
| Consistency across services | Guaranteed by `ParentBased`: children inherit the parent's decision | Requires every span of a trace to reach the same Collector                   |
| Ideal use                   | Uniform volume reduction, e.g. keep 10% of everything               | Capturing rare but interesting traces: errors, high latency                  |
| Main risk                   | Discards a trace that only becomes interesting later (a late error) | Buffer memory and latency; needs consistent trace-ID routing across replicas |

```java
SdkTracerProvider tracerProvider = SdkTracerProvider.builder()
    .setSampler(Sampler.parentBased(Sampler.traceIdRatioBased(0.10)))  // 10%, follows the parent
    .build();
```

```yaml
# otel-collector-config.yaml
processors:
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: errors-policy
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: latency-policy
        type: latency
        latency: { threshold_ms: 1000 }
      - name: rate-limiting-policy
        type: rate_limiting
        rate_limiting: { spans_per_second: 100 }
```

### Why tail sampling needs consistent routing

`tail_sampling` can only decide once it has seen every span of a trace, or at least those
arriving within `decision_wait`. With several Collector replicas behind an ordinary load
balancer, spans of the same trace — exported independently by different services — land on
different replicas by chance. Each replica then sees a fragment and decides on incomplete
evidence.

The fix is a load-balancing exporter stage in front of `tail_sampling`, routing by trace-ID
hash so every span of a trace reaches the same replica. `decision_wait` alone does not solve
it: the replica can still decide "drop" from a fragment, having waited the full time.

## Span attributes versus Baggage

| Criterion                 | Span attributes                                            | Baggage                                                                         |
| ------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Scope                     | Local to the span where it was set                         | The whole trace — every downstream span                                         |
| Cross-process propagation | Not propagated; stays in the tracing backend               | Propagated in headers (HTTP, Kafka), per W3C Baggage                            |
| Where it is visible       | The trace viewer, on that specific span                    | `Baggage.current()`, anywhere in the trace, in any downstream service           |
| Network overhead          | None extra — travels inside the exported span              | Bytes on every downstream request, growing with the number of entries           |
| Typical use               | Query duration, item count, a business value for that span | Tenant ID, feature flag, a correlation ID that must cross services              |
| Sensitive-data risk       | Low, though the tracing backend still sees it              | **High** — reaches every downstream system, including ones outside your control |

## `traceparent`

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             ^version  ^trace-id (32 hex, 128 bits)  ^parent-id (16 hex, 64 bits)  ^flags
```

An abbreviated form such as `00-abc123-xyz456-01` is not valid and no implementation emits
or accepts it — useful when judging whether an example in a document or a test fixture is
real.

## Java agent configuration precedence

| Priority | Mechanism                                                      | Example                             |
| -------- | -------------------------------------------------------------- | ----------------------------------- |
| 1        | `-Dotel.*` system properties                                   | `-Dotel.service.name=orders-api`    |
| 2        | `OTEL_*` environment variables                                 | `OTEL_SERVICE_NAME=orders-api`      |
| 3        | `.properties` file (`-Dotel.javaagent.configuration-file=...`) | `otel.service.name=orders-api`      |
| 4        | SDK and agent defaults                                         | `service.name=unknown_service:java` |

A conflict is resolved silently: `OTEL_SERVICE_NAME` in the container environment plus a
different `-Dotel.service.name` inherited from an old deploy script yields the system
property's value, with no error and no log line. Check both sources before concluding
anything about an unexpected `service.name`.

The agent must be passed as `-javaagent` on the command line. `premain` registers a
`ClassFileTransformer`, which the JVM calls for classes as they load — it cannot transform
classes already loaded, so attaching later loses coverage from boot. Each instrumentation
module also runs a build-time "muzzle" check that the method signatures its advice
references exist in the declared supported version range, which is what prevents injecting
bytecode against a library version that renamed an internal method.

## Measuring the agent's overhead

The point is to replace a published number with your own measurement, because the cost
scales with how many libraries get instrumented and how many spans are emitted.

1. Take an `opentelemetry-javaagent.jar` release compatible with the SDK version in use.
2. Use a simple HTTP application that the agent instruments automatically.
3. Run the same load test twice, e.g. `ab -n 5000 -c 20 http://localhost:8080/orders`:
   - baseline: `java -jar app.jar`
   - instrumented: `java -javaagent:opentelemetry-javaagent.jar -Dotel.service.name=overhead-lab -Dotel.traces.exporter=logging -Dotel.metrics.exporter=none -jar app.jar`
4. Collect p50, p99 and average CPU (`top` or `pidstat`) for each run.

Success criterion: the instrumented run completes without error and emits spans, and the p99
difference between the two runs is recorded from your measurement rather than assumed.
