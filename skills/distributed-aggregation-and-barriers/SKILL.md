---
name: distributed-aggregation-and-barriers
description: >
  Computing one answer from data spread across many workers, and its synchronisation cost:
  the barrier, which runs at the speed of the slowest participant; reduce correctness, where
  the combiner must be associative and commutative, average is not reducible, and
  floating-point addition is not associative so a distributed sum of doubles varies between
  runs; mergeable summaries; broadcast versus shuffle joins and skew; partial failure and
  checkpointing. Use when a nightly total does not reconcile with itself between runs, when
  a job's wall-clock time is set by two tasks out of 10,000, when adding workers stopped
  making a job faster, when per-worker percentiles are averaged, when an exact distinct
  count runs out of memory, or when a join makes one worker do all the work. Does not cover
  fan-out inside one request (scatter-gather), windowed processing
  (streaming-pipeline-topologies), percentile statistics (latency-statistics), ordering
  (message-ordering-and-partitioning), or key skew (hot-partitions-and-rebalancing).
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

1. **Write down the combining function and check its algebra.** It must be associative and
   commutative, because a retried or re-executed task changes the combination order and no
   ordering is guaranteed across partitions (`message-ordering-and-partitioning`).
2. **Rewrite the aggregates that are not directly reducible.** Average becomes a `(sum,
count)` pair; variance becomes `(n, mean, M2)`; a percentile becomes a mergeable
   histogram; a ratio carries numerator and denominator separately.
3. **Choose a summary per metric and state its error.** Exact where cardinality is small, an
   approximate mergeable sketch where it is not — with the error in the dashboard label.
4. **Partition by cost, not by count**, using a measured size per key. This removes more
   stragglers than any mitigation applied afterwards.
5. **Place the barriers deliberately and count them.** Every barrier converts the slowest
   participant into everyone's latency. Ask what breaks if this one is removed.
6. **Decide the partial-failure contract before the job runs**, not during the incident:
   fail the job, retry the failed tasks, or emit a partial result with an explicit
   completeness record.
7. **Prove determinism.** Re-run with a shuffled partition order and assert the same result.
   This is the only test that catches a non-associative combiner.

## Decision block

```text
Use a barrier when:
- a later stage genuinely reads the complete output of an earlier one — a global sort, a
  normalisation by a total, a join needing both sides fully partitioned
- the per-task duration distribution is tight (p99 near p50), so max-of-N is near the mean
- the participant set is bounded and known before the stage starts
Avoid a barrier when:
- the task duration distribution has a long tail; the barrier costs the maximum over
  participants, so one straggler stalls everything
- participants can join or fail mid-stage, so "all have arrived" is undecidable without a
  membership service
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
- **The combining function must be associative and commutative.** Safe: sum of integers,
  min, max, count, bitwise OR, set union, HyperLogLog merge. Unsafe: average, median,
  "first", "last", subtraction, division, and any function that reads the accumulated state
  of another partition.
- **Floating-point addition is not associative**: `(a + b) + c` and `a + (b + c)` differ for
  doubles. A distributed sum of doubles is therefore non-deterministic whenever the
  partition or merge order changes, and the difference is real money in a reconciliation
  report. Do not assume two sums over the same doubles agree — order and the summation
  algorithm both move the result. Three fixes, and the design must name which is used:
  **fixed-point** (`BigDecimal` with an explicit scale and `RoundingMode`, or a `long` of
  minor units) — mandatory for money, which is never a `double`; **compensated summation**
  (Kahan/Neumaier), which bounds the error without making the operation associative; or a
  **deterministic order** — sort within a partition, merge partitions in a fixed sequence.
- Average is not reducible: reduce `(sum, count)` and divide once at the end. The same
  rewrite applies to variance, standard deviation, rate and any ratio — carry both terms.
- **Never average percentiles** — that rule is `latency-statistics`. Its distributed
  consequence is the design: each worker emits a _histogram_, the coordinator merges the
  histograms, and the quantile is read once from the merged structure. A worker that emits
  only its own p99 has destroyed the information needed to compute the fleet's.
- **Mergeability is what makes distributed aggregation possible.** A summary that cannot be
  merged forces every record through one node, which is then the throughput ceiling and the
  single point of failure. Choose by what is traded: HyperLogLog for distinct counts (fixed
  memory, a stated relative error, merged by per-register maximum), count-min sketch for
  frequencies (over-estimates, never under-estimates), t-digest or HdrHistogram for
  quantiles. Exact distinct counting needs memory proportional to cardinality — that is the
  cost a sketch buys off.
- Broadcast join when the small side fits in each worker's memory alongside its working set,
  measured rather than assumed; shuffle join when both sides are large. A skewed join key
  sends one worker most of the rows, and the stage then runs at that worker's speed whatever
  the cluster size.
- A batch's partial failure needs a decision, not a default. Retrying failed tasks requires
  every task to be idempotent (`idempotency`) — one that appends to an output is not — and a
  partial result must carry an explicit completeness record naming what is missing; the
  per-request version of that contract is `scatter-gather`.
- A checkpoint must be atomic — write to a temporary location, then rename — or a restart
  reads a torn one and produces a plausible wrong answer. Set the interval from the restart
  cost, and check the pathology: if checkpointing costs more than the mean time between
  failures, the job never finishes.
- Never write "exactly-once aggregation". State the boundary: at-least-once task execution
  plus an idempotent commit of each partition's output is `effectively-once` for the job,
  and the coordinator's record of which partitions committed is what makes it so.

## References

- [Aggregation correctness](references/aggregation-correctness.md) — the associativity and
  commutativity requirement with the safe/unsafe operation table, the floating-point
  non-associativity problem and its three fixes, non-reducible aggregates rewritten as
  reducible pairs, mergeable summaries with what each approximates and its error, and a
  determinism test that shuffles partition order. Read before writing a combiner, or when an
  aggregate does not reproduce.
- [Barriers, joins and partial failure](references/barriers-joins-and-partial-failure.md) —
  what a barrier costs, straggler mitigation and its safety conditions, the two join shapes
  with their selecting conditions and the skew failure, checkpoint placement, the
  partial-failure decision, and how to test a batch job with an injected task failure. Read
  when designing a job's stages, or when its wall-clock time is set by a few tasks.
