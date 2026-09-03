---
name: orm-behavioral-patterns
description: >
  The three runtime behaviours that make object-relational mapping work and produce its most
  confusing failures: Unit of Work, Identity Map and Lazy Load. Use when an entity was
  modified but never saved and the change appeared anyway, when a change was expected to
  persist and did not, when LazyInitializationException appears during serialisation or in a
  job, when the query count scales with rows displayed, when a persistence context grows
  until flush becomes slow, when a bulk update is invisible to loaded entities, or when Open
  Session In View is being turned on to make an error disappear. Does not cover the mapping
  itself (orm-structural-mapping), which data-access pattern to use (data-source-patterns),
  transaction boundaries (enterprise-transactions), or whether to cache the read at all
  (caching-strategies).
---

# ORM Behavioral Patterns

## Purpose

Make the ORM's runtime behaviour visible and predictable. Unit of Work, Identity Map and
Lazy Load are not implementation details — they change what your code does, and almost every
surprising persistence bug in an enterprise application is one of them behaving exactly as
designed while the developer expected something else.

## The three patterns

```text
Unit of Work    tracks every object read or created in a transaction,
                works out what changed, and writes it all at commit in
                one ordered batch. Consequence: you do not call save();
                you change objects and the unit of work notices.

Identity Map    maintains one managed object instance per database identity
                in a persistence context. Consequence: repeated identity lookup
                may avoid SQL, while queries can still execute and resolve to the SAME
                managed instance, so a modification through one reference is
                visible through every other.

Lazy Load       replaces an association with a proxy that fetches on
                first access. Consequence: a query happens where the code
                shows a getter, possibly outside a transaction, possibly
                once per row of a loop.
```

In JPA these are the persistence context, the first-level cache, and lazy proxies. They are
the same patterns; knowing the pattern name makes the behaviour predictable rather than
magical.

## Workflow

1. **Establish the boundary of the unit of work.** In JPA that is the persistence context,
   whose lifetime is normally the transaction. Every behaviour below is scoped to it.
2. **Know which objects are managed.** Managed (tracked, changes flushed), detached (not
   tracked; changes silently lost), transient (never persisted), removed. Most "the change
   did not save" bugs are an object in the wrong state.
3. **Predict the flush points.** Commit, an explicit flush, and — the one people miss — a
   query whose results might be affected by pending changes.
4. **Budget the queries.** Every lazy association traversed in a loop is a query
   (`architecture-and-performance`). Decide the fetch strategy per use case, not per
   mapping.
5. **Bound the context's size.** Long-running units of work retain entities and snapshots; flush
   cost generally grows with managed state and can become worse through cascades/collections. Measure
   rather than assuming quadratic complexity.
6. **Verify against the statement log**, not against expectation. These behaviours are
   invisible in the source; the SQL log is the ground truth.

## Decision rules

```text
An entity was loaded in this transaction and modified
        → it will be written at commit. Calling save() is redundant, and
          NOT calling it does not prevent the write. If you do not want
          the write, do not modify a managed entity.

An entity was loaded in a previous transaction and modified now
        → detached; nothing happens. Re-read it, or merge deliberately
          knowing merge issues a SELECT and returns a DIFFERENT instance.

A collection is traversed once per row of a result set
        → N+1. Fix with a join fetch, an entity graph, batch fetching, or
          a projection. Do not fix it by making the association eager —
          that moves the cost to every other use case.

An association is needed by only some callers
        → keep it lazy and fetch explicitly where needed. Eager mapping
          is a global decision made for a local reason.

LazyInitializationException outside a transaction
        → the fetch was not planned. Fetch what the caller needs inside
          the boundary, or map to a DTO there. Turning on Open Session In
          View hides it and creates N+1 during serialisation.

A batch processes more than a few thousand entities
        → flush and clear per chunk, or use a stateless session. Dirty
          checking scans every managed entity at every flush.

A bulk UPDATE/DELETE via JPQL or SQL ran in this transaction
        → already-loaded entities are now stale, and the version column
          was probably not incremented. Clear the context, and mind
          optimistic locking (offline-concurrency-control).

The same row must be seen as two independent objects
        → not possible within one unit of work; that is the identity
          map's contract. Use a projection or a separate context.
```

## Rules

- **The unit of work writes what changed, whether or not you asked.** A managed entity
  modified for a temporary calculation is persisted at commit. This is the most common
  cause of unexplained updates in a log, and the fix is not to detach defensively but to
  stop mutating managed objects for non-persistent purposes.
- JPA dirty checking does not require `save()` for a managed entity. Spring Data's `save()` still
  invokes persist/merge according to its new-entity detection; `merge` copies state into a managed
  instance and may require a SELECT depending on identity/version/context. Use the returned instance
  and verify SQL for the provider/version instead of relying on a universal call shape.
- Flush order is the ORM's, not your statement order. Inserts, updates and deletes are
  reordered by type, which breaks the mental model that a delete-then-insert of the same
  key will work. Force it with an explicit flush between them, or design the key not to
  collide.
- **A query can flush.** Hibernate flushes before executing a query that might read tables
  with pending changes, so a write inside a loop that also queries produces a flush per
  iteration — a common cause of a batch job that is inexplicably slow.
- The identity map is per unit of work, not a cache across transactions. Two transactions
  loading the same row get two instances with two independent copies of the data. Anything
  spanning transactions is a second-level cache, with invalidation and staleness of its own
  (`caching-strategies`).
- Because the identity map returns the same instance, entity `equals`/`hashCode` matter
  more than they appear to. Use a business key or the identifier with care; the default
  identity semantics break when an entity moves between contexts, and generated identifiers
  make `hashCode` change after persist if the identifier is used naively.
- Lazy loading is a performance/availability decision paid at access time. Prefer explicit use-case
  fetch plans and conservative default graphs; note that JPA defaults to eager for to-one mappings
  and `LAZY` can be a provider hint depending on mapping/provider capabilities.
- `LazyInitializationException` is evidence that the fetch/lifetime contract was violated. Open
  Session In View extends persistence-context lifetime through rendering; it can trigger unplanned
  queries and connection churn outside the service transaction. It does not necessarily hold one
  database transaction or connection for the entire request—connection handling/provider settings
  matter
  (`architecture-and-performance`).
- Bulk statements bypass all three patterns. They do not update the identity map, do not
  run entity lifecycle callbacks, and do not increment version columns unless you write it.
  They remain the right tool for set-shaped work; they simply require the context to be
  cleared and optimistic locking to be handled explicitly.
- Never put a managed entity into a cache, a session or an HTTP response. It carries
  proxies that fail outside the context and a lifecycle that the consumer does not expect
  (`session-state-strategies`, `remote-facade-and-dto`).

## References

- [Unit of Work and Identity Map](references/unit-of-work-and-identity-map.md) — entity
  states and the transitions that lose data, flush timing and ordering, dirty checking cost
  and context growth, merge versus re-read, batch chunking, and how bulk operations
  interact with both patterns. Read when a write did not happen, happened unexpectedly, or
  a batch is slow.
- [Lazy Load](references/lazy-load.md) — proxy mechanics and what triggers a fetch, the
  four fetch strategies with their query counts and their failure shapes, pagination with
  fetch joins, the exception outside the boundary and the three correct fixes, and lazy
  loading across a serialisation or a network boundary. Read when diagnosing N+1 or a lazy
  initialisation failure.
