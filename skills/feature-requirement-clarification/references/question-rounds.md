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

For each candidate, identify the earlier decision or evidence needed to make its options meaningful.
Ask the unresolved prerequisite first; a pending investigation is not a settled fact. Independent
questions can proceed while that branch waits. After an answer or evidence result, discard questions
whose premise no longer applies, close those it also answered, and reconsider the rest before sending
another round. A short note beside an existing question is enough; no separate decision tree is required.

Among surviving questions, first resolve the missing answer needed for the next consequential
commitment. Prefer a branch-setting question that can eliminate dependent questions over details
inside those branches. If several independent questions are equally urgent, prefer the one that
changes more relevant work and is easier for this participant to answer. Defer later decisions with
their need-by resource; a hypothetical large consequence alone does not make a question urgent.

## Size one round

- Ask **one** question when its answer determines the next branch.
- Ask **two or three** when they share one decision area and no answer depends on another.
- Split compound questions. One question produces one decision.
- Preface a technology or convention question with what repository evidence already established.

Each question states the decision, why it matters now, consequences of likely answers, and a
recommendation when evidence supports one.

For an unclear business rule, ask about the smallest concrete situation that separates plausible
interpretations: "When cancellation arrives after dispatch, what should the customer observe?"
Resolve that boundary before asking about implementation mechanisms. Treat the example as evidence
for its stated conditions; it does not settle every cancellation case. For a term whose readings change
eligibility, state, timing or outcome, first check the applicable glossary, rule and workflow example.
Ask only about the remaining distinction. Preserve different meanings in different contexts and leave
harmless synonyms alone; a vocabulary exercise must not become another prerequisite to progress.

## Checkpoint after the answer

Record the answer's source, applicable scope and status before closing the question. A tentative
answer, unresolved conflict or answer from a participant without the required authority leaves
the affected distinction open; do not turn it into an accepted decision by copying it into a draft.

Separate a mixed reply into the decisions it actually settles and the residual unknowns. Keep an
explicit, authorized answer even if another part is tentative; ask only about the residual distinction.
For apparent contradictions, compare the actor, condition, version and time period first: different
scopes can coexist. If two answers conflict for the same case, state both sources and the behavioral
difference, then seek resolution from the existing accountable role. Recency alone does not establish
supersession, and compromise wording must not hide an unresolved conflict.

When a later answer changes an accepted decision, use its applicable scope and the speaker's
existing authority to identify what it supersedes. Preserve the earlier answer and its source
as superseded only once the replacement is established; otherwise record the conflict. Reassess
the affected questions and dependent contracts, criteria, resources and validation evidence.
Mark records awaiting review as stale, following the existing revision convention; keep unaffected
answers and independent work valid. Follow downstream dependencies until the changed premise no
longer matters; an indirect dependency can need review too. Reformatting an unchanged answer does
not reopen it.

Apply the resolved answer to the affected requirement, examples and criteria in the existing working
draft, not only an appended Q&A log. Reuse identifiers and links already present. Keep accepted snapshots
intact and follow the existing revision convention. For a resolved term, use the scoped meaning and
source in that draft or link the authoritative glossary; do not require a new file or rename code.
A conversation-only clarification may keep a concise current statement inline. When a document update
was requested, perform it within authorization; if unavailable or unsuccessful, show the proposed change
as unsaved rather than claiming persistence. `collaborative-feature-definition` owns the wider workshop.

Reread the changed rule and its affected criteria against the actual answer: preserve actor, condition,
timing, quantifier and required outcome where they matter. For example, "a duplicate never creates another
charge" must not become "duplicates are handled." Check the combined understanding against the feature's
outcome and constraints, then recompute the remaining questions. Show the consequential delta and residual
unknowns; acceptance of a requirement is not evidence that it is implemented or verified.

These source, scope and impact checks adapt
[NASA's requirements-management guidance](https://www.nasa.gov/reference/6-2-requirements-management/)
on traceability and change assessment. Scenario questions draw on
[stakeholder-expectations guidance](https://www.nasa.gov/reference/4-1-stakeholder-expectations-definition/).
They do not require NASA's lifecycle, formal boards or extra approval rounds.

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

## Worked boundary: cancel an order

An existing draft says "customers can cancel orders"; a shipment policy already defines dispatch as
carrier handover. Check that policy and the relevant workflow before asking what dispatch means. If the
post-handover outcome remains unspecified, ask what the customer should receive in that case, before
asking how a return or refund would work.

The authorized owner answers: "Only before handover; afterwards direct them to the existing returns
process, which this feature does not change." Update the cancellation rule and its before/after-handover
criteria, preserve the policy's dispatch definition, and remove questions about new return/refund rules
from this feature's round. Keep the existing-process handoff explicit; removing those questions does not
remove that requirement. Read back the clauses to check that "only before" survived the update.

If the answer instead authorizes post-handover cancellation, that branch remains relevant: inspect the
applicable returns policy and clarify its remaining behavioral gaps. The changed answer, not a fixed
questionnaire, determines the next round. Neither answer establishes that the existing code meets it.

## Confirmation

Before a stage closes, summarize scope, decisions with accountable owners, assumptions, criteria,
accepted GAP-* items, and anything deferred, proportionately to the task. Cite existing acceptance
and delegation; request only genuinely missing confirmation. The summary is not a mandatory extra
round or a fresh approval of unchanged decisions.
