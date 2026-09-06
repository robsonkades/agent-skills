# SQL Server concurrency, plans, and instance resources

## Blocking and versions

Inspect active requests, open transaction age, lock resources, and the head blocker. Lock escalation
is statement- and memory-sensitive; batching can reduce footprint, while row/page hints do not
guarantee escalation cannot occur.

For deadlocks, read the resource list and access paths that close the cycle, then the process order.
Choose deterministic access order, a narrower lock range, shorter transaction, or bounded retry from
the mechanism—not from which transaction SQL Server selected as victim.

With ADR off, RCSI/SNAPSHOT versions use `tempdb`; with ADR on, they use the database's persistent
version store (PVS). Inspect the actual ADR setting and store capacity. Retention also depends on
active transactions, version generation and cleanup, not just readers. Use
`sys.dm_tran_version_store_space_usage` for aggregate tempdb usage and
`sys.dm_tran_persistent_version_store_stats` for PVS; detailed version-store scans can be expensive.
Versioning does not eliminate writer conflicts or schema locks. Verify application isolation
assumptions before enabling and monitor store growth and SNAPSHOT update conflicts afterwards.

## Plans and grants

Read the application plan with actual rows and executions. Diagnose:

- first estimate divergence and the statistic/expression/parameter causing it;
- parameter skew and whether one, several, or per-execution plans are justified;
- implicit conversion on the indexed side;
- repeated key lookup or nested-loop inner work;
- requested/granted/used memory, spills, and concurrent grant pressure;
- worker/scheduler pressure and distribution of rows between parallel branches.

Use Query Store forcing or hints as scoped, monitored mitigation. Check force failures and remove the
control after the underlying distribution/statistics/query issue changes.

PSP starts with SQL Server 2022 and compatibility level 160; check the database-scoped setting,
query/predicate eligibility and actual dispatcher/variant plans. Engine version alone does not
prove it is active, and changing compatibility can affect the whole database.

Query Store holds compiled plans and aggregated execution statistics, not an actual execution plan
for every call or a complete runtime-parameter log. Check capture mode, read/write state, retention
and replica support before treating missing history as meaningful. Aggregate active-interval rows
by plan, execution type and interval; weight averages by execution count. Means/min/max do not
recover p99. Obtain request-level latency and representative parameters through an appropriate
capture, and separate aborted/exception executions from successful ones.

## Instance resources

- `tempdb`: inspect allocation/version/spill workload and file latency before changing file count.
  Equal-sized data files up to an initial measured baseline are a starting point, not a timeless rule.
- Memory: `max server memory` does not cap every byte of the process. Leave OS and non-buffer-pool
  headroom and use NUMA-aware trends rather than a universal Page Life Expectancy threshold.
- Parallelism: `MAXDOP` is not a total worker cap per request/query; parallel branches/tasks can
  require more workers in aggregate. Inspect actual DOP, worker reservations and effective overrides.
  Cost threshold uses estimated optimizer cost, not elapsed milliseconds, to consider parallel
  alternatives. Tune these as separate levers.
- Waits: preserve restart/reset history and compare interval deltas without clearing shared
  diagnostic counters. `sys.dm_os_wait_stats` accounts for completed waits; inspect live waiting
  tasks/requests for ongoing waits. Concurrent worker waits can exceed wall time, so their sum is
  not a request's elapsed latency or a CPU-utilization percentage.

## Primary references

- [Row versioning guide](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide?view=sql-server-ver16) — ADR/PVS, retention and monitoring.
- [MAXDOP](https://learn.microsoft.com/en-us/sql/database-engine/configure-windows/configure-the-max-degree-of-parallelism-server-configuration-option?view=sql-server-ver16) — task scope and overrides.
- [Query Store runtime statistics](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/sys-query-store-runtime-stats-transact-sql?view=sql-server-ver16) — aggregation keys and execution types.
- [PSP optimization](https://learn.microsoft.com/en-us/sql/relational-databases/performance/parameter-sensitive-plan-optimization?view=sql-server-ver16) — eligibility and compatibility.
- [Wait statistics](https://learn.microsoft.com/en-us/sql/relational-databases/system-dynamic-management-views/sys-dm-os-wait-stats-transact-sql?view=sql-server-ver17) — completed waits and reset history.
