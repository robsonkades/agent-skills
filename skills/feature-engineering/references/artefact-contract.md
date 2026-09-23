# Feature lifecycle artefact contract

Use this at intake, whenever an accepted baseline changes, and at each readiness/completion gate.

## Intake envelope

```text
Type                 Product Feature | Tech Feature
Product revision     <immutable ID; required for Product Feature>
Engineering revision <immutable ID; required when analysis is required>
Tech revision        <immutable ID; required for Tech Feature>
Owners               <accountable role per supplied stage>
Status               <accepted stage status>
Depth                Light | Standard | Deep, with drivers
Persistence          Inline | Dossier, with reason
Accepted gaps        <GAP-* or none>
```

Intake establishes accepted intent and the available evidence. Missing required Engineering Analysis
is routed through the lifecycle before implementation readiness, not required before analysis can
begin. At implementation readiness, required analysis is complete or its accountable owner has
established why it is inapplicable. A Tech Feature is engineering-owned from definition onward.
For Light work, a cited request/session statement can serve as the concise accepted baseline;
do not fabricate separate documents or approvals. Preserve target technology/version constraints.

## Identifier namespace

Identifiers remain stable and are never reused for another artefact type:

| Prefix | Artefact                           |
| ------ | ---------------------------------- |
| OBJ-*  | objective                          |
| F-*    | evidenced fact                     |
| A-*    | assumption                         |
| U-*    | unknown                            |
| BR-*   | business rule                      |
| BAC-*  | business acceptance criterion      |
| PF-*   | child Product Feature              |
| TF-*   | child Tech Feature                 |
| SC-*   | scope item                         |
| Q-*    | clarification question             |
| IMP-*  | architecture impact/boundary       |
| ED-*   | engineering decision               |
| EXP-*  | feasibility experiment or PoC      |
| CT-*   | boundary contract                  |
| TC-*   | technical criterion                |
| RES-*  | implementation resource            |
| RISK-* | risk                               |
| EV-*   | verification evidence              |
| GAP-*  | explicitly accepted unresolved gap |

Legacy identifiers in an existing dossier remain valid. Add an alias when touched; do not renumber a
live feature merely for formatting.

## Traceability

Maintain both directions:

```text
OBJ/BR -> BAC -> SC -> IMP -> ED/EXP/CT -> TC -> RES -> EV
                              \-> RISK/GAP
```

Every downstream item names its upstream justification. Use only applicable artefact types; a Tech
Feature can trace an engineering objective through TC/RES/EV without inventing product BACs. Before
implementation, criteria name planned validation; completion requires observed evidence. Missing
execution evidence before implementation is expected, not an automatic readiness failure.

## Authority

For each consequential product, engineering, security, data, operational, compliance, or financial
decision record:

```text
ID          <stable ID>
Decision    <choice>
Provenance  user-mandated | corporate-mandated | project-existing | proposed
Owner       <role authorized to approve the consequence>
Consulted   <roles>
Status      proposed | accepted | rejected | superseded | blocked
Source      <message, policy, path, record, or experiment>
```

Participation and silence alone do not establish authority. Existing user instructions and evidenced
delegation remain valid across phases; do not ask again because an artefact was reformatted or routed.
The agent resolves routine choices within that authorized scope. Ask only when a material decision
needs authority or information not already supplied, and continue independent authorized work.

## Accepted gaps

```text
GAP-ID       <missing decision or evidence>
Reason       <why resolving now costs more than proceeding>
Consequence  <credible failure or rework>
Owner        <role authorized to accept it>
Expiry       <date, milestone, or invalidating condition>
Reopen       <observable trigger and next action>
Blocks       <phases/resources, or none with reason>
```

Unknown authority, contract ownership, or mandatory security/compliance obligations cannot be waived by
an unrelated role. A readiness gate may still reject an otherwise valid gap.
Until acceptance is established, track the unresolved matter as `U-*` or `Q-*`, rather than an accepted
`GAP-*`. Acceptance preserves the missing evidence or residual consequence; it cannot satisfy an unmet
Required criterion, turn a failed check into a pass, or make a resource DONE. A change to delivery
scope requires an authorized baseline revision.

## Revision and invalidation

An accepted baseline is immutable. A semantic change creates a revision with:

```text
Previous/New  <revision IDs>
Changed       <statement and reason>
Affected      <BAC/SC/ED/EXP/CT/TC/RES/RISK/GAP IDs>
Stale         <downstream artefacts awaiting review>
Owners        <roles that must reconsider>
Rerun         <validations/evidence invalidated>
```

Typical returns:

- product intent/rule/BAC changes -> Product, then every traced downstream item;
- feasibility/architecture changes -> Engineering decisions, contracts, risks, plan;
- contract changes -> compatibility analysis, technical criteria, resources and tests;
- implementation deviation -> impact map, decision/plan, risk and readiness for affected scope.

## Gate result

Every independent readiness pass returns one status, reasons, affected IDs, and reviewed revisions:

- PASS — no blocking gap;
- PASS WITH ACCEPTED GAPS — only valid GAP-* items remain;
- RETURN TO PRODUCT — product value, intent, rule, scope, or BAC must change;
- RETURN TO ENGINEERING — feasibility, decision, contract, risk, or TC must change;
- DECOMPOSE BEFORE PROCEEDING — the feature is not independently deliverable/testable at this size.

Only the first two advance. A return status reopens a focused phase and produces a new snapshot when
resolved. State the scope of each gate: a blocked resource does not block an unrelated ready resource,
and a partial pass is not a pass for the entire feature.

These are readiness outcomes, not completion or deployment authorization. At completion, use
feature-readiness-review to report Complete: yes/no for the accepted baseline, trace Required
criteria to observed passing `EV-*`, and identify remaining work or unverified criteria. A readiness
PASS WITH ACCEPTED GAPS does not carry forward as proof that the feature is complete.
