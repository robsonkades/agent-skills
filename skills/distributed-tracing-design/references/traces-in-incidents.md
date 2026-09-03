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

- show the recorded critical path and relationships;
- expose retries, waits and selected attributes/events;
- provide examples of a tail/error cohort.

Traces do not automatically:

- estimate population frequency under policy-biased sampling;
- expose unsampled, late or dropped spans;
- identify CPU/allocation inside an interval;
- prove causal attribution from overlap;
- preserve full payload/business audit state.

Known probabilistic inclusion can support weighted estimates; tail-sampling policies usually
require policy-aware analysis rather than raw counts.

## Contract tests

Use an in-memory exporter or test collector to assert:

- expected number and class of spans;
- stable name and kind;
- parent trace/span IDs;
- links for batch/messaging causes;
- logical timestamps for async completion;
- status/outcome for success/error/cancel/retry;
- propagation across a real broker/executor boundary;
- no duplicate auto/manual spans;
- truncation and sensitive-data policy.

Also execute the backend queries/runbook links against a staging dataset. Correct spans can
still be unusable if indexes, retention or service-map assumptions differ.

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
