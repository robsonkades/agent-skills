# SQL Server storage, indexes, and statistics

## Physical model

SQL Server reads 8 KiB pages. The clustered index is the table, and its key becomes the row locator
stored in every nonclustered index. Evaluate clustered keys for width, uniqueness, insertion order,
immutability, nullability, and fixed-width storage. A random 16-byte key costs both locality and
width; UUID v7 in `uniqueidentifier` does not sort by timestamp bytes as a binary value would.

Measure page density and logical reads, not fragmentation percentage alone. `FILLFACTOR` reserves
space at rebuild time and the reserve decays; it is useful only for a measured split pattern. A
sequential insert hotspot may call for `OPTIMIZE_FOR_SEQUENTIAL_KEY`, not globally sparse pages.

## Statistics and cardinality

Compare estimated with actual rows at the first divergence. Inspect the exact statistic, histogram,
last update, modification count, sampling, and compatibility-level cardinality estimator. Test a
targeted `UPDATE STATISTICS` before attributing a rebuild improvement to fragmentation. Generic
calendar thresholds and `sp_updatestats` do not establish that the important histogram is accurate.

Query Store supplies plan history and runtime intervals; use it to distinguish data distribution,
statistics, parameter values, compatibility changes, and a plan regression.

## Layout decisions

- Compression trades CPU for fewer pages and must be evaluated per table/index with production CPU
  headroom. Nonclustered indexes do not simply inherit every table choice.
- Rowstore and columnstore serve different access/write shapes. Small or trickle-loaded rowgroups
  can remain in the delta store and lose the expected benefit.
- Partitioning primarily buys manageability. Verify partition elimination and index alignment;
  partitioning a point-lookup OLTP table can multiply seeks.
- A heap can accumulate forwarded records after widening updates. Staging is a legitimate heap use;
  defaulting OLTP tables to heaps is not.

## Files and maintenance

Pre-size files, use fixed growth increments, inspect actual file latency, and verify Instant File
Initialization rather than assuming it. A percentage growth becomes a larger synchronous event as
the database grows.

For online/resumable index work, state edition support, boundary-lock behavior, write amplification,
log/replica impact, scratch space, stop conditions, and validity after resume/failure.
