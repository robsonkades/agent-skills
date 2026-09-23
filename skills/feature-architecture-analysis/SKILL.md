---
name: feature-architecture-analysis
description: >
  Enumerating what a feature actually touches, with paths: which modules, layers, contracts,
  schemas, message topics, configuration and cross-cutting concerns change, which of those
  changes are visible outside the component, and where the change crosses a boundary that
  requires checking compatibility and ownership. Use before writing an implementation plan, when a feature is
  assumed to be local and might not be, when a change is about to alter a published contract or
  a stored schema, when the file list in a plan was written from memory, or when nobody can say
  what breaks if this feature is wrong. Does not choose which layer a responsibility belongs to
  (layering-and-boundaries), does not decide where a deployable boundary should fall
  (architecture-coupling-and-quanta), and does not evaluate competing designs
  (feature-solution-analysis).
---

# Feature Architecture Analysis

## Purpose

A plan whose file list was written from memory is a guess presented as a plan. It is wrong in a
specific and expensive way: it under-counts the places a change is visible, so the tests are
scoped to the component, the review is scoped to the diff, and the breakage lands on a caller
nobody enumerated.

The output is an **impact map**: what changes, at which path, and whether the change is visible
from outside.

## Workflow

1. **Start from agreed scope and accepted decisions**, not an assumed design. Record the feature
   revision, any accepted contract revisions, each inspected repository revision and relevant
   working-tree changes.
   Trace accepted items to `SC-*`; recommended work is conditional until included. If used
   alone, derive a small scope list from the request. Discovered impacts of accepted work
   remain relevant even if their files were absent from that list; surface new requirements
   as scope questions rather than silently adding them.
2. **Walk each item outward** — the component that changes, its callers, its persisted state,
   its contract, its configuration, its tests. `references/impact-map.md` gives the traversal
   and the shape of an entry.
3. **Classify every touched element**: NEW, MODIFIED (including explicit removals), or READ
   (unchanged, but its behaviour is depended on). READ elements are why a change breaks something nobody edited.
4. **Name the component boundary and mark visibility.** INTERNAL if nothing outside it can observe the change;
   EXTERNAL if a caller, a stored row, a message consumer, an operator or a dashboard can.
5. **Find consumers and dependencies of relevant NEW, MODIFIED and READ elements.** Search
   source, schemas, configuration and registrations; trace changed data, load and failure
   behavior. Distinguish call sites from distinct consumers and record search coverage.
6. **Name the cross-cutting touches explicitly** — security, configuration, observability,
   transactions, concurrency. These are the ones a component-shaped reading misses.
7. **Flag affected boundary crossings**: a contract others
   depend on, a schema holding existing data, a message others consume, or a shared library.
8. **Identify and trace impacts.** Assign each entry an `IMP-*` linked to its `SC-*` source. Every
   boundary crossing names the accountable contract/engineering owner or records that owner as open.
   Identify any required review from actual repository/team policy and existing authorization;
   crossing a boundary alone does not create a new permission gate or require a message.

## Decision rules

```text
IF a NEW or MODIFIED element affects an external contract
THEN link the applicable accepted contract revision and record the compatibility question.
     Changed or missing semantics need a decision/CT-* handoff through feature-contract-definition;
     do not duplicate a settled contract or choose its new semantics while mapping impacts.

IF an element is READ and the dependency is new, heavier or used under changed conditions
THEN it belongs in the map. Changed values, ordering, transaction scope or failure handling
     can affect unchanged code even when call counts and load do not increase.

IF the impact crosses a module boundary
THEN say which direction the dependency runs, and whether the direction is new.

IF the impact reaches persisted data
THEN distinguish unchanged access/load from schema, representation or semantic changes;
     record migration/backfill/coexistence needs where applicable, not for every read.

IF the impact reaches a message contract
THEN name the consumers and whether they can be deployed independently.

IF an entry has no repository path
THEN cite its concrete external identity/specification and evidence, or mark it unknown.

IF the map is entirely INTERNAL and entirely inside one module
THEN say so with the search boundary; lower review depth only if risk evidence supports it.
     Internal security, money, concurrency or resource changes can still be high impact.
```

## Constraints

- **Concrete locators.** Cite existing paths/symbols or external resource identities and
  evidence. NEW paths are proposed locations, not files claimed to exist. A shared topic,
  table or operator-owned dashboard is an impact even outside this checkout.
- **Do not design here.** The map says what is touched under the scope as agreed. If two designs
  produce different maps, that is an input to the solution phase, and both maps belong there.
- **Do not omit tests and configuration.** They are where features are actually incomplete.
- **Keep independently actionable impacts identifiable.** Group generated/repeated files
  under their source only when consumers, risks and verification remain traceable. File
  count is not a risk score. Map meaningful propagation without expanding every library call.
- Inspect the target compiler/runtime and API/dependency versions and wiring where compatibility
  matters; source, binary, wire and behavioral compatibility are distinct. No Java upgrade
  is implied by this analysis, and a text search cannot prove absence of reflective or remote users.

## Output

```text
Feature impact map
Feature/contract baseline / repository revisions + relevant working-tree changes / environments

api/
  IMP-01 OrderController.java:41     MODIFIED  EXTERNAL   new endpoint <- SC-01
  IMP-02 CreateOrderRequest.java     MODIFIED  EXTERNAL   optional field added <- SC-01
application/
  IMP-03 OrderService.java:88        MODIFIED  INTERNAL   dispatch branch <- SC-01
  IMP-04 OrderDispatchService.java   NEW       INTERNAL   <- SC-01
domain/
  IMP-05 Order.java:120              MODIFIED  EXTERNAL   new state; persisted <- SC-01
infrastructure/
  IMP-06 OrderRepository.java        MODIFIED  INTERNAL   persist dispatch state <- SC-01
  IMP-07 V42__order_dispatch_state.sql NEW     EXTERNAL   proposed old-row policy; confirm contract <- SC-01
cross-cutting/
  IMP-08 application.yaml            MODIFIED  EXTERNAL   proposed keys/defaults; confirm environments <- SC-01
  IMP-09 SecurityConfig.java:66      READ      EXTERNAL   verify endpoint rule matching/order <- SC-01
  IMP-10 OrderMetrics.java           MODIFIED  EXTERNAL   new counter name <- SC-01
tests/
  IMP-11 OrderDispatchContractTest.java NEW    INTERNAL   proposed endpoint/auth/state checks <- SC-01

Boundary crossings   <IMP-*, who depends on it, and accountable owner>
Contracts            <IMP-* -> existing CT/specification revision, or required definition and owner>
Consumers/dependencies   <IMP-* -> locators, count type, searched scope and evidence>
Verification points  <IMP-* -> existing test/contract evidence or required check>
Unknowns             <what could not be established, next check/owner, and what it blocks>
```

Before handoff, check that every accepted scope item maps to impacts or an evidenced no-impact
conclusion, locators match the inspected revision, and affected consumers and verification points are
traceable. If scope, contracts, code or wiring change, recheck affected entries and their propagation
before reusing the map; a path that still exists does not make old evidence current.
Material unknowns name their next check/owner and dependent work; they do not prevent
reporting the supported map or imply implementation readiness. A local feature may need only a few
entries. Close with the affected parties and credible consequences if the feature is wrong.
