---
name: distributed-aggregation-and-barriers
description: >
  Correct and recoverable aggregation across workers: algebraic laws, duplicate attempts,
  numeric reproducibility, mergeable summaries, barriers, joins, skew, checkpointing and
  partial results. Use when totals drift between runs, stragglers set job latency, worker
  percentiles are averaged, cardinality exhausts memory, or a join stalls on one task. It
  excludes request fan-out, streaming windows, percentile theory, message ordering and the
  broader hot-key repair catalogue.
---

# Distributed Aggregation And Barriers

## Purpose

Get one correct, reproducible answer out of many workers, and pay as little synchronisation
for it as the answer requires. Two decisions carry the whole topic: what the combining
function is allowed to be, and where — if anywhere — every worker must wait for every other.

The failure this prevents is the aggregate that disagrees with itself. Same input, same
code, a different partition order, and the total moves in the fifth decimal place; finance
opens a reconciliation ticket nobody can reproduce, because the cause is that floating-point
addition is not associative and the shuffle is not deterministic. The second failure is the
barrier nobody named: a job of ten thousand tasks whose wall-clock time is set entirely by
two of them, where adding workers changes nothing at all.

## Workflow

1. **Write the aggregate contract.** Define identity, accumulator, merge, finish, input
   domain, overflow/error policy and whether encounter order is semantically relevant.
   Associativity is required for arbitrary grouping; commutativity is required only when
   partials may be reordered. Neither prevents double-counting a repeated attempt.
2. **Rewrite aggregates that lack a mergeable sufficient state.** Average becomes a `(sum,
count)` pair; variance becomes `(n, mean, M2)`; a percentile becomes a mergeable
   histogram; a ratio carries numerator and denominator separately.
3. **Choose a summary per metric and state its error.** Exact where cardinality is small, an
   approximate mergeable sketch where it is not — with the error in the dashboard label.
4. **Partition by cost, not by count**, using a measured size per key. This removes more
   stragglers than any mitigation applied afterwards.
5. **Place the barriers deliberately and count them.** Every barrier converts the slowest
   participant into everyone's latency. Ask what breaks if this one is removed.
6. **Define attempt identity and output commit.** Every logical partition may execute more
   than once. Stage output by `(job, stage, partition, attempt)` and atomically select one
   successful attempt, or use a sink-specific idempotent/transactional commit protocol.
7. **Decide the partial-failure contract before the job runs**, not during the incident:
   fail the job, retry the failed tasks, or emit a partial result with an explicit
   completeness record.
8. **Prove algebra and recovery.** Property-test regrouping/reordering allowed by the
   contract, inject duplicate attempts and crashes at commit boundaries, and compare against
   a trusted sequential oracle. A shuffled-order example alone is not a proof.

## Decision block

```text
Use a barrier when:
- a later stage genuinely reads the complete output of an earlier one — a global sort, a
  normalisation by a total, a join needing both sides fully partitioned
- the participant set is bounded and known before the stage starts
The barrier is affordable when:
- measured max-stage latency, not merely p99/p50, fits the job SLO at the actual task count
Avoid a barrier when:
- the task duration distribution has a long tail; the barrier costs the maximum over
  participants, so one straggler stalls everything
- participants can join or fail mid-stage and no epoch/membership protocol defines who
  counts as a participant
- the downstream stage could consume results incrementally instead
Prefer incremental or hierarchical combination instead when the combining function is
  associative and commutative, so partial results merge in any order with no global wait;
  when the result is read continuously rather than at a job boundary, that is a stream and
  belongs to streaming-pipeline-topologies.
Speculatively re-execute a straggler only when the task is idempotent and side-effect-free
  (idempotency), only the first result is committed, and the speculative fraction is capped.
```

## Rules

- **A barrier is as fast as its slowest participant.** This is the max-of-N property
  `scatter-gather` owns inside one request, at batch scale: the expected wait grows with the
  number of participants and with the width of the task-duration tail, not with the mean.
  Plot the per-task duration distribution before adding workers.
- Partitioning by task _count_ assumes tasks cost the same. When key sizes span orders of
  magnitude that assumption manufactures a straggler on every run; partition by measured
  cost — bytes, rows, or a prior run's duration per key. Skew's repairs are
  `hot-partitions-and-rebalancing`.
