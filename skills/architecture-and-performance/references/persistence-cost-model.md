# Conditional costs of persistence and call patterns

Pattern names suggest where to measure; they do not determine SQL, allocation counts or latency.
Record provider/version, mappings, access sequence, cache state, data shape and database plan.
The examples below are cost models, not benchmark results.

## Fetching: count queries and rows

Assume a cold persistence context/cache, N distinct orders, one uninitialized lines collection
per order, every collection accessed, no extra eager relationships and no count query:

| Shape                                                | Expected SQL under those assumptions                                         | What can invalidate the estimate                                      |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Unbatched lazy collections                           | 1 root query + N collection queries                                          | Already initialized collections, cache hits or fetching configuration |
| Additional lazy customer per order                   | Up to N extra lookups                                                        | Shared customers already loaded by identity, cache or join            |
| Explicit single collection fetch join                | Often one statement, about N × lines-per-order rows for nonempty collections | Pagination, other associations and skew                               |
| Collection batch loading with effective batch size B | Approximately 1 + ceil(N/B)                                                  | Eligible keys, parameter limits, provider strategy and partial access |
| Subselect collection loading                         | Often root query plus one collection query                                   | Provider support and which owners the subselect includes              |
| Scalar/DTO projection                                | One statement if the requested shape fits it                                 | Count query, nested data, sorting and aggregation costs               |
| Entity graph                                         | Loading requirement, not a SQL-count promise                                 | Provider may use joins or secondary selects                           |

Jakarta Persistence defines graph loading semantics rather than guaranteeing one SQL statement.
An identity map belongs to the persistence context, which may span transactions; it reuses managed
identity but does not make arbitrary repeated queries avoid SQL. See
[Jakarta Persistence 3.2](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2).

Parallel collection joins multiply rows: with 4 lines and 3 payments, 25 orders can produce
300 rows before deduplication. Some collection mappings cannot be fetched together. Measure
rows, bytes and hydration as well as statement count. Batch loading trades round trips for
bounded groups; it is not constant as an unbounded N grows.

