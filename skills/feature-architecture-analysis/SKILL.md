---
name: feature-architecture-analysis
description: >
  Enumerating what a feature actually touches, with paths: which modules, layers, contracts,
  schemas, message topics, configuration and cross-cutting concerns change, which of those
  changes are visible outside the component, and where the change crosses a boundary that
  raises who must approve it. Use before writing an implementation plan, when a feature is
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

1. **Start from the scope table**, not from the design. Every Required and Recommended item
   produces impact; nothing else does.
2. **Walk each item outward** — the component that changes, its callers, its persisted state,
   its contract, its configuration, its tests. `references/impact-map.md` gives the traversal
   and the shape of an entry.
3. **Classify every touched element**: NEW, MODIFIED, or READ (unchanged, but its behaviour is
   depended on). READ elements are why a change breaks something nobody edited.
4. **Mark visibility.** INTERNAL if nothing outside the component can observe the change;
   EXTERNAL if a caller, a stored row, a message consumer, an operator or a dashboard can.
5. **Find the callers of everything MODIFIED and EXTERNAL.** Search, do not assume. A public
   method with three callers is three impacts.
6. **Name the cross-cutting touches explicitly** — security, configuration, observability,
   transactions, concurrency. These are the ones a component-shaped reading misses.
7. **Flag every boundary crossing**, because it changes who must agree: a contract others
   depend on, a schema holding existing data, a message others consume, or a shared library.

## Decision rules

```text
IF an element is MODIFIED and EXTERNAL
THEN it is a compatibility question before it is an implementation task —
     it needs a decision, not just a file edit.

IF an element is READ and its behaviour is being relied on more heavily
THEN it belongs in the map. Load, contention and failure modes travel to callers
     that never changed.

IF the impact crosses a module boundary
THEN say which direction the dependency runs, and whether the direction is new.

IF the impact reaches persisted data
THEN it is a migration, and the map must say whether old and new data coexist.

IF the impact reaches a message contract
THEN name the consumers and whether they can be deployed independently.

IF an entry has no path
THEN it is not a finding yet. Find the path or mark it as an unknown.

IF the map is entirely INTERNAL and entirely inside one module
THEN say so — that conclusion legitimately lowers the depth of everything downstream.
```

## Constraints

- **Paths, not descriptions.** "The service layer" is not an entry; a file is.
- **Do not design here.** The map says what is touched under the scope as agreed. If two designs
  produce different maps, that is an input to the solution phase, and both maps belong there.
- **Do not omit tests and configuration.** They are where features are actually incomplete.
- **Do not merge impacts to make the map shorter.** One line per element; the count is
  information, and it is the number the plan and the risk register are built from.

## Output

```text
Feature impact map

api/
  OrderController.java:41            MODIFIED  EXTERNAL   new endpoint; existing signature unchanged
  CreateOrderRequest.java            MODIFIED  EXTERNAL   optional field added
application/
  OrderService.java:88               MODIFIED  INTERNAL   dispatch branch
  OrderDispatchService.java          NEW       INTERNAL
domain/
  Order.java:120                     MODIFIED  EXTERNAL   new state; persisted
infrastructure/
  OrderRepository.java               MODIFIED  INTERNAL
  V42__order_dispatch_state.sql      NEW       EXTERNAL   migration; old rows default to LEGACY
cross-cutting/
  application.yaml                   MODIFIED  EXTERNAL   two new keys, both with defaults
  SecurityConfig.java:66             READ      -          new endpoint inherits the existing rule
  OrderMetrics.java                  MODIFIED  EXTERNAL   new counter name

Boundary crossings   <each, with who depends on it>
Callers of modified external elements   <path -> count>
Unknowns             <what could not be established, and what it blocks>
```

Close with one sentence: the blast radius if this feature is wrong.
