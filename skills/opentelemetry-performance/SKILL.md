---
name: opentelemetry-performance
description: >
  Designing OpenTelemetry tracing that remains causally useful within an explicit overhead
  and data-risk budget: auditing automatic/manual coverage, preserving context across
  asynchronous boundaries, choosing head/tail sampling and collector topology, controlling
  attributes/baggage, backpressure and export failure, and measuring application plus
  collector cost. Use when traces fragment, rare tails disappear, Collector memory grows,
  telemetry drops under incidents, instrumentation duplicates spans, or someone assumes a
  published agent-overhead figure applies locally. Trace schema design belongs to
  distributed-tracing-design; statistics to latency-statistics; profiling to
  continuous-profiling.
---

# OpenTelemetry Performance

## Purpose

Obtain trace evidence that is complete enough for the decision while bounding CPU,
allocation, network, storage, latency, cardinality, privacy and failure coupling.

Instrumentation can fail silently in two directions: missing/broken context hides causal
work, while duplicate or over-detailed telemetry changes the workload and overloads the
pipeline during the incident it should explain.

## Workflow

### 1. Define the performance question

State which journey, boundary, tail/error cohort and causal relationship must be visible.
Decide whether metrics, logs, profiles or traces are the right population evidence.
Traces explain individual paths; sampled traces alone do not generally estimate fleet
rates or quantiles without sampling-aware analysis.

### 2. Inventory actual instrumentation

Pin agent, SDK, semantic-convention and library versions. Inspect the current Java agent's
supported-library matrix and a smoke trace. Map ingress, egress, messaging, database and
async boundaries; locate duplicates, missing links and excessive internal spans.

Do not assume every I/O library is instrumented or that manual instrumentation is required.
Agent debug output can help in a controlled environment but may be verbose and is not a
production default.

### 3. Establish resource identity and schema

Set stable service identity and deployment/resource attributes through one authoritative
configuration path. Use versioned semantic conventions where available and a governed
domain schema otherwise. Avoid IDs or arbitrary strings on metrics; span attributes also
carry storage, indexing and privacy cost.

### 4. Verify context at each boundary

OpenTelemetry Context is immutable; making it current is scoped and must be closed. Default
Java ContextStorage is thread-local, while automatic instrumentation and Context wrapping
can propagate across many executors/frameworks. Therefore “nothing propagates” and
“everything propagates” are both wrong.

For every raw executor, CompletableFuture, virtual-thread, callback and reactive/messaging
boundary:

1. test whether the pinned instrumentation already wraps it;
2. assert parent/trace IDs in an integration fixture;
3. if missing, capture Context at submission and wrap/restore at execution;
4. avoid double wrapping and scope leaks.

Virtual threads do not inherit arbitrary thread locals by contract; agent/library support
and JDK combinations must be tested.

### 5. Choose sampling as an estimator and capacity policy

Head sampling decides early with limited information and bounds application/export volume.
Parent-based policies preserve the upstream decision, but trust-boundary and remote-parent
semantics need review.

Tail sampling buffers spans and decides from later trace properties. It can retain errors
or high latency but costs memory/CPU, delays export, loses late spans, and requires spans of
a trace to be routed consistently enough for the policy. Size decision wait, expected
traces, policies and collector shards from measured arrival/completion distributions.

Sampling policies change the dataset. Preserve decision metadata and use unbiased
probabilistic coverage when population estimation matters.

### 6. Engineer the telemetry failure path

Define batch queue, exporter timeouts/retries, memory limiter, load balancing, disk/agent
buffering if used, and drop behavior. Under backend/network failure, telemetry must not
unboundedly consume application or Collector resources. Monitor the telemetry pipeline with
independent signals: accepted/exported/dropped items, queue utilization, export failures,
collector CPU/memory and decision latency.

### 7. Measure overhead experimentally

Compare the production-relevant configuration against a baseline using randomized/blocked
repeated runs. Separate:

- agent bytecode/instrumentation cost;
- span creation/enrichment and context propagation;
- sampling/processing;
- batching/serialization/export;
- Collector and backend cost.

Hold observability and workload configuration fixed except the treatment. Measure useful
throughput, latency distribution, CPU, allocation/GC, memory, network and telemetry loss
under normal and failure scenarios. Report confidence and environment, not one percentage.

## Sampling decision table

