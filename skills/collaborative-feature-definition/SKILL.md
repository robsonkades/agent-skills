---
name: collaborative-feature-definition
description: >
  Co-authoring Product Features and Tech Features through focused question-and-revision rounds. For
  a Product Feature, separates the business definition from an optional engineering analysis owned
  by an architect or senior engineer, including PoCs, ADRs, contracts, and engineering premises.
  Use when the deliverable is an agreed feature brief or ticket, not implementation. The completed
  package is handed to feature-engineering for lifecycle validation and execution planning.
---

# Collaborative Feature Definition

## Purpose

Turn an initial idea into an agreed, buildable Feature or Tech Feature without inventing missing
intent or turning discovery into a one-shot questionnaire. The artefact is a living draft: each
conversation round resolves the highest-impact gaps, updates the draft, and exposes what remains
unknown.

This skill stops at an accepted definition and, when required, its engineering-analysis companion.
`feature-engineering` owns the subsequent independent readiness validation, planning,
implementation, progress, and completion review.

## Classify the artefact

- **Product Feature** — changes an outcome or behavior for a customer, user, operator, partner, or
  business process. Its value must be stated in those terms. Its definition is product-owned;
  engineering decisions are a separate, conditional stage.
- **Tech Feature** — changes an engineering capability or system quality. Its value may be indirect,
  but must be measurable: risk/cost reduction, reliability, security, operability, performance,
  maintainability, developer productivity, or enablement of a named product outcome.

If both apply, keep one parent objective and separate the product outcome from the enabling technical
work. Do not hide a multi-feature initiative under one title.

Identify both the artefact and the current stage. Read exactly one template for that stage:

- For the product-owned definition of a Product Feature, read
  [Product Feature](references/product-feature.md).
- For the later engineering analysis of an agreed Product Feature, read
  [Engineering Analysis](references/engineering-analysis.md).
- For a Tech Feature, read [Tech Feature](references/tech-feature.md).

Do not collapse the two Product Feature stages. The person establishing product intent and business
acceptance does not define engineering contracts, ADRs, PoC conclusions, or solution premises. Close
the first stage, record the handoff, and resume the second with an identified architect or senior
engineer. A new chat is not mandatory, but a distinct author and explicit stage transition are.

## Choose proportional depth

Start at the least depth supported by current evidence, state the choice and its drivers, and reassess
when an answer changes risk or scope:

| Depth        | Use when                                                                                                | Effect on the workshop                                       |
| ------------ | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Light**    | One outcome, known behavior, one authority domain, reversible, no contract                              | Few focused rounds; compact ledgers and direct verification  |
| **Standard** | Several rules/components, an existing integration or contract is touched                                | Explore boundaries, failures, ownership, and impact          |
| **Deep**     | New/public contract, migration, security/compliance, costly reversal, PoC, or several authority domains | Require stronger evidence, options, traceability, and review |

Depth changes how much evidence and challenge are warranted, not the quality gates. A small feature can
be Deep because it is irreversible; a large description is not automatically complex. The user may
request more depth. Do not reduce depth past a material driver without recording the resulting gap and
acceptance by the authority that owns that risk.

## The collaboration loop

### 1. Seed the living draft

Extract only what the user established. Use `feature-discovery` to separate facts, assumptions,
unknowns, and decisions. Mark missing mandatory sections as `OPEN`; never fill them with plausible
content.

Assign the shared lifecycle identifiers as items appear: `OBJ-*`, `BR-*`, `BAC-*`, `SC-*`, `Q-*`,
`IMP-*`, `ED-*`, `EXP-*`, `CT-*`, `TC-*`, `RES-*`, `RISK-*`, `EV-*`, and `GAP-*`. Do not reuse a
prefix for another artefact type or renumber identifiers merely to tidy the document.

For each consequential decision, record the decision, accountable owner, consulted roles, status, and
source. A participant can supply context without having authority to approve it. Keep the item `OPEN`
when the accountable role is unknown or absent.

Show the initial draft briefly, then name the most consequential gaps. The full polished document is
not repeated after every answer unless the user asks.

### 2. Ask one coherent round

Use `feature-requirement-clarification` to select questions. There is no predetermined number of
rounds. Size each round dynamically: ask one question when one answer determines the next direction,
or two to three when the questions belong to the same decision area and can be answered together.
For each question:

```text
Question       one decision in language the user uses
Why now        which section or decision it blocks
Consequence    what changes between the likely answers
Recommendation agent recommendation, when evidence supports one
```

Question order is adaptive, but normally moves through:

1. problem, audience, outcome, value, and evidence;
2. behavior, workflow, business rules, data, and failure cases;
3. scope, exclusions, dependencies, constraints, and existing patterns;
4. criteria and unresolved constraints appropriate to the current author's stage;
5. acceptance criteria, decomposition, unresolved risks, and confirmation.

Do not open a later area while an earlier answer can invalidate it.