- **The combining function must be associative** under the result equivalence relation.
  Commutativity is additionally required for unordered arrival; ordered concatenation is a
  valid associative reduce when the engine preserves encounter order. Safe when domains and
  overflow are handled: exact or intentionally modular integer sum,
  min, max, count, bitwise OR, set union, HyperLogLog merge. Unsafe: average, median,
  subtraction and division. `first`/`last` require a stable ordering key. Re-execution is a
  separate property: sum is associative and commutative but counts a duplicate twice.
- **Floating-point addition is not associative**: `(a + b) + c` and `a + (b + c)` differ for
  doubles. A distributed sum of doubles is therefore non-deterministic whenever the
  partition or merge order changes, and the difference is real money in a reconciliation
  report. Do not assume two sums over the same doubles agree — order and the summation
  algorithm both move the result. Three fixes, and the design must name which is used:
  **exact decimal/fixed-point** (`BigDecimal` without rounding during addition, or checked
  integer minor units with an explicit currency/scale and overflow policy) — normally the
  right model for contractual money; **compensated summation**
  (Kahan/Neumaier), which bounds the error without making the operation associative; or a
  **deterministic order** — sort within a partition, merge partitions in a fixed sequence.
- Average is not directly reducible from per-partition averages: reduce `(sum, count)` and
  divide once at the end. The same
  rewrite applies to variance, standard deviation, rate and any ratio — carry both terms.
- **Never average percentiles** — that rule is `latency-statistics`. Its distributed
  consequence is the design: each worker emits a _histogram_, the coordinator merges the
  histograms, and the quantile is read once from the merged structure. A worker that emits
  only its own p99 has destroyed the information needed to compute the fleet's.
- **Mergeability keeps intermediate state bounded and hierarchically combinable.** A summary
  that cannot merge may require retaining or repartitioning raw data and concentrating final
  work; it does not literally require every record to traverse one node. Choose by what is
  traded: HyperLogLog for distinct counts (fixed
  memory, a stated relative error, merged by per-register maximum), count-min sketch for
  frequencies (over-estimates, never under-estimates), t-digest or HdrHistogram for
  quantiles. Exact distinct counting needs memory proportional to cardinality — that is the
  cost a sketch buys off.
- Broadcast join when the small side fits in each worker's memory alongside its working set,
  measured rather than assumed; shuffle join when both sides are large. A skewed join key
  sends one worker most of the rows, and the stage then runs at that worker's speed whatever
  the cluster size.
- A batch's partial failure needs a decision, not a default. Retried/speculative task outputs
  need one selected attempt per logical partition, while external effects need idempotency.
  A partial result must carry an explicit completeness record naming what is missing; the
  per-request version of that contract is `scatter-gather`.
- A checkpoint needs a sink-supported commit protocol. Atomic rename works only on file
  systems that guarantee the required same-filesystem rename semantics; object stores may
  implement rename as copy/delete. Prefer immutable attempt outputs plus an atomic manifest,
  transaction or engine-native committer. Optimize checkpoint interval from write cost,
  failure rate and recovery work, then validate under injected failure.
- Never write "exactly-once aggregation". State the boundary: at-least-once task execution
  plus one selected output per logical partition can provide one committed contribution per
  stage. External side effects and source/sink commits need their own boundary proof.

## References

- [Java 25 `Collector` contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/stream/Collector.html)
- [MapReduce: Simplified Data Processing on Large Clusters](https://research.google/pubs/mapreduce-simplified-data-processing-on-large-clusters/)
- [HyperLogLog original analysis](https://algo.inria.fr/flajolet/Publications/FlFuGaMe07.pdf)

- [Aggregation correctness](references/aggregation-correctness.md) — identity,
  associativity, conditional commutativity and duplicate-attempt separation, with the
  safe/unsafe operation table and floating-point
  non-associativity problem and its three fixes, non-reducible aggregates rewritten as
  reducible pairs, mergeable summaries with what each approximates and its error, and a
  determinism test that shuffles partition order. Read before writing a combiner, or when an
  aggregate does not reproduce.
- [Barriers, joins and partial failure](references/barriers-joins-and-partial-failure.md) —
  what a barrier costs, straggler mitigation and its safety conditions, the two join shapes
  with their selecting conditions and the skew failure, checkpoint placement, the
  partial-failure decision, and how to test a batch job with an injected task failure. Read
  when designing a job's stages, or when its wall-clock time is set by a few tasks.
