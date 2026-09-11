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

For **all-of-N**, follow the critical path through dispatch, required leaf completions and
remaining gather/return work; overlapping stages must not be added twice. First-success and
k-of-N use order statistics and can return earlier;
quorum/partial semantics decide whether that answer is correct. At N = 100 with independent,
identically distributed leaves, roughly 63% of root requests contain
at least one leaf beyond its own p99. The arithmetic is `tail-latency-analysis`; the
consequence is this skill's whole subject.

The failure this prevents is the optimisation that reverses: work is split across more leaves
so each leaf does less, every leaf's p99 improves, and the user-facing p99 gets worse. No
leaf dashboard shows it, because no leaf is at fault. The second failure is the fan-out that
costs N units of work for one answer — the gather is satisfied, the root replies, and the
losing leaves keep running with their connections held.

## Compatibility and evidence

Inspect deployed Java/client versions, existing execution model and the caller's consistency
contract before changing fan-out. The Java sketch targets Java 21+ without preview; preserve
older supported executors/frameworks when appropriate rather than upgrading implicitly.
Missing joint traces, ownership epochs or cancellation evidence leave the corresponding
latency/correctness claim unverified. For a material design change, report the completion rule,
bounded work/bytes, deadline allocation, actual evidence and remaining validation. A narrow
review can give its supported conclusion and limits, retaining an adequate existing design.

## Workflow

Use the steps needed for the requested explanation, review or implementation. Reuse adequate
contracts, traces and tests; an unresolved narrow question need not trigger an N sweep, a new
execution model or a full fault campaign.

1. **State the completion rule before writing any code.** All-of-N (the answer needs every
   leaf), first-success (first acceptable equivalent answer), or k acceptable distinct owners
   by deadline. Define insufficient-k behavior separately; an error completing first is not
   a successful winner. Every other decision below follows from this one.
2. **Choose or retain N from the contract and cost.** N trades per-leaf work against tail
   exposure and coordination cost. One leaf per shard can be deliberate and bounded; compare
   owner coalescing or selective dispatch only when they preserve its semantics and improve
   the relevant cost — see `references/tail-amplification-and-hedging.md`.
3. **Derive every leaf cutoff from one root deadline**, reserving time for cancellation
   bookkeeping, merge/serialization/return.
   Start a leaf only when its probability/value of completing within remaining budget justifies
   the work; p50 is not a universal cutoff (`timeouts-and-deadlines`).
4. **Bound fan-out across concurrent roots as well as within each request.** Limit admission,
   waiting tasks, response bytes and active leaf work. Virtual threads still retain memory;
   a semaphore caps holders, not its waiter population
   (`concurrency-limiting-and-bulkheads`).
5. **Signal cancellation to losers when the gather is satisfied**, and observe root-task plus
   remote resource lifetimes. Cancellation may be advisory and cannot undo a committed effect;
   enforce/account for bounded residual work even after reply.
6. **Decide the partial/quorum-result contract with the caller.** Distinguish expected,
   responded, missing and failed work, data/version watermark and whether aggregation is exact,
   lower/upper-bounded or stale. Expose authorized counts/status or opaque reconciliation tokens
   when internal owner names are sensitive; the representation must support the caller's actual
   decision (`rpc-and-api-contracts`).
7. **Only then consider hedging**, with operation safety, replica independence/consistency,
   rate/capacity budget and cancellability measured.

## Decision block

