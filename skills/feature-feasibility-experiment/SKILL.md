---
name: feature-feasibility-experiment
description: >
  Designing and evaluating the smallest PoC or experiment that resolves one decision-relevant
  uncertainty in a Product Feature or Tech Feature. Use when feasibility, compatibility, capacity,
  integration behavior, or a risky technical premise cannot be established from existing evidence
  and a bounded experiment can decide the next step. Does not produce production implementation,
  replace an ADR, or run broad exploratory research without a decision and threshold.
---

# Feature Feasibility Experiment

## Purpose

A PoC earns its cost only when its result changes a named decision. This skill turns “try it and see”
into a bounded experiment with a falsifiable hypothesis, threshold, evidence, conclusion, and cleanup.

## Workflow

1. **Name one uncertainty.** Trace it to `U-*`, a solution option, `ED-*`, contract, `RISK-*`, or
   technical premise. State what supported, refuted and inconclusive results change. Reuse
   existing identifiers or source links; do not invent accepted criteria or authority.
2. **Use existing evidence first.** Locate the accepted requirement or decision and the relevant
   implementation path, build/runtime configuration, tests or prior runs. Record source paths and
   what remains unproved; a failed search is not proof that no evidence exists. A version-matched
   vendor specification or smaller static check may settle the question without a PoC.
3. **Write the hypothesis and threshold before acting.** A result without a predeclared boundary is a
   useful exploratory observation, but does not validate a pass criterion selected afterwards.
   Derive the threshold from the decision/requirement, including units, population, window and
   acceptable uncertainty where relevant; keep an unapproved proposed threshold explicit. Name
   the candidate revision, configuration and input domain: testing one candidate is different from
   establishing whether any permitted approach could satisfy the feature.
4. **Choose the cheapest valid experiment.** Minimize code, environment, data, duration, and side
   effects while preserving the condition that matters. Name the observable difference that could
   change the decision and where it will be checked. When execution is the question, inspect the
   resulting artifact or system behavior, not only a description of what should happen. Control
   competing causes when attributing an effect to one change. Read
   [Experiment record](references/experiment-record.md) when defining result checks or comparisons,
   recording the experiment, or retaining lessons for later decisions.
5. **Separate prototype from production.** Name shortcuts, excluded qualities, disposal plan, and
   anything the experiment cannot establish.
6. **Run only when authorized and safe.** Prefer isolated/local environments and synthetic or approved
   data. Do not mutate production, contact external parties, or incur material cost without explicit
   authority. Reuse authorization already established in the task/session; a template's approval
   field does not impose another approval round for authorized reversible local work.
7. **Read and preserve evidence.** Record commands, versions, inputs, raw results, repetitions, and
   anomalies. First verify the experiment exercised the intended condition: zero tests, an
   unavailable dependency or a broken harness cannot establish feasibility. Derive expected
   outcomes from the requirement, specification or independently checked fixture, not merely the
   prototype's own output. If detection is uncertain, check that a known violation is detected;
   a fast run that skips the required work is not a performance success. Separate execution
   status from `SUPPORTED`, `REFUTED`, or `INCONCLUSIVE`; no valid result means no pass/fail claim.
8. **Feed the result back.** Update or reopen the affected option, decision, contract, risk, depth, and
   Product question. Retain the prior premise and identify what the evidence changes; a finding
   does not itself authorize changing an accepted requirement or decision. If the result changes
   the viable options, pass the tested scope, fixed versus negotiable constraints, evidence and
   remaining alternatives to `feature-solution-analysis`
   for a revised recommendation. If unavailable, report that bounded consequence and next
   discriminator directly. A conclusion never silently becomes production design.

## Decision rules

```text
IF pass and fail would lead to the same decision
THEN do not run the experiment.

IF the experiment omits the condition that creates the uncertainty
THEN it cannot answer the question, however convincing the demo looks.

IF a valid experiment refutes one candidate
THEN reject that scoped claim, not every possible solution. Broader infeasibility needs evidence
     that excludes the other permitted options or a demonstrated binding constraint. Conversely,
     one valid counterexample can refute an "all supported inputs" claim for a fixed candidate;
     one passing example does not establish that universal claim.

IF a threshold is chosen after seeing results
THEN label the resulting claim exploratory; predeclare a fresh check before claiming confirmation.
     A decision under acknowledged uncertainty does not retroactively validate that claim.

IF the result is inconclusive
THEN identify the missing discriminator and whether a further check can change the decision at
     justified cost; otherwise defer or stop testing with the uncertainty explicit. Preserve the
     unresolved item; mark it an accepted GAP-* only when the appropriate authority accepts it.

IF prototype code would enter production
THEN it becomes a planned RES-* and must satisfy ordinary architecture, security, testing, and review.
```

## Constraints

- One experiment answers one material uncertainty; split independent hypotheses.
- Time-boxing limits cost but does not define success. Always state a decision threshold.
- Declare validity conditions and stopping rules as well as pass/fail criteria. A timebox
  exhausted before a valid measurement is inconclusive, not evidence the option is infeasible.
- When acceptance depends on noisy measurements, predeclare how uncertainty affects the
  decision. Evidence that cannot distinguish acceptable from unacceptable outcomes under that
  rule is inconclusive; a favorable point estimate alone is not a pass.
- Do not use production data unless its use and handling are explicitly authorized.
- Do not claim scalability, reliability, or security beyond the conditions actually exercised.
- Do not repair a prototype by silently changing the target JDK, dependency, environment or
  compatibility requirement. Record the mismatch and test an allowed alternative or new revision.

## Output

```text
Experiment     EXP-01 <title>
Trace          <U/ED/CT/RISK/TC IDs>
Owner          <engineering owner>
Execution      <planned/not run/running/finished/cancelled; reason if not run>
Question       <one uncertainty>
Decision       <what pass, fail, and inconclusive change>
Hypothesis     <falsifiable claim>
Threshold      <observable pass/fail boundary>
Method         <environment, inputs, controls, repetitions, validity and stopping rule>
Limits         <what this cannot establish>
Evidence       <EV-* links, commands and raw results>
Conclusion     <pending before evaluation; then SUPPORTED | REFUTED | INCONCLUSIVE>
Consequences   <prior premise, what changed, and items confirmed, reopened, made stale, or added>
Cleanup        <disposed artefacts or promoted RES-*>
```

For a request to design an experiment, return the reviewable plan with execution pending;
do not invent results. For an authorized execution request, run the bounded experiment and
report actual results or the concrete blocker. Preserve reproducible evidence before removing
only identified experiment-owned artefacts; never delete unrelated workspace or user data.
For a small deterministic check, a concise record with the same material criteria, evidence,
limits and consequence suffices; a full template is not an extra approval gate.
