# Architecture and cost model

## Decision record

Evaluate architectures against a written workload and threat model:

```text
runtimes/languages and deployment models:
required CPU/off-CPU/allocation/lock/native events:
required logical-work context:
kernel/process modification allowed:
JDK/OS/architecture matrix:
minimum detectable stack contribution:
collection and tail-latency budget:
network/storage/query budget and retention:
data residency/privacy controls:
operator ownership and recovery objectives:
```

Do a proof on the hardest representative workload: many virtual/platform threads, high
allocation, native code, autoscaling churn, restrictive containers, and backend outage.

## Architecture families

### In-process agent or native library

Prefer when Java/JIT stacks, profiler context, allocation/lock events, and per-process control
are essential. Costs include one lifecycle per JVM, compatibility with agents/instrumentation,
process failure coupling, upgrade rollout, and exporter backpressure.

Check:

- startup agent versus dynamic attach policy;
- JDK/vendor/architecture support and release pinning;
- coexistence with APM, security, JFR, and bytecode transformers;
- context propagation across logical work rather than carrier threads;
- local buffering, memory limits, rate limits, and kill switch;
- whether collection continues when the backend is unreachable.

### Native JFR

Prefer for JVM-native event chronology, low third-party footprint, and controlled JDK
integration. `default.jfc` is designed as a low-overhead starting point for continuous use;
that is not a guarantee for every added event, period, stack trace, or workload.

JFR provides recording and consumption primitives, not automatically a fleet profile store.
You still own target discovery, export, retry, deduplication, storage schema, stack
aggregation, symbol/build metadata, access control, query, and evidence-quality monitoring.

Use process-local rolling recordings for short “black box” history and dump/upload on trigger,
or stream selected events to a backend. A `RecordingStream` callback runs in the consumer
pipeline; keep it bounded and decouple slow I/O. Verify event loss/backpressure behavior.

### Host or eBPF collector

Prefer for multi-process/multi-language host visibility and minimal JVM modification. Costs
include kernel/host privilege, shared-node blast radius, kernel/architecture compatibility,
container/cgroup attribution, JIT symbol lifecycle, and weak application context.

For Java, native addresses are not enough. The design needs a supported JIT-symbol strategy
whose maps match process lifetime, PID namespace, code-cache reuse, ASLR, container image, and
collector time. Verify inlined/compiled/interpreted/virtual-thread fidelity. An attractive host
flame graph with unresolved or stale JIT frames is not production coverage.

### Managed service

Prefer when delegating backend operations, upgrades, UI, and retention is worth recurring cost
and vendor constraints. Validate actual engine/platform/event/context support, not product
category claims. Contract for data residency, tenant isolation, export/portability, retention,
sampling changes, query API, rate limits, incident support, and exit strategy.

## Hybrid patterns

| Need                                          | Pattern                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| Cheap JVM chronology plus code hotspots       | continuous default-like JFR + bounded CPU profiler                     |
| Multi-language nodes plus deep Java incidents | host collector + on-demand in-process/JFR capture                      |
| Tight production budget                       | sparse continuous screen + triggered high-resolution canary            |
| Backend outage resilience                     | bounded local ring + verified asynchronous export                      |
| High-risk tenant context                      | aggregate continuous profiles + authorized targeted contextual capture |

Avoid duplicating the same high-rate event through multiple agents unless the experiment
requires a comparison. Combined overhead, signal handlers, perf descriptors, JFR samples,
bytecode transforms, and export buffers can interact.

## Cost model

### Collection

For each channel estimate opportunities and measure accepted/dropped events:

```text
opportunities/s
  * selection probability or threshold pass rate
  * average stack frames/event
  * measured collection CPU/event
  = collection CPU demand
```

CPU sampling is bounded by consumed CPU time rather than nominal thread count. Wall sampling
can scale with eligible thread count, though implementations may batch/subsample. Allocation
events scale with allocation bytes and mechanism/interval; lock events with qualifying
contention; instrumentation with selected invocation rate.

Measure at steady state and bursts. Average rates hide exporter flush, class loading, GC,
virtual-thread mount/unmount, and lock storms.

