---
name: feature-implementation-plan
description: >
  Assembling everything established about a feature into one document another engineer could
  execute without re-deriving the architecture: the resources in dependency order, the schema,
  contract, configuration and security changes named individually, the test strategy per
  resource, the migration, deployment and rollback story, and acceptance criteria a test can be
  written from. Use once the decisions are taken and before implementation starts, when a plan
  is a list of file names, when the plan and the code have drifted apart, when a feature is being
  handed to someone else or resumed after a break, or when the rollback story is discovered
  during the rollback. Does not produce the breakdown it orders (feature-decomposition), does not
  execute it (feature-execution), does not track status against it
  (feature-progress-tracking), and contains no dates or sizes
  (estimation-under-uncertainty).
---

# Feature Implementation Plan

## Purpose

The plan is the hand-off artefact. It is read by whoever implements the feature — a different
person, a different agent, or the same agent after the context is gone — and its test is
whether they can proceed without asking what was decided or reading the analysis again.

It is also the artefact that goes stale fastest, so the second half of this skill is about
keeping it true rather than about writing it well the first time.

## Workflow

1. **Assemble, do not re-decide.** Every section is filled from an artefact that already exists:
   scope, impact map, decisions, resources, risks. If a section needs a new decision, the plan
   is premature — go back and take it.
2. **Order the resources** from their dependencies, and mark which arrows are forced. The order
   is the spine; everything else hangs off it.
3. **Name every change of kind** — schema, contract, configuration, security, observability,
   messaging — in its own section, even when one resource covers several. These are the sections
   people search for, and a change buried in a resource description is not found.
4. **State the test strategy per resource kind**, not as a paragraph. What level, against what,
   and what it must establish.
5. **Write migration, deployment and rollback as sequences**, with the ordering constraint
   spelled out. "Deploy then migrate" and "migrate then deploy" are different plans.
6. **Assemble, do not author, acceptance.** Carry accepted `BAC-*` from Product and `TC-*` from
   Engineering, trace both to `RES-*`, and name planned `EV-*`. If a criterion is missing or cannot
   become a check, return it to its owning stage instead of repairing intent in the plan.
7. **Mark every section that has nothing in it** as `none, because <reason>`. An empty section
   is ambiguous between "not applicable" and "not considered", and the difference matters.

## Decision rules

```text
IF a section would require a decision to fill
THEN the plan is early. Take the decision first; do not write a placeholder.

IF a resource has no validation
THEN it is not planned yet, whatever else is written about it.

IF the plan names a file that does not exist and is not created by a resource
THEN the file list is wrong. Every path is either created here or exists today.

IF the change touches persisted data
THEN the plan states the compatibility window: what runs against old data, what
     runs against new, and whether they overlap.

IF the rollback story is "revert the commit"
THEN check it against the schema section. Once a migration has run, reverting the
     code is not reverting the change.

IF implementation contradicts the plan
THEN create a revision-impact entry, mark traced downstream items stale, and return
     affected decisions/contracts for approval before continuing.

IF the feature spans sessions
THEN the plan must be readable cold. Assume the reader has none of the conversation.
```

## Constraints

- **Do not invent dates or effort estimates.** `estimation-under-uncertainty` owns forecasts.
  Preserve operational facts that constrain execution — migration windows, batch limits,
  retention periods, rollout intervals, and externally committed deadlines — and label their
  provenance instead of deleting them from the plan.
- **No design arguments.** The plan says what will be built; why it was chosen lives in the
  decision records, and duplicating it means two documents that disagree later.
- **No aspiration.** Everything in the plan is work someone will do. Nice-to-haves belong in the
  scope table's Optional bucket.
- **The plan is a living artefact.** It is amended during implementation, not preserved as a
  historical curiosity and quietly ignored.

## Keeping it true

Amend the plan whenever any of these happens, and say so in the execution log:

| Event                                    | Amendment                                                 |
| ---------------------------------------- | --------------------------------------------------------- |
| A resource turns out to need another one | Add a RES-*, with its dependency, and re-derive the order |
| A resource turns out to be unnecessary   | Mark it cancelled with the reason; do not delete          |
| A decision is superseded                 | Update affected RES-_/CT-_/TC-* and the record pointer    |
| A file turns out not to need changing    | Correct the file list                                     |
| Implementation reveals a risk            | Add it to the register and, if it needs work, a resource  |

Amendments are dated and appended. The original is not rewritten, because "the plan was wrong
here" is the most useful sentence in a post-mortem.

## Output

The full section list and the shape of each is in `references/plan-template.md`. The plan is
complete when every section is filled or explicitly marked `none, because`, and when the
resource order, the file list and the acceptance criteria agree with one another.