| Need                          | Prefer                                | Main limitation                         |
| ----------------------------- | ------------------------------------- | --------------------------------------- |
| bounded representative sample | probabilistic head sampling           | rare late outcomes may be missed        |
| preserve upstream decision    | parent-based policy                   | remote trust and biased upstream sample |
| retain errors/slow traces     | tail sampling plus consistent routing | buffering, late/incomplete traces       |
| low-volume critical journey   | always-on or targeted head rule       | cost/cardinality/privacy                |
| fleet rates/SLO quantiles     | metrics with exemplars                | less per-request detail                 |
| exploratory incident capture  | time-bounded increased sampling       | pipeline overload/data exposure         |

## Attributes and baggage

- Span attributes remain on that span but add process/export/backend bytes and indexing
  cost; they are not free merely because they are not request headers.
- Baggage is separate contextual key/value data. A configured propagator may put it on
  downstream carriers; it is not automatically a span attribute.
- Baggage can cross trust boundaries, lacks inherent integrity guarantees and can expose
  sensitive data. Allowlist, validate, size-limit and strip it at egress.
- Do not put secrets in either. Minimize or hash/tokenize personal identifiers under an
  explicit policy; hashing may remain personal/linkable data.

## Span lifecycle rules

- End spans in a finally path and close Scope in lexical order.
- Record exception details and status according to semantic conventions; exception text can
  contain sensitive/high-cardinality data.
- Prefer library/agent spans at protocol boundaries; add manual spans where they represent
  meaningful business or hidden asynchronous work.
- Async sends end according to actual completion semantics, not immediately after enqueue
  unless the span explicitly models enqueue only.
- Cancellation of a future is not proof downstream work or export stopped.

## Failure modes

| Symptom                             | Distinguish with                                                 | Response                                            |
| ----------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| orphan root/subtree                 | boundary fixture, agent support/version, double instrumentation  | wrap missing context or remove duplicate            |
| tail traces absent                  | head decision, tail policy, late spans, dropped telemetry        | inspect sampling/drop path; retain metric exemplars |
| traces fragmented across collectors | trace-ID routing and exporter connections                        | consistent routing before tail decision             |
| Collector OOM/restarts              | trace rate/span count, decision wait, queue/retry/backend outage | bound buffers, shard, reduce detail/policy          |
| app latency rises with tracing      | allocation/CPU/export blocking and attributes                    | batch, sample, simplify and remeasure               |
| telemetry disappears during outage  | queues, exporter timeout/retry/drop counters                     | fail boundedly and preserve pipeline health         |
| sensitive data reaches third party  | baggage/attributes and propagator/egress                         | strip, rotate/revoke, assess incident               |

## Anti-patterns

**Manual spans before coverage inventory:** duplicates protocol spans and costs without new
causal information.

**Static-final tracer as performance law:** caching stable instruments is sensible, but
lookup micro-cost is rarely the governing overhead; measure the real hot path.

**Process-wide GC delta attached to a request:** concurrent requests observe the same
cumulative collector counter, so the attribute does not identify that request's cause.
Correlate timestamped JFR/GC events offline.

**Tail sampling behind a random balancer:** trace fragments lead to incomplete decisions.
Use a supported trace-aware routing topology and measure late fragments.

**Attach mode assumptions:** Java-agent startup/dynamic-attach/retransformation behavior is
version and distribution specific. Follow the pinned agent documentation and verify
coverage; do not claim premain is the only possible mechanism.

## Cross-skill routing

- [instrumentation patterns](references/instrumentation-patterns.md)
- [sampling, configuration and overhead](references/sampling-and-config.md)
- distributed-tracing-design for span topology and semantic boundaries.
- metrics-and-cardinality for metric dimensions.
- tail-latency-analysis for causal interpretation.
- continuous-profiling/JFR for runtime attribution.

## Authoritative references

- [OpenTelemetry Java](https://opentelemetry.io/docs/languages/java/)
- [OpenTelemetry Java API and Context](https://opentelemetry.io/docs/languages/java/api/)
- [OpenTelemetry Java agent](https://opentelemetry.io/docs/zero-code/java/agent/)
- [OpenTelemetry sampling](https://opentelemetry.io/docs/concepts/sampling/)
- [OpenTelemetry baggage](https://opentelemetry.io/docs/concepts/signals/baggage/)
- [OpenTelemetry security](https://opentelemetry.io/docs/security/)
