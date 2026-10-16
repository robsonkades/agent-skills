---
name: legacy-enterprise-modernization
description: >
  Modernising an enterprise application that is in production and cannot stop: understanding
  a system nobody fully knows, pinning behaviour before changing it, strangling
  functionality out incrementally, and defending a new model with an anti-corruption layer.
  Use when a rewrite is proposed for a system that still earns money, when a shared database
  has several writers, when business rules live in stored procedures and triggers, when
  there are no tests and no specification, when a strangler migration has stalled with both
  systems running, or when a modernisation has run for a year with nothing decommissioned.
  Does not cover the specific pattern-to-pattern migrations
  (architecture-refactoring-paths), recognising the problems
  (enterprise-architecture-smells), whether a boundary should be remote
  (distribution-boundaries), or class-level seams and dependency breaking
  (java-legacy-code-testing).
---

# Legacy Enterprise Modernization

## Purpose

Change a system that is in production, poorly understood, and still earning revenue while
preserving its required contracts and service continuity. Prefer bounded incremental change;
a bounded replacement remains an option when scope, compatibility and cutover are understood.
One failure mode is a parallel rewrite that chases a moving target and leaves both systems
in production when funding runs out.

Another failure is a modernisation programme that has run for a
year, produced several new services, and **decommissioned nothing** — so the organisation now
operates two architectures and pays for both.

## Principles

```text
Avoid a parallel rewrite while the original changes unless a bounded scope,
        compatibility strategy and funded cutover make drift controllable.

Keep steps bounded with an observable benefit or prerequisite they unlock.
        Fund enabling work explicitly rather than assuming immediate revenue.

Track decommissioning alongside business and risk-reduction outcomes.
        New code alone does not prove reduced coexistence cost.

Understand before changing; pin before understanding fully.
        Characterisation tests capture behaviour you have not yet
        explained at the boundary being changed.

Contain semantic mismatch at the integration boundary.
        Use an anti-corruption layer when the models need translation;
        compatible concepts may need only a gateway or projection.
```

## Workflow

1. **Map the affected slice and its dependencies**, from evidence: which tables are written
   by what, which endpoints are called, where rules live (code, procedures, triggers, jobs,
   spreadsheets). Expand the investigation when evidence reveals another affected contract.
   Reconcile production evidence, documentation and operator knowledge: each has blind spots.
2. **Pin behaviour with characterisation tests** at the boundary you will preserve — usually
   the HTTP API or the batch output — before changing that behaviour. Retain known invariant
   tests and distinguish intended contract changes from accidental differences.
3. **Pick the first slice by value and by risk**, not by architecture: something that changes
   often (so the pain is real), is reasonably self-contained, and whose failure is survivable.
4. **Establish data ownership before transferring writes.** Shared writers constrain
   independent semantic changes; compatible additive work and read extraction can proceed.
   Preserve cross-table transaction contracts when introducing an owner API, and verify
   former writers' effective permissions and in-flight work before declaring the handoff complete.
5. **For an incremental extraction**, route the slice's traffic to new code and validate
   its contract and data-compatible rollback before retiring the old path.
6. **Plan the lifecycle of coexistence paths**: give temporary paths an owner, removal gates
   and dependencies, and a target window when evidence supports one. Document the support
   cost and contract of intentionally retained interfaces.

Return the decision for the requested boundary, its supporting evidence and the next
validation or unresolved dependency. A review can close with no change when the existing
design meets the contract; a narrow question does not require a programme-wide migration plan.

## Decision rules

