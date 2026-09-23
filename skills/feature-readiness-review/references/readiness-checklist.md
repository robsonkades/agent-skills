# Readiness checklist

Each item is PASS, N/A with a reason, or OPEN. The **blocking** column identifies prerequisites
for dependent implementation, not a feature-wide stop by default. Trace affected resources and
their dependents; only a common prerequisite blocks all implementation. Other OPEN items need an
owner and the stage/resource where they become prerequisites. Reuse existing authority and evidence.

## Definition intake

| #   | Item                                                               | Blocking |
| --- | ------------------------------------------------------------------ | -------- |
| 0a  | Exact Product/Engineering or Tech Feature revisions are identified | yes      |
| 0b  | Each stage has an accountable owner and accepted status            | yes      |
| 0c  | Required Engineering Analysis is complete or validly not required  | yes      |
| 0d  | Depth and persistence have evidenced drivers                       | yes      |
| 0e  | Every GAP-* is complete and remains valid for the reviewed scope   | yes      |

For 0e, check the missing decision/evidence, reason, consequence, accountable authority, expiry,
reopen trigger and `Blocks` field. Evaluate those conditions against the current revision and stage,
not just the presence of fields. An expired or reopened gap needs reassessment of affected resources;
an accepted gap may still block some resources while allowing others. Reuse unaffected acceptance
and existing authority; do not treat acceptance as permission to skip a declared prerequisite.

## Understanding

| #   | Item                                                                                                                  | Blocking |
| --- | --------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | The requirement is stated in the domain's terms, not as a solution                                                    | yes      |
| 2   | Every assumption still standing is written down with its falsifier                                                    | yes      |
| 3   | Every HIGH-impact unknown is resolved or linked to a valid GAP-* accepted by its accountable owner                    | yes      |
| 4   | No question marked BLOCKING is open                                                                                   | yes      |
| 5   | Scope-changing ambiguities were resolved by an authorised owner; local reversible choices follow recorded conventions | yes      |

## Scope

| #   | Item                                                                     | Blocking |
| --- | ------------------------------------------------------------------------ | -------- |
| 6   | In scope is listed, and every item traces to a requirement or constraint | yes      |
| 7   | Out of scope is listed, each with a reason and who excluded it           | yes      |
| 8   | The creep check has been run over Required and Recommended               | no       |

## Constraints and decisions

| #   | Item                                                                                                                                              | Blocking |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 9   | Applicable mandatory or prohibited technologies are established; preferences are recorded only when decision-relevant                             | yes      |
| 10  | Relevant organisational standards were checked in available authority sources; unknown external policy is raised only when it can change the work | yes      |
| 11  | Every ED-* carries provenance, accountable role, consulted roles, status and source                                                               | yes      |
| 12  | Every consequential decision was confirmed by the role authorized for its consequence                                                             | yes      |
| 13  | Decisions that materially affect the system have records                                                                                          | no       |
| 14  | No decision rests on "the project already does this" alone                                                                                        | yes      |

## Context and architecture

| #   | Item                                                             | Blocking |
| --- | ---------------------------------------------------------------- | -------- |
| 15  | The context report exists and every finding cites evidence       | no       |
| 16  | Established project patterns are identified and will be followed | no       |
| 17  | The impact map gives concrete repository or external locators    | yes      |
| 18  | Every boundary crossing is named, with who depends on it         | yes      |
| 19  | Reusable components were looked for and the result recorded      | no       |

External resource identities/specifications are valid locators; NEW locations are proposals,
not files claimed to exist. Unknown locations remain OPEN for affected work.

## The change itself

| #   | Item                                                                                          | Blocking |
| --- | --------------------------------------------------------------------------------------------- | -------- |
| 20  | Affected boundary contracts and owners are identified; required semantic changes are accepted | yes      |
| 21  | Schema changes are defined, with the compatibility window                                     | yes      |
| 22  | Error and failure behaviour is defined for the named cases                                    | yes      |
| 23  | Security obligations are established — authn, authz, data handling                            | yes      |
| 24  | Configuration is defined, with defaults and per-environment values                            | no       |
| 25  | Observability is defined: what an operator sees when it misbehaves                            | no       |

For item 20, reuse the authoritative accepted contract revision when its semantics are unchanged.
New, changed or missing semantics need the applicable contract-definition/CT-* handoff, including
failure and evolution behavior; do not duplicate a settled specification to satisfy the gate.

## Execution readiness

| #   | Item                                                                                  | Blocking |
| --- | ------------------------------------------------------------------------------------- | -------- |
| 26  | RES-* exist, each with upstream trace, dependencies and planned EV-*                  | yes      |
| 27  | The execution order is derived, with forced arrows marked                             | yes      |
| 28  | The test strategy is set per resource, not as a paragraph                             | yes      |
| 29  | Migration, deployment and rollback are written as sequences                           | yes      |
| 30  | Risks are derived; remaining HIGH-impact risks have planned controls or a valid GAP-* | yes      |
| 31  | BAC-* and TC-* are observable and trace to planned EV-*                               | yes      |
| 32  | Dependencies on other people or systems are named                                     | no       |

For item 30, an avoided risk needs evidence that removes its failure path for the reviewed scope.
A proposed removal remains open until supported; planned controls are not verified protection.

## Scaling the checklist

Not every feature runs all thirty-two. By depth class:

- **Light** — run concise definition intake and applicable readiness checks before implementation,
  then completion checks afterward. Inline requirements, resource and validation mappings suffice.
- **Standard** — run definition intake, then items 1–14, 17, 20–23, 26–28, 31 as a starting set;
  add other applicable checks such as migration or risk. Skip what the feature cannot touch.
- **Deep** — evaluate all items, but mark non-applicable items N/A with evidence. Depth
  increases scrutiny; it does not make every feature touch an API, schema, migration, deployment
  sequence, security boundary, or new telemetry.

Items are selected by depth **and applicability**, never by convenience. An item omitted because it
is awkward is a likely gap; an item marked N/A because the impact map proves the feature cannot
touch that concern is valid tailoring.

## Reporting the gate

```text
Readiness: RETURN TO ENGINEERING — full feature; 3 open prerequisites after N/A correction

OPEN  #4  Q-08 is unanswered: is a repeated dispatch a duplicate or a second
          dispatch? Blocks RES-07 and RES-08.
OPEN  #21 The compatibility window is undefined: whether the currently deployed
          reader tolerates the new column value is unverified.

N/A   #29 (migration) — none of the resources touches persisted data.
          Wrong: RES-03 adds a column. Corrected to OPEN.

Subset PASS: RES-09, RES-10 (authorized; no dependency on any open prerequisite).
```

The corrected line is worth imitating. An N/A that turns out to be wrong is the most common way
a checklist passes while the feature is not ready.
