---
name: architecture-trade-off-analysis
description: >
  Compare architectural alternatives when quality goals conflict, a scorecard or case study
  is being used as a verdict, options mix abstraction levels, advocates disagree, or a
  benchmark needs a decision rule. Build comparable options, separate constraints from
  preferences, test domain scenarios and uncertainty, and recommend a choice or a bounded
  next step. Excludes ADR lifecycle (architecture-decision-making), quality-driver
  elicitation (architecture-characteristics), domain pattern selection and debt repayment.
---

# Architecture Trade-off Analysis

Determine which feasible option best fits the stated conditions, what it costs, and how
sensitive that conclusion is to uncertain facts or stakeholder preferences. The result
may be a recommendation, a conditional choice, or an explicit finding that evidence does
not yet support selection. Always give an actionable next step; never manufacture a winner.

## Workflow

1. **Frame the decision.** Identify the affected system/operation, decision owner, deadline,
   current implementation and credible alternatives. Obtain requirements and constraints,
   workload/change/failure scenarios, relevant deployment/data ownership, and the evidence
   available. Separate measured facts, forecasts, assumptions and preferences. Ask only for
   missing inputs that can change the conclusion; analyze known constraints while waiting.
2. **Choose proportionate effort.** Use the modes below. Reversal cost depends on data,
   consumers, migration and commitments after adoption, not team size or a technology name.
   A small team can face a consequential decision; a clear, dominant feasible option does
   not need an invented trade-off.
3. **Make the options comparable.** Describe complete alternatives for the same boundary,
   required behavior and operating conditions. Include credible status quo, staged/hybrid
   and defer options where relevant; record material exclusions and their reasons.
   Components that can coexist are not necessarily rival architectures. Read
   [qualitative and quantitative analysis](references/qualitative-and-quantitative.md) when
   constructing an option set, checking Java compatibility, building a matrix/numerical
   model or designing an experiment.
4. **Establish feasibility before preference.** Test each option against mandatory
   constraints; mark pass, fail or unknown with evidence. A better score cannot compensate
   for a failed obligation. Keep nondifferentiating obligations as checks even if they leave
   the ranking matrix. If all options fail, expose the conflict and seek a revised option
   or an authorized constraint change.
5. **Explain the mechanisms.** For each material scenario, trace how a candidate changes
   dependencies, execution, state/transaction scope, failure/recovery, deployment and
   operating work. Use `architecture-coupling-and-quanta` when the dependency boundary
   itself needs investigation. A topology label is not proof of isolation, consistency,
   scalability or latency. Read the [worked analysis](references/worked-analysis.md) when
   translating coupling and scenarios into a recommendation.
6. **Compare and challenge.** Use anchored qualitative judgments and measured/modelled
   quantities where useful. Do not add ordinal labels as if they were measured values.
   Seek counterexamples, boundary conditions and uncertain inputs that could change the
   preference; do not keep searching until a reversal is manufactured. Preserve important
   disagreements instead of averaging them away. Read
   [bias and evidence](references/bias-and-evidence.md) when reviewing advocacy, sunk-cost
   arguments, case studies or contested conclusions.
7. **Reduce material uncertainty.** Before an experiment, state the hypothesis, decision
   boundary and what outcomes would change the recommendation. Prefer existing evidence,
   a defensible model or a narrow experiment when sufficient. Combine numerical evidence
   with remaining qualitative criteria; one easy-to-measure metric must not decide by
   default. Stop when further information is unlikely to change the choice enough to
   justify its cost, or report why unresolved uncertainty prevents a supported choice.
8. **Deliver the decision basis.** State the preferred option and its conditions, decisive
   evidence, accepted costs, unresolved risks, and signals that warrant review. Distinguish
   recommendation from authorization and planned validation from completed measurement.
   For compound requests, carry this basis into `architecture-decision-making` for the ADR;
   do not turn the analysis itself into a status-lifecycle procedure.

## Analysis modes

A–D are this skill's effort heuristic, not a formal standard or fixed time budget. Modes
can combine: compare qualitatively, measure one uncertain mechanism, and make a conditional
recommendation while a separate question remains open.

| Mode                              | Use when                                                                              | Required result                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| A — decide with existing evidence | The choice is clear at the relevant impact/reversal cost                              | Brief rationale, important limits and a proportionate revisit condition                |
| B — compare scenarios             | Several feasible alternatives differ on meaningful outcomes                           | Comparable alternatives, scenario-specific mechanisms, costs and preference conditions |
| C — reduce uncertainty            | A plausible result could alter selection or establish feasibility, at worthwhile cost | Bounded model/experiment, decision rule, results or explicit execution limits          |
| D — defer selection               | Missing evidence/authority is material and an explicit interim action is acceptable   | What is awaited, owner, deadline/event, interim behavior and delay cost                |

A deadline does not supply missing evidence. Under pressure, shorten B to the deciding
constraints, credible alternatives and the most consequential uncertainty. Recommend a
bounded reversible action if supported; otherwise explain why none is established as
feasible. A missed deferral date triggers review, not silent acceptance of an option.

## Boundaries and minimum result

Use `architecture-characteristics` when stakeholders cannot yet say what “fast,”
“available” or “easy to change” means. Budget and stakeholder preference can be legitimate
comparison inputs; an unresolved authority dispute cannot be settled by a score.
Use `architecture-fitness-functions` to design ongoing checks for accepted risks, rather
than embedding unvalidated monitoring thresholds here.

For a small decision, a paragraph can suffice. For a material comparison, provide the
decision/scope, feasibility findings, the few differentiating criteria/scenarios with
evidence, the recommendation or unresolved branch, accepted costs and next validation or
revisit signal. For a review, locate the unsupported claim and give its consequence,
correction and verification. State what was executed and what was inferred.

When evaluating this skill's behavior or selection, use
[validation cases](references/validation-cases.md). Neither a completed matrix nor repository
tests demonstrate that the skill improves agent decisions.
