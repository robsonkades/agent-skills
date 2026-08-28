---
name: scatter-gather
description: >
  Fanning one request out to N workers and combining the answers: the root's latency is the
  max over N leaves, not their mean, choosing N against tail exposure, the completion rule
  (all-of-N, first-of-N, k-of-N-by-deadline), hedges and the two conditions that make them
  safe, partial results with a completeness field, deadline propagation, and cancelling
  losers. Use when a keyless query fans out to every shard, when leaf dashboards are green
  but user-facing p99 is not, when more leaves made the request slower, when a fan-out gives
  no way to tell no-data from no-answer, when a hedge is proposed, or when an in-flight
  gauge stays high after the caller gave up. Not StructuredTaskScope
  (structured-concurrency), bounding in-flight work (concurrency-limiting-and-bulkheads),
  tail arithmetic (tail-latency-analysis), percentiles (latency-statistics), retry policy
  (retries-and-backoff), offline fan-out (distributed-aggregation-and-barriers), deadlines
  (timeouts-and-deadlines), or shard keys (sharding-and-partitioning).
---

# Scatter Gather

## Purpose

**A scatter/gather request is as slow as its slowest leaf.** The root's latency is the
_maximum_ of N samples drawn from the leaf distribution, not the mean — so the root inherits
every leaf's tail. At N = 100 with independent leaves, roughly 63% of root requests contain
at least one leaf beyond its own p99. The arithmetic is `tail-latency-analysis`; the
consequence is this skill's whole subject.

The failure this prevents is the optimisation that reverses: work is split across more leaves
so each leaf does less, every leaf's p99 improves, and the user-facing p99 gets worse. No
leaf dashboard shows it, because no leaf is at fault. The second failure is the fan-out that
costs N units of work for one answer — the gather is satisfied, the root replies, and the
losing leaves keep running with their connections held.

## Workflow

1. **State the completion rule before writing any code.** All-of-N (the answer needs every
   leaf), first-of-N (any leaf can answer, take the winner), or k-of-N-by-deadline (take what
   arrived, declare the rest missing). Every other decision below follows from this one.
2. **Choose N, and record why.** N is a trade between per-leaf work and tail exposure, not a
   free parameter. "One leaf per shard" is a _default inherited from the data layout_, not a
   decision — see `references/tail-amplification-and-hedging.md`.
3. **Propagate the deadline to every leaf** and refuse to start a leaf whose remaining budget
   is below its own measured p50. A leaf that cannot finish still costs the callee everything
   except the reply (`timeouts-and-deadlines`).
4. **Bound the in-flight fan-out.** Virtual threads make N cheap in the root and change
   nothing downstream: the limit belongs next to the scarce resource
   (`concurrency-limiting-and-bulkheads`).
5. **Cancel the losers the moment the gather is satisfied**, and verify it against the
   callee's in-flight gauge rather than against `Future.isCancelled()`.
6. **Decide the partial-result contract with the caller**, not in the root. Returning 8 of 10
   shards beats waiting for 10 only if the response says which 8 (`rpc-and-api-contracts`).
7. **Only then consider hedging**, and only if both safety conditions in the rules below
   hold.

## Decision block

```text
Use scatter/gather when:
- the answer genuinely requires data from several owners, each holding a disjoint slice
  (sharding-and-partitioning), and it must be current as of this request
- N is small, bounded and known at request time — it does not grow with tenant size or
  with the result set
- the root's latency budget exceeds the leaf p99.9 with room for the gather itself
- the caller's contract can express a partial answer, or all-of-N genuinely fits the budget
Avoid scatter/gather when:
- the leaves share a saturated resource — one database, one pool, one node — so the fan-out
  is concurrency against itself rather than parallelism
- N grows with data volume: latency then degrades as the workload succeeds
- the request writes. A fan-out write across N owners is not a transaction
  (distributed-transactions-and-sagas); reads are what this pattern is for
- the root budget is at or below the leaf p99: the max over N will exceed it by construction
Prefer instead:
- an index or denormalised view keyed by the query, so one owner answers it
  (sharding-and-partitioning) — this is the fix for a query that always fans out
- caching the gathered result when the inputs change more slowly than they are read
  (caching-strategies)
- a precomputed aggregate maintained out of band when the answer need not be per-request
  (distributed-aggregation-and-barriers)
```

## Rules

- Never quote a leaf's p99 as the root's SLO. Derive each leaf's budget backwards from the
  root's, using the fan-out amplification in `tail-latency-analysis`.
- Raising N reduces per-leaf work linearly and raises the chance the root meets a slow leaf
  monotonically. There is a crossover; find it by measuring the root, because no leaf metric
  contains it.
- The root is a **single** point of failure and each leaf is a **partial** one. Under
  all-of-N, root availability is the product of the leaf availabilities: N = 20 leaves at
  99.9% each gives roughly 98% for the request. Partial results are what break that product.
- A partial result must carry an explicit completeness field naming the missing owners. A
  list of 8 elements is indistinguishable from 8 shards that had no data, and a caller that
  cannot tell will cache the wrong answer or show it as authoritative.
- Every leaf call takes the **remaining** budget, not a per-leaf constant. Fixed per-leaf
  timeouts under a root deadline are unreachable configuration the first time a leaf is slow.
- Cancellation is delivered as an interrupt and proves nothing on its own. A cancelled
  `Future` means the root stopped waiting; the leaf may still hold a thread, a connection and
  a database session. Assert on the callee's in-flight gauge returning to zero.
- **Hedging is safe only when both hold**: the leaf operation is read-only or idempotent
  (`idempotency`), and the hedge rate is capped as a small fraction of traffic. An uncapped
  hedge fires most often exactly when the dependency is already slow, which makes it a load
  multiplier at the worst moment.
- Send the hedge to a **different** replica than the original, after the original has already
  spent its trigger percentile — a hedge to the same instance queues behind the same slow
  thing. Trigger placement and its load cost are `tail-latency-analysis`.
- A retry _inside_ a leaf multiplies the whole fan-out: N leaves at 3 attempts is 3N calls
  inside one root budget, and the budget arithmetic must include it
  (`retries-and-backoff`).
- **Scatter/gather scales worse than it looks.** Adding leaves adds tail exposure and root
  fan-out cost; it converts a capacity problem into a latency-variance problem. Say that in
  the design review rather than discovering it at N = 50.
- Java: the production shape is `Executors.newVirtualThreadPerTaskExecutor()` in
  try-with-resources with `invokeAll(tasks, timeout, unit)` for by-deadline gathers, or
  `invokeAny` for first-of-N. `StructuredTaskScope` is the better _model_ for this exact
  problem but has been a **preview** API on every released JDK including 25 and 26, requiring
  `--enable-preview` and recompilation for each JDK — `structured-concurrency` owns the API
  and the version matrix. Do not treat it as the default without that decision being made.

## References

- [Tail amplification and hedging](references/tail-amplification-and-hedging.md) — the
  max-of-N consequence with the N table, how to choose N and where the crossover sits, the
  hedging rule with its two safety conditions and rate cap, backup-request placement, and the
  four series that show whether hedging is helping or adding load. Read before changing N,
  and before enabling any hedge or backup request.
- [Fan-out in Java](references/java-fan-out.md) — a virtual-thread executor fan-out under a
  propagated deadline, per-leaf timeouts derived from the remaining budget, cancellation of
  the outstanding leaves and the `close()` trap behind it, partial-result assembly as a
  record with a completeness field, and a test that asserts the losers were actually
  interrupted. Read when implementing or reviewing a fan-out.
