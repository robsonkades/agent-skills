# Experiment record

Use this record before running a PoC and complete it without rewriting the pre-experiment fields.

```markdown
# EXP-<id>: <decision-relevant question>

Status: Proposed | Approved | Running | Supported | Refuted | Inconclusive | Cancelled
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

## Method

Environment: <isolated environment and relevant versions>
Inputs/data: <source, scale, authorization and representativeness>
Procedure: <repeatable commands or steps>
Controls/repetitions: <comparison and count>

## Known limits

<Production properties deliberately excluded and claims the result cannot support.>

## Evidence

<EV-* entries with raw output or durable links; do not keep only a summary.>

## Conclusion

SUPPORTED | REFUTED | INCONCLUSIVE
Reason: <comparison against the original threshold>
Anomalies: <unexpected observations>
Affected artefacts: <decisions, contracts, risks, criteria, depth and plan>

## Cleanup

<Deleted isolated artefacts, retained evidence, and prototype code promoted to planned resources.>
```

Do not edit the hypothesis or threshold after results exist. Append a new experiment revision when the
method changes materially.
