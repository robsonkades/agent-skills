# Experiment record

Use this record before running a PoC and complete it without rewriting the pre-experiment fields.

```markdown
# EXP-<id>: <decision-relevant question>

Status: Proposed | Approved | Running | Supported | Refuted | Inconclusive | Cancelled
Execution: Planned | Not run | Running | Finished | Cancelled
Authority: <existing task/session scope or recorded approval when required; do not invent one>
Owner: <accountable engineer>
Trace: <U/ED/CT/RISK/TC identifiers>

## Decision boundary

If supported: <decision consequence>
If refuted: <decision consequence>
If inconclusive: <next action and what remains blocked>

## Hypothesis and threshold

Hypothesis: <falsifiable statement>
Pass: <observable threshold>
Fail: <observable threshold>
Inconclusive: <insufficient coverage/uncertainty or unmet validity condition>

## Method

Environment: <isolated environment and relevant versions>
Inputs/data: <source, scale, authorization and representativeness>
Procedure: <repeatable commands or steps>
Controls/repetitions: <comparison and count>
Validity: <setup checks proving the intended condition was exercised>
Stopping: <time/resource budget and predeclared completion rule>

## Known limits

<Production properties deliberately excluded and claims the result cannot support.>

## Evidence

<EV-* entries with exact revision, command, result and raw output/durable links.
Record failed attempts and exclusions with reasons; do not keep only favorable runs.
Use sanitized fixtures/output and controlled access where evidence contains sensitive data.>

## Conclusion

Pending before evaluation; then SUPPORTED | REFUTED | INCONCLUSIVE
Reason: <comparison against the original threshold>
Anomalies: <unexpected observations>
Affected artefacts: <decisions, contracts, risks, criteria, depth and plan>

## Cleanup

<Owned paths/resources created, cleanup result, retained evidence location and required retention,
and prototype code promoted to planned resources. Record incomplete cleanup; do not infer success.>
```

Do not edit the hypothesis or threshold after results exist. Append a new experiment revision when the
method changes materially.

`Approved` describes authority to run, not proof of feasibility. `Finished` means execution
ended, not that the hypothesis was supported. If an unavailable tool prevents the run,
record `Not run` and the reason; if evaluation is attempted, its conclusion remains
`INCONCLUSIVE`. A compatibility failure can refute a claim only when the intended supported
configuration was actually exercised, rather than an accidentally different setup.

## Choosing a valid comparison

For a performance claim, state the useful operation, baseline, workload distribution and
scale, concurrency, placement, warm-up/measurement windows and relevant runtime settings.
Choose repetitions to assess observed variability and alternate/control run order when drift
could bias results. More repetitions do not correct an unrepresentative workload. Route actual
load-test design to `load-testing`; avoid turning a smoke test into a production-capacity claim.

For compatibility or integration, pin the exact supported versions and exercise the failing
edge: old bytes, rejected inputs, timeouts, duplicate requests or partial failure as relevant.
A successful connection alone does not establish the complete interaction contract.

Example decision test: "Existing consumer can read the proposed event" needs captured bytes
from the proposed writer and the actual old consumer configuration, with expected meaning as well as
decoding. A missing broker is inconclusive; a reproducible unsupported field in that valid
configuration can refute compatibility. Changing the reader before retrying tests a different
claim and requires a new recorded revision.
