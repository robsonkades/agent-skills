# Sampling, Configuration and Overhead

## Sampling model

| Property          | Head sampling                           | Tail sampling                                 |
| ----------------- | --------------------------------------- | --------------------------------------------- |
| decision          | near trace start                        | after buffering spans until a decision        |
| information       | trace ID, parent and early attributes   | received duration/error/span attributes       |
| app export volume | bounded early for unsampled traces      | upstream generally records/exports candidates |
| main bias         | misses outcomes learned later           | policy-biased retained population             |
| capacity risk     | sampling CPU/export for retained traces | memory, decision wait, late spans, sharding   |

Parent-based behavior is configurable: sampled/unsampled remote and local parents can have
different delegate samplers. Review trust boundaries; blindly honoring external sampled
flags can enable telemetry amplification.

## Tail-sampling topology

All relevant spans must reach the same decision shard within the policy window. A common
topology is:

```text
agents / SDK exporters
  -> stateless receiving collectors
  -> trace-ID-aware load balancing
  -> stateful tail-sampling collectors
  -> exporters/backend
```

Verify component stability and configuration against the deployed Collector distribution.
Size with measured:

- new traces and spans per second;
- spans/bytes per trace distribution;
- trace completion and late-span distribution;
- decision wait and policy match rates;
- collector heap/RSS/CPU and GC;
- queue/exporter failure duration and drops.

Tail sampling cannot know spans arriving after its decision. Long-running traces and
asynchronous messaging need explicit policy or separate routing.

## Configuration governance

Java autoconfiguration can use system properties, environment variables, files,
programmatic customizers and newer declarative configuration with different precedence and
exclusivity. The rules change by agent/SDK mode and version. Generate an effective
configuration report from the pinned deployment and avoid duplicating the same field across
sources.

Set and test service.name, version/instance/deployment identity, propagators, sampler,
exporter endpoint/protocol, batch sizes, timeouts, queue limits and resource detectors.
Never expose credentials in diagnostics.

## Overhead experiment

Treatments should isolate:

1. baseline without OTel;
2. agent/SDK installed with export disabled or no-op where meaningful;
3. production instrumentation and sampler;
4. production exporter/Collector;
5. degraded telemetry backend or blocked network.

Use repeated randomized/blocked runs and the same workload/state. Measure:

- client latency distribution and useful throughput;
- process CPU, allocation, GC, heap/native memory and threads;
- network bytes/connections;
- spans/attributes/events/links per logical operation;
- SDK queue occupancy, export latency/failures and dropped items;
- Collector CPU/memory/GC/queue/drop and backend ingestion.

Logging exporters are diagnostic and can dominate overhead; do not use them as a proxy for
production OTLP. Include warmup and steady state separately. Report absolute and relative
effects with uncertainty.

## Failure-budget decisions

Prefer dropping bounded telemetry over blocking or exhausting the application, except where
regulatory/audit semantics require a separate durable pipeline. Traces are normally
diagnostic—not the source of truth for business events.

Define which signals survive overload: pipeline health, SLI metrics and sampled exemplar
coverage may be more valuable than every internal span. Test recovery after the backend
returns; retry queues can create a second overload.

## Sensitive data

Allowlist attributes and baggage; enforce count/value-length limits; strip propagation at
untrusted egress; transform/redact in a controlled processor; encrypt in transit; restrict
backend access/retention. The collector is a security boundary and DoS target.

## References

- [OpenTelemetry sampling](https://opentelemetry.io/docs/concepts/sampling/)
- [OpenTelemetry Collector scaling](https://opentelemetry.io/docs/collector/scaling/)
- [OpenTelemetry Java configuration](https://opentelemetry.io/docs/languages/java/configuration/)
- [OpenTelemetry baggage](https://opentelemetry.io/docs/concepts/signals/baggage/)
- [OpenTelemetry security](https://opentelemetry.io/docs/security/)