### Transport and backend

```text
ingest ~= selected events * encoded event size
stored ~= ingest * retention * replication / compression-dedup ratio
index  ~= unique stack/context/time partitions * index amplification
query  ~= scanned partitions * resolution * requested interval
```

Stack interning/deduplication makes cost workload-dependent: stable stacks compress well;
dynamic names, hidden classes, unbounded labels, and stack-depth diversity do not. Retention
tiers and downsampling alter which historical questions remain answerable.

### Context cardinality

Do not use the Cartesian product as a prediction without active/churn data, but treat it as an
upper-bound warning:

```text
active profile partitions <= product of simultaneously active independent label values
churned partitions         += new values over the retention window
```

Test real active combinations and churn. Version labels may be low active cardinality but high
retention churn; raw paths/trace IDs/tenant IDs can be unbounded.

## Calibration experiment

Run at least these arms on the same workload blocks:

```text
A: no profiler
B: minimum continuous configuration
C: intended configuration
D: intended configuration with backend unavailable
E: intended configuration at peak event/thread/cardinality rate
```

Compare CPU seconds per successful operation, throughput, latency distribution, allocation,
GC, native memory, file descriptors, local disk, exporter queue, network bytes, lost/dropped
events, and backend ingest/query cost. Randomize/interleave arms where carry-over permits and
repeat across process restarts/hosts.

An acceptable average overhead with a tail spike during flush is a failed tail-latency budget.
A cheap configuration that misses the injected known stack is a failed coverage budget.

## JDK-specific decisions

The shipped `default.jfc` and `profile.jfc` are versioned configuration inputs. Diff them
across JDK upgrades and enumerate effective settings with the deployed tools. Add events one
at a time and measure.

For JDK 25 features:

- JEP 509 CPU-time profiling is experimental and platform-limited; check event metadata,
  shipped enablement, throttle meaning, and lost-sample event in that build.
- JEP 518 changes execution sampling internals to cooperative stack walking; do not convert
  implementation constants or an intended period into a per-thread coverage guarantee.
- JEP 520 method timing/tracing is experimental instrumentation of selected methods; use a
  bounded target/window and measure perturbation at real invocation rate.

Java 17 and 21 do not have these delivered features. A multi-JDK fleet needs explicit
capability negotiation and separate evidence epochs.

## Build versus buy criteria

Building a backend is justified only if the organization will own:

- schema evolution and version compatibility;
- ingestion authentication, retries, idempotency, and quotas;
- stack/context interning, indexing, retention, and deletion;
- fleet target inventory and missing-data detection;
- symbol/JIT metadata lifecycle;
- query correctness, normalization, and access control;
- upgrade, backup/restore, disaster recovery, and on-call.

The JDK provides collection APIs, not those guarantees. Conversely, a vendor does not remove
the need to validate profiler overhead, coverage, labels, and causal interpretation.

## Architecture fitness tests

- A known CPU/allocation/wait workload appears with the expected relative weights.
- An autoscaled target is discovered, labeled correctly, and removed without stale identity.
- A pod/process restart does not associate old JIT symbols or context with the new PID.
- Backend unavailability stays within local CPU/memory/disk limits and later recovery policy.
- A forbidden/high-cardinality label is rejected before export.
- JDK/agent/collector upgrade creates a visible schema/config epoch.
- An incident snapshot remains queryable after rolling retention expires.
- A compromised/unauthorized producer cannot impersonate another service or promote evidence.

## Authoritative references

- [JFR package API](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.jfr/module-summary.html)
- [JFR `RecordingStream`](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.jfr/jdk/jfr/consumer/RecordingStream.html)
- [Grafana Pyroscope Java client documentation](https://grafana.com/docs/pyroscope/latest/configure-client/language-sdks/java/)
- [Pyroscope Java source](https://github.com/grafana/pyroscope-java) — inspect the pinned tag's
  configuration and label APIs.
- [Parca Agent source](https://github.com/parca-dev/parca-agent) — host/eBPF collector support,
  privilege, and Java symbolization behavior for the pinned release.