Before closing a stage, use at least one challenge question wherever the answer could expose false
value, solution bias, excess scope, or a hidden invariant. Useful challenges include the counterfactual
of doing nothing, the evidence for the problem, the smallest outcome that still creates value, behavior
that must remain unchanged, and how the feature could fail while all written criteria pass. Do not ask
all of them mechanically.

### 3. Integrate and challenge

After each answer:

- update the affected sections and decision/assumption ledger;
- show what changed in a compact delta;
- identify contradictions, new dependencies, or consequences;
- close resolved questions and promote nothing from assumption to fact without a source;
- choose the next highest-impact gap.

Maintain bidirectional traceability as the draft grows:

```text
OBJ/BR -> BAC -> SC -> IMP -> ED/EXP/CT -> TC -> RES -> EV
```

Each downstream item names its upstream justification; each objective and rule names the criteria that
demonstrate it. An item with no upstream reason is speculative. An upstream item with no downstream
criterion is not yet verifiable. For Light depth this may be a few inline `Trace:` fields; use a matrix
when Standard or Deep work would otherwise become hard to audit.

Challenge scope or rules with a concrete consequence, not generic disagreement. When the user chooses
against a recommendation, record the decision and its trade-off; do not keep relitigating it unless
new evidence changes the choice.

When an accepted baseline changes, do not silently edit it. Create a change-impact entry containing the
previous and new revision, changed statement and reason, affected rules/criteria/contracts/ADRs/PoCs/
decomposition, owners who must reconsider, and validations to rerun. Mark affected downstream items
stale until reapproved; unaffected items remain valid.

### 4. Decide whether another round earns its cost

After integrating each round, assess the current stage against its convergence gates and give one of
three recommendations:

- **Continue** — name the unresolved decision and the quality, scope, risk, or acceptance problem that
  another round will resolve. Offer the next focused round and ask whether the user wants to answer it
  now or pause.
- **Close the stage** — state that no blocking gap remains and ask whether to close/hand off or continue
  with an optional deeper area named by the agent.
- **Blocked** — name the missing owner, evidence, or decision and ask whether to resolve it now or pause;
  do not offer advancement as if the blocker were harmless.

The user's answer controls the cadence. Answering the offered questions means continue; choosing to
close triggers the stage gates; asking for more depth starts another round in the requested area. Do
not ask a content-free “continue?” after every response: include the recommendation, its reason, and
the concrete subject of the next round or optional deepening.

One round may be sufficient; five or ten may be appropriate when each produces new consequential
information. Never continue merely to exhaust the topic, and never stop because a target number of
rounds was reached.

### 5. Inspect context when it can answer

During engineering-owned work, use `feature-context-analysis` before asking about established
technologies, conventions, contracts, or patterns. During product definition, inspect context only
to clarify existing behavior or known dependencies; do not turn repository evidence into a product
author's engineering decision. The repository establishes what exists, not what the business intends
or which standard is authoritative.

### 6. Write checkable criteria

Use `requirements-and-acceptance` to separate ownership as well as criterion type:

- **Business acceptance criteria** — observable behavior, business rule, outcome, or failure response;
- **Technical criteria** — constraints the solution and delivery must satisfy, including compatibility,
  security, performance scenarios, tests, telemetry, migration, deployment, and rollback where relevant.

The product stage authors business acceptance and may record externally imposed constraints. The
engineering stage authors technical criteria and contracts. A Tech Feature is engineering-owned and
may define both its technical criteria and the service or product outcome it protects.

Every criterion has an identifier and a verification method. Avoid criteria that only say “implemented,”
“works,” “performant,” “secure,” or name a class/table/framework without an observable consequence.

### 7. Test the size

Use `feature-decomposition` when the definition contains several independently valuable or verifiable
outcomes, independent release paths, different owners, or forced dependencies.

A valid child feature is:

- **valuable** — it produces a named product or engineering outcome;
- **independent** — it can be decided, built, and accepted without an incomplete slice of another child;
- **testable** — it has its own observable business and/or technical acceptance criteria.

Do not split by controller/service/repository, frontend/backend/database, or analysis/build/test unless
each slice independently meets those three properties. Technical work with no direct user value is a
Tech Feature or implementation resource, not a fake user story.

### 8. Close the correct stage

The product-definition stage may finish when:

- the objective states one desired change and why it matters;
- product value, beneficiary, behavior, rules, boundaries, failure cases, and exclusions agree;
- business acceptance is observable and names verification;
- assumptions, dependencies, risks, and unresolved product questions are visible;
- the need for engineering analysis is recorded as `Required`, or `Not required` with an accountable
  engineering owner and rationale;
- the product author confirms the business definition and hands it off without supplying engineering
  decisions on behalf of the later owner.

Require engineering analysis when the feature introduces or materially changes an API, event, schema,
integration, security boundary, architectural decision, migration, operational model, or significant
non-functional target, or when feasibility must be proven. The engineer may also require it after
initial review. Product cannot waive it alone.

