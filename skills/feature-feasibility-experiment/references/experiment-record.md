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

Prior premise: <current option or assumption and source; proposed if unsettled>
If supported: <decision consequence>
If refuted: <decision consequence>
If inconclusive: <next action and what remains blocked>

## Hypothesis and threshold

Hypothesis: <falsifiable statement; candidate revision, configuration and input domain>
Scope: <fixed requirements versus changeable design choices; what a failure can rule out>
Pass: <observable threshold>
Fail: <observable threshold>
Inconclusive: <insufficient coverage/uncertainty or unmet validity condition>
Inference when needed: <practical margin, uncertainty method/assumptions and decision rule>

## Method

Environment: <isolated environment and relevant versions>
Inputs/data: <source, scale, authorization and representativeness>
Procedure: <repeatable commands or steps>
Controls/repetitions: <comparison, independent unit and count; or why a deterministic check suffices>
Discriminator: <observable result and check separating outcomes; competing causes if attribution matters>
Validity: <setup checks, source of expected outcomes and detection checks when needed>
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
Next action: <targeted follow-up and why it can change the decision, or reason to defer/stop testing>

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

## Scope of a feasibility conclusion

Resolve what the hypothesis quantifies over before choosing the experiment. Is it one specified
case, every supported input for a fixed candidate, a sampled workload, or the existence of any
acceptable design? Inspect the accepted requirement and option constraints first; ask a focused
question only when the unresolved scope changes what would count as refutation.

- **Candidate failure:** an eager export implementation exceeds the memory cap on the required
  dataset. A valid result rejects that implementation under the tested conditions. If streaming
  or another implementation is permitted, return those alternatives for analysis; do not declare
  the feature impossible or claim that an untested streaming alternative will pass.
- **Changed decisive constraint:** the same implementation revision and configuration are the
  only permitted option, and the memory cap and dataset are fixed. The same evidence now rejects
  feasibility under those constraints. Report the conflict and which constraint would have to
  change; do not silently enlarge memory or substitute a library. If a verified specification or
  lower bound already establishes the conflict, a PoC adds no decision value.
- **Coverage:** a fixed converter claimed to preserve every supported identifier is refuted by
  one valid counterexample that truncates an identifier. A passing ordinary identifier establishes
  that case, not the universal claim. A defect in the result checker instead makes that result
  unusable; it does not refute the converter. Record both what is known and what remains open.

Make the result checker capable of distinguishing the outcomes that drive the decision. For
example, a conversion benchmark must verify the required records and their expected meaning;
the same buggy conversion used to generate both actual and expected values is not an independent
check. A small accepted fixture or independently derived expected result may suffice. When a
custom harness's sensitivity is uncertain, an intentionally missing record or otherwise known
violation can check that it fails as intended. This is a validity check, not a requirement to
build a general testing framework for every experiment. Preserve invalid-run evidence and repair
the harness before using new results; never relabel a broken run as feature infeasibility.

## Match the check to the uncertainty

Trace the smallest relevant path from the accepted requirement through the actual candidate to
the checked result. Capture the input, executing revision/configuration and observation point;
a success message is insufficient when the question concerns a persisted artifact or downstream
behavior. Check the state or consumer result that the requirement names.

When evaluating whether an automated tool can find a cause or implementation site, supplying
the diagnosis and correct file bypasses that work. Use ordinary project artifacts and inspect the
resulting evidence or change. A response-only check can evaluate a proposed plan, but cannot
establish that the feature finds the right source, edits it correctly or executes successfully.
Keep the requirements available; do not manufacture difficulty by hiding facts users normally
provide. If tools or access prevent the intended work, report that boundary instead of treating
an answer about the work as its execution.

## Choosing a valid comparison

When the decision depends on why a result changes, identify the plausible competing explanation
and the observation that separates it. Control or account for material differences in inputs,
environment and state, including tool access, permissions and resource budgets; use matched
comparisons, blocking or randomization where appropriate. Verify which candidate/configuration
actually ran and restore the intended starting state between trials; a different output directory
alone does not isolate shared caches, files or services.
A trial that changes both the library and host size may establish feasibility of that combined
configuration if both changes are allowed. It does not isolate a benefit from the library.
If the decision instead permits only a library change on fixed hardware, that trial has not
answered it. Do not require causal isolation when the decision only needs the combined result.

If both candidates already meet every criterion in the sample, report that bounded result.
A score at its ceiling cannot show an increase; it neither proves equivalence outside that
sample nor establishes that the change has no useful effect. Preserve those regression checks.
If the decision still needs a discriminator, choose a representative unresolved condition or a
decision-relevant measure such as completed work per unit cost, and define the new check before
running it. Do not change past grades, select only cases favorable to one candidate or claim an
unmeasured saving. When the question is simply whether the specified deterministic case works,
its valid pass may already settle it; a broader comparative benchmark is unnecessary.

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

## Updating decisions and retaining lessons

Compare the result with the recorded prior premise and identify the affected recommendation.
When evidence conflicts, first check whether revisions, inputs, measurement boundaries or
validity conditions differ; preserve both records and the remaining conflict rather than keeping
only the favorable one. Inconclusive evidence may justify a better discriminator, deferral or
ending the investigation when its likely decision value does not justify further cost. That
choice does not establish feasibility or make an unresolved mandatory constraint disappear.

When a lesson is useful beyond this decision, retain its condition, observed result, bounded
implication, evidence link and what change would require rechecking it. For example, an eager
export exceeding the tested cap rules out that revision under those conditions; it is not a
rule that exports always require streaming. Record it in the existing experiment or feature
record when authorized, or return it in the handoff. Do not claim it was stored elsewhere or
became project policy. Before reuse, inspect whether the new case still meets its conditions.

## Sources

- [Anthropic, Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), terminology and steps 4–7: distinguish final state from a response, inspect actual runs, isolate relevant state and recognize score saturation. The guidance above applies these checks to experiments involving discovery or automated work; it does not require an agent-evaluation harness for ordinary feasibility checks.
- [NIST experiment objectives](https://www.itl.nist.gov/div898/handbook/pri/section3/pri31.htm): choose the design from the decision objective and distinguish narrow initial comparisons from broader confirmation.
- [NIST randomized block designs](https://www.itl.nist.gov/div898/handbook/pri/section3/pri332.htm): account for important nuisance factors when isolating an effect. The library/host example applies this distinction to a software feasibility claim.
- [NASA Systems Engineering Handbook, decision analysis](https://www.nasa.gov/reference/6-8-decision-analysis/), sections 6.8.1.2.4–6.8.1.3: consider the value of reducing uncertainty and retain assumptions, sensitivities, recommendations and lessons. The bounded follow-up and lesson guidance here adapts those principles without adopting NASA's governance process.
- [ISTQB Foundation Level syllabus 4.0.1](https://istqb.org/wp-content/uploads/2024/11/ISTQB_CTFL_Syllabus_v4.0.1.pdf), sections 1.2.3, 1.3 and 1.4.1: distinguish failure causes, limited test evidence and comparison with expected results. The candidate-versus-feature examples above apply that reasoning to feasibility decisions.
- [NIST confidence intervals for proportions](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm): one-sided bounds and exact binomial intervals for small failure counts.
- [ASA statement on p-values](https://www.amstat.org/asa/files/pdfs/p-valuestatement.pdf): significance, effect size and the limits of a p-value alone.
