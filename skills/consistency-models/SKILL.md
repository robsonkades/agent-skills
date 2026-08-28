---
name: consistency-models
description: >
  Choosing a consistency model as an engineering decision: the ladder from linearizable
  through sequential, causal and the session guarantees (read-your-writes, monotonic reads)
  to eventual, stated as what a client can and cannot observe; CAP stated correctly — the
  choice between C and A exists only while partitioned — and PACELC as the more useful
  framing; and where the surprise lives, from a replica serving a stale read to the writer
  that just wrote to transaction isolation being orthogonal to distributed consistency. Use
  when a user cannot see their own write, when a read after a write returns the previous
  value, when a design names a model instead of an observable requirement, when reads are
  being routed to replicas, or when someone cites "pick two". Does not cover multi-service
  atomicity (distributed-transactions-and-sagas), quorum arithmetic (consensus-and-quorums),
  caches (caching-strategies), replicated cache topology (cache-sharding-and-replication),
  or the JMM's happens-before (java-memory-model).
---

# Consistency Models

## Purpose

Pick the weakest consistency model that satisfies a stated, observable requirement, and know
what it costs. Consistency is bought with latency and availability; buying more than the
requirement needs is a permanent tax, and buying less is a bug that appears only under load
or partition.

The failure this prevents is the requirement expressed as a model name. "We need strong
consistency" cannot be verified, priced, or tested. "A user must never see their own
comment disappear after posting it" names an observation, rules out eventual consistency,
and — importantly — does **not** require linearizability: read-your-writes is enough, and it
is available for a fraction of the cost.

## Workflow

1. **State the requirement as something a client observes.** "Two users must never both be
   assigned seat 14C." "A user must never see their own write disappear." "A balance may lag
   by up to five seconds but must never go backwards." No model names yet.
2. **Ask who observes it.** Requirements that hold only for the session that performed the
   write are session guarantees and are cheap. Requirements that hold across independent
   observers are expensive.
3. **Map the requirement to the weakest model that satisfies it**, using the table in
   `references/requirement-to-model.md`. Record the cost you are accepting.
4. **Trace the whole read path, not the database.** A linearizable store behind a
   read-replica router, a CDN, or a cache delivers the weakest link in the chain. The path
   has a consistency model; the store only has one of its components.
5. **Separate isolation from consistency explicitly.** Decide the transaction isolation
   level for anomalies _within_ a transaction, and the distributed model for recency
   _across_ nodes, as two decisions. They are orthogonal.
6. **Write a test that fails under the model you rejected.** Stale-read detection with a
   deliberately lagged replica, or a partition injected with a network fault. Techniques are
   in `references/read-your-writes-in-java.md`.

## Rules

- Never state a consistency requirement by naming a model. Name the observation, then map
  it. A model name in a requirements document is an unpriced, untestable assertion.
- **CAP is about behaviour during a partition, not a general "pick two".** With no
  partition, a system provides both consistency and availability; the theorem says that
  while a partition is in progress, a system cannot both stay linearizable and answer every
  request at every reachable node. "CP" and "AP" describe partition behaviour and nothing
  else.
- **PACELC is the framing that survives contact with production.** If Partitioned, choose
  Availability or Consistency; Else, choose Latency or Consistency. Partitions are rare; the
  else-branch is every request, and it is where the tuning knobs actually are — replica
  routing, quorum sizes, cache TTLs.
- Linearizability is a **single-object, real-time** guarantee: once a write completes, every
  subsequent read returns that value or a later one. It says nothing about two objects
  changing together. A store advertising per-key linearizability gives you no cross-key
  atomicity — that is `distributed-transactions-and-sagas`.
- **Serializable isolation is not a recency guarantee.** Serializability says the outcome
  equals _some_ serial order of transactions; linearizability constrains that order to
  respect real time. A serializable transaction may legally read a stale snapshot. Strict
  serializability is the conjunction. Isolation level and distributed consistency are
  orthogonal axes; naming one does not constrain the other.
- Read-your-writes, monotonic reads, monotonic writes and writes-follow-reads are **session
  guarantees** — they bind one client's own observations and cost far less than a global
  model. Most requirements phrased as "strong consistency" are one of these.
- Causal consistency orders causally related operations and leaves concurrent ones
  unordered. It is the strongest model that remains available during a partition, and it is
  the right answer wherever "the effect appeared before the cause" is the visible bug —
  reply chains, comment threads, edit histories.
- **Eventual consistency guarantees convergence, not a bound.** "Eventually" has no
  deadline. If the requirement has a number in it, the model needs one too — measure and
  alert on replication lag, or the guarantee is unfalsifiable.
- A cache in front of a strongly consistent store downgrades the path to the cache's own
  staleness bound. If the requirement is read-your-writes, the write must invalidate or
  bypass the cache, not merely refresh it eventually. Cache mechanics are
  `caching-strategies` and `cache-sharding-and-replication`.
- `@Transactional(readOnly = true)` is a hint: it shapes the JDBC connection and lets the
  ORM skip dirty checking. It routes nothing and says nothing about recency.
- **This is not the Java Memory Model.** `happens-before`, `volatile` and `synchronized`
  concern visibility between threads sharing one memory; that subject is
  `java-memory-model`. The vocabulary overlaps ("sequential consistency" exists in both) and
  the scales do not. Do not reason about replica lag with JMM rules, or the reverse.

## References

- [Requirement to model](references/requirement-to-model.md) — a decision table from an
  observable business requirement to the weakest model that satisfies it, with the cost and
  the failure of choosing one rung lower. Read when a requirement is being written, or when
  a chosen model needs justifying.
- [Read-your-writes in Java and Spring](references/read-your-writes-in-java.md) — routing a
  session's reads to the primary for a bounded window after a write, why
  `@Transactional(readOnly = true)` is not a guarantee, the `LazyConnectionDataSourceProxy`
  trap in routing data sources, and how to detect stale reads in tests. Read when reads are
  being sent to replicas.
