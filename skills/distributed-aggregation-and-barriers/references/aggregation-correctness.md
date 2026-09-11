# Aggregation correctness

## The algebra a combiner must satisfy

A distributed reduce splits the input into partitions, folds each one, then combines the
partial results. The required laws depend on the execution contract:

- **Associativity** — `combine(combine(a, b), c) == combine(a, combine(b, c))`. Without it,
  the answer depends on how the input was split.
- **Identity** — combining with the empty state is equivalent to the original state.
- **Commutativity** — `combine(a, b) == combine(b, a)`. It is required when the engine may
  reorder partials or the result is declared unordered, but not for an ordered reduce whose
  engine preserves encounter order.

These laws do **not** make duplicate attempts safe. `sum(a, a)` is not `sum(a)`. The engine
must select one output per logical partition/attempt lineage, or the aggregate itself must be
idempotent under duplicate contribution (for example set union). Ordering, regrouping and
duplicate suppression are separate proof obligations.

| Operation                 | Associative             | Commutative | Distributed form                                                                  |
| ------------------------- | ----------------------- | ----------- | --------------------------------------------------------------------------------- |
| bounded integer sum/count | yes modulo width        | yes         | use checked/exact arithmetic if overflow is invalid                               |
| min, max                  | yes                     | yes         | min/max of the partials                                                           |
| bitwise OR/AND, set union | yes                     | yes         | fold the partials                                                                 |
| sum of doubles            | **no** (rounding)       | yes         | see below — fix or fix the type                                                   |
| average                   | no                      | —           | carry `(sum, count)`, divide at the end                                           |
| variance, stddev          | no                      | —           | carry `(n, mean, M2)`, merge with Chan's formula                                  |
| median, any percentile    | no                      | —           | carry a mergeable histogram/digest                                                |
| distinct count            | no                      | —           | carry a HyperLogLog sketch, or exact sets while small                             |
| top-K by frequency        | no                      | —           | carry a count-min sketch plus a candidate heap                                    |
| ordered "first" / "last"  | yes with empty identity | no          | preserve encounter order; for unordered input use min/max on a total ordering key |
| subtraction, division     | no                      | no          | rewrite as a pair of reducible terms                                              |

`java.util.stream.Collector` requires identity and associativity; ordered collectors can
preserve encounter order, while `UNORDERED` changes the equivalence relation. A parallel
stream is a useful local probe but not a substitute for property tests over arbitrary
partitioning.

Checked integer addition is not closed under arbitrary regrouping: `(MAX_VALUE + 1) + (-1)`
throws while `MAX_VALUE + (1 + -1)` fits. If signed inputs can cancel, accumulate in a sufficient
exact representation such as `BigInteger` and range-check at finish, or define a domain that
guarantees every partial fits. Specify result equivalence too: numerically equal `BigDecimal`
values with different scales are unequal under `equals`; use the scale/canonicalization policy
or `compareTo` when the contract is numeric equality.

## Floating-point addition is not associative

```java
double a = 1e16, b = -1e16, c = 1.0;
double left = (a + b) + c;   // 1.0
double right = a + (b + c);  // 0.0
```

Nothing here is a bug in Java; it is how binary floating point rounds. The distributed
consequence is that **the same input summed over a different partitioning can give a different
total**, and unordered shuffles can expose this between runs of
identical code over identical data. Cancellation can make relative error large; do not assume
the discrepancy is small or that every input produces a different result.

Three fixes. Name the one in use, in the code:

1. **Exact decimal or fixed point.** `BigDecimal.add` is exact when no finite-precision
   `MathContext` rounds intermediate results. Integer minor units are exact only until
   overflow, so use checked arithmetic or a wider representation and carry currency and
   scale. These are normally required for contractual monetary amounts; binary floating
   point remains legitimate for explicitly approximate analytics.
2. **Compensated summation** (Kahan, or Neumaier for wide-magnitude inputs). Carry a running
   correction term alongside the sum. This can reduce rounding error under the algorithm's
   assumptions; it does **not** make addition associative or guarantee a smaller discrepancy
   for every input. Specify non-finite/intermediate-overflow handling and validate the chosen
   accumulator and merge against an appropriate exact oracle and error contract.
3. **Deterministic evaluation.** Fix input, partition boundaries, order within each partition
   and merge tree/algorithm. Sorting local partitions and merging by ID alone does not preserve
   results when partition boundaries change. Specify whether reproducibility must survive a
   worker-count change; that stronger contract may need canonical global evaluation or an exact
   reproducible accumulator. Stable order is not an accuracy guarantee.

Do not assume two "sums of the same doubles" agree even inside one JVM: order and the
summation algorithm both move the result.

## Non-reducible aggregates, rewritten

