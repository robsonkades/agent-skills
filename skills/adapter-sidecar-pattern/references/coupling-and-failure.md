# Translation contracts and failure behavior

## Pin meaning across releases

Record producer image/version, input schema if any, parser/mapping version, consumer contract
and compatibility owner. Informal logs need stricter upgrade checks than a documented API;
neither is immune to semantic drift.

Capture representative valid records from the real producer, sanitizing sensitive values while
preserving relevant syntax. Include multiline, optional-field and restart examples where applicable.
On upgrade, recapture under comparable conditions and assert values, units, metric types and
field meanings. Do not fail merely because timestamps, IDs or record order changed, or require
every new version to break. Keep supported old/new fixtures; fail incompatible changes until the
mapping and consumer migration are reviewed.

Count invalid, dropped, truncated and exported records with bounded reason labels. An increase
in parse failures after deployment is evidence consistent with drift, not proof of its cause:
compare offending sanitized samples with the old grammar and rule out truncation or mixed formats.
Choose alert thresholds against normal traffic and loss requirements; never silently discard
failures. If quarantine is allowed, bound and redact it rather than retaining arbitrary raw data.

## Enrichment: preserve provenance

| Field                    | Permitted translation and limit                                                                                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Trace/span or request ID | Preserve emitted context or attach context via a verified unique association. A random ID per line is not the original request ID; temporal proximity cannot establish concurrent request membership. |
| User/tenant              | Use emitted identity or an authoritative mapping with isolation guarantees, such as an exclusively assigned workload. Pod identity alone cannot identify a tenant in a multi-tenant process.          |
| Event time               | Preserve source timestamp, timezone and precision. If unknown, retain observed time as such; document a consumer-required fallback.                                                                   |
| Severity                 | Map a documented source convention; distinguish unknown from a guessed default.                                                                                                                       |
| Pod/node/container/image | Attach from configured metadata sources with reliable workload association and record its origin. This is not exclusive to sidecars.                                                                  |
| Exception/stack          | Parse when grammar permits; define multiline boundaries, timeout, size cap and behavior for interleaved or truncated records. Do not merge unrelated requests by guesswork.                           |

[OpenTelemetry's log model](https://opentelemetry.io/docs/specs/otel/logs/data-model/)
distinguishes optional event Timestamp from ObservedTimestamp and permits absent trace context.
An observed timestamp is valid collection information, not a recovered event timestamp.
Request instrumentation belongs to `structured-logging` and `distributed-tracing-design`.

## Metrics and indexed dimensions

Map units, type, reset behavior, aggregation scope and label meanings, not only names.
Do not rename a rolling count into a cumulative counter or equate durations that measure different
operations. For freshness and scrape failure decisions, use the metrics section of
[adapter-or-node-agent.md](adapter-or-node-agent.md).

Expose a cumulative source counter's current value through the collector API; do not add
each snapshot to an adapter-owned counter. Source readings `42, 42, 45` must remain
`42, 42, 45`, not become `42, 84, 129`. Preserve observable source resets and distinguish
them from adapter restarts. Use the client's custom collector mechanism for translated
snapshots; keep per-scrape state isolated so concurrent scrapes cannot overwrite each other
or retain disappeared series. See
[Prometheus exporter collection guidance](https://prometheus.io/docs/instrumenting/writing_exporters/#collectors).

Distinct observed label combinations determine series count. The product of label-domain sizes
is a worst-case combination bound, not necessarily the actual count:

```text
7 methods × 12 statuses × 60 route templates = up to 5,040 combinations
```

That is not automatically affordable: include target replicas, churn and metric expansion
(such as classic histogram buckets, sum and count). Compare with an explicit series budget.
Avoid request/user/order IDs, raw paths, exception messages and timestamps as metric labels.
Map routes to a controlled template set with a bounded unmatched bucket and monitor its rate;
do not silently collapse distinct metric identities into duplicate series. Delegate full sizing
to `metrics-and-cardinality`. Log fields can contain high-cardinality identifiers subject to
privacy, indexing and retention policy; they are not automatically suitable metric labels.

If normalization merges source series, define a valid aggregation or reject the mapping;
last-write-wins silently loses data. Summing independently resetting cumulative counters can
hide resets, so do not offer that as a generic cardinality fix. Retain bounded source identity
and calculate rates before aggregation where feasible, or change producer instrumentation.
See [Prometheus rate semantics](https://prometheus.io/docs/prometheus/latest/querying/functions/#rate).

## Follow the actual buffering path

| Handover                          | Failure to model                                                                                     | Required decision/check                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| stdout → runtime → node collector | Collector lag can lose rotated logs; runtime/disk failure can still affect app logging               | Identify runtime draining, rotation owner, retention and loss signals; test sink outage |
| Pipe drained by adapter           | Full pipe can block; a closed reader can produce a write error/SIGPIPE depending on process handling | Bounded asynchronous policy where appropriate; test slow and absent reader separately   |
| Shared file, adapter tails        | Backlog, rotation loss, storage exhaustion; offsets lost on restart can duplicate or skip records    | Retention cap, overflow policy, offset recovery and restart/rotation tests              |
| Source endpoint → metrics adapter | Slow/failed collection or cached values returned as current                                          | Timeout, source-success signal or failed scrape, cache expiry if applicable             |

An ordinary disk-backed `emptyDir` uses node ephemeral storage; exhaustion or exceeding
accounted limits can lead to write failure or eviction. `medium: Memory` uses tmpfs and writes
count toward the writing container's memory usage, creating memory pressure/OOM risk.
A `sizeLimit` alone is not a loss or availability policy. Specify medium, relevant resource
limits, rotation/retention and behavior when writes fail; validate on the target runtime.
See [Kubernetes emptyDir semantics](https://kubernetes.io/docs/concepts/storage/volumes/#emptydir).

For an outage budget, estimate backlog from excess input over drain rate multiplied by outage
duration, then measure encoded size and overhead. State whether overflow drops, blocks, samples
or spills, and who accepts that tradeoff. A finite local buffer cannot promise lossless delivery
through an unlimited outage. Observe application latency as well as loss/backlog during injection.

## Validate the output contract

Use the consumer's parser and semantic assertions. The following is a test specification,
not runnable code or an actual capture:

```text
Given a sanitized producer fixture whose documented fields are:
  ts=2026-08-27T10:15:03.412Z level=ERROR order_id=ORD-4471 duration_ms=250
And the consumer contract requires duration_seconds:
  expect event time unchanged, severity ERROR and duration_seconds=0.25
  expect order_id as a permitted log field, never as a metric label
  expect no trace_id when neither emitted nor uniquely associated
  expect one record, no silent loss and zero parse failures
```

For the real implementation, add a changed-unit fixture, missing mandatory fields, unknown
optional fields and oversized/malformed input with a fake secret. Assert explicit reject/fallback
behavior, bounded processing/output and no secret leakage through errors or quarantine. Add
multiline, rotation/restart and stale-source cases only for the paths in use. Reconcile input
records with exported/rejected/dropped counts, accounting explicitly for multiline assembly.

For Prometheus text output, when a compatible Prometheus tool is installed,
`promtool check metrics < exposition.txt` validates/lints the captured stream in a shell
supporting input redirection. Record tool version and result; it does not prove units,
cardinality budget or freshness. Test those separately, including removal of obsolete series.
See [promtool check metrics](https://prometheus.io/docs/prometheus/latest/command-line/promtool/#promtool-check-metrics).

Primary references describe platform behavior; placement and failure policies here are engineering
decisions to validate against the supplied deployment. No production runtime is implied by these
examples, and their tests are distinct from behavioral evaluation of this skill.
