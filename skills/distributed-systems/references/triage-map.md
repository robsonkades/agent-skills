# Triage map

Each entry is a pair of symptoms that look alike and route to different owners, the question that
separates them, and the cheapest evidence that answers it. Use this only when the routing table
gave two candidates.

## Duplicates appeared

**Separating question:** did the _same_ logical operation happen twice, or did two different
operations both happen?

| Evidence                                                      | Route to                                                   |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| Same request id or message id, two side effects               | `idempotency` — the handler is not repeat-safe             |
| Two different ids, same business intent (user double-clicked) | `idempotency` — the key is wrong, not the mechanism        |
| Duplicates cluster at a deploy or a consumer restart          | `kafka-consumers-in-java` (rebalance, uncommitted offsets) |
| Duplicates cluster at a timeout in the caller's log           | `retries-and-backoff` — the ambiguous class retried        |
| Duplicates on a queue after slow processing                   | `task-queues-and-competing-consumers` — lease expiry       |

Cheapest evidence: one duplicated record's ids and timestamps against the caller's log for the
same second. It usually settles the fork in a minute.

## The data is wrong or stale

**Separating question:** is the value _old_, or is it _inconsistent between readers_?

- Old everywhere, converges later → test replication lag, cached snapshots and delayed
  invalidation; route to `consistency-models` or `caching-strategies` based on the serving path.
- Different per replica or per instance, does not converge → `cache-sharding-and-replication` if a
  cache is involved, otherwise `consistency-models` for the model actually in force.
- The writer cannot read its own write → read-your-writes: `consistency-models`.
- Correct value overwritten by an older one → ordering or a missing version guard:
  `message-ordering-and-partitioning`.

## Something is slow

**Separating question:** is the service _working harder_ or _waiting_?

- Low process CPU does not prove “waiting”: inspect off-CPU time, throttling, run queue,
  downstream latency and queue age. Use `littles-law-and-queueing` for queue arithmetic and
  `timeouts-and-deadlines` for unbounded remote waits.
- High CPU in one process → first route to `java-performance`; then determine whether skew,
  retries or serialization from distributed traffic created the load.
- Slow only for some keys or tenants → `hot-partitions-and-rebalancing`.
- Slow only on fan-out requests, fine on simple ones → `scatter-gather` (max-of-N).
- Slow and spreading across services, error rate rising with it → `cascading-failures`. Time-critical.

## A background job misbehaved

**Separating question:** did it run too many times, not at all, or too late?

- Ran once per replica → `leader-election`.
- Did not run and nothing alerted → the absence-of-errors pattern:
  `distributed-failure-catalogue`, then `slo-and-alerting` for the freshness signal it needed.
- Ran on stale input, or did work nobody wanted any more → stale work:
  `distributed-failure-catalogue`, then `timeouts-and-deadlines` for the deadline it should carry.
- Two instances did conflicting work → `distributed-locks-and-leases`, and check whether a
  fencing token exists before believing a lock was held.

## A dependency is failing

**Separating question:** is it _down_, _slow_, or _rejecting_?

- Down (fast, definite errors) → `retries-and-backoff` for the policy, `circuit-breakers` if the
  failures are sustained and correlated.
- Slow (timeouts, threads held) → `timeouts-and-deadlines` first, because a missing bound is the
  amplifier; then `circuit-breakers`.
- Rejecting with 429 → inspect the named quota/scope and `Retry-After`; it may be valid
  admission control, quota misconfiguration or unexpected workload. Route to
  `retries-and-backoff` and `rate-limiting-and-load-shedding`.
- Up, healthy, and useless (gray failure) → `failure-models`, then `load-balancing-and-routing`
  for outlier ejection.

## Ordering looks broken

**Separating question:** across what scope was ordering ever promised?

Global ordering requires a named serialization mechanism such as one log/partition, sequencer
or consensus order, and it trades availability/throughput. Establish the promised scope first —
`message-ordering-and-partitioning`. If it was per-key and the key was right, inspect parallel
handlers, retries/redrive, producer epochs and gaps before calling the broker unordered.

## Two candidates that are usually the same answer

- "Rate limit or load shed?" — both, and they are different mechanisms.
  `rate-limiting-and-load-shedding` separates them.
- "Circuit breaker or bulkhead?" — a breaker stops calling a failing dependency; a bulkhead stops
  one dependency consuming all your capacity. `circuit-breakers` and the concurrency-limiting
  skill respectively. Under a slow dependency, a bulkhead often protects caller capacity while
  a breaker may reduce futile calls; select from measured saturation and fallback semantics.
- "Saga or outbox?" — an outbox makes one write-plus-publish atomic; a saga sequences several
  local transactions with compensations. `distributed-transactions-and-sagas` decides, and
  `delivery-semantics` owns the outbox itself.
