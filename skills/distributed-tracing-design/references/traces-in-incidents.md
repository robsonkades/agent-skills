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

Known probabilistic inclusion can support weighted estimates; tail-sampling policies usually
require policy-aware analysis rather than raw counts.

Distinguish valid context, recording, sampling, export and retention. A non-recording span
can still carry valid context. `RECORD_ONLY` records data without setting the sampled flag;
processors can observe it while standard export paths normally omit it. Neither
`isRecording` nor a sampled flag is an export acknowledgment or backend retention guarantee.
Inspect the pinned SDK and pipeline before treating an empty exporter as propagation loss.

## Contract tests

For local model assertions, use an isolated SDK and an in-memory exporter with known
recording/export settings. Select assertions relevant to the changed operation:

- expected number and class of spans;
- stable name and kind;
- parent trace/span IDs;
- links for batch/messaging causes;
- logical timestamps for async completion;
- status/outcome for success/error/cancel/retry;
- no duplicate auto/manual spans;
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