```java
// Average: reduce the pair, divide once at the end.
// Partial JDK 16+ sketch; java.math.* and java.util.Optional imports omitted.
// Input contract: non-null sum/count, count >= 0; empty state is (ZERO, ZERO).
record SumCount(BigDecimal sum, BigInteger count) {
    SumCount merge(SumCount other) {                     // associative and commutative
        return new SumCount(sum.add(other.sum), count.add(other.count));
    }
    Optional<BigDecimal> average(int scale) {
        return count.signum() == 0 ? Optional.empty()
                : Optional.of(sum.divide(new BigDecimal(count), scale, RoundingMode.HALF_UP));
    }
}
```

- **Pooled percentiles**: each worker emits a compatible `HdrHistogram`/t-digest; the coordinator
  merges the structures and reads the quantile once. Per-worker p99s cannot reconstruct it.
  A mean of independent run-level p99s answers a different question — `latency-statistics`
  owns that distinction and the population/measurement boundary.
- **Rate**: define the exposure before merging denominators. For disjoint worker counts of
  100 and 200 during the same aligned 10-second window, fleet throughput is `300 / 10 = 30`
  events/s. Summing the overlapping durations gives `300 / 20 = 15` events per worker-second,
  a different statistic. Sum denominators only when those exposures are additive for the
  requested ratio; partial coverage does not silently become a full-window measurement.
- **"Latest value per key"**: use an explicit version/order key and deterministic tie-breaker
  for different records with equal versions. `max` on that total order can merge in any order;
  arrival-based last is only meaningful when the engine preserves the required encounter order.

## Mergeable summaries and what each trades

| Summary                    | Answers                           | Memory                                                            | Error                                                                 | Merge                                      |
| -------------------------- | --------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------ |
| Exact set                  | distinct                          | proportional to distinct cardinality                              | none                                                                  | union, unbounded                           |
| Exact sorted multiset/list | quantiles                         | proportional to input count, or distinct values plus exact counts | none                                                                  | merge preserving multiplicities, unbounded |
| HyperLogLog                | distinct count                    | fixed by precision                                                | estimator/precision-specific error                                    | compatible-register max                    |
| Count-min sketch           | non-negative frequencies          | fixed by width/depth                                              | one-sided error under its hash assumptions                            | sum compatible tables                      |
| t-digest                   | approximate quantiles             | compression-dependent                                             | implementation/data/order-dependent, often tail-oriented              | merge compatible digests                   |
| HdrHistogram               | quantiles over a configured range | fixed by range/precision                                          | quantization; out-of-range behavior is implementation/config-specific | add compatible histograms                  |

Compatibility is part of every merge contract: preserve units, input cohort/window and outcome
filters, and check precision, bounds, hashes/seeds, normalization and implementation versions.
Use only the algorithm's supported combinations or conversions and retain their error limits;
not every field must be identical. For example, HdrHistogram 2.2.2 can remap counts between
different precision layouts when values fit, but cannot recover the source's lost precision.
Successful library addition does not establish compatible measurement populations.
A non-mergeable result may force raw
data retention, repartitioning or a centralized final step. Bounded sketches trade storage for
their stated estimator/quantization errors. Count-min's one-sided property assumes non-negative
updates, compatible hashes and counters without overflow; a candidate heap needs its own
heavy-hitter coverage guarantee and does not make top-K exact. Approximate digest merges may
vary with grouping/order while satisfying the declared error contract.

## The determinism test

```java
@RepeatedTest(20)
void aggregateIsIndependentOfPartitionOrder(RepetitionInfo repetition) {
    List<Partition> partitions = new ArrayList<>(fixedInput());
    long seed = 10_000L + repetition.getCurrentRepetition();
    Collections.shuffle(partitions, new Random(seed)); // reproducible, varied trials
    Result actual = partitions.stream()
        .map(Aggregator::fold)
        .reduce(Result.identity(), Result::merge);      // exercises combine in a new order
    assertThat(actual).isEqualTo(EXPECTED);             // exact equality, not a delta
}
```

This partial JUnit Jupiter/AssertJ sketch assumes project fixtures and imports, including
`RepetitionInfo`; report the seed on failure. Reinitializing the same seed each repetition
would test the same permutation. Order trials do not exercise alternative partition boundaries
or merge trees, so generate those separately.

Exact equality is appropriate only when the contract promises exact deterministic output.
Approximate sketches and floating-point analytics instead need documented error invariants
and a trusted oracle; a loose arbitrary tolerance proves little. Add generated tests for
empty input, singleton, extreme magnitudes, overflow, NaN/infinity policy, regrouping,
allowed reorderings, duplicate attempts and incompatible summary metadata.

Sources: [BigDecimal arithmetic and equality](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/math/BigDecimal.html),
[DoubleStream summation accuracy and non-finite behavior](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/stream/DoubleStream.html#sum()>),
[HdrHistogram 2.2.2 merge implementation](https://github.com/HdrHistogram/HdrHistogram/blob/HdrHistogram-2.2.2/src/main/java/org/HdrHistogram/AbstractHistogram.java),
[Count-Min Sketch authors' reference](https://sites.google.com/site/countminsketch/),
and [t-digest implementation and accuracy discussion](https://github.com/tdunning/t-digest).