```text
Use scatter/gather when:
- the answer needs several slices (sharding-and-partitioning), eligible replica responses,
  or independent providers under an explicit completion/consistency contract
- request-time freshness or an accepted snapshot/staleness watermark is defined
- N and total work are bounded by an admission budget; hierarchical/dynamic fan-out has a
  global descendant cap rather than recursively multiplying unchecked
- root latency is derived from measured joint/order-statistic behavior, not one leaf percentile
- the caller's contract can express a partial answer, or all-of-N genuinely fits the budget
Avoid scatter/gather when:
- the leaves share a saturated resource — one database, one pool, one node — so the fan-out
  is concurrency against itself rather than parallelism
- growing N or shared contention exceeds the root's measured latency/work/byte budget
- the request writes and requires atomic all-or-nothing visibility without a commit protocol.
  Fan-out writes can be valid for replicated/quorum or idempotent broadcast semantics, but
  scatter/gather alone is not a transaction (`distributed-transactions-and-sagas`)
- the measured all-of-N tail plus dispatch/merge cost does not fit the root target;
  a leaf p99 alone cannot prove a breach for every request or for first-success
Prefer instead:
- an index or denormalised view keyed by the query, so one owner answers it
  (sharding-and-partitioning), when its maintenance/freshness cost fits the query contract
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
- A partial result needs explicit completeness semantics; returned row count is not coverage.
  Retain internal owner/epoch evidence, but do not expose private topology merely to report
  completeness. Authorized identities, counts/status or integrity-protected opaque tokens can
  serve different contracts; define what they establish and how unresolved work is reconciled.
- Each leaf timeout is bounded by the remaining leaf cutoff; a smaller dependency-specific
  timeout may also apply. Include queue/admission time. An early dependency timeout is valid,
  but a fresh timeout must not extend the root deadline.
- Java `Future.cancel(true)` attempts interruption; `CompletableFuture.cancel` does not
  guarantee interrupting supplier execution, and remote cancellation depends on protocol/
  client. A cancelled handle proves only local state. Measure remote in-flight/resource release
  and enforce its residual-work budget rather than claiming guaranteed cancellation.
- **Hedging requires all of these**: equivalent/read-only or downstream-idempotent operation;
  an independent eligible replica with acceptable consistency; remaining deadline; global
  hedge/concurrency budget; and cancellation plus bounded, accounted residual work whose cost
  fits the objective. An uncapped
  hedge fires most often exactly when the dependency is already slow, which makes it a load
  multiplier at the worst moment.
- Prefer a different failure domain than the original after a conditional latency trigger.
  A different replica sharing the same shard/database may add only load, and a stale replica
  may not be semantically equivalent. Trigger placement is `tail-latency-analysis`.
- A retry _inside_ a leaf multiplies the whole fan-out: N leaves at 3 attempts is 3N calls
  inside one root budget, and the budget arithmetic must include it
  (`retries-and-backoff`).
- Evaluate scaling at the root and protected resources. More leaves can improve divisible work
  while adding tail exposure and coordination cost; neither improvement nor degradation follows
  from N alone. Retain a design that meets the actual contract and capacity limits.
- Java: `Executors.newVirtualThreadPerTaskExecutor()` in a lifecycle-managed executor
  (Java 21+) is one option with completion/cancellation tracking. A supported older executor
  or framework client with suitable admission/lifecycle can remain appropriate. A per-call try-with-resources executor can
  block in `close()` until uncooperative tasks terminate, defeating the response deadline.
  `StructuredTaskScope` expresses ownership better but remains preview through JDK 26 (JEP 525),
  requiring preview flags/recompilation; `structured-concurrency` owns the version matrix.

## References

- [Tail amplification and hedging](references/tail-amplification-and-hedging.md) — the
  max-of-N consequence with the N table, how to choose N and where the crossover sits, the
  hedging eligibility conditions and admission caps, backup-request placement, and the
  series that show whether hedging is helping or adding load. Read before changing N,
  and before enabling any hedge or backup request.
- [Fan-out in Java](references/java-fan-out.md) — a virtual-thread executor fan-out under a
  propagated deadline, per-leaf timeouts derived from the remaining budget, cancellation of
  outstanding leaves and the `close()` trap behind it, partial-result assembly with
  completeness/watermark fields, and tests distinguishing local cancellation from residual
  remote work. Read when implementing or reviewing a fan-out.