Hibernate 7.1 warns that fetch joins combined with limits can require in-memory limiting.
Inspect SQL and fail/warning behavior for the exact provider/version; consider paging root IDs
then fetching details, or a projection. Preserve deterministic ordering and define consistency
between the two reads under concurrent writes. See
[Hibernate fetching and limits](https://docs.hibernate.org/orm/7.1/userguide/html_single/#hql-limit-offset).

Use `orm-fetch-and-batching-performance` for implementation choices. Prefer fixing unnecessary
traversals before relying on cache hits, but compare a justified cache separately when repeated
source demand and freshness requirements support it.

## Persistence context, flush and inheritance

A large managed set retains memory and can increase dirty-check work. Repeated full scans of a
growing set can accumulate quadratic total work across many flushes; one flush is not inherently
quadratic. Enhancement, read-only entities and flush mode change costs. Measure managed count,
flush frequency, allocation and SQL. Flush pending writes before clearing between chunks;
clearing or switching to stateless processing changes identity/cascade semantics.

Automatic flush may run before affected queries, but not necessarily before every query.
Inspect emitted SQL and transaction configuration before blaming a loop.

For inheritance, compare actual subtype and polymorphic queries: single-table avoids inheritance
joins but may use wider/sparser rows; joined mapping adds table accesses; table-per-class can
require unions. There is no universal fastest mapping. Check constraints, indexes, subtype
distribution and writes using `inheritance-mapping-strategies`, rather than ranking mappings
from their names.

## Aggregate boundaries and read models

An aggregate is a consistency boundary, not a requirement to hydrate every related row on every
operation. Identify the invariant and the state/locks necessary to enforce it. Bound work for
each operation across realistic tenant sizes; do not rewrite an invariant as a running total
without atomic maintenance, conflict handling and reconciliation.

Illustrative read-path comparison, assuming all listed loads really occur:

```text
500 independent aggregate loads × 4 queries = 2,000 queries
500 × 60 hydrated objects = 30,000 objects

Candidate projection: 500 result rows × 6 selected columns
SQL count, joined rows and plan cost still require verification.
```

A projection can avoid unnecessary hydration when a read needs only selected data. It must keep
authorization/tenant filters, derived-value semantics and consistency requirements. Thirty queries
alone do not prove reads went through a write model. Inspect the access graph.
Use `query-objects-and-specifications` for read-query design and `domain-logic-organization`
when changing invariant ownership.

## Mapping and large payloads

Mapping cost depends on conversions, copying, reflection, object reuse and payload shape; field
count does not determine allocation count. Check CPU and allocation evidence separately.
If mapping/serialization dominates, optimize that work even when database calls are already
bounded. Remove a layer only if the measured benefit and its responsibilities justify it.

For bulk reads, compare streaming or chunked projections. Streaming may hold a cursor/connection
while a slow client drains; chunking needs ordering, restart and consistency decisions.
Measure peak memory, response progress, total work and resource hold time, rather than assuming
streaming is automatically cheap.

## Remote calls, caching and extraction

For sequential dependent calls, elapsed call time is approximately their sum. For all-required
calls started together without contention, completion follows the slowest plus coordination;
bounded concurrency, retries and queueing change that model. A fan-out still consumes the sum
of downstream work.

For independent identically distributed branch latencies with CDF F and all N branches required,
P(all finish by t) = F(t)^N. This is a model, not permission to multiply p99 by N; correlation,
shared limits and partial-response semantics change the result. Measure complete request
distributions. Coarsening calls can reduce overhead while increasing bytes and coupling.
Use `distribution-boundaries` for placement and consistency tradeoffs.

Before parallelizing, specify a concurrency bound, shared deadline, cancellation behavior and
downstream capacity. Test partial failure and offered load, not just an idle-system response.
Do not concurrently share an EntityManager/persistence context; Jakarta Persistence does not
require it to be thread-safe. Spring's imperative, thread-bound transaction does not propagate
to newly started worker threads. Separate contexts/transactions may change snapshot consistency
and atomicity, and require additional connections. If the operation requires one transaction,
prefer sequential or set-based access unless the chosen transaction model explicitly supports
the alternative. See [Jakarta Persistence concurrency contract](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2#obtaining-an-entity-manager)
and [Spring transaction context](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/annotation/Transactional.html).

A simple sequential read-through cache model is:
mean time ≈ lookup cost + (1 - hit ratio) × source cost.
This assumes comparable source cost on misses and excludes fill/serialization overhead,
contention, stampedes and invalidation. It predicts neither tail latency nor freshness.
Use representative hot-key and cold/miss traffic, source demand and correctness constraints;
delegate implementation to `caching-strategies`.

Extraction can help through isolation, independent scaling or data locality when the measured
constraint moves. It adds network and operational costs and may leave shared database contention
unchanged. State which resource gains capacity, what additional demand reaches dependencies and
how this will be validated; do not assume either improvement or inevitable regression.

## Locks and transaction scope

A continuously contended exclusive resource with mean lock hold H seconds has an idealized
ceiling near 1/H acquisitions per second if there are no handover gaps. For H = 0.020 seconds,
that is about 50/s. Use actual exclusive hold time, not total transaction time; multiple independent
keys and shorter critical sections change capacity. Retries may increase offered work.

Optimistic concurrency still has version-check and database locking costs; conflicts require
bounded retry or explicit failure, and retries must be safe. A locking read's scope depends on
engine, isolation, plan and rows/gaps visited, not merely the SQL spelling.
Bulk updates may bypass ORM version handling unless the statement enforces it; lock escalation
is engine-specific, not a universal bulk-update outcome. Inspect actual waits and version predicates.
See [PostgreSQL locking semantics](https://www.postgresql.org/docs/current/explicit-locking.html)
as one engine's behavior, not a cross-database contract.

Shorten a lock/transaction only if the invariant still holds. Per-item transactions reduce
atomic scope and may increase commit overhead; batching/chunking needs an explicit partial-failure
contract. Use `enterprise-transactions` and `offline-concurrency-control` for those decisions.
For connection occupancy, use the distinct intervals and mean-rate model in
[request-path-budget.md](request-path-budget.md).

The cited specifications establish mechanics. Cost estimates and architectural recommendations
remain conditional until checked against the target implementation and workload.
