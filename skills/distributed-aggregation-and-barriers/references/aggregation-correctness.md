# Aggregation correctness

## The algebra a combiner must satisfy

A distributed reduce splits the input into partitions, folds each one, then combines the
partial results. Two properties make that legal:

- **Associativity** — `combine(combine(a, b), c) == combine(a, combine(b, c))`. Without it,
  the answer depends on how the input was split.
- **Commutativity** — `combine(a, b) == combine(b, a)`. Without it, the answer depends on
  the order partial results arrive in, which no system guarantees across partitions
  (`message-ordering-and-partitioning`).

Retry makes both non-negotiable rather than merely desirable: a re-executed task re-enters
the combination at a different point, so an aggregation that is only correct in one order is
an aggregation that is only correct when nothing fails.

| Operation                 | Associative       | Commutative | Distributed form                                      |
| ------------------------- | ----------------- | ----------- | ----------------------------------------------------- |
| sum of integers, count    | yes               | yes         | sum the partials                                      |
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

`java.util.stream.Collector` states the same requirement on its combiner, and a parallel
stream will exercise it. A non-associative combiner in a sequential stream produces the
right answer for as long as nobody parallelises it.

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

1. **Fixed point.** `BigDecimal` with an explicit scale and `RoundingMode` on every division,
   or a `long` of minor units. Addition on both is exact, therefore associative. **Money is
   never a `double`, `float` or `Double`** — that is not a performance trade, it is the
   difference between an exact and an approximate total.
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
record SumCount(BigDecimal sum, long count) {
    SumCount merge(SumCount other) {                     // associative and commutative
        return new SumCount(sum.add(other.sum), count + other.count);
    }
    BigDecimal average(int scale) {
        return count == 0 ? BigDecimal.ZERO
                          : sum.divide(BigDecimal.valueOf(count), scale, RoundingMode.HALF_UP);
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

| Summary                 | Answers                                | Memory                         | Error                                                              | Merge                |
| ----------------------- | -------------------------------------- | ------------------------------ | ------------------------------------------------------------------ | -------------------- |
| Exact set / sorted list | distinct, quantiles                    | proportional to cardinality    | none                                                               | union, unbounded     |
| HyperLogLog             | distinct count                         | fixed, small                   | a stated relative error that grows as the sketch shrinks           | per-register maximum |
| Count-min sketch        | frequency of a key                     | fixed                          | over-estimates only; never under-estimates                         | element-wise sum     |
| t-digest                | quantiles, accurate at the tails       | fixed                          | relative, best near 0 and 1                                        | merge centroids      |
| HdrHistogram            | latency quantiles over a bounded range | fixed for the configured range | fixed relative, values above the range are not recorded truthfully | add                  |

The property that matters is the last column. **A summary you cannot merge forces every
record through one node**, which becomes the throughput ceiling and the single point of
failure for the whole job. Choosing a sketch is choosing a stated error in exchange for
keeping the aggregation distributed; choosing an exact structure is choosing that node.

## The determinism test

```java
@RepeatedTest(20)
void aggregateIsIndependentOfPartitionOrder() {
    List<Partition> partitions = new ArrayList<>(fixedInput());
    Collections.shuffle(partitions);                    // the shuffle a cluster gives free
    Result actual = partitions.stream()
        .map(Aggregator::fold)
        .reduce(Result.identity(), Result::merge);      // exercises combine in a new order
    assertThat(actual).isEqualTo(EXPECTED);             // exact equality, not a delta
}
```

Assert **exact** equality. A test written with a tolerance passes with a non-associative
combiner and therefore tests nothing that matters here. Run the same shape with a parallel
stream to catch a combiner that is only correct sequentially.
