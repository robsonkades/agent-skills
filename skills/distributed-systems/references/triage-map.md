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

- Old everywhere, converges later → replication lag: `consistency-models`.
- Different per replica or per instance, does not converge → `cache-sharding-and-replication` if a
  cache is involved, otherwise `consistency-models` for the model actually in force.
- The writer cannot read its own write → read-your-writes: `consistency-models`.
- Correct value overwritten by an older one → ordering or a missing version guard:
  `message-ordering-and-partitioning`.

## Something is slow

**Separating question:** is the service _working harder_ or _waiting_?

- Waiting, with CPU low → a queue or a dependency. `littles-law-and-queueing` for the arithmetic;
  `timeouts-and-deadlines` if it waits without a bound.
- Working harder, CPU high, one process → this is not a distributed question yet: `java-performance`.
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
- Rejecting with 429 → you are the problem: `retries-and-backoff` for the client obligation and
  `rate-limiting-and-load-shedding` to understand what it is enforcing.
- Up, healthy, and useless (gray failure) → `failure-models`, then `load-balancing-and-routing`
  for outlier ejection.

## Ordering looks broken

**Separating question:** across what scope was ordering ever promised?

Nothing promises global ordering unless one partition was chosen deliberately. Establish the
scope first — `message-ordering-and-partitioning` — because most "ordering bugs" are a correct
system meeting an assumption nobody wrote down. If the scope was per-key and the key was right,
look for a parallel handler, a retry that re-enqueued, or a DLQ that let the next message through.

## Two candidates that are usually the same answer

- "Rate limit or load shed?" — both, and they are different mechanisms.
  `rate-limiting-and-load-shedding` separates them.
- "Circuit breaker or bulkhead?" — a breaker stops calling a failing dependency; a bulkhead stops
  one dependency consuming all your capacity. `circuit-breakers` and the concurrency-limiting
  skill respectively. A system under a slow dependency usually needs the bulkhead first.
- "Saga or outbox?" — an outbox makes one write-plus-publish atomic; a saga sequences several
  local transactions with compensations. `distributed-transactions-and-sagas` decides, and
  `delivery-semantics` owns the outbox itself.
