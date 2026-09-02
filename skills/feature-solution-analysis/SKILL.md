---
name: feature-solution-analysis
description: >
  Producing the option set for a feature-level choice and the block that recommends one: always
  including the simplest thing that satisfies the constraints, keeping the options the same
  category of thing, evaluating only the axes this feature is actually sensitive to, and saying
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

Say so and move on. A choice exists only when two options both satisfy the constraints. If the
constraints, the context report and the user's answers leave one survivor, name the survivor,
name what eliminated the others in one line each, and skip the rest of this skill. Manufacturing
a comparison to fill a template is worse than not doing one.

## Workflow

1. **State the choice as a question**, not as a proposal. "How does the caller learn the work
   finished?" admits options; "should we use a webhook?" does not.
2. **Generate options including the floor.** The floor is the simplest thing that satisfies the
   stated requirements — often "extend what already exists", sometimes "do nothing here". It is
   always in the set, and it wins ties.
3. **Keep the options comparable.** Same category of thing, same level of commitment. A library,
   a pattern and a managed service are not three options; they are three questions.
4. **Eliminate on constraints first.** An option ruled out by a mandatory technology, a
   prohibition or a compatibility obligation is eliminated before any evaluation — record it as
   eliminated, with the constraint, not as rejected on merit.
5. **Evaluate only the axes this feature is sensitive to** (`references/evaluation-axes.md`).
   Scoring every axis for every option produces a table that reads the same at every company.
6. **Recommend one**, with the reason stated as the thing that separated it from the runner-up.
7. **For each rejected option, say what would have to change** for it to win. That sentence is
   what makes the decision re-openable rather than final.

## Decision rules

```text
IF two options differ only in naming or internal structure
THEN it is not a feature-level choice. Decide it while implementing.

IF the recommendation is more complex than the floor
THEN name the specific requirement or constraint that the floor fails. If you
     cannot, the floor wins.

IF an option requires a technology the project does not run
THEN its cost includes operating it, not just using it — and it is a decision
     the agent does not take alone.

IF an option is favoured because it is more extensible
THEN name the extension that is actually expected, with who expects it. Otherwise
     the extensibility is speculative and does not count.

IF the deciding argument is what another system or another company did
THEN it is not an argument. Their constraints are not in this feature's context report.

IF two options survive with no separating axis
THEN choose the more reversible one and say that reversibility was the tiebreak.

IF the choice materially affects behaviour, data, operations or cost
THEN it is the user's to confirm, not the agent's to take.
```

## Constraints

- **No scoring totals.** Weighted scorecards launder a judgement into arithmetic; the weights
  are the judgement and they are chosen after the fact. Say what separated the options.
- **No option with no disadvantage.** If the recommendation has no cost, the analysis is
  incomplete, not the option perfect.
- **Do not evaluate against a requirement nobody stated.** Every axis used must trace to a
  requirement, a constraint or a named risk.
- **Do not present options you would refuse to implement.** A straw option makes the set look
  considered and makes the analysis worthless.

## Output

```text
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

Recommendation   <option>
Because          <the one thing that separated it from the runner-up>
Consequences     <what the project accepts by taking it, including the unpleasant part>
Reversibility    <what undoing it would cost, and where it is contained>
Would change if  <per rejected option: the observation that would make it win>
Decision needed  <agent may take it | user must confirm, and why>
```

Hand the block to the decision phase. This skill produces the analysis; it does not record the
outcome.
