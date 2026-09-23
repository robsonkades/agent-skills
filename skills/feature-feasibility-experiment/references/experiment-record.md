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
Inference when needed: <practical margin, uncertainty method/assumptions and decision rule>

## Method

Environment: <isolated environment and relevant versions>
Inputs/data: <source, scale, authorization and representativeness>
Procedure: <repeatable commands or steps>
Controls/repetitions: <comparison, independent unit and count; or why a deterministic check suffices>
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
could bias results. Name the independent unit (for example run, host or deployment); many
correlated requests within one run are not independent repetitions of that run. More repetitions
do not correct an unrepresentative workload. Route actual
load-test design to `load-testing`; avoid turning a smoke test into a production-capacity claim.

When sampling uncertainty matters, distinguish an absolute limit, a minimum useful improvement
and an equivalence margin. Choose the inference method and its assumptions before interpreting
results. Under an interval-based rule, an interval spanning both acceptable and unacceptable
values is inconclusive, even if the point estimate passes. A large p-value does not by itself
establish equivalence, and statistical significance does not establish a useful effect size.
Do not extend a fixed-sample experiment until it happens to pass; use its stopping rule or a
predeclared sequential design with appropriate error control.

Zero observed failures also leaves uncertainty. For example, with 20 independent trials having
the same failure probability, the exact one-sided 95% upper binomial bound after zero failures
is `1 - 0.05^(1/20)`, about 13.9%. This does not establish a failure probability below 0.1%.
The bound depends on those sampling assumptions; counting correlated requests as independent
trials would not justify it.

For compatibility or integration, pin the exact supported versions and exercise the failing
edge: old bytes, rejected inputs, timeouts, duplicate requests or partial failure as relevant.
A successful connection alone does not establish the complete interaction contract.
Mocks and simulations support conclusions about the modeled behavior; they do not establish
the real dependency's integration behavior or production performance. If the required dependency
is unavailable, preserve the original question and record what the substitute actually tested.

Example decision test: "Existing consumer can read the proposed event" needs captured bytes
from the proposed writer and the actual old consumer configuration, with expected meaning as well as
decoding. A local check can answer that decoding question when the required schemas and reader
configuration are available. A missing broker blocks conclusions that depend on broker behavior;
it need not block decoding, and successful decoding does not prove delivery or live integration.
A reproducible decoding or semantic failure in the valid configuration can refute compatibility.
Changing the reader before retrying tests a different claim and requires a new recorded revision.
A deterministic check of a specified fixture need not acquire statistical repetitions or a
p-value; limit its conclusion to that configuration and contract rather than a population-wide
failure rate.

## Sources

- [NIST confidence intervals for proportions](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm): one-sided bounds and exact binomial intervals for small failure counts.
- [ASA statement on p-values](https://www.amstat.org/asa/files/pdfs/p-valuestatement.pdf): significance, effect size and the limits of a p-value alone.
