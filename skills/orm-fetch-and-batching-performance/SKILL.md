---
name: orm-fetch-and-batching-performance
description: >
  Making JPA and Hibernate stop issuing the statements you did not ask for, and making the ones
  they do issue cheap: statement count as the primary number, N+1 from an association and from a
  collection, join fetch versus entity graph versus batch fetching, the cartesian product two
  join-fetched collections produce, DTO projections instead of entity graphs, and why write
  batching silently does nothing under identity id generation. Use when the query count scales
  with rows rendered, when a page issues hundreds of selects, when LAZY was changed to EAGER to
  make an exception go away, when open-session-in-view is switched on, when a bulk write is one
  INSERT per row, when a flush is slow, or when pagination over a join fetch warns about
  in-memory paging. Not the plan for one statement (sql-query-performance), pool sizing
  (connection-pool-sizing), the runtime patterns themselves (orm-behavioral-patterns), where the
  mapping lives (metadata-mapping), or the second-level cache decision (caching-strategies).
---

# ORM Fetch and Batching Performance

## Purpose

Make the number of statements the ORM issues a quantity you chose, rather than one that emerges
from the mapping.

The failure this prevents is the global fix for a local symptom: switching an association to
`EAGER`, or turning on open-session-in-view, because one screen threw
`LazyInitializationException`. Both can hide that symptom while changing loading scope and
cost. Neither establishes a correct fetch plan or a performance improvement.

Inspect the project's Java release/toolchain, Jakarta versus javax API, resolved Hibernate
version, enhancement settings, database/dialect, JDBC driver and transaction boundaries first.
Examples use Hibernate 6.6-era APIs and Spring Boot property forwarding where shown; they
are partial snippets, not authorization to upgrade the project. A DTO record requires Java 16+.
Reproduce with the deployed stack; JPA fetch contracts do not prescribe a SQL statement count.

## Workflow

1. **Count the statements before forming any theory.** Turn on statement counting for one
   request and read the number. "It feels slow" and "this request issues 431 selects" lead to
   different investigations, and only the second is falsifiable.
2. **Classify what the count is proportional to.** Repeated selects growing with accessed
   associations suggest N+1; a constant query count can still transfer excessive rows or be
   slow. Writes remain one logical DML operation per row even when JDBC batching works.
   Measure batch executions separately; inspect listeners, cascades, implicit flushes and
   identifier allocation rather than diagnosing from a count alone.
3. **Find the traversal that triggers it.** For N+1 the statement log shows one query followed by
   many near-identical ones differing only in a parameter. The many can be associations
   being resolved per row, possibly through eager secondary selects as well as lazy traversal.
4. **Choose the mechanism deliberately** — join fetch, entity graph, batch fetching, or a
   projection — using the table in `references/n-plus-one-remedies.md`. They are not
   interchangeable; query counts depend on the provider, mappings and population.
5. **Check what the fix cost.** A join fetch that solved N+1 can return a cartesian product; a
   projection that solved it can bypass a cache you were relying on.
6. **Re-measure the same operation through rendering/serialization**, with matched row counts,
   cache state and transaction scope. Report selects, prepared statements/batches where relevant,
   returned rows, duration and result correctness before/after. Accept a change only against
   the actual objective; fewer statements with worse row volume or latency is not a success.

## Rules

- **`FetchType.EAGER` is a default loading obligation for entities**, not a join instruction
  or a requirement on scalar projections. Prefer local fetch plans when appropriate.
  A JPA `fetchgraph` treats unspecified attributes as lazy even if mapped eager, whereas
  `loadgraph` preserves their mapping defaults; providers may fetch additional state. Verify
  the actual provider behavior instead of promising either one SQL query or mandatory laziness.
- **`LazyInitializationException` reports a boundary, not a defect in `LAZY`.** Something read
  uninitialized state after its entity became detached or its context closed. The fix is fetching it in the query that
  needs it, or mapping to a DTO before the boundary — not widening the context's lifetime.
- **Open-session-in-view permits additional queries during rendering.** Reads may occur outside
  the service transaction and see a different database state; connection acquisition/release
  depends on configuration. Include this phase in counting. Enabling it does not fix N+1.
- **Join fetching multiple to-many associations can multiply rows.** Ten line items and five
  shipments may produce fifty rows carrying the same order. Hibernate rejects some multiple-bag
  shapes, while other collection combinations may execute and still explode the result. Prefer one
  collection fetch per query unless measured cardinalities prove the product is bounded.
- **Pagination over a collection fetch requires version- and query-specific verification.** Common
  Hibernate query shapes warn and page in memory because SQL row limits do not equal root-entity
  limits. Fail on that warning in tests; use a root-id page followed by a bounded fetch, or a
  provider feature whose generated SQL and ordering you have verified.
- **Batch fetching can approach `1 + ceil(N / batch)` for one eligible association role.** It is a candidate when the
  association is needed for most rows and a join fetch would multiply, and it is still round
  trips.
- **A scalar DTO projection often reduces read cost**, because its results are not managed entities:
  fewer columns and no additional managed result graph to dirty-check or flush. It can lose
  identity-map and second-level-cache benefits and may duplicate rows or computation, so prefer it
  when measurement and ownership fit a read model. Selecting entities into a DTO does not
  remove their managed/lazy behavior, and an AUTO-flush query can still flush earlier writes.
- **Bound persistence-context growth.** Flush traversal, snapshots, collections and dirty
  entities can make a large context expensive; enhancement, immutability and read-only state
  change the work. Profile the actual flush and bound the input pipeline as well as the context.
- **Write batching needs eligibility as well as configuration.** The JDBC batch size must be configured _and_ the
  statement/driver/flush arrangement must permit batching. Hibernate 6.6 disables JDBC insert
  batching for entities using IDENTITY; this does not disable unrelated updates/deletes.
  Pre-insert identifiers (for example sequences or assigned UUIDs) permit insert batching;
  sequence pooling reduces identifier round trips separately and needs a compatible schema.
- **The `count` query for a page is frequently the expensive half.** Optimise or avoid it
  separately; do not assume the page query is the problem because it is the one you were reading.
- **A statement whose plan is bad is a different problem.** Once the count is right and one
  statement is still slow, that is `sql-query-performance`.

## References

- [N+1 and its remedies](references/n-plus-one-remedies.md) — how to see it, the four mechanisms
  compared on what each costs, the cartesian product, and paginating a fetch. Read when the
  statement count scales with rows.
- [Writes, batching and the persistence context](references/writes-and-batching.md) — why
  batching silently does nothing, id generation, flush cost, bulk operations and what they
  invalidate. Read when the count scales with rows written, or a flush is slow.
