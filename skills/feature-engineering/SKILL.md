---
name: feature-engineering
description: >
  Owning a Product Feature or Tech Feature from definition intake to completion review: selecting
  proportionate depth, routing iterative analysis and explicit returns, holding readiness gates,
  and keeping versioned evidence another engineer can resume. Use when feature implementation is
  being prepared, resumed, or validated and its scope, contracts, decisions, or completion need a
  trustworthy lifecycle. Does not co-author the initial feature brief
  (collaborative-feature-definition), own any specialist phase in depth, orchestrate an arbitrary
  change (clean-delivery-workflow), or define the ADR record format
  (architecture-decision-making).
---

# Feature Engineering

## Purpose

Prevent two opposite failures: implementation beginning before intent, contracts, and authority are
settled; and every small feature receiving the same ceremony as a migration or public contract.

The lifecycle has a stable forward spine and explicit return paths. How much analysis a feature earns,
and what a new finding invalidates, are the judgements. A phase is never repeated for ceremony; it is
reopened when evidence makes a downstream artefact stale.

## Workflow

1. **Run definition intake before depth.** Accept an approved Product Definition plus required
   Engineering Analysis, or an engineering-owned Tech Feature. If the input is still an idea, route
   co-authoring to collaborative-feature-definition; do not make lifecycle analysis impersonate
   Product. Validate revision, stage, accountable owners, accepted gaps, and authority using
   [the artefact contract](references/artefact-contract.md).
2. **Classify depth and persistence separately** — Light, Standard or Deep; Inline or Dossier
   ([depth and phases](references/depth-and-phases.md)). State every driver; the highest evidenced
   driver wins.
3. **Follow the forward spine with explicit returns.** A phase may be skipped by the depth rule; it
   may never be faked. When evidence changes an accepted baseline, apply the artefact contract's
   invalidation rules and return to the owner of the affected stage.
4. **Hold the gates.** No implementation begins while a BLOCKING question is open, and no resource
   becomes DONE without a validation line.
5. **Write decisions when made**, not at the end. A decision recalled at review time is a
   justification, and those differ from reasoning exactly where it matters.
6. **Report state, not intention:** reviewed revisions, current phase, decisions, stale artefacts,
   accepted gaps, blockers, and the next valid transition.

## Depth and persistence

| Depth        | Fits when                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Light**    | One local outcome, known behavior, reversible, no boundary/schema change and no material choice                        |
| **Standard** | Several components, a shared boundary touched, a meaningful choice, or a regulated concern                             |
| **Deep**     | New technology/integration, public or breaking contract, migration, PoC, costly reversal, or several authority domains |

Persistence is **Dossier** when work crosses sessions or owners, or depth is Standard/Deep; otherwise
it is **Inline**. Crossing a session changes persistence, not technical risk. Reclassify on evidence;
never lower past an active material driver merely to shorten the process.

## Phase graph

The forward spine is:

```text
Definition intake
  -> discovery
  -> targeted repository context
  -> adaptive clarification
  -> scope
  -> architecture impact
  -> solution [-> feasibility experiment] -> decision -> contract
  -> decomposition -> risk -> implementation plan
  -> readiness -> execution/progress -> completion review
```

| Responsibility                                        | Skill                             |
| ----------------------------------------------------- | --------------------------------- |
| Co-author the initial definition                      | collaborative-feature-definition  |
| Separate known, assumed, and unknown                  | feature-discovery                 |
| Establish what the repository answers                 | feature-context-analysis          |
| Ask adaptive rounds and identify blockers             | feature-requirement-clarification |
| Fix what is in and out                                | feature-scope-analysis            |
| Map touched elements and boundary crossings           | feature-architecture-analysis     |
| Generate and evaluate options                         | feature-solution-analysis         |
| Resolve one decision-relevant feasibility uncertainty | feature-feasibility-experiment    |
| Record provenance, authority, and outcome             | feature-decision-analysis         |
| Define changed contracts and compatibility            | feature-contract-definition       |
| Preserve observable business and technical criteria   | requirements-and-acceptance       |
| Split into valuable features and executable resources | feature-decomposition             |
| Derive risks, detection, mitigation, and fallback     | feature-risk-analysis             |
| Produce the executable plan                           | feature-implementation-plan       |
| Gate before implementation and review completion      | feature-readiness-review          |
| Implement resource by resource                        | feature-execution                 |
| Persist truthful status and chronology                | feature-progress-tracking         |

The spine is not a one-way checklist. Use these returns:

| Finding                                             | Return to                                       |
| --------------------------------------------------- | ----------------------------------------------- |
| Product value, rule, scope, or BAC is disputed      | Product Definition                              |
| Repository evidence closes or contradicts an answer | Discovery/clarification, then affected outputs  |
| Feasibility refutes an option or premise            | Solution and decision                           |
| Contract exposes a product trade-off                | Product owner for the affected rule/BAC         |
| Contract changes compatibility or rollout           | Architecture, risk, decomposition, and plan     |
| Implementation departs from an accepted decision    | Impact, decision, contract/plan, then readiness |

Only traced downstream artefacts are invalidated. A return is focused, not a restart.

## Decision rules

```text
IF the repository can answer a question
THEN establish and cite the fact before asking the user.

IF a question changes behavior, contract, data semantics, security, or failure handling
THEN identify the accountable role; the conversation participant is not automatically the authority.

IF feasibility is unknown and pass/fail changes a decision
THEN run feature-feasibility-experiment before selecting or recording the option.

IF a boundary crossing has no accepted contract and owner
THEN return to engineering; a DTO or file shape in the plan is not a contract.

IF a plan needs a BAC-* or TC-* that the accepted definition does not contain
THEN return to the accountable role; planning does not author acceptance criteria.

IF a Product Definition changes after Engineering Analysis starts
THEN create a new revision, invalidate traced downstream artefacts, and reapprove only what changed.

IF implementation contradicts a recorded decision
THEN amend the plan and supersede the decision before continuing.

IF work will cross a session or owner
THEN persistence is Dossier and the resumption artefact is current before handoff.
```

## Non-negotiable rules

- Never invent business requirements, corporate standards, compliance obligations, or approval.
- Never select a major technology silently.
- Never treat repository practice as organisational authority.
- Never reuse an identifier for a different artefact type.
- Never expand or shrink accepted scope without a revision and impact entry.
- Never mark RES-* DONE without observed EV-*.
- Never waive a gap without the role authorised to accept its consequence.

## Dossier

When persistence is Dossier, use [the dossier layout](references/dossier-layout.md), adapted to the
repository's existing convention. The dossier is a working resumption and audit artefact, not a
ceremonial deliverable assembled at the end.

When reviewing or evolving the lifecycle itself, use
[the behavioral validation cases](references/validation-cases.md). They are evaluation scenarios,
not extra runtime ceremony.

## Output

Open with input revisions, depth, persistence, and their drivers. Then report current phase, decisions,
stale artefacts, accepted gaps, blockers, and next transition. Normalize readiness to:

- PASS;
- PASS WITH ACCEPTED GAPS;
- RETURN TO PRODUCT;
- RETURN TO ENGINEERING;
- DECOMPOSE BEFORE PROCEEDING.

Only the first two advance. A Light/Inline report may still be three lines.
