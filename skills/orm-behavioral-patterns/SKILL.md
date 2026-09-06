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
Unit of Work    tracks managed state and pending persistence operations,
                synchronizing at flush (possibly before commit).
                Dirty changes need no save() on managed entities;
                SQL ordering is distinct from optional JDBC batching.

Identity Map    maintains one managed object instance per database identity
                in a persistence context. Consequence: repeated identity lookup
                may avoid SQL, while queries can still execute and resolve to the SAME
                managed instance, so a modification through one reference is
                visible through every other.

Lazy Load       defers data access using proxies, collections or enhancement on
                first access. Consequence: a query happens where the code
                shows a getter, possibly outside a transaction, possibly
                once per row of a loop.
```

In JPA these are the persistence context, the first-level cache, and lazy proxies. They are
the same patterns; knowing the pattern name makes the behaviour predictable rather than
magical.

## Workflow

1. **Establish the runtime and unit of work.** Inspect JPA/Hibernate, Spring and Java versions,
   mappings, flush mode and context ownership. A transaction-scoped persistence context
   commonly ends at commit; extended/application-managed contexts or OSIV can outlive it.
2. **Know which objects are managed.** Managed (tracked, changes flushed), detached (not
   tracked; changes silently lost), transient (never persisted), removed. Most "the change
   did not save" bugs are an object in the wrong state.
3. **Predict the flush points.** Commit, an explicit flush, and — the one people miss — a
   query whose results might be affected by pending changes.
4. **Budget the queries.** Lazy traversal can issue queries depending on loaded state,
   cache and batch/fetch configuration
   (`architecture-and-performance`). Decide the fetch strategy per use case, not per
   mapping.
5. **Bound the context's size.** Long-running units of work retain entities and snapshots; flush
   cost generally grows with managed state and can become worse through cascades/collections. Measure
   rather than assuming quadratic complexity.
6. **Verify against the statement log**, not against expectation. These behaviours are
   invisible in the source; the SQL log is the ground truth.

## Decision rules

```text
An entity remains managed, writable and dirty in a context joined to a committing transaction
        → expect synchronization at flush/commit. Calling save() is redundant, and
          NOT calling it does not prevent the write. If you do not want
          the write, do not modify a managed entity.

An entity's persistence context ended or it was detached, then modified
        → changes are not automatically synchronized. Re-read or merge deliberately;
          merge returns the managed target and may issue a SELECT.

A collection is traversed once per row of a result set
        → inspect for N+1. Consider a join fetch, an entity graph, batch fetching, or
          a projection. Do not fix it by making the association eager —
          that moves the cost to every other use case.

An association is needed by only some callers
        → keep it lazy and fetch explicitly where needed. Eager mapping
          is a global decision made for a local reason.

LazyInitializationException outside a transaction
        → the fetch was not planned. Fetch what the caller needs inside
          the boundary, or map to a DTO there. Turning on Open Session In
          View may hide it while allowing unplanned queries during serialisation.

A batch processes more than a few thousand entities
        → measure retained state and flush cost; flush/clear bounded chunks
          or assess stateless semantics. Context size is not the only transaction cost.

A bulk UPDATE/DELETE via JPQL or SQL ran in this transaction
        → affected loaded entities may be stale; inspect explicit version handling.
          Flush required pending changes before bulk work, then clear/refresh deliberately, and mind
          optimistic locking (offline-concurrency-control).

The same row must be seen as two independent objects
        → not possible within one unit of work; that is the identity
          map's contract. Use a projection or a separate context.
```

## Rules

- **Writable managed changes can persist without save().** A managed entity
  modified for a temporary calculation can persist on successful flush/commit. This is a
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
- **A query can flush.** With applicable AUTO flush behavior, Hibernate flushes before a query that might read tables
  with pending changes, so a write inside a loop that also queries produces a flush per
  iteration — a common cause of a batch job that is inexplicably slow.
- The identity map belongs to the persistence context. Separate contexts have independent
  managed instances; an extended context can span transactions without becoming a second-level
  cache. A second-level cache has separate invalidation and staleness concerns
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
- Bulk statements bypass managed entity change tracking. They do not update loaded state, do not
  run entity lifecycle callbacks, and do not increment version columns unless you write it.
  They remain useful for set-shaped work; reconcile pending changes and stale managed state,
  and handle optimistic locking explicitly. A fresh context or selective refresh can avoid
  clearing unrelated managed work.
- Never put a managed entity into a cache, a session or an HTTP response. It carries
  proxies that fail outside the context and a lifecycle that the consumer does not expect
  (`session-state-strategies`, `remote-facade-and-dto`).

## References

Return the observed state/SQL behavior, its likely mechanism and confirming evidence, the
smallest correction, and validation gaps. SQL shows execution, not proof of commit; verify
persisted results from a fresh context after transaction completion. Examples are partial
JPA/Hibernate/Spring snippets; adapt to resolved versions, without upgrading to use this skill.

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
