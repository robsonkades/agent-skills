---
name: database-engine-selection-and-migration
description: >
  Choosing among SQL Server, MySQL/InnoDB, and PostgreSQL for a greenfield system, or planning a
  migration between them, from explicit semantic, workload, operational, JVM-driver, DDL, cost,
  and team constraints. Use when an ADR, proof of concept, compatibility inventory, shadow
  validation, or reversible cutover is needed. Not a generic product ranking or live query-tuning
  workflow.
---

# Database Engine Selection and Migration

## Purpose

Make the accepted trade-offs and non-portable assumptions visible before an engine choice or
cutover. Start with vetoes and behavioral proof, not a weighted feature popularity score.

## Decision inputs

```text
read/write/admin SLOs, availability, RPO/RTO, retention, and growth:
OLTP/analytic/hybrid workload, data shape/distribution, working set, and peak concurrency:
transaction invariants and anomalies the domain permits or forbids:
topology, regions, replication/CDC, backup/restore, and failover requirements:
required SQL/types/extensions/indexes/search/JSON/partitioning/columnar capabilities:
JDK, ORM, pool, exact driver versions, batching/fetch/generated-key behavior:
edition/license/managed-service constraints and team operational competence:
DDL/cutover window, reversibility, data sovereignty, and exit cost:
```

If these are missing, produce the evidence plan rather than selecting a winner.

## Greenfield workflow

1. Express hard vetoes as testable requirements. A required behavior that an allowed edition or
   topology cannot provide eliminates an option; many small advantages do not cancel a veto.
2. Write the domain's critical concurrent scenarios and run deterministic interleavings at the
   intended isolation level. Isolation names are not portable behavior contracts.
3. Use production-shaped volume, skew, correlations, transaction durations, and concurrency. Compare
   work—reads/buffers, rows examined, spills, log/WAL, locks, and p99—not empty-schema averages.
4. Exercise inevitable operations: vacuum/purge/version store, checkpoints, growth, replication lag,
   backup/restore, failover, and a large DDL under concurrent traffic.
5. Run the intended JVM stack. Drivers and poolers change prepared statements, plans, batch/fetch,
   memory, timeout, session state, and generated-key behavior.
6. Record the trade-off, risk signal, owner, mitigation, exit path, and event that reopens the ADR.

## Migration workflow

1. Inventory five surfaces separately: schema; SQL; concurrency; JVM integration; operations.
   Converting `CREATE TABLE` covers the least dangerous surface.
2. Turn every source-specific behavior into an explicit destination invariant or an accepted change.
   Do not transliterate hints, types, index syntax, isolation names, or driver properties.
3. Compare source and destination using an anonymized edge-case corpus and production-shaped load.
   Check result set, order, JDBC types, errors, plans, and work.
4. Force concurrent interleavings for critical invariants and failure cases for DDL, partial loads,
   restart, failover, lag, timeout, and generated keys.
5. Shadow reads and reconcile. Dual-write only with explicit idempotency, ordering, failure handling,
   and reconciliation; otherwise it creates two sources of truth.
6. Cut over with measurable abort criteria, a bounded reconciliation window, rehearsed rollback, and
   one owner authorized to decide.

## Non-portability rules

- Compare isolation by allowed outcomes and conflict handling, not labels. SQL Server locking/RCSI,
  InnoDB consistent reads plus next-key locks, and PostgreSQL snapshot/SSI can block, abort, or admit
  different interleavings under similarly named levels.
- Redesign physical keys and indexes for the destination. SQL Server clustered keys, InnoDB primary
  keys, and PostgreSQL heap indexes amplify width and updates differently.
- Test nullable uniqueness, collations, case/accents/trailing spaces, identifiers, time zones/DST,
  numeric overflow, booleans, UUID ordering, generated IDs, and `NULL` semantics explicitly.
- Upsert, pagination, partial/expression indexes, covering, JSON, DDL transactions, and online DDL do
  not have one-to-one translations.
- Replace driver and ORM settings by destination behavior. Similar property names do not imply the
  same wire protocol, plan lifecycle, fetch streaming, batch rewrite, or timeout coverage.
- Operational competence is a requirement. A benchmark winner the team cannot back up, fail over,
  observe, maintain, and recover under the target RTO is not a viable winner.
- Version and edition are part of every claim. A Developer/Enterprise lab can validate DDL that the
  production edition rejects; a major version can invert defaults.

## Output contract

For greenfield, produce an ADR with context, vetoes, measured scenarios, accepted trade-offs, risks
and owners, reversibility, and review trigger. For migration, produce a compatibility inventory,
evidence matrix, shadow/reconciliation plan, cutover/abort/rollback runbook, and unresolved risks.

Each decisive claim must identify evidence, inference, confidence reason, and the test that could
falsify it.

## References

- [Engine trade-offs](references/engine-trade-offs.md) — read when comparing the three engines or
  defining proof-of-concept gates.
- [Migration compatibility](references/migration-compatibility.md) — read when inventorying a source
  system or writing destination equivalence tests.
- [Shadow and cutover](references/shadow-and-cutover.md) — read when planning dual-run, reconciliation,
  failure rehearsal, cutover, or rollback.
