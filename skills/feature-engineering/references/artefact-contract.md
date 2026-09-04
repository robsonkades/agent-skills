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

A Product Feature is eligible for lifecycle validation only when its Product Definition is accepted
and its Engineering Analysis is complete or an accountable engineering owner records why it is not
required. A Tech Feature is engineering-owned from definition onward.

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

Every downstream item names its upstream justification. Every objective, rule, and criterion names the
items that satisfy or verify it. A downstream item with no reason is scope creep; an upstream item with
no criterion/evidence is not ready.

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

Participation is not authority. Silence is not approval. The agent owns only local, reversible choices
inside explicitly delegated constraints.

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
resolved.
