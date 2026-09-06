# Index decisions

An index buys one of three things. Decide which before proposing one, because they want
different indexes.

| Job           | What it needs                                             |
| ------------- | --------------------------------------------------------- |
| **Filtering** | Searchable predicates matching the index/access method    |
| **Ordering**  | The sort columns, in order, after the equality columns    |
| **Covering**  | Every column the statement reads, filtering ones included |

## Selectivity decides whether filtering is worth it

Selectivity here is the fraction of rows a predicate keeps. A non-covering path may fetch table
pages, with cost depending on clustering, caching and batching; a scan reads broadly. Often the
more selective path favors an index, but ordering, covering and LIMIT also matter. Any crossover
depends on the engine, storage, locality and row width, not a percentage to memorize.

What follows from that:

- **A column with two distinct values** can be heavily skewed: an `active=false` value matching
  0.1% may benefit from a normal or partial/filtered index. Measure the queried value's frequency;
  two possible values do not imply 50/50. Covering/ordering may add other benefits.
- **A nearly unique equality predicate** — an id, an email, an external reference — usually
  gives a selective lookup; wide ranges on the same column need a different assessment.
- **Skew matters more than cardinality.** A `tenant_id` with 5,000 values is highly selective for
  4,999 tenants but retains 80% for another. Different access paths may be best; the larger tenant
  can also be slower simply because it requires more useful work. Compare plans and costs.

Use statistics and observed rows first. Exact counts may be expensive and must share a meaningful
snapshot/population; collect them only when the decision needs that precision.

## Composite indexes serve a leading prefix

A B-tree on `(a, b, c)` commonly narrows by the leading prefix. Non-leading predicates may still
use index scans or version-specific skip scans (for example PostgreSQL 18); that does not give
them the same cost as a dedicated `(b)` index. Inspect the exact access conditions and pages read.

The ordering rule, in the order to apply it:

1. **Start with equality predicates that establish the useful leading prefix.** Their relative
   order may not matter for this one lookup, but can matter for other queries, ordering,
   statistics, compression, and vendor-specific access paths.
2. **Then the range used to bound the scan** (`>`, `<`, `BETWEEN`, `LIKE 'prefix%'`). Columns after
   it may still filter or cover even when they cannot further narrow that range in a given engine.
3. **Then the columns needed for ordering**, where direction and engine rules allow the sort to be avoided.
4. **Consider remaining columns needed to cover.** Included payload columns are not search keys;
   extra key columns may also serve other predicates. Wider keys/payload have distinct costs.

For `tenant_id = ? AND created_at > ?`, `(tenant_id, created_at)` commonly narrows a useful
contiguous range. `(created_at, tenant_id)` can scan a broader range yet filter by tenant inside
the index. Required ordering/LIMIT and other queries can change the best choice; this is a
candidate construction process, not a universal equality-range-order recipe.

## Covering, and its cost

If the index contains all required values, it can cover the query. This does not universally
eliminate table access: PostgreSQL MVCC visibility can require heap fetches unless the relevant
pages are all-visible. Read actual heap fetches and the engine's rules, not just the node name.

The costs are real:

- The index gets wider, so fewer entries fit per page and more pages are read for the same range.
- The index must be maintained when any covered column is written, not just the key columns.

So covering pays when the lookup is the dominant cost and the added columns are narrow and rarely
updated. `SELECT *` can make a previously covering index insufficient, but is not intrinsically
non-covering; clustered/all-column access paths are counterexamples.

## When the answer is no index

- **The predicate returns most rows.** A scan may be cheapest; required bulk/reporting work is
  not a design defect by itself. Consider ordering, covering and throughput requirements.
- **The table is small enough to sit in memory.** The optimiser will frequently ignore the index
  and be correct to.
- **The write cost exceeds the read benefit.** A high-write, low-read table with an index added
  for a report run twice a day.
- **An existing index serves the prefix.** `(a)` may be redundant beside `(a, b)`, but its narrower
  size can change cost. Require evidence of benefit and inspect uniqueness/other dependencies.
- **The real fix is elsewhere** — the statement is issued N times (`orm-fetch-and-batching-performance`),
  or the result should have been cached (`caching-strategies`).

## Removing one

Indexes accumulate and are rarely deleted, because deletion feels riskier than addition. It is
not free to keep them: storage and relevant insert/update/delete maintenance accumulate.

Before removing, inspect a representative usage window, counter resets, replicas, rare jobs,
constraints and foreign-key/locking effects. Zero reads is not proof of no dependency. Use an
authorized engine-specific rollout and recovery plan: rebuilding may be expensive and blocking.

Sources: [PostgreSQL 18 multicolumn B-trees](https://www.postgresql.org/docs/18/indexes-multicolumn.html),
[PostgreSQL 17 covering and visibility](https://www.postgresql.org/docs/17/indexes-index-only-scans.html).
