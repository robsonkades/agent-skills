---
name: orm-fetch-and-batching-performance
description: >
  Making JPA and Hibernate stop issuing the statements you did not ask for, and making the ones
  they do issue cheap: statement amplification, N+1 from an association and from a
  collection, join fetch versus entity graph versus batch fetching, the cartesian product of
  independent join-fetched collections, scalar DTO projection trade-offs, and why write
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

Choose the ORM's fetching and batching work against the operation's correctness and cost
requirements: statements, transferred rows, managed state and actual JDBC batch execution.

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

Use the steps that resolve the actual question. Reuse adequate SQL, timing and lifecycle
evidence; a narrow explanation or supported no-change review needs no new instrumentation,
full fetch comparison or write benchmark. Keep independently supported findings when another
measurement is missing, and qualify only the claims that need it.

1. **Identify the disputed work and its boundary.** For suspected N+1, obtain scoped statement
   counts and SQL for the relevant traversal; do not reset shared factory statistics. For an
   already identified slow statement, flush or JDBC batch issue, start with that evidence.
   Missing counts prevent quantifying amplification, not explaining a known provider contract.
2. **Classify what the count is proportional to.** Repeated selects growing with accessed
   associations suggest N+1; a constant query count can still transfer excessive rows or be
   slow. Entity-by-entity writes remain logical per-row DML even when JDBC batching works.
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
6. **Validate a proposed change at the affected boundary**, including rendering/serialization
   when it can trigger fetching. Compare relevant counts, rows, duration and result correctness
   with matched population, cache state and transaction scope. Accept a change only against
   the actual objective; fewer statements with worse row volume or latency is not a success.

Return the supported mechanism, smallest justified correction or no-change conclusion, and
the evidence and remaining gap relevant to that conclusion. Do not claim a speedup from a
query-count reduction or configuration change alone.

## Rules

- **`FetchType.EAGER` is a default loading obligation for entities**, not a join instruction
  or a requirement on scalar projections. Prefer local fetch plans when appropriate.
  A JPA `fetchgraph` treats unspecified attributes as lazy even if mapped eager, whereas
  `loadgraph` preserves their mapping defaults; providers may fetch additional state. Verify
  the actual provider behavior instead of promising either one SQL query or mandatory laziness.
- **Diagnose the initialization context before changing `LAZY`.** For `LazyInitializationException`,
  inspect the uninitialized proxy/collection's session association and whether that context
  closed or disconnected. Fetch required state in its owning query, reload in the proper unit
  of work, or map loaded data before the boundary. An intentional extended context or OSIV
  can be valid with bounded lifetime, query/connection cost and explicit consistency and
  mutation ownership; retain an adequate contract. Extending lifetime alone does not fix N+1.
- **Open-session-in-view permits additional queries during rendering.** Reads may occur outside
  the service transaction and see a different database state; connection acquisition/release
  depends on configuration. Include this phase in counting. Enabling it does not fix N+1.
- **Join fetching independent to-many branches can multiply rows.** Ten line items and five
  shipments may produce fifty rows carrying the same order. Hibernate rejects some multiple-bag
  shapes, while other collection combinations may execute and still explode the result. Multiple
  to-one fetches or a single nested chain do not create that independent sibling product, though
  nested child volume still matters. Split independent collections when their product exceeds
  the budget; retain a supported, adequately bounded fetch shape.
- **Pagination over a collection fetch requires version- and query-specific verification.** Common
  Hibernate query shapes warn and page in memory because SQL row limits do not equal root-entity
  limits. When SQL pagination is required, fail on that fallback in tests; use a root-id page
  followed by a fetch of those roots with a separate child-row budget, or a
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
- **A page's `count` query can be expensive independently.** Measure it separately; optimise it
  or omit it only if the response contract permits doing without the total.
- **An individually slow statement has its own diagnosis.** Hand its SQL, bindings, rows and
  timing to `sql-query-performance`; count amplification and statement cost can coexist.

## References

- [N+1 and its remedies](references/n-plus-one-remedies.md) — how to see it, the four mechanisms
  compared on what each costs, the cartesian product, and paginating a fetch. Read when the
  statement count scales with rows.
- [Writes, batching and the persistence context](references/writes-and-batching.md) — why
  batching silently does nothing, id generation, flush cost, bulk operations and what they
  invalidate. Read when the count scales with rows written, or a flush is slow.
