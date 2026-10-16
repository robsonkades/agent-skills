# Traces in Incidents

## Signal navigation

```text
SLI/metric identifies population and magnitude
  -> exemplar or bounded search finds representative trace
  -> trace identifies path, waits and dependency attempts
  -> correlated logs identify detailed state/events
  -> profile/JFR explains code/runtime within a broad span
```

This path degrades gracefully: exemplars may point to unsampled/expired data, trace IDs may
be absent, and logs can outlive traces. Keep business/request correlation appropriate to
the data-retention and privacy model.

## Findability

Useful bounded attributes include route/RPC operation, outcome/error type, deployment
version, retry count, region/zone, messaging destination/partition and feature variant.
Tenant/entity IDs require privacy, indexing and sampling review and often belong in logs or
restricted attributes.

Add a field only when an incident query and retention/access need are known.

## What traces do and do not establish

Traces can:

- show recorded operations and relationships that support a critical-path hypothesis;
- expose retries, waits and selected attributes/events;
- provide examples of a tail/error cohort.

Traces do not automatically:

- estimate population frequency under policy-biased sampling;
- expose unsampled, late or dropped spans;
- identify CPU/allocation inside an interval;
- prove causal attribution from overlap;
- preserve full payload/business audit state.

Do not sum child durations to infer request latency: parallel work overlaps, parents need
not await children, and producer/consumer spans may represent different operations. Cross-host
clock skew and missing spans can distort apparent ordering and gaps. A gap can be queueing,
uninstrumented work, export loss or clock error; confirm with queue metrics, clocks and logs.
Missing service edges likewise need export/sampling/resource-identity checks before changing
SpanKind merely to make a backend service map look connected.
For missing ancestry at ingress, also inspect deliberate trace-restart policy and context
provenance. A root created at a trust boundary can be correct; a retained external link is
correlation evidence, not authenticated proof of the caller or cause. Do not reconnect traces
by overriding that policy to improve a visualization.

Known probabilistic inclusion can support weighted estimates; tail-sampling policies usually
require policy-aware analysis rather than raw counts.

Distinguish valid context, recording, sampling, export and retention. A non-recording span
can still carry valid context. `RECORD_ONLY` records data without setting the sampled flag;
processors can observe it while standard export paths normally omit it. Neither
`isRecording` nor a sampled flag is an export acknowledgment or backend retention guarantee.
Inspect the pinned SDK and pipeline before treating an empty exporter as propagation loss.

## Apparent duplicate spans

Two rows with the same operation name are not enough to remove instrumentation. Obtain a
representative raw record with trace/span IDs, parent, kind, timestamps, resource and
instrumentation scope/version, where available. Follow the actual caller, enabled agent or
library and manual span creation; scope identifies the emitting software unit, but does
not prove which deployed path ran. Compare records at SDK export and backend ingestion when
available to locate where repetition first appears.

- **Same `(traceId, spanId)`:** compare normalized IDs and payloads before counting distinct
  operations. OTLP permits duplicate delivery when acknowledgment is lost. Retransmission,
  multiple export paths or a backend display/query can explain repetition; investigate the
  observed path before suppressing a creator. ID equality alone does not prove retransmission;
  conflicting payloads can also require checking transformations or erroneous ID reuse.
- **Different IDs:** check whether the records represent client/server sides, retries or
  independently actionable stages. Same names and overlapping timing do not make them
  redundant. Map each to the operation/attempt and its actual creator.
- **Redundant creators for the same protocol role and attempt:** select one owner that
  preserves the required kind, attributes, parentage and completion semantics. Recheck the
  changed operation and affected backend query; do not remove legitimate attempt or
  business-stage spans to force a lower count.

If records or origin evidence are unavailable, retain that uncertainty and identify the
smallest capture that distinguishes creation from delivery/display duplication. Keep the
span model unchanged until evidence justifies suppression; hand pipeline mechanics to
`opentelemetry-performance` with the observed IDs and export path.

The identity rule comes from the [Trace API](https://opentelemetry.io/docs/specs/otel/trace/api/#spancontext);
emitter metadata from [instrumentation scope](https://opentelemetry.io/docs/concepts/instrumentation-scope/).
The delivery limitation was checked against [OTLP specification v1.11.1](https://github.com/open-telemetry/opentelemetry-proto/blob/v1.11.1/docs/specification.md#duplicate-data).
These sources do not establish a particular backend's storage or deduplication behavior.

## Contract tests

For local model assertions, use an isolated SDK and an in-memory exporter with known
recording/export settings. Select assertions relevant to the changed operation:

- expected distinct span identities and operation classes, separate from delivered record counts;
- stable name and kind;
- parent trace/span IDs;
- links for batch/messaging causes;
- logical timestamps for async completion;
- status/outcome for success/error/cancel/retry;
- no redundant creators for the same protocol role/attempt, preserving legitimate stages;
- truncation and sensitive-data policy.

These assertions prove only what the exercised fixture records. Test actual broker/executor
propagation using the pinned integration and its carrier/context boundary; a handcrafted
parent ID is not evidence that deployed instrumentation propagates it. Separately test the
effective sampling/processor/export path, including intentional omissions and relevant loss
conditions, without changing production policy merely to make a model assertion pass.

For affected backend queries/runbook links, execute them against a representative staging
dataset or retain an explicit validation gap. Correct spans can still be unusable if indexes,
retention or service-map assumptions differ.

## Incident handoff

Record:

```text
Affected SLI population:
Trace/sample selection policy:
Representative and counterexample trace IDs:
Missing spans / clock uncertainty:
Critical path and dominant wait:
Correlated log/profile/JFR evidence:
Hypothesis versus confirmed cause:
Next discriminating action:
```
