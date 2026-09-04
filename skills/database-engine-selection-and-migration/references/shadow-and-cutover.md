# Shadow validation and cutover

## Shadow phase

1. Capture an anonymized corpus containing common and edge parameters, expected results, and allowed
   nondeterminism.
2. Replay reads and compare sets, total ordering, types, warnings/errors, and precision. Normalize
   only differences explicitly allowed by the contract.
3. Compare plans by work: examined rows, reads/buffers, loops, spill, log/WAL, and locks. Time alone
   confounds hardware and cache.
4. Run barrier-controlled concurrency tests for every integrity invariant.
5. Simulate restart, failover, replica lag, timeout, invalid load chunks, and interrupted DDL.

## Dual-write gate

Do not dual-write unless the design defines operation identity, ordering/version conflict, partial
success, retry, repair, source of truth, reconciliation lag, and an exit condition. Prefer log/CDC
capture or one authoritative write plus replication when it gives a clearer recovery model.

## Cutover contract

Specify:

```text
freeze or replication catch-up boundary:
pre-cutover invariant and lag checks:
traffic ramp stages and owner:
abort thresholds for correctness, error, latency, lag, and resource saturation:
reconciliation window and repair authority:
rollback point, data written after cutover, and reverse-sync method:
deadline after which rollback becomes a forward-fix:
```

Rehearse backup/restore and rollback using production-scale timing. A rollback that cannot account for
writes accepted after cutover is not a rollback plan.
