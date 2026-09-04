# SQL Server concurrency, plans, and instance resources

## Blocking and versions

Inspect active requests, open transaction age, lock resources, and the head blocker. Lock escalation
is statement- and memory-sensitive; batching can reduce footprint, while row/page hints do not
guarantee escalation cannot occur.

For deadlocks, read the resource list and access paths that close the cycle, then the process order.
Choose deterministic access order, a narrower lock range, shorter transaction, or bounded retry from
the mechanism—not from which transaction SQL Server selected as victim.

RCSI and SNAPSHOT consume `tempdb` version store. Long readers determine retention. Before enabling,
measure tempdb capacity, transaction age, and application assumptions; after enabling, monitor
version-store growth and update conflicts where applicable.

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

## Instance resources

- `tempdb`: inspect allocation/version/spill workload and file latency before changing file count.
  Equal-sized data files up to an initial measured baseline are a starting point, not a timeless rule.
- Memory: `max server memory` does not cap every byte of the process. Leave OS and non-buffer-pool
  headroom and use NUMA-aware trends rather than a universal Page Life Expectancy threshold.
- Parallelism: `MAXDOP` limits workers inside a plan; cost threshold controls which plans become
  candidates. Tune them as separate levers.
- Waits: exclude benign categories carefully, preserve uptime, compare deltas during the incident,
  and use average duration plus correlated resource evidence.
