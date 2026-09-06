---
name: architecture-decision-making
description: >
  Write, review, reconstruct or supersede architecture decision records when rationale is
  missing, a decision is repeatedly reopened, a proposal needs an explicit outcome, or an
  accepted choice changes. Decide how much record is warranted; preserve evidence,
  alternatives, consequences, decision authority and revisit conditions. Covers ADR scope,
  lifecycle and traceability; option comparison belongs to architecture-trade-off-analysis,
  quality-driver elicitation to architecture-characteristics, and shortcut/repayment choices
  to technical-debt-decisions.
---

# Architecture Decision Making

Produce a record that lets a later reader distinguish what was decided, why it was
reasonable with the evidence then available, where it applies, and what would justify
reconsidering it. The output can be a short rationale, a proposed ADR, a supported status
transition, or a review finding; it need not be a new full ADR.

## Workflow

1. **Inspect the local decision practice.** Read relevant ADRs, their index, the repository
   template and status/approval policy, plus the code, issue or design evidence supplied
   for this decision. Reuse locations, IDs and terminology. Establish the affected scope,
   actual decision-maker, decision date if known, and whether the task is documentation,
   analysis or a change to an existing decision. Do not equate PR authorship or an ADR
   owner's name with authority to accept it.
2. **Choose proportionate record depth.** Consider external consumers, persistent data,
   organizational commitments, consequences, uncertainty and likely future readers, as
   well as reversal cost over a relevant adoption horizon. A local, easily reversed choice
   may need only a commit/issue rationale; a mandated ADR can still be short. Read
   [writing the record](references/writing-the-record.md) for the depth heuristic, evidence
   fields, compatibility evidence for Java-dependent choices and worked example. Do not
   classify a database or process boundary as irreversible
   merely from its name.
3. **Preserve the basis for the decision.** Separate requirements/constraints and their
   sources from measurements, forecasts and assumptions. Capture the decision and credible
   alternatives actually considered, including the downside accepted. Missing material
   evidence stays visible with a next step; do not invent measurements, rejected options,
   consensus or historical motives. A significant forced choice may still deserve a record
   explaining the constraint and its consequences.
4. **Resolve analysis gaps without fabricating a verdict.** If asked to compare options,
   use `architecture-trade-off-analysis` for that work and return here to record its result.
   If quality goals are vague, use `architecture-characteristics` for observable drivers.
   Continue drafting known context while gaps remain. A forecast with an accountable
   source or a scheduled requirement is legitimate context; “future” does not invalidate it.
5. **Represent the outcome and lifecycle accurately.** Read
   [templates and lifecycle](references/templates-and-lifecycle.md) before selecting a
   format, recording acceptance/rejection, reconstructing history or superseding a decision.
   Preserve accepted rationale when changing the choice, and maintain explicit replacement
   links. Record acceptance only when the provided context or authorized decision process
   supports it; otherwise retain a proposed outcome and name the missing decision.
   A request to document an already authorized decision does not require another approval.
6. **Make verification and reconsideration actionable.** Name how implementation adherence
   and the expected outcome will each be checked. For material uncertainty, specify an
   assumption, an observable review trigger, who observes it and what review follows.
   New evidence can justify review even without a previously written trigger. A trigger
   opens reconsideration; it does not automatically reverse the decision.
7. **Check the result.** Verify IDs, links, status consistency, preserved history and the
   relationship to actual implementation. Read [evidence and tooling](references/evidence-and-tooling.md)
   when reviewing an existing set, selecting a checker or adding governance. Separate
   document validity from implementation compliance and outcome evidence; none proves the
   others. Report which checks ran and which remain pending.

## Scope boundaries

A technical shortcut can need both a debt item and an ADR: use `technical-debt-decisions`
for the trade and repayment, then link the artifacts where the architectural rationale
merits preservation. A backlog item and a status lifecycle are not mutually exclusive.
For delivering a refusal or resolving stakeholder conflict, use `engineering-communication`;
this skill records the supported outcome and reasons. Designing enforcement policy and
responses to failed checks belongs to `architecture-fitness-functions`.

Do not start a fresh architecture comparison merely to repair an ADR link or typo. Do not
require a new ADR for every commit, every implementation phase, or every rejected suggestion.
Split records when choices have independently changing scope or rationale; link tightly
coupled choices whose consequences must be understood together.

## Minimum deliverable

For a new or reconstructed record: scope and current status, context/evidence, the decision
or proposal, rationale and known consequences, with genuine alternatives and verification
or revisit conditions where material. Identify unresolved facts and authority explicitly.
For a review: location, evidence, consequence, proposed adjustment and validation per
actionable finding. For a trivial choice: a concise rationale and why an ADR adds no value
under local policy is enough.

When evaluating this skill's selection or decisions, use
[validation cases](references/validation-cases.md). Written cases and document linting are
not evidence of measured behavioral improvement.
