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

| Operation                 | Associative       | Commutative | Distributed form                                      |
| ------------------------- | ----------------- | ----------- | ----------------------------------------------------- |
| bounded integer sum/count | yes modulo width  | yes         | use checked/exact arithmetic if overflow is invalid   |
| min, max                  | yes               | yes         | min/max of the partials                               |
| bitwise OR/AND, set union | yes               | yes         | fold the partials                                     |
| sum of doubles            | **no** (rounding) | yes         | see below — fix or fix the type                       |
| average                   | no                | —           | carry `(sum, count)`, divide at the end               |
| variance, stddev          | no                | —           | carry `(n, mean, M2)`, merge with Chan's formula      |
| median, any percentile    | no                | —           | carry a mergeable histogram/digest                    |
| distinct count            | no                | —           | carry a HyperLogLog sketch, or exact sets while small |
| top-K by frequency        | no                | —           | carry a count-min sketch plus a candidate heap        |
| "first" / "last"          | no                | no          | needs an explicit ordering key, then min/max on it    |
| subtraction, division     | no                | no          | rewrite as a pair of reducible terms                  |

`java.util.stream.Collector` requires identity and associativity; ordered collectors can
preserve encounter order, while `UNORDERED` changes the equivalence relation. A parallel
stream is a useful local probe but not a substitute for property tests over arbitrary
partitioning.

## Floating-point addition is not associative

```java
double a = 1e16, b = -1e16, c = 1.0;
(a + b) + c;   // 1.0
a + (b + c);   // 0.0
```

Nothing here is a bug in Java; it is how binary floating point rounds. The distributed
consequence is that **the same input summed over a different partitioning gives a different
total**, and shuffles are not order-stable, so the difference appears between two runs of
identical code over identical data. It is small, it is real, and it is why a reconciliation
report will not tie out twice.

Three fixes. Name the one in use, in the code:

1. **Exact decimal or fixed point.** `BigDecimal.add` is exact when no finite-precision
   `MathContext` rounds intermediate results. Integer minor units are exact only until
   overflow, so use checked arithmetic or a wider representation and carry currency and
   scale. These are normally required for contractual monetary amounts; binary floating
   point remains legitimate for explicitly approximate analytics.
2. **Compensated summation** (Kahan, or Neumaier for wide-magnitude inputs). Carry a running
   correction term alongside the sum. This bounds the error; it does **not** make addition
   associative, so two partitionings may still differ — the difference is merely smaller.
3. **A deterministic order.** Sort each partition before summing and merge partitions in a
   fixed sequence (by partition id, not by arrival). This gives reproducibility without
   changing the type, at the cost of a sort and a barrier.

Do not assume two "sums of the same doubles" agree even inside one JVM: order and the
summation algorithm both move the result.

## Non-reducible aggregates, rewritten

```java
// Average: reduce the pair, divide once at the end.
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

- **Percentiles**: each worker emits an `HdrHistogram`/t-digest; the coordinator merges the
  structures and reads the quantile once. Emitting per-worker p99s destroys the information
  needed to compute the fleet's — the rule itself is `latency-statistics`.
- **Rate**: carry numerator and denominator; never average per-worker rates weighted by
  nothing.
- **"Latest value per key"**: needs a version or timestamp in the record so the merge is
  `max by version`, which _is_ associative. Without one, "last write wins" depends on
  arrival order and is not reducible at all.

## Mergeable summaries and what each trades

| Summary                 | Answers                           | Memory                      | Error                                                                 | Merge                     |
| ----------------------- | --------------------------------- | --------------------------- | --------------------------------------------------------------------- | ------------------------- |
| Exact set / sorted list | distinct, quantiles               | proportional to cardinality | none                                                                  | union, unbounded          |
| HyperLogLog             | distinct count                    | fixed by precision          | estimator/precision-specific error                                    | compatible-register max   |
| Count-min sketch        | non-negative frequencies          | fixed by width/depth        | one-sided error under its hash assumptions                            | sum compatible tables     |
| t-digest                | approximate quantiles             | compression-dependent       | implementation/data/order-dependent, often tail-oriented              | merge compatible digests  |
| HdrHistogram            | quantiles over a configured range | fixed by range/precision    | quantization; out-of-range behavior is implementation/config-specific | add compatible histograms |

Compatibility is part of every merge contract: precision, bounds, hash functions/seeds,
normalization and implementation version must match. A non-mergeable result may force raw
data retention, repartitioning or a centralized final step; a mergeable sketch bounds that
state in exchange for a quantified estimator error.

## The determinism test

```java
@RepeatedTest(20)
void aggregateIsIndependentOfPartitionOrder() {
    List<Partition> partitions = new ArrayList<>(fixedInput());
    Collections.shuffle(partitions, seededRandom());
    Result actual = partitions.stream()
        .map(Aggregator::fold)
        .reduce(Result.identity(), Result::merge);      // exercises combine in a new order
    assertThat(actual).isEqualTo(EXPECTED);             // exact equality, not a delta
}
```

Exact equality is appropriate only when the contract promises exact deterministic output.
Approximate sketches and floating-point analytics instead need documented error invariants
and a trusted oracle; a loose arbitrary tolerance proves little. Add generated tests for
empty input, singleton, extreme magnitudes, overflow, NaN/infinity policy, regrouping,
allowed reorderings, duplicate attempts and incompatible summary metadata.
