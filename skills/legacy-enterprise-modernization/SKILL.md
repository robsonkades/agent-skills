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

Change a system that is in production, poorly understood, and still earning revenue, without
a rewrite and without a stop-the-world release. The failure mode this exists to prevent is
the parallel rewrite: a new system built beside the old one, competing against a target that
keeps moving, funded until the first budget review, and eventually abandoned with both
systems in production.

The second failure is subtler and more common: a modernisation programme that has run for a
year, produced several new services, and **decommissioned nothing** — so the organisation now
operates two architectures and pays for both.

## Principles

```text
Avoid a parallel rewrite while the original changes unless a bounded scope,
        compatibility strategy and funded cutover make drift controllable.

Every step ships and delivers value on its own.
        A step that only pays off at the end will not be funded to the end.

Decommissioning is the deliverable.
        New code is not progress; removed old code is.

Understand before changing; pin before understanding fully.
        Characterisation tests capture behaviour you have not yet
        explained, which is most of it.

The legacy model must not infect the new one.
        That is the entire purpose of an anti-corruption layer.
```

## Workflow

1. **Map what exists**, from evidence: which tables are written by what, which endpoints are
   actually called, where rules live (code, procedures, triggers, jobs, spreadsheets).
   Reconcile production evidence, documentation and operator knowledge: each has blind spots.
2. **Pin behaviour with characterisation tests** at the boundary you will preserve — usually
   the HTTP API or the batch output — before touching anything.
3. **Pick the first slice by value and by risk**, not by architecture: something that changes
   often (so the pain is real), is reasonably self-contained, and whose failure is survivable.
4. **Establish data ownership before code ownership.** Two writers to one table is the
   constraint that blocks everything else.
5. **Strangle**: route the slice's traffic to new code, keep the old path available, and
   remove it once the new one has proven itself.
6. **Decommission explicitly**, as a scheduled deliverable with a date. Otherwise both
   systems live forever.

## Decision rules

```text
The system still changes regularly and earns money
        → prefer incremental replacement. A rewrite carries moving-target,
          parity and cutover risk; use it only with evidence those costs are bounded.

The system is frozen, small, and thoroughly understood
        → a rewrite may be genuinely cheaper. This is rare; verify
          "frozen" against a representative change window and operational roadmap.

Several applications write the same tables
        → establish write authority and compatible migration rules first.
          Read-only extraction or additive schema evolution may proceed, but
          independent writes remain coupled until ownership is enforced.

A new component must read a legacy schema
        → anti-corruption layer. Translate at the boundary; do not let
          the legacy shape become the new model.

Business rules live in stored procedures and triggers
        → inventory them before anything else. Rules invisible to the
          application are what makes "we replaced that module" false.

There are no tests
        → characterisation tests at the outermost stable boundary, from
          real production inputs where possible.

The programme has produced new services and removed nothing
        → stop building. Decommission one thing. Two architectures cost
          more than either.

A slice's old and new paths must both work for a long period
        → route by feature flag per case, with an explicit owner per
          case, and a comparison policy if both run.
```

## Rules

- **A rewrite is a bet that the new system will catch up before the old one moves.** It
  rarely does, and the failure is usually organisational rather than technical: the funding
  outlasts neither the roadmap nor the sponsor.
- **Characterisation tests capture behaviour, including bugs.** That is intentional — users
  and downstream systems depend on behaviour nobody specified, and the migration's job is not
  to fix it silently. Record the ones that look wrong; decide about them separately.
- Prefer triangulated evidence over recollection alone. Access/audit logs cover only their retention,
  sampling and instrumentation; documentation can encode rare regulatory and recovery paths absent
  from recent traffic. Choose an observation window from business cycles, not “a month” by default.
- **Rules hide outside the application.** Stored procedures, triggers, scheduled jobs,
  database defaults, ETL scripts and a spreadsheet someone runs monthly. A module "replaced"
  without inventorying those has left its rules behind, and they will fire on the new data.
- **An anti-corruption layer is not a mapper.** Its job is to prevent the legacy model's
  concepts from entering the new one, which means it may drop, merge, rename and reinterpret
  — and it will be ugly, because it holds the mismatch that would otherwise be spread
  through the new code (`enterprise-base-patterns`).
- **Write ownership constrains independent evolution.** Several writers can coexist under additive,
  backward-compatible migrations, but conflicting semantics and removal cannot be made independently.
  Establish authority before transferring writes. This is usually the largest and least glamorous
  part of the work, and skipping it is why extractions fail
  (`distribution-boundaries`).
- Prefer strangling at a boundary that already exists — an endpoint, a queue, a batch file —
  because it is already a contract and something already speaks it.
- **Decommissioning must be on the plan with a date.** "We will remove the old path once
  things are stable" is how a programme ends with two systems. Removal is the deliverable
  that realises the benefit.
- Keep the legacy system running well while it lives. Deliberate neglect ("it is going away")
  extends its life by making the migration riskier and the team's mornings worse.
- Prefer separating technology upgrades from domain restructuring so failures remain attributable.
  Combine them only when one unlocks the other and the migration has independent behavioral,
  compatibility and rollback evidence.

## References

- [Strangler and anti-corruption layer](references/strangler-and-anticorruption.md) —
  choosing the interception point, routing a slice with a flag, running old and new in
  parallel with a comparison policy, the anti-corruption layer's shape and what belongs in
  it, and decommissioning as a scheduled step with its verification. Read when planning or
  executing an extraction from a legacy system.
- [Understanding and migrating the data](references/understanding-and-data-migration.md) —
  discovering a system from production evidence, characterisation tests without a
  specification, inventorying rules in procedures and triggers, establishing table
  ownership, and migrating a shared database incrementally with dual-write and
  reconciliation. Read at the start of a modernisation, and before any change to a shared
  schema.
