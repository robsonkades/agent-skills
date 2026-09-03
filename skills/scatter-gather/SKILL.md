---
name: scatter-gather
description: >
  Fanning one request out to N workers and combining answers: order-statistic latency,
  choosing N against tail exposure, all-of-N/first-of-N/k-of-N completion, safe hedging,
  partial-result completeness and watermarks, deadline propagation, and cancelling
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

For **all-of-N**, root latency includes the maximum of the required leaf completion times plus
scatter/gather overhead. First-success and k-of-N use order statistics and can return earlier;
quorum/partial semantics decide whether that answer is correct. At N = 100 with independent,
identically distributed leaves, roughly 63% of root requests contain
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
3. **Propagate one deadline to every leaf** with a reserve for merge/serialization/return.
   Start a leaf only when its probability/value of completing within remaining budget justifies
   the work; p50 is not a universal cutoff (`timeouts-and-deadlines`).
4. **Bound the in-flight fan-out.** Virtual threads make N cheap in the root and change
   nothing downstream: the limit belongs next to the scarce resource
   (`concurrency-limiting-and-bulkheads`).
5. **Signal cancellation to losers when the gather is satisfied**, and verify root tasks plus
   remote work release resources. Cancellation may be advisory and cannot undo a committed
   effect; budget residual work even after reply.
6. **Decide the partial/quorum-result contract with the caller.** Include expected/responded/
   missing owners, errors, data/version watermark and whether aggregation is exact, lower/
   upper-bounded or stale (`rpc-and-api-contracts`).
7. **Only then consider hedging**, with operation safety, replica independence/consistency,
   rate/capacity budget and cancellability measured.

## Decision block

```text
Use scatter/gather when:
- the answer genuinely requires data from several owners, each holding a disjoint slice
  (sharding-and-partitioning), and it must be current as of this request
- N and total work are bounded by an admission budget; hierarchical/dynamic fan-out has a
  global descendant cap rather than recursively multiplying unchecked
- root latency is derived from measured joint/order-statistic behavior, not one leaf percentile
- the caller's contract can express a partial answer, or all-of-N genuinely fits the budget
Avoid scatter/gather when:
- the leaves share a saturated resource — one database, one pool, one node — so the fan-out
  is concurrency against itself rather than parallelism
- N grows with data volume: latency then degrades as the workload succeeds
- the request writes and requires atomic all-or-nothing visibility without a commit protocol.
  Fan-out writes can be valid for replicated/quorum or idempotent broadcast semantics, but
  scatter/gather alone is not a transaction (`distributed-transactions-and-sagas`)
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
- Raising N may reduce divisible data work, but fixed setup, skew, duplicate work and shared
  bottlenecks prevent linear scaling. For all-of-N it increases exposure to any slow leaf;
  correlation determines how much. Find the crossover at the root with realistic placement.
- The coordinator/root is a failure and capacity domain unless replicated/stateless. Under
  all-of-N, independent required leaves with aligned success definitions multiply to about
  98% at N=20 and 99.9% each; real correlation requires joint measurement. k-of-N availability
  follows a binomial model only for independent identical leaves, while quorum correctness has
  separate consistency assumptions.
- A partial result must carry an explicit completeness field naming the missing owners. A
  list of 8 elements is indistinguishable from 8 shards that had no data, and a caller that
  cannot tell will cache the wrong answer or show it as authoritative.
- Every leaf call takes the **remaining** budget, not a per-leaf constant. Fixed per-leaf
  timeouts under a root deadline are unreachable configuration the first time a leaf is slow.
- Java `Future.cancel(true)` attempts interruption; `CompletableFuture.cancel` does not
  guarantee interrupting supplier execution, and remote cancellation depends on protocol/
  client. A cancelled handle proves only local state. Assert remote in-flight/resource release.
- **Hedging requires all of these**: equivalent/read-only or downstream-idempotent operation;
  an independent eligible replica with acceptable consistency; remaining deadline; global
  hedge/concurrency budget; and cheap cancellation/residual-work accounting. An uncapped
  hedge fires most often exactly when the dependency is already slow, which makes it a load
  multiplier at the worst moment.
- Prefer a different failure domain than the original after a conditional latency trigger.
  A different replica sharing the same shard/database may add only load, and a stale replica
  may not be semantically equivalent. Trigger placement is `tail-latency-analysis`.
- A retry _inside_ a leaf multiplies the whole fan-out: N leaves at 3 attempts is 3N calls
  inside one root budget, and the budget arithmetic must include it
  (`retries-and-backoff`).
- **Scatter/gather scales worse than it looks.** Adding leaves adds tail exposure and root
  fan-out cost; it converts a capacity problem into a latency-variance problem. Say that in
  the design review rather than discovering it at N = 50.
- Java: the production shape is `Executors.newVirtualThreadPerTaskExecutor()` in
  a lifecycle-managed virtual-thread executor (Java 21+) plus completion/cancellation tracking,
  or a framework client with equivalent lifecycle. A per-call try-with-resources executor can
  block in `close()` until uncooperative tasks terminate, defeating the response deadline.
  `StructuredTaskScope` expresses ownership better but remains preview through JDK 26 (JEP 525),
  requiring preview flags/recompilation; `structured-concurrency` owns the version matrix.

## References

- [Tail amplification and hedging](references/tail-amplification-and-hedging.md) — the
  max-of-N consequence with the N table, how to choose N and where the crossover sits, the
  hedging rule with its two safety conditions and rate cap, backup-request placement, and the
  four series that show whether hedging is helping or adding load. Read before changing N,
  and before enabling any hedge or backup request.
- [Fan-out in Java](references/java-fan-out.md) — a virtual-thread executor fan-out under a
  propagated deadline, per-leaf timeouts derived from the remaining budget, cancellation of
  outstanding leaves and the `close()` trap behind it, partial-result assembly with
  completeness/watermark fields, and tests distinguishing local cancellation from residual
  remote work. Read when implementing or reviewing a fan-out.
