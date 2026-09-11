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

Reuse the existing aggregate definition, input snapshot, engine commit protocol and measured
task profile before asking for missing context. Retain an adequate exact representation and
required barrier; introduce a sketch, repartitioning or speculation only for a demonstrated
constraint. Scale investigation and testing to whether the request is an explanation, design
review or implementation change.

1. **Write the aggregate contract.** Define identity, accumulator, merge, finish, input
   domain, units/window/population, overflow/error policy and whether encounter order matters.
   Associativity is required for arbitrary grouping; commutativity is required only when
   partials may be reordered. Neither prevents double-counting a repeated attempt.
2. **Rewrite aggregates that lack a mergeable sufficient state.** Average becomes a
   `(sum, count)` pair; variance becomes `(n, mean, M2)`; a pooled percentile needs a mergeable
   distribution summary. A ratio needs a denominator with the correct exposure semantics.
3. **Choose a summary per metric and state its error.** Exact where cardinality is small, an
   approximate mergeable sketch when its error is acceptable and exact state is too costly.
   Make that error part of the consumer's result contract.
4. **Partition by measured cost**, not merely count, when skew explains stragglers; distinguish
   deterministic data skew from host faults or transient resource contention.
5. **Place the barriers deliberately and count them.** Every barrier converts the slowest
   participant into everyone's latency. Ask what breaks if this one is removed.
6. **Define attempt identity and output commit.** Every logical partition may execute more
   than once. Stage output by `(job, stage, partition, attempt)` and atomically select one
   successful attempt, or use a sink-specific idempotent/transactional commit protocol.
7. **Decide the partial-failure contract before the job runs**, not during the incident:
   fail the job, retry the failed tasks, or emit a partial result with an explicit
   completeness record.
8. **Check algebra and recovery.** Property-test regrouping/reordering allowed by the
   contract, inject duplicate attempts and crashes at commit boundaries, and compare against
   a trusted sequential oracle. Report the schedules and faults actually tested; finite trials
   support the contract but do not prove every distributed execution safe.

Inspect engine and sketch-library versions, input snapshot, numeric domain and sink commit
guarantees; for Java, inspect the target JDK/toolchain too. Reference records require JDK 16+; test sketches
assume project-specific JUnit/AssertJ fixtures and are not standalone programs. Do not upgrade the
target to fit an example. Deliver the aggregate/equivalence contract, evidence for merge and
recovery semantics, expected participant/completeness record and remaining validation gaps.

## Decision block

```text
Use a barrier when:
- a later stage genuinely reads the complete output of an earlier one — a global sort, a
  normalisation by a total, a join needing both sides fully partitioned
- the participant set is bounded and known before the stage starts
The barrier is affordable when:
- measured max-stage latency, not merely p99/p50, fits the job SLO at the actual task count
Avoid a barrier when:
- incremental consumption preserves the required semantics and waiting adds unnecessary
  exposure to stragglers; retain a required completeness gate despite a long tail
- participants can join or fail mid-stage and no epoch/membership protocol defines who
  counts as a participant
- the downstream stage could consume results incrementally instead
Prefer incremental or hierarchical combination instead when the combining function is
  associative under the permitted grouping and order (commutative if reordered). Combining
  early does not remove the participant/completeness condition for a final batch result.
  Continuously read results and window semantics belong to streaming-pipeline-topologies.
Speculatively re-execute a straggler only when attempts satisfy the same result contract,
  one output is selected, and external effects are absent or independently safe across all
  attempts and late effects (idempotency). Cap copies and account for losers still running.
```

## Rules

- **A barrier is as fast as its slowest participant.** This is the max-of-N property
  `scatter-gather` owns inside one request, at batch scale: the expected wait grows with the
  number of comparable participants and their tail behavior. With queued task waves, stage
  latency is the latest completion from stage start, including scheduling and retries; it is
  not simply the longest isolated task duration.
  Plot the per-task duration distribution before adding workers.
- Partitioning by task _count_ assumes tasks cost the same. When key sizes span orders of
  magnitude that assumption manufactures a straggler on every run; partition by measured
  cost — bytes, rows, or a prior run's duration per key. Skew's repairs are
  `hot-partitions-and-rebalancing`.
- **The combining function must be associative** under the result equivalence relation.
  Commutativity is additionally required for unordered arrival; ordered concatenation is a
  valid associative reduce when the engine preserves encounter order. Safe when domains and
  overflow are handled: exact or intentionally modular integer sum,
  min, max, count, bitwise OR, set union, HyperLogLog merge. Unsafe as scalar combiners: average,
  median, subtraction and division. Ordered `first`/`last` can be associative; unordered arrival
  needs an ordering key with deterministic ties. Re-execution is a
  separate property: sum is associative and commutative but counts a duplicate twice.
