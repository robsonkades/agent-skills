# Collection, context, storage, and query protocol

## Configuration as a versioned contract

Keep a checked-in profile policy separate from deployment wiring:

```yaml
schemaVersion: 1
service: order-service
epoch: jdk25-profiler45-policy3
channels:
  cpu:
    enabled: true
    interval: calibrated-value
  allocation:
    enabled: false
context:
  allowed: [service, version, environment, operation]
  maxActiveValues:
    operation: 100
retention:
  rolling: 7d
  incidentHold: 30d
budgets:
  cpuPerOperation: measured-limit
  tailLatency: measured-limit
  exportQueueBytes: bounded-limit
```

This YAML is a policy sketch with placeholders, not a runnable vendor configuration.
The deployment translates this policy to the pinned JFR/profiler/vendor API. Validate the
translation against runtime metadata/help and emit the effective configuration. Third-party
Java APIs and defaults move; do not preserve uncompiled SDK snippets as platform truth.

Configuration rollout needs canary percentage, health criteria, automatic/manual rollback,
kill switch, and an epoch marker. A profiler update is an observability change that can alter
both overhead and historical comparability.

## Native JFR rolling buffer

For a target JDK, inspect first:

```bash
jcmd <pid> help JFR.start
jfr configure --interactive
jfr metadata
```

These are POSIX-shell sketches with placeholders. `jcmd <pid>` queries the running target;
`jfr metadata` without a recording and `jfr configure` use the local tool's JDK. Use the target's
toolchain or inspect a target-produced recording (`jfr metadata recording.jfr`) before assuming
event support. Run interactive configuration only in a deliberate output directory; preserve
existing policy files and review the generated settings before deployment.

A conceptual continuous recording uses a low-overhead settings file, no finite duration, and
bounded age/size:

```bash
jcmd <pid> JFR.start \
  name=continuous \
  settings=/etc/service/continuous.jfc \
  maxage=24h \
  maxsize=512m
```

Exact syntax/options are JDK-version inputs; validate them on the deployed runtime. Define
disk repository location and `dumponexit`/filename behavior deliberately. `maxage` and
`maxsize` limit retained chunks but do not promise an exact time horizon when event volume,
chunk size, disk failure, or process lifecycle intervenes.

On incident trigger, dump a bounded window to a unique local path, checksum it, upload
atomically, verify remote receipt, and retain metadata:

```bash
jcmd <pid> JFR.dump \
  name=continuous \
  begin=-30m \
  filename=/var/log/jfr/incident-<id>-<timestamp>.jfr
```

Discover whether `begin`, `end`, path expansion, view, or other conveniences exist in the
target JDK rather than assuming cross-version support. Do not stop the rolling recording just
to take a snapshot unless the operational protocol requires it.