When analysis is required, the Product Feature is `Business definition agreed — engineering analysis
pending`; it is not yet ready for final validation. The engineering-analysis stage may finish when:

- its architect or senior-engineer owner and input feature revision are identified;
- premises distinguish evidence, imposed constraints, proposals, and assumptions;
- feasibility unknowns have a PoC or explicit resolution path, success condition, and owner;
- consequential decisions have linked ADRs or a recorded reason why an ADR is unnecessary;
- decision-relevant unknowns use `feature-feasibility-experiment` when evidence cannot settle them;
- affected API, event, data, security, and operational contracts use
  `feature-contract-definition` and are accepted or explicitly blocked;
- technical criteria, migration, observability, rollout, rollback, and compatibility are addressed
  where applicable;
- every engineering decision traces to a product rule, acceptance criterion, risk, or stated technical
  necessity;
- engineering does not silently rewrite product intent. A conflict reopens the affected product
  question with the product owner.

A Tech Feature, or a Product Feature whose required analysis is complete, may converge when:

- value and beneficiary are explicit, including engineering value for a Tech Feature;
- detailed behavior or desired technical state, rules, boundaries, failure cases, and exclusions agree;
- facts, assumptions, decisions, dependencies, constraints, and unresolved risks are visible;
- business acceptance and technical criteria are observable and name verification;
- every remaining `OPEN` item is explicitly accepted as non-blocking or deferred;
- any decomposition produces valuable, independent, testable children;
- the accountable owner confirms the resulting definition is acceptable.

An unresolved item may become an accepted gap only when it records:

```text
GAP-ID       missing decision or evidence
Reason       why resolving it now costs more than proceeding
Consequence  credible failure or rework created by proceeding
Owner        role authorized to accept that consequence
Expiry       date, milestone, or condition after which acceptance is invalid
Reopen       observable trigger and next action
```

The participant requesting progress is not automatically the risk owner. Missing authority, an unknown
contract owner, or a mandatory security/compliance decision cannot be converted into acceptance by an
unrelated role. Keep accepted gaps visible in the final artefact; `feature-engineering` may still judge
one blocking.

Closing a stage creates an immutable snapshot: artefact type, revision, date, status, accountable owner,
accepted gaps, and approval. Engineering analysis names its Product Definition revision; validation
names both. A later semantic change creates a new revision and applies the change-impact rule instead of
rewriting history.

Then hand the complete artefact package to `feature-engineering` as a fresh validation pass. Do not
claim readiness only because either workshop converged. Incorporate validation findings through a
focused loop with the owner of the affected stage. Stop when `feature-engineering` reports no blocking
readiness gaps or the accountable owner explicitly accepts a named gap.

Normalize that independent result to one status with reasons and affected IDs:

- `PASS` — no blocking readiness gap;
- `PASS WITH ACCEPTED GAPS` — only valid `GAP-*` items remain;
- `RETURN TO PRODUCT` — product intent, value, rule, scope, or business acceptance must change;
- `RETURN TO ENGINEERING` — feasibility, decision, contract, or technical criterion must change;
- `DECOMPOSE BEFORE PROCEEDING` — the package is not independently deliverable/testable at its current size.

Only the first two statuses may mark the package `Validated`. A return status reopens a focused round
with the accountable role and creates a new snapshot when resolved.

## Interaction rules

- Ask from consequence, not from a universal questionnaire.
- Never ask the user for facts available in the supplied repository or documents.
- Never infer business rules, corporate standards, compliance, priority, or authority from code.
- Prefer one recommended option plus its trade-off over a menu with no analysis.
- Keep a visible `OPEN` list; unanswered blocking questions do not decay into assumptions.
- Ask which role is participating before entering engineering analysis; never infer authority from
  technical fluency.
- Preserve authorship and decision provenance when information crosses the product/engineering handoff.
- Distinguish approval authority from participation; never record consensus merely because no one
  objected.
- Do not optimize wording while semantics remain unresolved.
- Respect “good enough” only after the convergence gates; do not prolong the loop for polish.
- Do not implement code, create delivery tasks, estimate, or assign people unless the user expands the
  request after the definition passes validation.

## Working response shape

During the loop, respond with:

```text
Updated      <sections changed and decisions made>
Open         <highest-impact unresolved items>
Checkpoint   <Continue | Close the stage | Blocked, with reason>
Next         <next focused subject or optional deeper area>
Questions    <one coherent round of one to three questions, only when continuing>
Impact       <downstream items made stale by this change, or None>
Draft        <only the affected excerpt, unless a full draft was requested>
```

At a product-stage handoff, return the agreed Product Feature, its revision, engineering-analysis
requirement and status, and the unresolved items assigned to engineering. At final convergence, return
the complete Product Feature plus Engineering Analysis, or the Tech Feature, followed by accepted
assumptions/risks, decision authority, traceability, accepted gaps, snapshot revisions, decomposition if
any, and the normalized `feature-engineering` validation result.
