# Templates and lifecycle

Read when selecting a format, changing a status, reconstructing history or superseding
a decision. Follow the repository's declared practice before introducing another template.

## Select the smallest compatible format

[Nygard's original ADR](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
uses title, context, decision, status and consequences, preserves reversed decisions, and
does not reuse record numbers. It offers a lightweight starting point for significant
decisions. Use those concepts without copying prompt text and attributing it to him.
His status discussion names proposed, accepted, deprecated and superseded; richer local
lifecycles can add rejected or other states.

[MADR 4.0.0's tagged template](https://github.com/adr/madr/blob/4.0.0/template/adr-template.md)
makes context/problem, considered options and outcome prominent, with optional metadata
and further sections. Its optional decision-makers, consulted and informed fields help
distinguish roles. Confirmation records how the implementation will be checked; it is
not proof that the check passed. Select fields needed by the decision and local tools
rather than copying all coaching text into a finished record.

MADR's `date` describes an update date. **Inference limit:** this does not establish that
accepted rationale should be rewritten, or conflict with a policy that updates status
and replacement links while preserving reasoning. Nor does structured metadata make
MADR the only mechanically checkable form: parsers can support prose status conventions.
Verify the actual checker/template combination.

A one-sentence rationale can preserve context, chosen option, intended benefit and
accepted cost. It can also have an ID, status, date and replacement link in its enclosing
record or index. A compact sentence does not inherently prevent supersession.

Use the existing repository or knowledge-base location. If choosing a new home, consider
reader access, version history, stable links, review workflow and affected repositories.
For cross-repository decisions, identify one authoritative record and link it rather than
creating independently editable copies. A wiki can preserve history; Git does not
automatically keep rationale accurate or accessible to every stakeholder.

## Authority is local policy, not a template field

Identify the role that can decide, who must be consulted, and the evidence that the
transition occurred. Author, maintainer, consulted expert and decision-maker may differ.
Preserve policy already supplied by the user or repository.

[AWS's ADR process](https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html)
describes an owner recording an outcome after team review, including reasons for rejection.
[Harmel-Law's advice process](https://martinfowler.com/articles/scaling-architecture-conversationally.html)
describes decision-taking after consulting affected parties and experts; consultation is
not a universal requirement for their consent. These are process models, not authority
granted to an agent by reading this skill. Do not silently choose one for an existing team.

If no process is known, draft the record with unresolved decision authority. If the user
has supplied an authorized outcome, document it without demanding duplicate approval.
An accepted ADR can legitimately include acknowledged uncertainty; uncertainty alone
does not negate an authorized risk decision. Preserve who accepted which risk and what
follow-up is required.

## Practical status semantics

The following is a recommended interpretation when no conflicting local definitions exist.
Map it to existing spellings rather than silently rewriting the whole decision set.

| Status             | Meaning                                        | What must be clear                                                               |
| ------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| Proposed           | Outcome under consideration                    | Proposal, unresolved decision/evidence, responsible role and next review         |
| Accepted           | Decision authorized for its stated scope       | Decision evidence/date, scope and any rollout conditions                         |
| Rejected           | This proposal was considered and declined      | Reason, decision authority/date and what could justify a new proposal            |
| Deprecated/retired | Previously accepted guidance no longer applies | Affected scope, reason and current guidance or explicit absence of a replacement |
| Superseded         | Another accepted decision replaces this one    | Replacement ID/link, supersession date and the scope replaced                    |

Acceptance is not rollout completion. Track implementation or migration state separately,
using a linked plan/issue when necessary. Rejection of an alternative inside an accepted
ADR does not make the entire ADR rejected. A decision to retain the status quo may itself
be accepted; it differs from an unanswered or rejected proposal.

Acceptance date and effective applicability can also differ. Record which environments,
consumer versions or cohorts follow the replacement, the activation condition/date and who
verifies it. An accepted plan with an unfulfilled gate must not be reported as already in
force for every consumer. Conversely, a failed rollout does not by itself revoke the team's
accepted target architecture; record the operational fallback separately unless the decision
authority has also changed the choice.

A deferred proposal is not automatically rejected or accepted. Record its interim behavior,
owner and ending condition in the local status vocabulary. Age alone does not establish
abandonment. A future proposal can reopen a rejected subject with new evidence; the written
reason helps compare context rather than banning discussion forever.

## Supersession procedure

1. Read the accepted record and check what still applies. For a typo, link repair or
   clarified wording that does not change meaning, follow local correction policy and
   preserve history. Do not create a fresh architectural choice for a spelling fix.
2. For a material change, draft a new record with the new evidence, rationale, affected
   scope and link back. While it is only proposed, identify it as a proposed replacement;
   do not mark the accepted record superseded.
3. Once the replacement outcome is authorized, establish when and for whom it becomes
   governing guidance. Update status and replacement links together where practical, under
   local policy. If supersession is recorded at acceptance, as in the AWS process above,
   make any continuing transition guidance explicit in the replacement and linked plan.
   If local policy keeps the old record active until an effective date or verified gate,
   preserve that state and record the authorized future replacement now. Do not invent
   satisfaction of the gate or require approval again merely to document the accepted plan.
   Preserve the old context, decision and reasons; do not reuse its ID or delete its history.
4. Specify the relationship precisely. If only part of the old decision changes, identify
   that scope and the remainder still in force. Do not use a full supersession marker that
   hides active guidance; use a supported partial-supersession annotation or an explicit
   restatement of remaining guidance in the replacement. Restatement is viable only when
   the replacement's stated scope and authorization cover that remaining guidance. If a
   checkout-only replacement cannot carry the still-active batch decision, retain the old
   record for batch and annotate the relationship using local conventions; do not silently
   expand the new decision's authority or retire batch guidance to satisfy a status field.
5. Check both links, status consistency, non-self-reference and absence of a supersession
   cycle. Check the index and affected code/design references so readers can find current
   guidance without losing the historical chain. When multiple accepted successors exist,
   verify that their scopes/activation conditions are compatible or that authorized precedence
   is explicit. A newer date or larger ADR number does not automatically resolve incompatible
   instructions for the same scope; report the conflict and the decision needed to resolve it.

If the repository explicitly permits substantive in-place amendments, retain its convention
but make the prior rationale, change, date and authority recoverable through its history
and amendment policy. Do not present this as the default append-only approach or erase the
old reasons.

“Revisit the decision” means reconsider it. It does not mean changing the accepted record's
original rationale while pretending the team always held the new position.

## Standards and evidence limits

The [official ISO/IEC/IEEE 42010:2022 overview](https://www.iso.org/standard/74393.html)
describes architecture descriptions and says no recording format or medium is prescribed.
That permits format choice; it does not prove that a particular ADR set satisfies the
standard. An architecture description is broader than a decision record.

The full normative requirements were not inspected for this revision. If a task requires
conformance, obtain the applicable text and assess the actual architecture description
against it. Do not certify conformance from a table of contents, a template name, or an ADR
linter. Likewise, these template/process sources establish conventions; they do not measure
this skill's effect on agent behavior or establish a universally best template.
