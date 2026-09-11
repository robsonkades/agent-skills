---
name: architecture-refactoring-paths
description: >
  Sequence a chosen enterprise architecture change into compatible, testable checkpoints:
  domain and persistence refactoring, remote boundaries, session state, locking or events.
  Use when old and new paths must coexist, a migration has stalled, code and data changes
  interact, consumers cannot upgrade together, or rollback and safe pause points are unclear.
  Does not select target patterns, diagnose the need for change (enterprise-architecture-smells),
  plan a whole modernization programme (legacy-enterprise-modernization), or implement
  database migration tooling.
---

# Architecture Refactoring Paths

## Purpose

Sequence an agreed architectural change into compatible, testable checkpoints. Establish
the current and target contract rather than selecting a pattern from fashion. Incremental
delivery limits exposure when coexistence and recovery are explicit; it is not automatically
safer than a bounded, rehearsed cutover.

The useful target is that an architectural refactor can be paused at documented checkpoints without
leaving correctness dependent on completing the next step. Some migrations have an intentionally
atomic cutover; make its recovery procedure, compatibility window and irreversible point explicit.

## The shape of every path here

```text
1. Characterise      pin current behaviour with tests at the level that
                     will survive the change (usually the use case).
2. Introduce         add the new structure BESIDE the old. Nothing is
                     removed yet; both work.
3. Route one case    move a single, low-risk case to the new path. Ship.
4. Widen             move cases one at a time, each shipped separately.
5. Contract          remove the old structure when nothing uses it.
6. Simplify          only now, remove the scaffolding that supported the
                     coexistence.
```

This is a planning shape, not a fixed release count. A deploy rollback works only while
the old implementation can interpret current data and see every authoritative write.

## Workflow

These paths are planning pseudocode, with no executable Java baseline. Before proposing Java
types or ORM changes, inspect Maven/Gradle release/toolchain settings, resolved framework and
serializer versions, CI and runtime images. Preserve the target's compatibility contract;
using this skill does not authorize upgrades, preview features or new dependencies.

1. **State the harm and constraints**, with evidence (`enterprise-architecture-smells`).
   Inspect writers, consumers, jobs, schema/ORM versions, transaction boundaries and deployment
   topology. Obtain the target invariants, downtime and recovery/data-loss objectives. Separate
   observed harm from its hypothesized cause; name a measurement that could refute the proposed
   improvement. If critical evidence is absent, ask for it and provide a conditional plan,
   not a certified cutover or invented safe lock duration.
2. **Choose the smallest first case** — one aggregate, one endpoint, one screen. Not the
   most painful one; the one that proves the hard seam. A read-only pilot cannot validate writes.
3. **Write characterisation tests first**, at the use-case level. Tests written against the
   old structure's internals may need adaptation; retain useful existing coverage. Separate
   intentional corrections from preserved behavior, especially security defects or corrupt data.
4. **Define the intermediate state explicitly.** While two mechanisms coexist,
   which one owns reads, writes and in-flight work for each case must be explicit. Test the
   overlapping reader/writer versions, not only old-only and new-only deployments.
5. **Validate each checkpoint.** Define acceptance, pause/abort criteria and an owner. Exercise
   relevant concurrent writes, partial failures and restart in isolation before rollout.
   Distinguish routing reversal, binary rollback, resynchronization, restore and forward repair.
   Record what was executed versus planned; rehearsals reduce risk before shipping too.
6. **Define the abandonment point.** Which step is a good place to stop if priorities
   change? Usually there is one, and naming it makes the work fundable.

## Decision rules

```text
The change requires a data migration
        → define authority, backfill races and catch-up first; use the
          persistence reference. Expand/contract does not make every
          phase reversible, especially after old writes stop.

The change breaks an API consumer
        → additive first, deprecate with a date, remove after the
          consumers have moved. A coordinated replacement is possible
          when all consumers are controlled and compatibility is tested
          (rpc-and-api-contracts).

The change is internal to one module, no persisted state
        → do it in one change with tests. Not everything needs a
          programme.

Two mechanisms must coexist
        → make ownership explicit and mechanical (a feature flag per
          case, a registry, a package boundary). "Whichever the developer
          remembers" is how a migration produces a hybrid nobody
          understands.

The migration cannot be paused
        → first try to decompose it further. If an atomic cutover is intrinsic,
          rehearse it against production-scale data and define abort, forward-fix
          and restore criteria instead of pretending it is reversible.

Rolling back requires restoring a backup
        → treat this as an irreversible migration boundary. Prefer a compatible
          expand/contract path; where none exists, test restore time and data-loss
          exposure against the recovery objectives before approving the cutover.
```

## Rules

- **Shadow execution must suppress real side effects or share proven deduplication across
  both paths.** Separate idempotency within each path does not prevent a double charge.
  Decide the authoritative result, accepted differences and investigation owner in advance.
- Deploy bounded, validated increments when feasible; tests and cutover rehearsals provide
  evidence before deployment, while production rollout tests additional assumptions.
- Prefer separate, compatibility-preserving schema and code deploys when independent rollback is
  valuable. A transactional metadata change or tightly controlled maintenance-window cutover may
  combine them, but then rollback, lock duration and mixed-version behavior must be proven.
- **Large backfills need bounded, restartable work and observable progress.** Determine actual
  lock scope, duration, log volume and replica lag for the engine/version; do not assume every
  UPDATE exclusively locks the table (`enterprise-transactions`).
- Keep authoritative ownership explicit. Bound dual-write periods by compatibility and recovery
  needs, with an owner and reconciliation; duration alone does not establish safety.
- Separate refactoring from intentional behavior changes when that produces independently
  reviewable and deployable increments. If the seam cannot be introduced without changing
  behavior, state both deltas and test the old and new contracts explicitly.
- Retire the old path explicitly after consumer/job inventory, in-flight work, telemetry over
  a justified window and rollback policy agree. Intentional coexistence is a valid stopping
  point when ownership and maintenance cost are accepted.

## Minimum deliverable

For a plan: current/target contract, evidence gaps, checkpoints with ownership, acceptance
and recovery, first slice, useful stopping point and irreversible boundary. For a review:
evidence, unsafe transition, consequence, adjustment and validation. A local stateless
refactor may need only one tested change, not a migration programme.

## References

- [Domain and persistence paths](references/domain-and-persistence-paths.md) — transaction
  script to domain model, Active Record to Data Mapper, entity-as-payload to a boundary
  contract, and inheritance strategy changes; each with the step sequence, the intermediate
  state, the data migration where one is needed, and the point at which stopping is a good
  outcome. Read before starting one of these moves.
- [Boundary and concurrency paths](references/boundary-and-concurrency-paths.md) —
  in-process module to remote service, server session to stateless, pessimistic to
  optimistic locking, and synchronous call to event; each with its rollback story, its
  parallel-run policy where one applies, and the verification that the migration is
  complete. Read when changing a boundary or a concurrency mechanism.
- [Validation cases](references/validation-cases.md) — evaluator-only requests and criteria;
  withhold from the task agent during scored comparisons. Use the path references above to
  challenge an actual plan's rollback, side-effect and mixed-writer assumptions.