- **Floating-point addition is not associative**: `(a + b) + c` and `a + (b + c)` differ for
  doubles. A distributed sum of doubles can therefore change when the
  partition or merge order changes, and the difference is real money in a reconciliation
  report. Do not assume two sums over the same doubles agree — order and the summation
  algorithm both move the result. Three fixes, and the design must name which is used:
  **exact decimal/fixed-point** (`BigDecimal` without rounding during addition, or checked
  integer minor units with an explicit currency/scale and overflow policy) — normally the
  right model for contractual money; **compensated summation**
  (Kahan/Neumaier), which can reduce rounding error under the algorithm's assumptions but
  does not make the operation associative or guarantee closer results for every input; or a
  **deterministic evaluation** — fix partition boundaries, within-partition order and the merge
  tree, or use an algorithm guaranteeing reproducibility across the required regroupings.
- Average is not directly reducible from per-partition averages: reduce `(sum, count)` and
  divide once at the end. Variance needs its own sufficient state. Rate denominators are
  additive only for additive exposures: disjoint counts of 100 and 200 events over the same
  10-second window yield 30 fleet events/s; `300 / 20 = 15` events per worker-second measures
  a different exposure.
- **Averaging worker percentiles does not recover a pooled percentile.** Each worker emits a
  compatible distribution summary; merge counts for the intended units, window and outcome
  population, then read the quantile once. Per-worker p99s lack that information. A mean of
  run-level p99s is a different legitimate statistic; `latency-statistics` owns that distinction.
- **Mergeability permits hierarchical combination; it does not imply bounded state.** Exact
  set union merges but grows with distinct input. A summary
  that cannot merge may require retaining or repartitioning raw data and concentrating final
  work; it does not literally require every record to traverse one node. Choose by what is
  traded: HyperLogLog for distinct counts (fixed
  memory, a stated relative error, merged by per-register maximum), count-min sketch for
  non-negative frequencies (one-sided over-estimation with compatible hashes and no counter
  overflow), t-digest or HdrHistogram for
  quantiles. An in-memory exact distinct set needs memory proportional to cardinality; exact
  sorted-input or spill-based approaches trade different ordering, storage and execution costs.
- Broadcast join when the small side fits in each worker's memory alongside its working set,
  measured rather than assumed; shuffle join when both sides are large. A skewed join key
  sends one worker most of the rows, and the stage then runs at that worker's speed whatever
  the cluster size.
- A batch's partial failure needs a decision, not a default. Retried/speculative task outputs
  need one selected attempt per logical partition, while each external effect needs its own
  enforced retry-safe contract across attempts; selecting output does not deduplicate effects.
  A partial result must carry an explicit completeness record naming what is missing; the
  per-request version of that contract is `scatter-gather`.
- A checkpoint needs a sink-supported commit protocol. Atomic rename works only on file
  systems that guarantee the required same-filesystem rename semantics; object stores may
  implement rename as copy/delete. Prefer immutable attempt outputs plus an atomic manifest,
  transaction or engine-native committer. Optimize checkpoint interval from write cost,
  failure rate and recovery work, then validate under injected failure.
- Never claim unqualified "exactly-once aggregation". State the boundary: at-least-once task execution
  plus one selected output per logical partition can provide one committed contribution per
  stage. External side effects and source/sink commits need their own boundary proof.

## References

- [Java 25 `Collector` contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/stream/Collector.html)
- [MapReduce: Simplified Data Processing on Large Clusters](https://research.google/pubs/mapreduce-simplified-data-processing-on-large-clusters/)
- [HyperLogLog original analysis](https://algo.inria.fr/flajolet/Publications/FlFuGaMe07.pdf)

- [Aggregation correctness](references/aggregation-correctness.md) — identity,
  associativity, conditional commutativity and duplicate-attempt separation, with the
  safe/unsafe operation table and floating-point
  non-associativity problem and its three fixes, non-reducible aggregates rewritten with
  mergeable state, summaries with what each approximates and its error, and a
  determinism test that shuffles partition order. Read before writing a combiner, or when an
  aggregate does not reproduce.
- [Barriers, joins and partial failure](references/barriers-joins-and-partial-failure.md) —
  what a barrier costs, straggler mitigation and its safety conditions, the two join shapes
  with their selecting conditions and the skew failure, checkpoint placement, the
  partial-failure decision, and how to test a batch job with an injected task failure. Read
  when designing a job's stages, or when its wall-clock time is set by a few tasks.
