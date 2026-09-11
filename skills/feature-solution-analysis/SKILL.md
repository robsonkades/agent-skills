---
name: feature-solution-analysis
description: >
  Producing the option set for a feature-level choice and the block that recommends one: always
  considering the simplest feasible approach, comparing complete options for the same boundary,
  evaluating the axes this feature is actually sensitive to, and saying
  what would have to be true for a rejected option to win. Use when a feature has a real choice
  in it — a mechanism, a storage strategy, a place to put the work — when one approach has
  already been assumed and nobody wrote down what else was possible, when a design is justified
  by what a previous system did, or when a decision is about to be taken without an alternative.
  Does not own the analysis method itself — MECE option sets, qualitative versus quantitative
  comparison, resisting evangelism (architecture-trade-off-analysis) — does not write the
  resulting record (architecture-decision-making), and does not choose among design patterns
  once the forces are fixed (pattern-selection-and-composition).
---

# Feature Solution Analysis

## Purpose

Most feature designs are the first idea, defended. That is not always wrong — the first idea is
often right — but it leaves nothing to re-open when the context changes, and it hides the fact
that a simpler option existed and was never priced.

This phase costs little and buys two things: a recommendation with a reason that can be checked,
and a record of what else was possible, so the choice can be reversed on evidence instead of on
regret.

## When there is nothing to analyse

If evidence establishes only one feasible option, name it and why alternatives were eliminated;
skip a manufactured comparison. If none is feasible, expose the conflicting constraints and seek
a revised option or authorized constraint change. Unknown feasibility is not a pass or a failure:
identify the smallest check that could settle it and keep dependent selection conditional.

## Workflow

1. **Frame the unresolved choice from the accepted baseline.** Inspect the request, prior
   decisions, relevant implementation and acceptance constraints before asking. Distinguish a
   required mechanism from an example or preference. "How does the caller learn the work
   finished?" opens the choice; if webhooks are already mandated, compare designs within that
   boundary. Revisit a settled premise only for material new evidence or an authorized scope change.
2. **Generate options including the floor.** The floor is the simplest thing that satisfies the
   stated requirements — often "extend what already exists", sometimes "do nothing here". It is
   included when feasible; if it is only a candidate, label its unresolved constraints.
   Treat supplied examples as seeds unless the option set is explicitly fixed. Consider materially
   different placement, staged adoption or composed approaches when they meet the same obligation;
   avoid adding variants that cannot affect the decision.
3. **Keep the options comparable.** Describe complete alternatives for the same behavior, boundary
   and operating conditions. A library, pattern and service label alone are not comparable,
   but complete solutions using different technologies can be; split choices that can coexist.
4. **Eliminate on constraints first.** An option ruled out by a mandatory technology, a
   prohibition or a compatibility obligation is eliminated before any evaluation — record it as
   eliminated, with the constraint and source, not as rejected on merit. Record pass/fail/unknown;
   inspect target compiler/runtime, resolved dependencies and contract versions where relevant.
   Analysis does not authorize upgrades or new dependencies to make an option feasible.
5. **Evaluate only the axes this feature is sensitive to** (`references/evaluation-axes.md`).
   Scoring every axis for every option produces a table that reads the same at every company.
6. **Recommend one when supported**, with the decisive trade-off and evidence. Otherwise return
   a conditional recommendation or unresolved choice with its next check; do not manufacture a winner.
7. **For each rejected option, say what would have to change** for it to win. That sentence is
   what makes the decision re-openable rather than final.
8. **Separate uncertainty from preference.** If evidence cannot distinguish viable options and a
   bounded pass/fail experiment would change the recommendation, hand one hypothesis to
   `feature-feasibility-experiment`; do not choose by confidence or prototype enthusiasm.
   Stop when remaining uncertainty is unlikely to change the choice materially; a routine
   preference does not need a prototype. Keep unresolved mandatory feasibility explicit.

## Decision rules

```text
IF two options differ only in local naming or private structure while preserving contracts and accepted quality requirements
THEN decide the routine detail during authorized implementation; public names, compatibility or changed runtime guarantees still need analysis.

IF the recommendation is more complex than the floor
THEN name the evidenced benefit on an accepted driver that justifies the added cost.
     Two options may both meet mandatory constraints yet differ materially in operating cost
     or risk. Without a justified benefit, prefer the floor among established feasible options.

IF an option requires a technology the project does not run
THEN include adoption and operating cost; reuse existing authorization/delegation or name the
     specific missing authority before commitment. Continue independent analysis meanwhile.

IF an option is favoured because it is more extensible
THEN name the extension that is actually expected, with who expects it. Otherwise
     the extensibility is speculative and does not count.

IF the deciding argument is what another system or another company did
THEN test whether their workload, versions and constraints transfer. Treat the case as a hypothesis
     source, not proof for this feature without applicable evidence.

IF established feasible options are otherwise equivalent on the relevant evidence
THEN compare evidenced reversal cost, then simplicity if reversal cost is comparable.
     Missing evidence is not equivalence; use a conditional choice or next check when material.

IF the choice materially affects behaviour, data, operations or cost
THEN name the role accountable for that consequence and reuse evidenced authorization or delegation; participation alone is not authority, nor does an existing delegation need fresh approval.
```

## Constraints

- **No unsupported scoring totals.** Do not add ordinal labels as measurements. If a numerical
  model materially helps, use explicit units/assumptions, weights established before results,
  and sensitivity analysis; no total compensates for a failed mandatory constraint.
- **Expose material costs and limits.** Check the recommendation's adoption, operating and reversal
  costs; do not invent a disadvantage or a winning scenario for a dominated option to fill a template.
- **Do not evaluate against a requirement nobody stated.** Every axis used must trace to a
  requirement, a constraint or a named risk.
- **Exclude straw options, not credible alternatives you dislike.** Familiarity and preference
  are not feasibility evidence. Include material learning/adoption costs and unresolved checks
  rather than silently removing an unfamiliar option.

## Output

```text
Baseline         <accepted scope/requirement/decision revisions or source links>
Choice           <the question>
Constraints      <what any option must satisfy, with source>

Option A  <name>   the floor
  How it works     <two lines>
  Fits because     <axis: consequence>
  Costs            <axis: consequence>
Option B  <name>
  ...
Eliminated
  <option>  <- <constraint that ruled it out>

Recommendation   <option with conditions | unresolved and next action>
Because          <the one thing that separated it from the runner-up>
Consequences     <what the project accepts by taking it, including the unpleasant part>
Reversibility    <what undoing it would cost, and where it is contained>
Would change if  <per rejected option: the observation that would make it win>
Decision needed  <existing authority/source | missing accountable decision and affected work>
Evidence         <observed checks and limits; distinguish estimates and planned validation>
Experiment       <EXP-* when a bounded experiment is warranted; otherwise next check or none>
```

Hand the block to the decision phase; a small choice can use a concise paragraph with the same
material evidence and limits. This skill produces the analysis; it does not record acceptance.
When a premise changes, retain the earlier comparison and identify the changed evidence and
affected recommendation for the decision phase. Do not silently replace an accepted decision
or require unrelated analysis to restart.
