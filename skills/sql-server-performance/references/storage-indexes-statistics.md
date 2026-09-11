# SQL Server storage, indexes, and statistics

## Physical model

For disk-based rowstore, SQL Server uses 8 KiB pages. A clustered rowstore index's leaf level holds
the data; its key forms the locator in nonclustered rowstore indexes (a heap uses a RID instead).
Do not apply that layout literally to clustered columnstore or memory-optimized tables.
Evaluate clustered keys for width, uniqueness, insertion order,
immutability, nullability, and fixed- versus variable-width storage in the actual workload;
these are design costs, not a mandate to replace a demonstrated adequate key. A random 16-byte key costs both locality and
width; UUID v7 in `uniqueidentifier` does not sort by timestamp bytes as a binary value would.

Measure page density and logical reads, not fragmentation percentage alone. `FILLFACTOR` reserves
space at rebuild time and the reserve decays; it is useful only for a measured split pattern. A
sequential insert hotspot may call for `OPTIMIZE_FOR_SEQUENTIAL_KEY`, not globally sparse pages.

## Statistics and cardinality

Compare estimated with actual rows at the first divergence. Inspect the exact statistic, histogram,
last update, modification count, sampling, and compatibility-level cardinality estimator. A rebuild
can change statistics as well as layout, so its improvement alone does not isolate fragmentation.
A targeted `UPDATE STATISTICS` comparison may help when the evidence and authorized scope justify
that mutation; it is not a prerequisite for every review. Generic
calendar thresholds and `sp_updatestats` do not establish that the important histogram is accurate.

Query Store supplies plan history and aggregated runtime intervals. Correlate it with independently
captured parameter distributions, statistics and compatibility changes; history alone does not
prove which change caused a regression. See the concurrency/plans reference for capture limits.

## Layout decisions

- Compression trades CPU for fewer pages and must be evaluated per table/index with production CPU
  headroom. Nonclustered indexes do not simply inherit every table choice.
- Rowstore and columnstore serve different access/write shapes. Small or trickle-loaded rowgroups
  can remain in the delta store and lose the expected benefit.
- Partitioning primarily buys manageability. Verify partition elimination and index alignment;
  partitioning a point-lookup OLTP table can multiply seeks.
- A heap can accumulate forwarded records after widening updates. Staging, small tables, or
  appropriate nonclustered-index access can justify one; OLTP alone does not forbid a heap.
  Compare update/scan/range/order requirements, locator width and maintenance cost, and retain
  adequate measured behavior rather than requiring a clustered-index migration.

## Files and maintenance

Pre-size files, use fixed growth increments, inspect actual file latency, and verify Instant File
Initialization rather than assuming it. A percentage increment grows with file size; inspect the
actual growth duration and remaining allocation/storage work instead of treating IFI as cost-free.
For SQL Server 2022 on Windows, distinguish data-file IFI from transaction-log autogrowth: log growth
up to 64 MB can use IFI even with TDE and without the data-file volume-maintenance privilege. Larger
log growth does not get that exception; TDE prevents data-file IFI. Verify the target before choosing
growth increments, rather than applying a universal data/log rule or optimizing only growth frequency.

For online/resumable index work, state edition support, boundary-lock behavior, write amplification,
log/replica impact, scratch space, stop conditions, and validity after resume/failure.

## Primary references

- [Index architecture](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-index-design-guide?view=sql-server-ver16) — rowstore, locators and layout alternatives.
- [GUID comparison](https://learn.microsoft.com/en-us/sql/connect/ado-net/sql/compare-guid-uniqueidentifier-values?view=sql-server-ver17) — SQL Server ordering differs from binary timestamp ordering.
- [RFC 9562, UUIDv7](https://www.rfc-editor.org/rfc/rfc9562.html#section-5.7) — timestamp-first layout; combine with SQL Server's comparison rules before assuming insertion order.
- [Heap access and maintenance](https://learn.microsoft.com/en-us/sql/relational-databases/indexes/heaps-tables-without-clustered-indexes?view=sql-server-ver16) — justified heap uses and forwarding/scan costs.
- [Instant file initialization](https://learn.microsoft.com/en-us/sql/relational-databases/databases/database-instant-file-initialization?view=sql-server-ver16) — SQL Server 2022 log-autogrowth threshold and data/log/TDE distinctions.
