---
name: consistency-models
description: >
  Choosing distributed consistency guarantees as an engineering decision: linearizability,
  sequential/causal ordering, session guarantees (read-your-writes, monotonic reads), bounded
  staleness and eventual convergence, stated as observable contracts rather than a false total
  ladder; CAP stated correctly—the
  choice between C and A exists only while partitioned—and PACELC, replica paths and
  transaction isolation boundaries. Use
  when a user cannot see their own write, when a read after a write returns the previous
  value, when a design names a model instead of an observable requirement, when reads are
  being routed to replicas, or when someone cites "pick two". Does not cover multi-service
  atomicity (distributed-transactions-and-sagas), quorum arithmetic (consensus-and-quorums),
  caches (caching-strategies), replicated cache topology (cache-sharding-and-replication),
  or the JMM's happens-before (java-memory-model).
---

# Consistency Models

## Purpose

Specify the weakest set of guarantees that satisfies observable requirements and price it. The
models are not one total ladder: recency, ordering, session, convergence and multi-object atomicity
are different dimensions. Stronger coordination often costs latency or partition availability,
but the cost depends on topology, implementation and workload.

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
3. **Map each requirement to guarantees and scope**, using
   `references/requirement-to-model.md`: object/key range, session versus all clients, normal
   operation versus partition, and any time bound. Record the cost and fallback.
4. **Trace the whole read path, not the database.** A linearizable store behind a
   read-replica router, a CDN, or a cache delivers the weakest link in the chain. The path
   has a consistency model; the store only has one of its components.
5. **Separate but connect isolation from consistency explicitly.** Decide the transaction isolation
   level for anomalies _within_ a transaction, and the distributed model for recency
   _across_ nodes, as distinct axes; a product may bundle them as strict serializability.
6. **Write a test that fails under the model you rejected.** Stale-read detection with a
   deliberately lagged replica, or a partition injected with a network fault. Techniques are
   in `references/read-your-writes-in-java.md`.

## Rules

- Do not stop at a model name. Name the observation, scope, failure condition and time bound, then map
  it. A model name in a requirements document is an unpriced, untestable assertion.
- **CAP is about behaviour during a partition, not a general "pick two".** With no
  partition, a system provides both consistency and availability; the theorem says that
  while a partition is in progress, a system cannot both stay linearizable and satisfy CAP's
  availability definition for every request to a non-failing node. That theorem-level availability
  is not an SLO percentage, and real systems may reject only affected keys/operations.
- **PACELC is a useful design heuristic, not a replacement theorem.** If Partitioned, choose
  Availability or Consistency; Else, choose Latency or Consistency. Partitions are rare; the
  else-branch is every request, and it is where the tuning knobs actually are — replica
  routing, quorum sizes, cache TTLs.
- Linearizability gives each operation an instantaneous point between invocation and response and
  respects real-time precedence. It is compositional across independently linearizable objects,
  but two separate operations still do not become one atomic multi-key transaction. Cross-object
  invariants require an atomic protocol or compensation.
- **Serializable isolation is not a recency guarantee.** Serializability says the outcome
  equals _some_ serial order of transactions; linearizability constrains that order to
  respect real time. A serializable transaction may legally read a stale snapshot. Strict
  serializability is the conjunction. Isolation level and distributed consistency are
  orthogonal axes; naming one does not constrain the other.
- Read-your-writes, monotonic reads, monotonic writes and writes-follow-reads are **session
  guarantees**—often cheaper than global ordering, but session identity, failover, roaming clients,
  expiry and watermark storage are part of their cost.
- Causal consistency orders causally related operations and permits different orders for
  concurrent ones. Highly available causal designs exist under specific replication/conflict
  assumptions; do not convert that into a universal “strongest AP model” claim.
- **Eventual consistency promises convergence only under its stated conditions**, typically after
  updates stop and communication/reconciliation resumes. It has no deadline. A numeric requirement
  is bounded staleness/SLA evidence, not plain eventual consistency; measure end-to-end visibility,
  not just transport lag.
- A cache in front of a strongly consistent store downgrades the path to the cache's own
  staleness behavior. If the requirement is read-your-writes, use a commit/version token or route
  to an authoritative path known to include the write; invalidation alone has stale-fill races.
  Cache mechanics are
  `caching-strategies` and `cache-sharding-and-replication`.
- `@Transactional(readOnly = true)` is transaction metadata that frameworks/drivers may use for
  routing or optimization; effects vary by stack. By itself it chooses no replica and promises no recency.
- **This is not the Java Memory Model.** `happens-before`, `volatile` and `synchronized`
  concern visibility between threads sharing one memory; that subject is
  `java-memory-model`. The vocabulary overlaps ("sequential consistency" exists in both) and
  the scales do not. Do not reason about replica lag with JMM rules, or the reverse.

## Primary sources

- [Herlihy and Wing — Linearizability](https://cs.brown.edu/~mph/HerlihyW90/p463-herlihy.pdf)
- [Brewer — CAP twelve years later](https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/)
- [Terry et al. — Session Guarantees](https://www.cs.cornell.edu/courses/cs734/2000FA/cached%20papers/SessionGuaranteesPDIS_1.html)
- [etcd API guarantees](https://etcd.io/docs/v3.6/learning/api_guarantees/)

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
