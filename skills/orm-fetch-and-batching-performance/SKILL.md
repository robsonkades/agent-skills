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
`LazyInitializationException`. Both make the exception go away. Neither reduces the query count,
and the first raises it for every other query in the system.

## Workflow

1. **Count the statements before forming any theory.** Turn on statement counting for one
   request and read the number. "It feels slow" and "this request issues 431 selects" lead to
   different investigations, and only the second is falsifiable.
2. **Classify what the count is proportional to.** Constant is fine. Proportional to rows
   rendered is N+1. Proportional to rows _written_ is missing write batching. Proportional to
   nothing visible is usually a listener, an interceptor or a validator.
3. **Find the traversal that triggers it.** For N+1 the statement log shows one query followed by
   many near-identical ones differing only in a parameter. The many are the lazy association
   being resolved per row.
4. **Choose the mechanism deliberately** — join fetch, entity graph, batch fetching, or a
   projection — using the table in `references/n-plus-one-remedies.md`. They are not
   interchangeable and two of them still issue extra round trips.
5. **Check what the fix cost.** A join fetch that solved N+1 can return a cartesian product; a
   projection that solved it can bypass a cache you were relying on.
6. **Re-count, on the same request.** The deliverable is a number that went down, not a
   changed annotation.

## Rules

- **`FetchType.EAGER` on a mapping is a decision applied to every query in the system**,
  including the ones that never touch the association. `LAZY` plus a per-query fetch is the
  reversible arrangement; there is no per-query way to _undo_ eager.
- **`LazyInitializationException` reports a boundary, not a defect in `LAZY`.** Something read
  the association after the persistence context closed. The fix is fetching it in the query that
  needs it, or mapping to a DTO before the boundary — not widening the context's lifetime.
- **Open-session-in-view converts the exception into invisible queries.** The N+1 still happens;
  it now happens during rendering, outside any transaction, where it is harder to see and holds
  the connection longer. Treat enabling it as an admission, not a fix.
- **Join fetching multiple to-many associations can multiply rows.** Ten line items and five
  shipments may produce fifty rows carrying the same order. Hibernate rejects some multiple-bag
  shapes, while other collection combinations may execute and still explode the result. Prefer one
  collection fetch per query unless measured cardinalities prove the product is bounded.
- **Pagination over a collection fetch requires version- and query-specific verification.** Common
  Hibernate query shapes warn and page in memory because SQL row limits do not equal root-entity
  limits. Fail on that warning in tests; use a root-id page followed by a bounded fetch, or a
  provider feature whose generated SQL and ordering you have verified.
- **Batch fetching turns N+1 into N/batch + 1, not into 1.** It is the right answer when the
  association is needed for most rows and a join fetch would multiply, and it is still round
  trips.
- **A DTO projection often reduces read cost**, because the rows never become managed entities:
  fewer columns, no persistence-context growth, no dirty checking, nothing to flush. It can lose
  identity-map and second-level-cache benefits and may duplicate rows or computation, so prefer it
  when measurement and ownership fit a read model.
- **The persistence context is not a cache you want large.** Flush cost scales with the number of
  managed entities, because dirty checking visits each one. A batch job that loads 100,000
  entities into one context is paying that on every flush.
- **Write batching needs both halves.** The JDBC batch size must be configured _and_ the id
  generation strategy must not require a round trip per row — identity-column generation forces
  the ORM to execute each insert immediately to learn the id, which disables batching entirely.
  A sequence with an allocation size is the arrangement that batches.
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
