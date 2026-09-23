# Adaptive question rounds

Rounds exist because an answer changes which later questions are worth asking. The sections below are
decision areas, not a fixed four-round script. A feature may close after one round or need many.

## Select the next area

Choose the unresolved area with the largest consequence for the next decision:

1. product problem, beneficiary, outcome, evidence and value;
2. behavior, business rules, boundaries and failures;
3. externally imposed constraints, authority and compatibility;
4. architecture/solution choices that remain after repository evidence;
5. acceptance, decomposition, risks and confirmation.

Do not ask later-area questions when an earlier answer can make them irrelevant. If the user already
answered an unasked question, close it from that source instead of asking again.

## Size one round

- Ask **one** question when its answer determines the next branch.
- Ask **two or three** when they share one decision area and no answer depends on another.
- Split compound questions. One question produces one decision.
- Preface a technology or convention question with what repository evidence already established.

Each question states the decision, why it matters now, consequences of likely answers, and a
recommendation when evidence supports one.

## Checkpoint after the answer

Record the answer's source, applicable scope and status before closing the question. A tentative
answer, unresolved conflict or answer from a participant without the required authority leaves
the affected distinction open; do not turn it into an accepted decision by copying it into a draft.

When a later answer changes an accepted decision, use its applicable scope and the speaker's
existing authority to identify what it supersedes. Preserve the earlier answer and its source
as superseded only once the replacement is established; otherwise record the conflict. Reassess
the affected questions and dependent contracts, criteria, resources and validation evidence.
Mark records awaiting review as stale, following the existing revision convention; keep unaffected
answers and independent work valid. Reformatting an unchanged answer does not reopen it.

After updating the applicable draft or question record, report proportionately:

```text
Checkpoint  Continue | Close the stage | Blocked
Because     <remaining consequence or reason no blocker remains>
Next        <specific decision area another round would resolve>
Missing input <specific answer/authority needed, or none>
```

- **Continue** — another round has a named quality, scope, risk, contract, or acceptance benefit.
- **Close the stage** — no blocking gap remains for the declared scope; close within existing
  authorization. Optional depth is not a reason to hold ready work.
- **Blocked** — authority, evidence, or a decision is missing; dependent work cannot advance.

Do not count rounds as progress. Continue while each round earns attention; stop when gates are met,
not when a template has been exhausted.

## Confirmation

Before a stage closes, summarize scope, decisions with accountable owners, assumptions, criteria,
accepted GAP-* items, and anything deferred, proportionately to the task. Cite existing acceptance
and delegation; request only genuinely missing confirmation. The summary is not a mandatory extra
round or a fresh approval of unchanged decisions.
