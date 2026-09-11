# The feature engineering suite

Seventeen packages cover feature definition, investigation, decisions, contracts, planning,
implementation and completion. They help an agent establish what is agreed, resolve material
uncertainty, and produce work another engineer can verify and resume.

This overview explains the handoffs. Individual packages and the
[lifecycle artefact contract](../skills/feature-engineering/references/artefact-contract.md)
define detailed behavior. Use the specialists a task needs; a small change does not need every
phase or a separate document for every concern.

## Responsibilities and handoffs

```text
Collaborative definition
  Product Definition -> required Engineering Analysis, or Tech Feature
                       |
              feature-engineering intake
                       |
  discovery -> context -> clarification -> scope -> architecture impact
                       |
  solution [-> feasibility experiment] -> decision -> contract
                       |
  decomposition -> risk -> implementation plan -> readiness
                       |
              execution/progress -> completion review
```

A new finding reopens the affected decision or definition and its traced dependents; it does
not restart every phase. Missing analysis routes analysis work, rather than preventing that
investigation from starting.

| Package                             | Owns                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------- |
| `collaborative-feature-definition`  | Co-authoring an agreed definition through focused rounds and stage handoffs |
| `feature-engineering`               | Intake, depth, persistence, phase routing and lifecycle gates               |
| `feature-discovery`                 | Facts, assumptions, unknowns and decisions with their sources               |
| `feature-context-analysis`          | Targeted repository evidence and its limits                                 |
| `feature-requirement-clarification` | Material questions, consequences and scoped blockers                        |
| `feature-scope-analysis`            | Scope classification, exclusions and delivery selection                     |
| `feature-architecture-analysis`     | Affected elements, owners and boundary crossings                            |
| `feature-solution-analysis`         | Relevant options, the simplest viable approach and recommendation           |
| `feature-feasibility-experiment`    | A bounded experiment that can change a decision                             |
| `feature-decision-analysis`         | Decision provenance, authority, status and rationale                        |
| `feature-contract-definition`       | Consumer/provider obligations, compatibility and planned conformance checks |
| `feature-decomposition`             | Valuable child features when useful, and executable resources               |
| `feature-risk-analysis`             | Failure scenarios, detection, mitigation and fallback                       |
| `feature-implementation-plan`       | Dependencies, verifiable increments and plan amendments                     |
| `feature-execution`                 | Implement, validate and record each ready resource                          |
| `feature-progress-tracking`         | Current state, chronology and resumption context                            |
| `feature-readiness-review`          | Definition intake, implementation readiness and completion evidence         |

A Product Feature has a product-owned definition and separate Engineering Analysis when
required. The workshop preserves distinct authorship and an explicit stage handoff; a new chat
is not required. A Tech Feature is engineering-owned from definition onward. Reuse evidenced
roles, accepted revisions and delegated authority. Drafting an artefact does not establish its
acceptance, and a handoff does not itself authorize contacting another person.

## Boundaries with other catalog skills

The suite applies specialist methods to one feature. It does not replace those methods.

| Concern                                    | Specialist                                                    | Feature-specific use                                    |
| ------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------- |
| Observable requirements and acceptance     | `requirements-and-acceptance`                                 | Preserve business and technical criteria across stages  |
| ADR format, reversibility and supersession | `architecture-decision-making`                                | Record consequential choices under existing conventions |
| Comparing alternatives                     | `architecture-trade-off-analysis`                             | Decide material feature choices                         |
| Delivery of an arbitrary change            | `clean-delivery-workflow`                                     | Add the feature lifecycle when applicable               |
| Appropriate automated checks               | `quality-gates`                                               | Plan relevant resource and integration checks           |
| Evidence and completion claims             | `coding-agent-discipline`                                     | Match DONE and completion to observed results           |
| Defects and design in a diff               | `code-review`                                                 | Complement review against accepted scope                |
| Responsibility and release boundaries      | `layering-and-boundaries`, `architecture-coupling-and-quanta` | Identify impacts and independent parties                |
| Failure models                             | `failure-models`, `distributed-failure-catalogue`             | Derive concrete feature risks                           |
| Estimates                                  | `estimation-under-uncertainty`                                | Estimate separately when requested                      |

## Depth and persistence

Classify these separately using [depth and phases](../skills/feature-engineering/references/depth-and-phases.md).
The highest evidenced risk driver determines depth; uncertain material drivers prevent Light
classification until resolved.

| Depth        | Typical drivers                                                                                                                                                                   |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Light**    | One local outcome, known behavior, one authority domain, reversible, no new dependency or boundary/schema change, no material choice                                              |
| **Standard** | Several components, compatible shared/internal contract change, meaningful choice, or contained established regulatory obligations                                                |
| **Deep**     | New technology/integration, public or breaking contract, migration, decision-relevant PoC, material security/compliance consequence, costly reversal or several authority domains |

Use **Inline** for one-session, one-owner work whose intermediate state need not survive.
Use **Dossier** across sessions or owners, or for Standard/Deep depth. A small handoff can be
Light/Dossier; crossing a session does not itself make the technical work Deep.

Apply only relevant phases and checks. Light/Inline work can have a concise baseline, boundary,
validation and completion report. Reclassify when evidence introduces or removes a driver;
retain earlier artefacts as history and revisit only newly required or invalidated work.

## Artefacts and continuity

