# Provenance and authority

## Establishing provenance

Ask one question: **what would I show someone who disputed this?**

| Class              | What you show                                                                                   | What it is not                                          |
| ------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| USER_MANDATED      | The user's words, quoted, with when they said them                                              | Your summary of what they meant                         |
| CORPORATE_MANDATED | Attributed instruction or authoritative policy with issuer, applicable scope and current status | A repeated code pattern or an unverified document claim |
| PROJECT_EXISTING   | `path:line`, and how many places                                                                | Evidence that it should continue                        |
| AGENT_PROPOSED     | The option set and the separating reason                                                        | A default that "everyone uses"                          |

Use AGENT_PROPOSED when the agent actually proposes the choice, not as a fallback for lost
history. If the origin is unknown, record that fact and a source check. Establish acceptance
separately: a documented authorized outcome can remain accepted for its evidenced scope even
when the original proposer or proposal date is unknown. Missing historical provenance alone
does not require reapproval; missing authority or applicable scope keeps the unsupported
commitment pending. Do not invent historical details or infer a mandate from current code.

An agent proposal later accepted by a person retains its provenance and gains separate acceptance
evidence. The later approver need not be the original proposer. Cite all relevant sources when a
user instruction and project practice jointly support a choice.

## The levels of "the project does this"

These are routinely collapsed, and collapsing them is how an accident becomes a policy:

```text
Observed instance     Evidence of that instance; insufficient to establish a general policy.

Project pattern       Several places, no counter-example. Follow it for consistency,
                      and say that consistency is the reason. Still not a requirement.

Project standard      Written down somewhere in the repository — a contributing guide,
                      an architecture document, an enforced rule, a lint configuration.
                      Check normative status, scope and current applicability before
                      treating it as a constraint; examples and stale drafts are not policy.

Corporate standard    Someone with the authority to set it says so. Only a person
                      establishes its authority; a controlled policy document can record it.
```

First inspect available instructions and existing authorization. Ask only if the distinction
changes an unresolved decision; otherwise record the observed convention and proceed:

> Every repository under `src/main/java/.../api` returns a `ProblemDetail` on failure — 11
> controllers, no counter-example. Is that an organisational standard I must follow, or a
> convention in this project that this feature may follow for consistency?

If there is no proposed deviation and no material uncertainty, this question is unnecessary.

## The authority test

Four questions identify consequences whose authority must be understood, not automatically
reconfirmed. Existing user authorization or delegation may already cover them:

1. **Does it change what the system does**, as opposed to how it does it?
2. **Is it visible outside the change** — to a caller, a consumer, an operator, or in stored
   data?
3. **Is it expensive or impossible to reverse** once it is running with real data?
4. **Does it touch money, security, personal data, or a legal obligation?**

All four no: agent-owned when the choice is also inside accepted constraints. Take it,
record it in a line, and do not ask.

Name authority by consequence, not by whoever is chatting: Product for behavior/value; Engineering or
Architecture for system choices; Security/Privacy/Compliance for their obligations; Data for shared
semantics; Operations for support/SLO commitments; Finance for material spend. A participant may inform
a decision without authority to accept it. Role names are illustrative; use the project's
actual responsibility model rather than imposing nine separate approvers. A mandatory
confirmation comes from an applicable instruction or unresolved authorization, not the label.

## Calibrating against both failure modes

| Failure             | Looks like                                                          | Cost                                                                  |
| ------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Deciding too much   | A broker chosen, a retention period invented, an endpoint versioned | Rework, or a wrong behaviour that ships and is not noticed            |
| Deciding too little | Five questions about naming, a confirmation request per file        | The user stops reading, and the real question gets the same treatment |

The second is the failure a rule-following agent falls into, and it is not safer. An agent that
asks about everything has not transferred risk to the user; it has trained the user to approve
without reading, which is worse than deciding alone.

## Recording a decision without the accountable role

Sometimes a material choice is outside existing authorization and cannot be resolved from
available evidence. Prepare the proposal, name the specific blocked action and continue
independent work; do not present it as accepted. A bounded gap needs actual acceptance:

```text
ED-07 Job history retained for 90 days
      Provenance:  AGENT_PROPOSED
      Owner:       Data/Compliance — NOT CONFIRMED
      Assumption:  90 days matches the retention of the audit table (schema, V17).
      Falsified by: a stated retention policy, or a compliance obligation.
      Consequence: deletion destroys historical data; changing the configured number later
                   cannot restore it. Retention also affects collection/access obligations.
      Status:      PENDING; retention-dependent writes/deletion are not authorized by this
                   proposal. Independent schema analysis and tests can proceed.

GAP-02 If Data/Compliance explicitly accepts proceeding to implementation, record the
       consequence, owner, expiry, reopening trigger and affected RES-* separately.
```

Reversibility and an escalation date do not create authority. The gap is valid only when the role that
owns the consequence accepts it; mandatory legal/security obligations may remain non-waivable.

## Superseding

A decision changes when the world does — a constraint is lifted, an assumption is falsified,
implementation shows the choice does not work. A deviation from a still-valid decision calls for
correcting the implementation; a review trigger alone does not authorize a replacement. When the
accountable decision process supports a change:

- Preserve the original rationale and link the replacement using the local status convention. For a
  partial replacement, keep the original's unaffected scope explicitly applicable; do not retire the
  whole decision when only one consumer or use case changed.
- The new entry says **what changed**, not just what was chosen. "Implementation showed the
  batch endpoint cannot express partial failure" is the useful sentence.
- Trace affected contracts, criteria and resources; update the plan when present and mark only
  dependent artifacts stale. A record-only task reports the needed handoff without claiming those
  downstream changes were implemented.

Never edit a decision in place to make the record consistent with the code. The inconsistency
was the information.
