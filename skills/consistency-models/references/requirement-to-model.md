# From an observable requirement to sufficient guarantees

Read the left column as something a person could witness and file a bug about. Never start
from the model name.

| Observable requirement                                                                                                           | Sufficient guarantee under the stated scope                                            | What it costs                                                                                                            | Failure without the needed guarantee                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| "Two users must never both be assigned seat 14C."                                                                                | One authoritative atomic conditional write; linearizable register/CAS when distributed | Coordination with the write authority; partitioned contenders may be rejected or unavailable                             | Two winners when stale reads are followed by unconditional writes. Seats, idempotency keys, uniqueness and leases share this shape |
| "A successful debit must never make the authoritative balance negative."                                                         | Atomic invariant-preserving write/transaction; recency model alone is insufficient     | Contention/serialization or conditional-update failures at the authority                                                 | A linearizable read followed by an unconditional write still races; validity and read freshness are different requirements         |
| "Operations must fit one legal sequential history preserving each client's program order; real-time precedence is not required." | Sequential consistency                                                                 | Ordering across all objects in the specified history; implementation determines coordination cost                        | Individually plausible object histories can form a cycle when combined with client program order                                   |
| "A reply must never appear before the message it replies to."                                                                    | Causal consistency                                                                     | Metadata carried with each operation (vector clocks, dependency stamps) and the storage for it                           | Out-of-order rendering. The classic symptom is a threaded UI where a reply is orphaned until a refresh                             |
| "A session must never read a state that predates its own committed write."                                                       | Read-your-writes (session guarantee)                                                   | Select a path proven to include the write for the guarantee's lifetime; wait or reject when none is available            | A bounded primary window expires while the replica still lags; a reload loses the comment and prompts a duplicate post             |
| "A session must never read an older state than one it already read."                                                             | Monotonic reads (session guarantee)                                                    | Preserve a read watermark across routing/failover; stickiness helps only while the replica does not regress              | A refresh returns an older version from another replica; legitimate deletes or lower numeric values do not alone prove a violation |
| "Writes ordered within one session must be applied and exposed in that order at relevant replicas."                              | Monotonic writes (session guarantee)                                                   | Preserve session dependencies through acceptance, replication and application; one ordered ingress alone is insufficient | A replica exposes the second write before its predecessor even though the primary accepted both in order                           |
| "The report may be up to 60 seconds behind, including during deploy/rebalance."                                                  | Bounded-staleness contract implemented over replication/projection                     | Capacity, monitoring, fallback/rejection when the bound cannot be met                                                    | Plain eventual convergence permits four hours of lag and does not satisfy the number                                               |
| "The count may lag and may be approximate within ±1%."                                                                           | Two separate contracts: convergence/recency plus approximation error                   | Reconciliation and error-bound measurement; async writes still consume resources                                         | Eventual consistency alone says nothing about numerical approximation, and an approximate algorithm says nothing about staleness   |

## Two rules for reading this table

**Session guarantees are often sufficient, but not free.** Three rows above are session-shaped.
They may use sticky routing or a per-session watermark rather than a quorum on every read, while
still needing durable session identity, failover behavior and bounded metadata. “The user who
just…” is a prompt to investigate, not proof of scope.

Define which operations share a session and how their order is established. Concurrent requests
from two devices using the same user ID do not acquire a program order from that identity alone.

**Scope is explicit.** Linearizability composes across objects for individual operations, but it
does not make a sequence of operations atomically update an order and payment. Multi-object
atomicity/invariants route to `distributed-transactions-and-sagas`.

Sequential consistency does **not** compose per object. With registers initially `x=y=0`,
client A executes `write(x,1); read(y)->0`, while B executes `write(y,1); read(x)->0`.
Each object's history can be sequentially consistent separately. Together, program order and
the returned zeros require `Wx < Ry < Wy < Rx < Wx`, an impossible global order.

## Failure modes of the surrounding system, not the store

The chosen model is a property of the whole read path. These paths can weaken it when their
visibility behavior is not checked against the required contract:

- **Uncoordinated reads from asynchronously replicated nodes.** May miss a completed write.
  Replica topology alone does not identify the model: token checks or coordinated reads can
  provide stronger guarantees without session affinity.
- **Unchecked mutable cache reads.** TTL bounds residence after filling, not source age. Filling
  from a stale replica can extend visibility lag; invalidation races can repopulate old data.
  Check versions or use a path proven to include the session's write.
- **A CDN or a browser cache on a GET.** Same mechanism, one layer further out, and usually
  discovered only when a `Cache-Control` header is finally read.
- **An asynchronously updated search index or materialised read model.** Convergence needs
  reliable delivery and correct application/reconciliation. Unchecked reads may be stale;
  waiting for a commit-linked projection watermark can provide session guarantees.
- **A message-driven projection.** Broker offset lag alone does not measure end-to-end visibility
  time. Bound that time with an enforcement policy, including during rebalance or redeploy.
  Delivery-side causes are `delivery-semantics`.

## Decision block — routing reads to replicas

```text
Route reads to replicas when:
- the path enforces its stated staleness bound, falling back or rejecting when it cannot
  establish freshness; monitoring alone does not enforce a guarantee
- measured read load cannot meet capacity/SLO economically on the authoritative path
- session requirements are absent or enforced through a commit-linked token/routing policy

Avoid relying on replica reads when:
- a decision is acted on without atomic validation of the relevant invariant at the authority;
  stale data followed by an unconditional write or external side effect can violate correctness
- the same session writes and reads, but the replica path cannot enforce the session contract

A replica may supply a proposal when the authority atomically checks all required predicates or
versions, every relevant write path participates, and the caller handles conflicts before effects.
Freshness can reduce retries, but a fresh read alone does not eliminate the read/write race.

Prefer a bounded authoritative-read window when:
- only the writing session needs a probabilistic freshness SLO; size the window from measured
  end-to-end lag and define behavior for tail excursions/failover. It cannot prove a strict “never”

Prefer a version token instead when:
- clients can carry a commit position or version from the write into the read, so the read
  path can wait for or select a replica that has caught up. This supports a strict guarantee
  when token durability, history/epoch comparability and unavailable-path behavior are defined
```

## Stating the guarantee in an API contract

Write the boundary into the response, not into a design document nobody reads at 3 a.m.:

- Return the version, sequence number or commit position with the write, and accept it on
  the read (an application-defined header or token parameter). The client can then require its own write.
- Document per endpoint which model it provides. "`GET /orders/{id}` is read-your-writes for
  the session that created it; `GET /orders?status=` permits up to 30 seconds of staleness and
  rejects when that bound cannot be established" is an explicit contract.
- Expose replication lag as a metric with an alert. An unmeasured eventual-consistency
  bound has no operational evidence; test enforcement under lag and failed freshness checks.

For the distinction between a stale proposal and authoritative validation, see the
[PostgreSQL transaction-isolation documentation](https://www.postgresql.org/docs/18/transaction-iso.html).
Its `UPDATE` predicate recheck and snapshot rules are engine-specific; verify the chosen product's
atomicity, conflict and affected-row contracts.
