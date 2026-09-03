---
name: architecture-refactoring-paths
description: >
  Moving an enterprise application from one architectural choice to another without a
  rewrite: transaction script to domain model, Active Record to Data Mapper, in-process call
  to remote boundary, server session to stateless, pessimistic to optimistic locking, and
  entity-as-payload to a boundary contract. Use when a pattern choice has been outgrown and
  someone proposes a rewrite, when a refactor has stalled halfway with two designs
  coexisting badly, when a migration needs to survive being paused for a quarter, when a
  data migration and a code change must ship in the same release, when a change would break
  API consumers, when an intermediate state has no defined behaviour, or when nobody can say
  how the refactor would be rolled back. Does not cover recognising that a change is needed
  (enterprise-architecture-smells), the programme-level approach to a legacy system
  (legacy-enterprise-modernization), the target patterns themselves, or database migration
  tooling.
---

# Architecture Refactoring Paths

## Purpose

Change an architectural decision incrementally, in steps that each ship, each provide value,
and each can be the last one. The alternative — a rewrite, or a long-lived branch — fails
for reasons that are structural rather than accidental: the business does not stop, the old
system keeps changing, and the new one is compared against a moving target.

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

Step 2 is what distinguishes a migration from a rewrite: at every moment, the whole system
works, and rolling back is a deploy rather than a restore.

## Workflow

1. **State the harm that justifies the move**, with evidence. Without it, the migration will
   be deprioritised halfway, which is the worst possible state
   (`enterprise-architecture-smells`).
2. **Choose the smallest first case** — one aggregate, one endpoint, one screen. Not the
   most painful one; the one that proves the path.
3. **Write characterisation tests first**, at the use-case level. Tests written against the
   old structure's internals will be deleted by the refactor and prove nothing.
4. **Define the intermediate state explicitly.** Two mechanisms will coexist for months;
   which one owns which case must be answerable by anyone, at any time.
5. **Ship each step.** A step that is not deployed is a branch, and a branch is a rewrite
   with extra steps.
6. **Define the abandonment point.** Which step is a good place to stop if priorities
   change? Usually there is one, and naming it makes the work fundable.

## Decision rules

```text
The change requires a data migration
        → expand/contract: add the new shape, write both, backfill in
          chunks, switch reads, stop writing the old, drop it. Six
          deploys, each reversible.

The change breaks an API consumer
        → additive first, deprecate with a date, remove after the
          consumers have moved. Never in one release
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

- **Never run the old and new implementations of a rule in parallel and reconcile
  afterwards** unless you also decide, in advance, which one wins on disagreement and who
  investigates. Parallel-run without that policy generates alerts nobody can action.
- **Characterisation tests come first and must be behavioural.** The point is to detect a
  change in what the system does, including behaviour nobody intended but users depend on.
- **A step that has not shipped has not reduced risk.** Long-lived refactor branches conflict
  with feature work, and the conflict is resolved by whoever is under most pressure — which
  is never the refactor.
- Prefer separate, compatibility-preserving schema and code deploys when independent rollback is
  valuable. A transactional metadata change or tightly controlled maintenance-window cutover may
  combine them, but then rollback, lock duration and mixed-version behavior must be proven.
- **Backfills are chunked, restartable and observable.** A single `UPDATE` over a large table
  locks it and cannot be resumed (`enterprise-transactions`).
- Keep a single source of truth at every moment. Dual-write periods are the exception, must
  be short, and need a reconciliation check — two writers with no comparison is how silent
  divergence starts.
- Separate refactoring from intentional behavior changes when that produces independently
  reviewable and deployable increments. If the seam cannot be introduced without changing
  behavior, state both deltas and test the old and new contracts explicitly.
- Delete the old path as a separate, explicit step. Migrations that stall do so at step 5,
  and a codebase with two mechanisms and no plan is worse than either.
- Name the abandonment point. "If we stop after step 3, we have the aggregate under test and
  the boundary in place, which is worth the effort on its own" is what keeps a migration
  funded when priorities move.

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