Changing collection settings is separate from `JFR.dump`. Before starting an elevated
recording, inventory active sessions with the target's `JFR.check` and record the overlap;
the continuous recording's own configuration does not describe all effective event settings.
See [hybrid patterns](architecture-choice.md#hybrid-patterns).

## RecordingStream design

`RecordingStream` requires JDK 14+ with JFR support. `start()` blocks; `startAsync()` starts
asynchronous processing and returns `void`, not a thread handle. Use `awaitTermination` where
waiting is required and assign ownership of closure. That API fact does not make
an exporter safe. Event handlers must avoid blocking I/O, unbounded maps, per-event logging,
and expensive symbol/string transformations.

Architecture:

```text
RecordingStream callback
  -> validate/minimize and copy required data into an owned payload
  -> bounded in-memory handoff
  -> batch/encode/export worker
  -> retry with bounded spool
  -> authenticated backend
```

Specify overload behavior: sample/drop by class, spill to bounded disk, or disable a channel.
With event reuse enabled (`setReuse(true)`), do not retain `RecordedEvent` references beyond the
callback. Copy the required fields/stack representation before handoff, or deliberately disable
reuse and budget the retained objects. Bound the stream's own disk retention with `setMaxAge`
and/or `setMaxSize` as well as the exporter queue/spool; without either limit its recording may
grow indefinitely. These are recording retention controls, not a filesystem quota.

Expose dropped-event and queue-age metrics. The pipeline owner must close the stream, stop its
separate workers, flush within a deadline, and leave recoverable spool state; stream closure
does not manage application-owned workers. Test application shutdown, exporter exception,
callback exception, backend timeout, and schema rejection.

Preserve full stack and event weight where profiling queries require them. A map keyed only by
top method loses caller ownership, timestamp, thread/task context, and uncertainty; exporting
such a counter is telemetry, not a continuous profiler.

## Context propagation contract

For each allowed dimension:

| Field            | Question                                                                 |
| ---------------- | ------------------------------------------------------------------------ |
| Semantic source  | Is this authenticated route/workload metadata or user input?             |
| Canonicalization | How are case, aliases, unknown, and version formats normalized?          |
| Bound            | Maximum simultaneous values and churn per retention window?              |
| Privacy          | Personal/customer/security classification and permitted viewers/regions? |
| Propagation      | Which executor/reactive/virtual-thread/async boundaries carry it?        |
| Lifetime         | Exactly where is context installed, restored, cancelled, and cleared?    |
| Missing          | Is `unknown` explicit, or can old thread context leak into new work?     |

Use lexical/scoped wrappers supplied by the pinned profiler SDK where possible and close them
with structured lifetime. Verify nested scopes and exceptional/cancelled exits. Never assume a
servlet interceptor covers async dispatch or that a `ThreadLocal` follows tasks through a pool.

For virtual threads, bind logical context inside each task. For reactive streams, propagate
through the framework context/hook designed for the pinned version. Sampling a trace ID as a
high-cardinality profile label is usually wrong; use sparse linkage/exemplars or backend joins.

Test with two concurrent tenants/tasks repeatedly switching threads. The assertion is not only
“label present,” but “no sample from A is attributed to B.”

## Backend schema

At minimum preserve:

```text
producer identity and authenticated service
process lifetime identity, actual collection intervals, coverage gaps and selection policy
profile/event type and weight/unit
time interval and clock metadata
stack/frame identity plus language/native/JIT type
thread/task state where available
bounded approved context
service version, artifact/image digest, JDK/profiler/config epoch
sample/event totals and loss/throttle counters
source manifest and checksum
```

Profile stores often intern stacks and labels. Schema changes to frame normalization,
demangling, hidden/lambda names, thread labels, or weight units can split/merge historical
series. Version the schema and prevent comparisons across incompatible epochs by default.

## Query procedure

### Incident localization

1. Establish the affected service/version/instances and UTC time range from SLO metrics.
2. Check collection coverage, clock, event totals, loss, and unresolved frames for that range.
3. Select the event that matches CPU, elapsed wait, allocation, lock, or native question.
4. Filter only by governed context whose presence ratio is known.
5. Inspect absolute weights and totals before normalized stack percentages.
6. Correlate with deploy/config/infrastructure/JFR/trace/queue evidence.
7. Form a causal hypothesis and validate through reproduction or controlled change.

### Deploy comparison

Build matched sets rather than one arbitrary “before” and “after” window:

```text
same profile/config epoch
same route/workload distribution
same offered and completed work bands
same error/timeout/cancellation treatment
same capacity/autoscaling lifecycle and host class
equivalent warm-up/uptime phase
multiple independent instances/windows
```

Compare code-resource cost in a denominator tied to the decision, such as CPU-weight per
successful operation. Preserve unnormalized totals. Apply statistical comparison at the
independent instance/window level; sample events inside a profile are not independent trials.

If matching is impossible during an incident, state the comparison as exploratory and list
the confounders. A profile can still identify investigation targets without proving the deploy
caused the outcome.

### Cohort normalization

Join profile weights and workload counters on the same process lifetime, time interval, and
workload filters before dividing. A PID or pod name alone may be reused. Exclude uncovered
intervals from both sides of a covered-cohort estimate; report their extent and reason.
Counter resets and missing scrape boundaries need an explicit alignment policy. Do not
silently use full-window counters for a collector that started halfway through the window.

For example, one profiled replica contributes 20 CPU-seconds and completes 1,000 operations;
the ten-replica fleet completes 10,000. The covered-replica cost is 0.02 CPU-seconds/operation,
not 0.002. Increasing collection to all ten otherwise identical replicas changes the observed
total to 200 CPU-seconds, not the cost per operation. Use CPU-time weights only when the
collector actually supplies them; raw JFR execution-sample counts are not CPU-seconds.

For operation-weighted cost, divide the sum of compatible weights by the sum of matched
operations. Do not average per-instance ratios without stating that this instead gives each
instance equal weight. With 100 CPU-seconds/1,000 operations and 90/9,000, the combined cost
is 190/10,000 = 0.019, whereas the equal-instance mean is 0.055 CPU-seconds/operation.
Independent windows still govern statistical uncertainty; aggregation does not create trials.

Fleet extrapolation additionally needs a justified inclusion/weighting model and comparable
workload strata. A nominal 10% rollout does not establish a random sample. Hot, crashing, or
unexported targets may be systematically absent, so inverse coverage alone cannot repair
that bias. When selection or loss is unknown, report the covered cohort and withhold a fleet
cost or regression claim. Retain coverage details in provenance rather than turning every
process identity into an unbounded dashboard label.

## Alerting

Alert on the system's ability to provide evidence:

- expected targets missing or stale;
- collector/profile session inactive;
- event rate outside calibrated bounds conditional on workload;
- lost/dropped/throttled events above budget;
- context-present ratio or cardinality guardrail breach;
- exporter queue age/bytes and disk free-space risk;
- backend rejection/ingest lag/query freshness;
- unresolved stack/JIT-symbol ratio;
- collection overhead/latency budget exceeded.

Do not page directly because a method's share of normalized samples changed by 20%. Resource
or SLO guardrails page; profiles provide attribution. A statistically calibrated automated
regression decision belongs in `performance-regression-ci`.

## Retention, deletion, and incident hold

Test retention with synthetic profiles and clock advancement. Verify deletion removes raw,
indexes, replicas, caches, and derived exports according to policy. Incident holds need a
legal/security owner, immutable manifest, checksum, reason, access log, expiry, and explicit
release; they must not silently defeat tenant deletion obligations.

Plan for backend disaster recovery: restore should preserve stack IDs/schema/version mapping,
or historical queries can return plausible but wrong aggregates.

## Operational test matrix

| Test                           | Required evidence                                                            |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Collector starts late/restarts | gap is observable; no identity/PID confusion                                 |
| Target scales 1→N→0            | expected-target inventory converges; no orphan series                        |
| Backend unavailable            | local resources bounded; drop/spool policy and recovery observed             |
| Disk fills                     | application stays within failure contract; incident evidence status explicit |
| High-cardinality input         | rejected/coarsened before export; security event visible                     |
| Async context handoff          | correct logical attribution; no stale cross-request leakage                  |
| Profiler/JDK upgrade           | new epoch; old/new not silently diffed                                       |
| Partial fleet/time coverage    | numerator and denominator cover the same cohort; gaps remain visible         |
| Injected hot stack             | appears above minimum detectable contribution                                |
| Allocation/thread burst        | overhead and file/export volume remain within budget                         |
| Unresolved symbols             | alert fires and raw addresses/build metadata survive                         |

## Authoritative references

- [JFR consumer package](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.jfr/jdk/jfr/consumer/package-summary.html)
- [`RecordingStream`](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.jfr/jdk/jfr/consumer/RecordingStream.html)
- [JDK 25 `jfr` command](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jfr.html)
- [JDK 25 `jcmd` command](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
- [Grafana Pyroscope Java source](https://github.com/grafana/pyroscope-java) — API and context
  behavior must be read from the pinned tag.
- [OpenTelemetry Profiles data model](https://github.com/open-telemetry/opentelemetry-proto/tree/main/opentelemetry/proto/profiles) — inspect stability/version before adopting the schema.
