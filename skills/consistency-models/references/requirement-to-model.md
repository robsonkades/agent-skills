# From an observable requirement to the weakest model that satisfies it

Read the left column as something a person could witness and file a bug about. Never start
from the model name.

| Observable requirement                                                                              | Weakest sufficient model                                                               | What it costs                                                                                          | What breaks one rung lower                                                                                                                               |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Two users must never both be assigned seat 14C."                                                   | One authoritative atomic conditional write; linearizable register/CAS when distributed | Coordination with the write authority; partitioned contenders may be rejected or unavailable           | Two winners when stale reads are followed by unconditional writes. Seats, idempotency keys, uniqueness and leases share this shape                       |
| "A successful debit must never make the authoritative balance negative."                            | Atomic invariant-preserving write/transaction; recency model alone is insufficient     | Contention/serialization or conditional-update failures at the authority                               | A linearizable read followed by an unconditional write still races; validity and read freshness are different requirements                               |
| "Every observer must agree on the order operations happened in, but need not see them immediately." | Sequential consistency                                                                 | A single ordering point (a partition leader, a log) per object; throughput is bounded by it            | Two dashboards render the same event stream in different orders and each is internally plausible. Hard to reproduce, harder to explain                   |
| "A reply must never appear before the message it replies to."                                       | Causal consistency                                                                     | Metadata carried with each operation (vector clocks, dependency stamps) and the storage for it         | Out-of-order rendering. The classic symptom is a threaded UI where a reply is orphaned until a refresh                                                   |
| "A user must never see their own write disappear."                                                  | Read-your-writes (session guarantee)                                                   | Pin that session's reads to the primary, or to a replica known to have caught up, for a bounded window | The user posts a comment, the page reloads from a lagging replica, the comment is gone, they post it again. The duplicate is then a real business record |
| "A page must never show data older than what it showed a moment ago."                               | Monotonic reads (session guarantee)                                                    | Sticky routing of a session to one replica, or a per-session low-water mark                            | Time appears to run backwards: refresh shows fewer items than the previous render, because two requests hit replicas with different lag                  |
| "Two writes from the same user must apply in the order they were issued."                           | Monotonic writes (session guarantee)                                                   | Serialising that session's writes through one path                                                     | "Set profile private" then "post" apply in the wrong order and the post is public                                                                        |
| "The report may be up to 60 seconds behind, including during deploy/rebalance."                     | Bounded-staleness contract implemented over replication/projection                     | Capacity, monitoring, fallback/rejection when the bound cannot be met                                  | Plain eventual convergence permits four hours of lag and does not satisfy the number                                                                     |
| "The count may lag and may be approximate within ±1%."                                              | Two separate contracts: convergence/recency plus approximation error                   | Reconciliation and error-bound measurement; async writes still consume resources                       | Eventual consistency alone says nothing about numerical approximation, and an approximate algorithm says nothing about staleness                         |

## Two rules for reading this table

**Session guarantees are often sufficient, but not free.** Three rows above are session-shaped.
They may use sticky routing or a per-session watermark rather than a quorum on every read, while
still needing durable session identity, failover behavior and bounded metadata. “The user who
just…” is a prompt to investigate, not proof of scope.

**Scope is explicit.** Linearizability composes across objects for individual operations, but it
does not make a sequence of operations atomically update an order and payment. Multi-object
atomicity/invariants route to `distributed-transactions-and-sagas`.

## Failure modes of the surrounding system, not the store

The chosen model is a property of the whole read path. These downgrade it silently:

- **A read replica behind a load balancer with no session affinity.** Provides eventual
  consistency regardless of what the primary provides. The write returned 200; the read went
  elsewhere.
- **A cache in front of the store.** The path's staleness bound becomes the cache TTL, even
  if the store is strictly serializable. Invalidate on write or bypass on the session that
  wrote.
- **A CDN or a browser cache on a GET.** Same mechanism, one layer further out, and usually
  discovered only when a `Cache-Control` header is finally read.
- **A search index or a materialised read model updated asynchronously.** CQRS read sides
  are eventually consistent by construction. This is a correct design; the failure is not
  saying so in the API contract, so a client reads its own write from the index.
- **A message-driven projection.** Its lag is the consumer lag, and it is bounded by nothing
  during a rebalance or a redeploy. Delivery-side causes are `delivery-semantics`.

## Decision block — routing reads to replicas

```text
Route reads to replicas when:
- the requirement is a stated staleness bound (seconds), and replication lag is measured
  against it with an alert
- measured read load cannot meet capacity/SLO economically on the authoritative path
- no session needs to observe its own write through this path

Avoid replica reads when:
- the read decides a write (read-modify-write, uniqueness check, balance check) — a stale
  read here is a correctness failure, not a freshness one
- the requirement is per-user and the same session both writes and reads within one
  interaction

Prefer a bounded authoritative-read window when:
- only the writing session needs a probabilistic freshness SLO; size the window from measured
  end-to-end lag and define behavior for tail excursions/failover. It cannot prove a strict “never”

Prefer a version token instead when:
- clients can carry a commit position or version from the write into the read, so the read
  path can wait for or select a replica that has caught up. This is strictly better than a
  time window when the token is tied to the committed write and replicas expose comparable progress
```

## Stating the guarantee in an API contract

Write the boundary into the response, not into a design document nobody reads at 3 a.m.:

- Return the version, sequence number or commit position with the write, and accept it on
  the read (`If-Version`, a token parameter). The client can then require its own write.
- Document per endpoint which model it provides. "`GET /orders/{id}` is read-your-writes for
  the session that created it; `GET /orders?status=` is eventually consistent with a lag of
  up to 30 seconds" is a contract. "The API is consistent" is not.
- Expose replication lag as a metric with an alert. An unmeasured eventual-consistency
  bound is a guarantee that cannot fail a test and therefore cannot hold.
