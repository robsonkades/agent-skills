# Triage map

Each entry is a pair of symptoms that look alike and route to different owners, the question that
separates them, and the cheapest evidence that answers it. Use this only when the routing table
gave two candidates.

## Duplicates appeared

**Separating question:** did the _same_ logical operation happen twice, or did two different
operations both happen?

| Evidence                                             | Route to                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------- |
| Same request id or message id, two side effects      | `idempotency` — verify identity scope and the protected-effect contract   |
| Two different ids, apparently same business intent   | `idempotency` — establish whether the contract treats these as one intent |
| Duplicates cluster at a deploy or a consumer restart | `delivery-semantics`; Kafka confirmed → `kafka-consumers-in-java`         |
| Duplicates cluster at a timeout in the caller's log  | `retries-and-backoff` — inspect attempt history and retry decisions       |
| Duplicates on a queue after slow processing          | `task-queues-and-competing-consumers` — inspect ack/redelivery            |

Start with a duplicate's business identity, durable effects, attempt IDs and ack/progress
history across the full retry/lease window. Timestamps alone do not establish one intent or
causal ordering across hosts; log duplication can also mimic duplicate business effects.
Lease expiry is a candidate only where the queue uses that model; slow processing alone does
not establish it.

## The data is wrong or stale

**Separating question:** is an old value being served, do readers disagree, or did a stale
write replace the authoritative value?

- Old everywhere, converges later → test replication lag, cached snapshots and delayed
  invalidation; route to `consistency-models` or `caching-strategies` based on the serving path.
- Different per replica or per instance, does not converge → `cache-sharding-and-replication` if a
  cache is involved, otherwise `consistency-models` for the model actually in force.
- The writer cannot read its own write → read-your-writes: `consistency-models`.
- Correct stored value overwritten by an older one → inspect the original read/version,
  update path and enforced write precondition. Replayed or reordered messages route to
  `message-ordering-and-partitioning`; stale client read/edit/save across transactions routes
  to `offline-concurrency-control`. A missing version guard does not establish a broker fault.
  [HTTP conditional writes](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1) are one
  example of enforcing the client's original precondition.

## Something is slow

**Separating question:** is the service _working harder_ or _waiting_?

- Low process CPU does not prove “waiting”: inspect off-CPU time, throttling, run queue,
  downstream latency and queue age. Use `littles-law-and-queueing` for queue arithmetic and
  `timeouts-and-deadlines` for unbounded remote waits.
- High CPU in one process → first route to `java-performance`; then determine whether skew,
  retries or serialization from distributed traffic created the load.
- Slow only for some keys or tenants → compare work/input size, query plans and placement;
  demonstrated partition skew routes to `hot-partitions-and-rebalancing`.
- Slow only on fan-out requests, fine on simple ones → `scatter-gather` (max-of-N).
- Slow and spreading across services, error rate rising with it → `cascading-failures`. Time-critical.

## A background job misbehaved

**Separating question:** did it run too many times, not at all, or too late?

- Ran once per replica → verify whether work was intended once fleet-wide or once per replica;
  required role ownership routes to `leader-election`, repeated effects to `idempotency`.
- Did not run and nothing alerted → `slo-and-alerting` for an established freshness-signal gap;
  use `distributed-failure-catalogue` only when the failure mechanism still needs recognition.
- Ran on stale input, or did work nobody wanted any more → separate stale input from expired
  useful work: `consistency-models` owns the read contract, `timeouts-and-deadlines` the useful-work
  deadline. Use `distributed-failure-catalogue` only if the owner remains unclear.
- Two instances did conflicting work → `distributed-locks-and-leases`; distinguish the grant,
  resource claim and protected effect. Check actual resource-side enforcement: possession of a
  fencing token alone proves neither a current grant nor rejection of stale effects.

## A dependency is failing

**Separating question:** is it _down_, _slow_, or _rejecting_?

- Down (fast, definite errors) → `retries-and-backoff` for the policy, `circuit-breakers` if the
  failures are sustained and correlated.
- Slow (timeouts, threads held) → inspect elapsed budgets and actual work lifetime;
  `timeouts-and-deadlines` owns ineffective bounds/cancellation, while
  `concurrency-limiting-and-bulkheads` owns local capacity isolation. A slow response does not
  prove the timeout was missing; breaker choice depends on failure samples and fallback.
- Rejecting with 429 → inspect the named quota/scope and `Retry-After`; it may be valid
  admission control, quota misconfiguration or unexpected workload. Route to
  `retries-and-backoff` and `rate-limiting-and-load-shedding`.
- Health checks pass but useful work fails → `failure-models`; compare client-visible
  outcomes by endpoint and path before naming a gray-failure mechanism. Route to
  `load-balancing-and-routing` for ejection only when the detector can observe the relevant
  failures and usable alternatives have enough capacity. Successful protocol responses can
  conceal wrong results; ejection does not repair a shared cause. See the detection inputs
  and ejection limits in [Envoy 1.35.3](https://www.envoyproxy.io/docs/envoy/v1.35.3/intro/arch_overview/upstream/outlier).

## Ordering looks broken

**Separating question:** across what scope was ordering ever promised?

Global ordering requires a named serialization mechanism such as one log/partition, sequencer
or consensus order, and it trades availability/throughput. Establish the promised scope first —
`message-ordering-and-partitioning`. If it was per-key and the key was right, inspect parallel
handlers, retries/redrive, producer epochs and gaps before calling the broker unordered.

## Distinguishing mechanisms that can coexist

- "Rate limit or load shed?" — identify quota/fairness policy versus overload protection;
  one or both may be needed, and they are different mechanisms.
  `rate-limiting-and-load-shedding` separates them.
- "Circuit breaker or bulkhead?" — a breaker stops calling a failing dependency; a bulkhead stops
  one dependency consuming all your capacity. Route to `circuit-breakers` and
  `concurrency-limiting-and-bulkheads` respectively. Under a slow dependency, a bulkhead often protects caller capacity while
  a breaker may reduce futile calls; select from measured saturation and fallback semantics.
- "Saga or outbox?" — an outbox atomically records a database change and publication intent;
  relay publication can repeat. A saga tracks local transactions, compensation and forward
  recovery; it may use an outbox and can expose intermediate state. `distributed-transactions-and-sagas` decides, and
  `delivery-semantics` owns the outbox itself.
