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
Lazy Load change what code does. These patterns explain common surprises about tracked
changes, repeated identities and deferred reads; establish the actual mechanism before
attributing a persistence failure to one of them.

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

JPA providers realize these patterns through persistence-context tracking, managed identity
and their lazy-loading mechanisms. The pattern explains the responsibility; the provider,
mapping and runtime settings determine how it is implemented.

## Workflow

Use the steps relevant to the state, lifecycle or query question. Reuse adequate evidence;
a narrow explanation or supported no-change review does not require new logging, a full
fetch comparison or a persistence-context redesign.

1. **Establish the runtime and unit of work.** Inspect JPA/Hibernate, Spring and Java versions,
   mappings, flush mode and context ownership. A transaction-scoped persistence context
   commonly ends at commit; extended/application-managed contexts or OSIV can outlive it.
2. **Know which objects are managed.** Managed (tracked, changes flushed), detached (not
   tracked; changes remain in memory but are not automatically synchronized), transient
   (not yet managed/persisted), removed. Check actual state and transaction outcome.
3. **Predict the applicable synchronization points.** Explicit flush, commit, and queries
   under the target provider's flush mode. Hibernate AUTO commonly flushes before an
   overlapping entity query; this is not a promise that every query issues writes.
4. **Budget the queries.** Lazy traversal can issue queries depending on loaded state,
   cache and batch/fetch configuration
   (`architecture-and-performance`). Choose the fetch plan for actual use-case requirements;
   detailed query-count and batching tuning belongs to `orm-fetch-and-batching-performance`.
5. **Bound the context's size.** Long-running units of work retain entities and snapshots; flush
   cost generally grows with managed state and can become worse through cascades/collections. Measure
   rather than assuming quadratic complexity.
6. **Confirm the disputed behavior with relevant evidence.** Statement logs show SQL execution;
   state inspection, transaction outcome and fresh-context reads answer different questions.
   Add only the missing observation needed to distinguish plausible causes.

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
          a projection. Eager mapping alone does not establish a bounded query plan;
          inspect its effect on the other entity-loading paths.

An association is needed by only some callers
        → prefer a conservative mapping and fetch explicitly where needed. Retain
          an adequate eager requirement when its loading/cost contract is intentional.

LazyInitializationException on access to uninitialized state
        → inspect that proxy/collection's session and loaded state: detached,
          closed or disconnected is not the same as merely "no transaction".
          Fetch what the caller needs in its owning context, reload in the proper
          unit of work, or map a loaded result there. Turning on Open Session In
          View may hide it while allowing unplanned queries during serialisation.

A batch's retained context or flush work exceeds its budget
        → measure retained state and flush cost; flush/clear bounded chunks
          or assess stateless semantics. Context size is not the only transaction cost.

A bulk UPDATE/DELETE via JPQL or SQL ran in this transaction
        → affected loaded entities may be stale; inspect explicit version handling.
          Flush required pending changes before bulk work, then clear/refresh deliberately, and mind
          optimistic locking (offline-concurrency-control).

The same row must be represented by two independent managed instances
        → not within the same persistence context. Independent projections or
          detached snapshots can coexist; use a separate context when managed identity
          really must be independent, accounting for consistency and write ownership.
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
- Hibernate 6.6 queues entity actions in its own order; JPA does not promise source-order SQL.
  A delete-then-insert of a conflicting unique key can therefore insert first and fail.
  Consider updating the existing row, or flush the deletion before the insertion where
  that ordering satisfies the transaction and constraint contract.
- **A query can flush.** With applicable AUTO flush behavior, Hibernate flushes before a query that might read tables
  with pending changes, so a write/query loop can flush each iteration. Check overlap,
  effective mode and actual work before attributing batch cost to it.
- The identity map belongs to the persistence context. Separate contexts have independent
  managed instances; an extended context can span transactions without becoming a second-level
  cache. A second-level cache has separate invalidation and staleness concerns
  (`caching-strategies`).
- Choose entity equality for the required identity contract. Default reference equality is
  valid when independent instances should differ; it does not equate separate instances of
  the same persistent row across contexts. If value/persistent identity is required, design
  `equals`/`hashCode` together and keep hashes stable while objects are in hashed collections;
  naively using a generated identifier can change the hash after persist.
- Lazy loading is a performance/availability decision paid at access time. Prefer explicit use-case
  fetch plans and conservative default graphs; note that JPA defaults to eager for to-one mappings
  and `LAZY` can be a provider hint depending on mapping/provider capabilities.
- `LazyInitializationException` identifies uninitialized state without a usable initialization
  context; inspect the actual session association and lifecycle. Open
  Session In View extends persistence-context lifetime through rendering; it can trigger unplanned
  queries and connection churn outside the service transaction. It does not necessarily hold one
  database transaction or connection for the entire request—connection handling/provider settings
  matter
  (`architecture-and-performance`).
- JPQL bulk statements bypass managed entity change tracking. They do not update loaded state
  or run per-entity lifecycle callbacks; ordinary bulk updates do not automatically check or
  increment versions. Explicit assignments, provider extensions or database triggers can alter
  version behavior, so inspect the actual operation.
  They remain useful for set-shaped work; reconcile pending changes and stale managed state,
  and handle optimistic locking explicitly. A fresh context or selective refresh can avoid
  clearing unrelated managed work.
- Do not give independently owned cache/session consumers a live mutable managed graph.
  For a response or detached snapshot, define required loaded state, mutation ownership,
  serialization exposure/cycles and compatibility. DTOs/projections often make that contract
  explicit; an already adequate bounded representation needs no automatic conversion
  (`session-state-strategies`, `remote-facade-and-dto`).

## References

Return the observed state/SQL behavior, its likely mechanism and confirming evidence, the
smallest correction or supported no-change verdict, and validation gaps. SQL shows execution,
not proof of commit; verify a disputed persistence result from a fresh context after transaction completion. Examples are partial
JPA/Hibernate/Spring snippets; adapt to resolved versions, without upgrading to use this skill.

- [Unit of Work and Identity Map](references/unit-of-work-and-identity-map.md) — entity
  states and the transitions that lose data, flush timing and ordering, dirty checking cost
  and context growth, merge versus re-read, batch chunking, and how bulk operations
  interact with both patterns. Read when a write did not happen, happened unexpectedly, or
  a batch is slow.
- [Lazy Load](references/lazy-load.md) — proxy mechanics and what triggers a fetch, the
  four fetch strategies with their query counts and their failure shapes, pagination with
  fetch joins, initialization-context failures and context-dependent remedies, and lazy
  loading across a serialisation or a network boundary. Read when diagnosing N+1 or a lazy
  initialisation failure.
