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
   technical premise. State the decision that changes on pass versus fail.
2. **Use existing evidence first.** Repository facts, vendor specifications, prior measurements, or a
   smaller static check may settle it without a PoC.
3. **Write the hypothesis and threshold before acting.** A result without a predeclared boundary is a
   demonstration, not evidence.
4. **Choose the cheapest valid experiment.** Minimize code, environment, data, duration, and side
   effects while preserving the condition that matters. Read
   [Experiment record](references/experiment-record.md) for the required fields.
5. **Separate prototype from production.** Name shortcuts, excluded qualities, disposal plan, and
   anything the experiment cannot establish.
6. **Run only when authorized and safe.** Prefer isolated/local environments and synthetic or approved
   data. Do not mutate production, contact external parties, or incur material cost without explicit
   authority.
7. **Read and preserve evidence.** Record commands, versions, inputs, raw results, repetitions, and
   anomalies. Conclude `SUPPORTED`, `REFUTED`, or `INCONCLUSIVE` against the threshold.
8. **Feed the result back.** Update or reopen the affected option, decision, contract, risk, depth, and
   Product question. A conclusion never silently becomes production design.

## Decision rules

```text
IF pass and fail would lead to the same decision
THEN do not run the experiment.

IF the experiment omits the condition that creates the uncertainty
THEN it cannot answer the question, however convincing the demo looks.

IF a threshold is chosen after seeing results
THEN label the result exploratory and run a confirmatory experiment before deciding.

IF the result is inconclusive
THEN narrow the uncertainty, improve the method, or preserve it as a GAP-* with an authorized owner.

IF prototype code would enter production
THEN it becomes a planned RES-* and must satisfy ordinary architecture, security, testing, and review.
```

## Constraints

- One experiment answers one material uncertainty; split independent hypotheses.
- Time-boxing limits cost but does not define success. Always state a decision threshold.
- Do not use production data unless its use and handling are explicitly authorized.
- Do not claim scalability, reliability, or security beyond the conditions actually exercised.

## Output

```text
Experiment     EXP-01 <title>
Trace          <U/ED/CT/RISK/TC IDs>
Owner          <engineering owner>
Question       <one uncertainty>
Decision       <what pass, fail, and inconclusive change>
Hypothesis     <falsifiable claim>
Threshold      <observable pass/fail boundary>
Method         <environment, inputs, controls, repetitions>
Limits         <what this cannot establish>
Evidence       <EV-* links, commands and raw results>
Conclusion     SUPPORTED | REFUTED | INCONCLUSIVE
Consequences   <items confirmed, reopened, made stale, or added>
Cleanup        <disposed artefacts or promoted RES-*>
```
