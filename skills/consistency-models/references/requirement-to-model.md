# From an observable requirement to sufficient guarantees

Read the left column as something a person could witness and file a bug about. Never start
from the model name.

| Observable requirement                                                                                                           | Sufficient guarantee under the stated scope                                            | What it costs                                                                                                            | Failure without the needed guarantee                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| "Two users must never both be assigned seat 14C."                                                                                | One authoritative atomic conditional write; linearizable register/CAS when distributed | Coordination with the write authority; partitioned contenders may be rejected or unavailable                             | Two winners when stale reads are followed by unconditional writes. Seats, idempotency keys, uniqueness and leases share this shape |
| "A successful debit must never make the authoritative balance negative."                                                         | Atomic invariant-preserving write/transaction; recency model alone is insufficient     | Contention/serialization or conditional-update failures at the authority                                                 | A linearizable read followed by an unconditional write still races; validity and read freshness are different requirements         |
| "Operations must fit one legal sequential history preserving each client's program order; real-time precedence is not required." | Sequential consistency                                                                 | Ordering across all objects in the specified history; implementation determines coordination cost                        | Individually plausible object histories can form a cycle when combined with client program order                                   |
| "A replica must expose a reply's creation only after the parent creation it depends on."                                         | Causal consistency with captured/enforced dependencies                                 | Dependency metadata and visibility checks; a combined UI view needs the separate checks below                            | A reply write is exposed before its dependency; causal store ordering alone does not coordinate separate UI reads                  |
| "A session must never read a state that predates its own committed write."                                                       | Read-your-writes (session guarantee)                                                   | Select a path proven to include the write for the guarantee's lifetime; wait or reject when none is available            | A bounded primary window expires while the replica still lags; a reload loses the comment and prompts a duplicate post             |
| "A session must never read an older state than one it already read."                                                             | Monotonic reads (session guarantee)                                                    | Preserve a read watermark across routing/failover; stickiness helps only while the replica does not regress              | A refresh returns an older version from another replica; legitimate deletes or lower numeric values do not alone prove a violation |
| "Writes ordered within one session must be applied and exposed in that order at relevant replicas."                              | Monotonic writes (session guarantee)                                                   | Preserve session dependencies through acceptance, replication and application; one ordered ingress alone is insufficient | A replica exposes the second write before its predecessor even though the primary accepted both in order                           |
| "A write based on a value I read must be exposed after that observed write."                                                     | Writes-follow-reads (session guarantee)                                                | Carry the read dependency into the write and preserve its ordering/visibility across replicas                            | A reaction is visible where the write it reacts to is not; ordering only this session's own writes misses the read dependency      |
| "The report may be up to 60 seconds behind, including during deploy/rebalance."                                                  | Bounded-staleness contract implemented over replication/projection                     | Capacity, monitoring, fallback/rejection when the bound cannot be met                                                    | Plain eventual convergence permits four hours of lag and does not satisfy the number                                               |
| "The count may lag and may be approximate within ±1%."                                                                           | Two separate contracts: convergence/recency plus approximation error                   | Reconciliation and error-bound measurement; async writes still consume resources                                         | Eventual consistency alone says nothing about numerical approximation, and an approximate algorithm says nothing about staleness   |

## Two rules for reading this table

**Session guarantees are often sufficient, but not free.** Four rows above are session-shaped.
Read guarantees may use sticky routing or a per-session watermark rather than a quorum on
every read, while still needing durable session identity, failover behavior and bounded metadata.
Write-order guarantees also require propagation/application to preserve the dependencies;
stickiness alone does not establish that. “The user who just…” is a prompt to investigate,
not proof of scope.

Define which operations share a session and how their order is established. Concurrent requests
from two devices using the same user ID do not acquire a program order from that identity alone.
When a read in one service/session informs a write in another, inspect how the datastore's
dependency context is transferred. User identity, wall-clock order or a tracing header is not
automatically that context. Without transfer/enforcement evidence, keep the causal guarantee
conditional; use the product's documented mechanism rather than inventing a universal token.
See [Terry et al., section 3.3](https://www.cs.cornell.edu/courses/cs734/2000FA/cached%20papers/SessionGuaranteesPDIS_1.html)
for the distinction between writes-follow-reads and ordering a session's own writes.

**Scope is explicit.** Linearizability composes across objects for individual operations, but it
does not make a sequence of operations atomically update an order and payment. Multi-object
invariants within one transactional owner route to `enterprise-transactions`; coordination
across transactional owners routes to `distributed-transactions-and-sagas`. Multiple objects
alone do not require a distributed transaction or saga.

Sequential consistency does **not** compose per object. With registers initially `x=y=0`,
client A executes `write(x,1); read(y)->0`, while B executes `write(y,1); read(x)->0`.
Each object's history can be sequentially consistent separately. Together, program order and
the returned zeros require `Wx < Ry < Wy < Rx < Wx`, an impossible global order.

## Causal order and a coherent response

Consider this interleaving: a reader finds no parent; a writer creates the parent, then a
dependent reply; the reader fetches the reply and combines it with its earlier parent result.
Every read can be linearizable and every write causally ordered, yet the assembled view has
an orphan. Stronger per-key recency alone does not fix the read boundary.

If the contract requires one coherent multi-key state, prefer an existing read transaction or
read API with the required snapshot guarantee; verify its scope and freshness separately.
If only no-orphan rendering is required, fetch the parent after observing the reply with
the required dependency context, and publish the pair only after validating it. Suppressing
the reply while its parent is unavailable can also satisfy that narrower contract.
Neither approach proves a snapshot for other fields. Respect the deadline when dependencies are
unavailable; return the allowed incomplete result or refuse, rather than stale success.

A later legitimate deletion, authorization change or conflict resolution can also hide the
parent. Define whether the endpoint hides the reply, shows a tombstone or rejects; causal
ordering does not promise that the parent's original value remains readable forever.
For transaction implementation, pass the read set, freshness requirement and failing
interleaving to `enterprise-transactions`; if unavailable, specify those checks and leave
the implementation conditional. Preserve an adequate existing read boundary.

[Lloyd et al., COPS/COPS-GT](https://www.cs.princeton.edu/~wlloyd/papers/cops-sosp11.pdf)
distinguishes per-item causal consistency from consistent multi-key get transactions.
The UI alternatives here follow the narrower stated requirement; they are not equivalent
transaction mechanisms. Sources in this section were checked 2026-09-25.

### Worked decision pair

**Input A:** A moderation dashboard must display a parent and its reply together. Separate
GETs return an absent parent, then a reply created after that first GET. Both endpoints claim
linearizable reads. The proposed fix is stronger replica consistency.

**Expected:** Trace the interleaving above; identify the assembled-read boundary and compare
a coherent read with dependency-aware rendering. Do not diagnose this history as a violated
linearizable read or prescribe a global isolation upgrade.

**Decisive change B:** The same dashboard obtains the full parent/reply read set from one
documented consistent snapshot. Tested rendering uses that response; there is no later
deletion or authorization change, and the contract permits its stated staleness.

**Expected:** Preserve that boundary and its scoped evidence; no added global linearizability
or causal-token machinery is required by this requirement. A new recency requirement would
need a separate check.

**Failure:** Same recommendation for A and B without accounting for the read boundary;
claiming a model name guarantees rendered output; treating an unavailable parent as permission
to violate the endpoint contract; or inventing executed tests.

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
