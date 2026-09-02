---
name: feature-engineering
description: >
  Owning a feature request from first reading to completion review: choosing how much of the
  lifecycle the change actually warrants, running the phases in order, holding the gates that
  stop implementation beginning on unresolved assumptions, and keeping a dossier that lets
  another agent resume the work. Use when a feature request arrives and the order of work is
  not obvious, when implementation is about to start on a request whose technology or scope was
  never agreed, when a half-finished feature has to be picked up from someone else, when the
  same feature is being re-analysed because nobody wrote down what was decided, or when a change
  is being declared done because it compiles. Does not own any phase in depth — it routes to the
  thirteen specialised feature-* skills — and it is not the general order of work for an
  arbitrary change (clean-delivery-workflow), nor the record format for a decision
  (architecture-decision-making).
---

# Feature Engineering

## Purpose

Two failures this exists to prevent, and they are opposites.

The first is the feature that starts in the editor: code written before anyone established
what was being asked, on a technology nobody agreed, discovering at review that the contract
was wrong. The second is ceremony applied uniformly — a configuration flag carrying a
fourteen-phase lifecycle, an ADR and a story breakdown, until the process becomes something
people route around.

The phase order below is fixed. **How much of it a request earns is the judgement**, and
making that judgement well is the skill.

## Workflow

1. **Classify the depth** before anything else — Direct, Standard or Significant
   (`references/depth-and-phases.md`). The classification decides which phases run and whether
   a dossier exists at all. State the class and the one fact that decided it.
2. **Run the phases the class calls for, in order.** A phase may be skipped by the depth rule;
   it may never be faked. Producing an empty scope table is not running the scope phase.
3. **Hold the gates.** Two are hard: no implementation begins while a BLOCKING question is
   open, and no resource is marked DONE without a validation line. Everything else is advisory.
4. **Write the decision down when it is made**, not at the end. A decision recalled at review
   time is a justification, and those differ from reasoning exactly where it matters.
5. **Report the state**, not the intention: which phase, what is decided, what is blocking.

## Depth classes

| Class           | Fits when                                                                                               | Dossier                                 |
| --------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Direct**      | Reversible in a day, one module, no new dependency, no contract or schema change, no new decision       | None — the commit message is the record |
| **Standard**    | Several components, an existing pattern extended, a contract or schema touched, one or two real choices | Dossier without story decomposition     |
| **Significant** | A new technology, a new integration, a migration, a breaking change, or work spanning sessions          | Full dossier                            |

When two classes both look plausible, take the lower one and escalate on evidence. Escalating
mid-feature is cheap; a discarded analysis is not.

## Phase routing

| Phase                                                 | Skill                               |
| ----------------------------------------------------- | ----------------------------------- |
| Separate what is known from what is assumed           | `feature-discovery`                 |
| Decide what to ask, and what blocks                   | `feature-requirement-clarification` |
| Establish what the repository already answers         | `feature-context-analysis`          |
| Fix what is in and out                                | `feature-scope-analysis`            |
| Map what the change touches                           | `feature-architecture-analysis`     |
| Generate and evaluate the options                     | `feature-solution-analysis`         |
| Record the decision, its provenance and its authority | `feature-decision-analysis`         |
| Decide whether to split, and into what                | `feature-decomposition`             |
| Name what could go wrong and how it is detected       | `feature-risk-analysis`             |
| Produce the executable plan                           | `feature-implementation-plan`       |
| Implement resource by resource                        | `feature-execution`                 |
| Track status and keep the log                         | `feature-progress-tracking`         |
| Gate before implementing, and review after            | `feature-readiness-review`          |

Adjacent owners, when the request is not a feature at all:

| Situation                                               | Skill                          |
| ------------------------------------------------------- | ------------------------------ |
| A change of any kind whose order of work is unclear     | `clean-delivery-workflow`      |
| A defect with an unknown cause                          | `debugging`                    |
| Restating an ambiguous requirement, acceptance criteria | `requirements-and-acceptance`  |
| Writing the decision record itself                      | `architecture-decision-making` |
| Which automated checks a change must pass               | `quality-gates`                |
| Reviewing the resulting diff                            | `code-review`                  |
| What may be claimed about work that was done            | `coding-agent-discipline`      |

## Decision rules

```text
IF the request names a technology that is not already in the project
THEN it is a decision, not a detail — feature-decision-analysis before any code.

IF a phase would produce a section with nothing in it
THEN say "none, because <reason>" rather than deleting the section or inventing content.

IF the repository can answer a question
THEN answer it from the repository and record the evidence; do not ask.

IF a question changes the API contract, the execution model, the persistence strategy
   or the failure behaviour, and the repository cannot answer it
THEN it is BLOCKING: stop and ask.

IF implementation contradicts a decision already recorded
THEN update the plan and supersede the record before continuing — never silently deviate.

IF work will not finish in this session
THEN the dossier must be current before the session ends, or the next agent restarts it.
```

## Non-negotiable rules

- Never invent a business requirement, a corporate standard, or a compliance obligation.
- Never select a major technology silently. Present options, recommend, and get the decision.
- Never treat an implementation found in the repository as an organisational standard.
- Never mark a resource DONE without naming the validation that passed.
- Never expand scope without writing down what justified it.

## Dossier

Artefacts live in one directory per feature; see `references/dossier-layout.md` for the layout
and for what to do when the repository already has a documentation standard of its own. The
dossier is a working artefact, not a deliverable: it exists so the work can be resumed,
audited and re-opened, and it is kept current during the work rather than assembled at the end.

## Output

Open with the depth class and the reason for it. Then, in order: what is decided, what is
assumed, what is blocking, and what happens next. If nothing is blocking and the class is
Direct, that report is three lines — which is the correct length for it.