```text
The system still changes regularly and earns money
        → prefer incremental replacement. A rewrite carries moving-target,
          parity and cutover risk; use it only with evidence those costs are bounded.

The system is frozen, small, and thoroughly understood
        → compare the cost of a bounded rewrite with incremental replacement. Verify
          "frozen" against a representative change window and operational roadmap.

Several applications write the same tables
        → establish write authority and compatible migration rules first.
          Read-only extraction or additive schema evolution may proceed, but
          independent writes remain coupled until ownership is enforced.

A new component must read a legacy schema
        → inspect semantic differences. Translate them at the boundary if present;
          use a simple gateway/projection when the agreed concepts already match.

Business rules live in stored procedures and triggers
        → inventory the affected rules and their callers before changing that slice.
          Preserve their required effects regardless of where they execute.

There are no tests
        → characterise the affected stable boundary, from representative,
          safely handled production inputs where possible.

The programme has produced new services and removed nothing
        → investigate removal blockers and coexistence cost. Prioritize a
          bounded retirement path; continue independent justified work.

A slice's old and new paths must both work for a long period
        → route by feature flag per case, with an explicit owner per
          case, and a comparison policy if both run.
```

## Rules

- Inspect the project's JDK/toolchain, framework/database versions and compatibility contracts
  before applying snippets. They illustrate application-specific seams, not a complete program
  or authorization to upgrade the stack. No project-wide Java baseline is assumed: the
  backfill's `Stream.toList()` requires Java 16+, while Spring and test-library compatibility
  must match the target project. Adapt examples to that target without silently upgrading it.
- **A parallel rewrite must account for drift, parity and cutover.** Compare bounded scope,
  funding and operational recovery with the cost of incremental coexistence.
- **Characterisation tests capture behaviour, including bugs.** That is intentional — users
  and downstream systems depend on behaviour nobody specified, and the migration's job is not
  to fix it silently. Record the ones that look wrong; decide about them separately.
- Prefer triangulated evidence over recollection alone. Access/audit logs cover only their retention,
  sampling and instrumentation; documentation can encode rare regulatory and recovery paths absent
  from recent traffic. Choose an observation window from business cycles, not “a month” by default.
- **Rules hide outside the application.** Stored procedures, triggers, scheduled jobs,
  database defaults, ETL scripts and a spreadsheet someone runs monthly. Identify those
  affecting the changed boundary; code replacement alone does not retire their effects.
- **An anti-corruption layer contains semantic translation.** Agree and test any dropping,
  merging or reinterpretation of legacy data. A mapper or gateway can suffice when the
  concepts already match; do not invent domain differences to justify a layer
  (`enterprise-base-patterns`).
- **Write ownership constrains independent evolution.** Several writers can coexist under additive,
  backward-compatible migrations, but conflicting semantics and removal cannot be made independently.
  Establish authority before transferring writes; otherwise remaining writers can violate
  the new contract
  (`distribution-boundaries`).
- Prefer strangling at a boundary that already exists — an endpoint, a queue, a batch file —
  because it is already a contract and something already speaks it.
- **Make temporary coexistence accountable.** Replace "once things are stable" with named
  ownership and verifiable consumer, data and rollback gates. If a removal date is unknown,
  record the blocking decision and next check; a date never overrides those gates.
- Keep the legacy system running well while it lives. Deliberate neglect ("it is going away")
  extends its life by making the migration riskier and the team's mornings worse.
- Prefer separating technology upgrades from domain restructuring so failures remain attributable.
  Combine them only when one unlocks the other and the migration has independent behavioral,
  compatibility and rollback evidence.

## References

- [Strangler and anti-corruption layer](references/strangler-and-anticorruption.md) —
  choosing the interception point, routing a slice with a flag, running old and new in
  parallel with a comparison policy, the anti-corruption layer's shape and what belongs in
  it, and decommissioning gates. Read when planning or
  executing an extraction from a legacy system.
- [Understanding and migrating the data](references/understanding-and-data-migration.md) —
  discovering a system from production evidence, characterisation tests without a
  specification, inventorying rules in procedures and triggers, establishing table
  ownership, and migrating a shared database incrementally with dual-write and
  reconciliation. Read when discovering an affected legacy boundary or planning a shared
  schema/data migration.