The [default dossier layout](../skills/feature-engineering/references/dossier-layout.md) is:

```text
docs/features/<feature-slug>/
├── definition.md      accepted input revisions, owners, criteria and gaps
├── analysis.md        discovery, context, scope, impact, options and experiments
├── contracts/         authoritative specifications or links to them
├── plan.md            resources, dependencies, validation and amendments
├── progress.md        current state and resumption point
├── execution-log.md   append-only chronology, including corrections
└── decisions/         ADRs where a separate record is warranted
```

Follow existing repository locations and decision-record conventions. These are artefact roles,
not a required file count: combine small records, omit unused directories and link to an existing
contract rather than copying it. Routine decisions can remain in the decision log. Records
needed to resume must be current or explicitly stale; updating only `progress.md` is insufficient
when the underlying decision or contract changed.

Use the shared identifier namespace from the artefact contract and preserve existing IDs.
The applicable trace is:

```text
OBJ/BR -> BAC -> SC -> IMP -> ED/EXP/CT -> TC -> RES -> EV
                              \-> RISK/GAP
```

A Tech Feature can trace `OBJ -> TC -> RES -> EV` without inventing product acceptance criteria.
Before implementation, criteria identify planned validation. At completion, `EV-*` refers to
observed evidence. A semantic baseline change creates a revision and invalidates affected
downstream records; unaffected evidence remains usable within its original scope.

## Gates and authority

`feature-readiness-review` has three gates:

1. **Gate 0: definition intake.** Establish input revisions, accountable stages, authority and
   remaining analysis. A raw idea returns to collaborative definition; missing engineering
   analysis can proceed through its authorized lifecycle work.
2. **Gate 1: implementation readiness.** Check decisions, contracts, dependencies and planned
   validation for resources being started. Block dependent commitments when material input is
   missing; continue independent ready work. Implementation evidence is not yet required.
3. **Gate 2: completion.** Compare the delivered feature with its accepted baseline, changed
   contracts, Required scope and observed validation. A green build alone cannot establish this.

Normalize readiness to `PASS`, `PASS WITH ACCEPTED GAPS`, `RETURN TO PRODUCT`,
`RETURN TO ENGINEERING`, or `DECOMPOSE BEFORE PROCEEDING`. Only the first two advance the stated
scope. A subset pass does not pass the whole feature or authorize deployment/publication.

Code establishes current behavior; an applicable accepted policy or contract can establish a
requirement. Preserve that distinction and reuse authorization across handoffs. A missing
consequential answer stays unresolved even when independent work can continue.

An accepted `GAP-*` names its consequence, accountable owner, expiry/reopen condition and blocked
work. Acceptance cannot make an unmet Required criterion satisfied, a planned check executed,
or a failed resource DONE. Amend scope explicitly when an authorized decision changes delivery.

## Worked request

> "Add asynchronous processing to order dispatch."

This is an illustrative sequence, not an executed evaluation or facts about this repository.
Paths, requirements and measurements must come from the actual project.

1. **Define the outcome.** Establish whose wait changes, what acknowledgement promises, how the
   caller learns the eventual outcome, and required failure behavior. Keep a proposed status
   endpoint distinct from the requirement to observe completion.
2. **Inspect context.** Cite the API, transaction boundary, consumers and operational support.
   Finding an existing broker does not mandate reuse; a bounded search finding no retry policy
   does not prove none exists anywhere.
3. **Classify and scope.** A public asynchronous contract is a Deep driver. Select Required
   delivery and justify exclusions from accepted outcomes, including necessary recovery and
   validation work beyond the initial sentence.
4. **Compare viable mechanisms.** Depending on the durability and delivery contract, compare
   a durable database worker with the existing broker. If database changes and publication must
   agree, examine that consistency boundary for either design; naming a broker does not solve
   it. Include retaining current behavior only when it can meet the accepted outcome.
5. **Resolve material uncertainty.** Use an `EXP-*` only if its outcome changes the choice.
   Record proposals while it is pending. An inconclusive experiment leaves feasibility unresolved;
   it does not establish production performance or reliability.
6. **Record and define.** Capture the `ED-*` with authority and rationale; use an ADR when warranted.
   Define `CT-*` for acknowledgement versus completion, retries after response loss, supported
   old/new clients, retention and recovery, using the selected mechanism.
7. **Plan verifiable resources.** Trace `RES-*` to criteria, sequence actual dependencies, and identify
   migration, rollout and rollback limits where applicable. Split child features only when they
   can deliver and verify their own value.
8. **Run scoped gates.** A contract blocker stops dependent resources. Independent ready work can
   continue. Record checks as they run. At completion, an uncovered Required recovery criterion
   means the feature remains incomplete even if compilation and unit tests pass.

## Using the suite

```bash
agent-skills install feature-engineering
agent-skills install collaborative-feature-definition
agent-skills install feature-progress-tracking
```

These are alternative entry points, not a required installation sequence. The orchestrator's
manifest declares its lifecycle dependencies; the initial-definition workshop is a suggestion
and can be installed explicitly. Invoke a specialist directly when the phase is already clear.

Installed packages make guidance available. Activation and resource loading depend on the target
agent and runtime; installation alone does not prove automatic routing. The orchestrator's
instructions select applicable guidance, and the
[written lifecycle cases](../skills/feature-engineering/references/validation-cases.md) describe
behaviors to evaluate. Written cases are not evidence of executed behavior.
