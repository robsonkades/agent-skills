# Ordering and comparators

## The Comparable contract

For all `x`, `y`, `z` of the type:

- `sgn(x.compareTo(y)) == -sgn(y.compareTo(x))`, and `x.compareTo(y)` throws exactly when
  `y.compareTo(x)` throws.
- Transitive: `x.compareTo(y) > 0` and `y.compareTo(z) > 0` implies `x.compareTo(z) > 0`.
- Substitutable equals: `x.compareTo(y) == 0` implies `sgn(x.compareTo(z)) == sgn(y.compareTo(z))`
  for every `z`.
- **Strongly recommended, not required:** `x.compareTo(y) == 0` iff `x.equals(y)`.

The last one is the one the JDK itself breaks, deliberately, and the break is worth knowing
because it changes program behaviour rather than style:

```java
Set<BigDecimal> hash = new HashSet<>(List.of(new BigDecimal("1.0"), new BigDecimal("1.00")));
Set<BigDecimal> tree = new TreeSet<>(List.of(new BigDecimal("1.0"), new BigDecimal("1.00")));
hash.size();   // 2 — equals() compares scale as well as value
tree.size();   // 1 — compareTo() compares numeric value only
```

`TreeSet`, `TreeMap`, `SortedMap` and the sorted views ignore `equals` entirely: membership,
lookup and deduplication are all decided by `compareTo`/`Comparator`. A class whose ordering
is inconsistent with equality therefore behaves differently in a sorted collection, and any
`Set` swapped from `HashSet` to `TreeSet` for "determinism" silently changes semantics.
Document the inconsistency in the Javadoc when it exists, as `BigDecimal` does.

## Writing it

Prefer building the comparator over hand-writing the arithmetic:

```java
public record Invoice(Instant issuedAt, Money total, UUID id) implements Comparable<Invoice> {
    private static final Comparator<Invoice> ORDER =
        Comparator.comparing(Invoice::issuedAt)
                  .thenComparing(Invoice::total, Money.byAmount())
                  .thenComparing(Invoice::id);        // tiebreaker: makes the order total

    @Override public int compareTo(Invoice other) { return ORDER.compare(this, other); }
}
```

Rules encoded there:

- **Never subtract.** `(int)(a.millis - b.millis)`, `a.count - b.count` and
  `(int) (a.amount - b.amount)` all overflow and return a wrong _sign_ — the bug appears only
  for operands far apart, so it survives testing and corrupts a sort in production. Use
  `Integer.compare` / `Long.compare` / `Double.compare`, or the `comparing*` factories.
- **Use the primitive-specialised factories** (`comparingInt`, `comparingLong`,
  `comparingDouble`) when the key is primitive: `Comparator.comparing` boxes on every
  comparison, and a sort calls the extractor O(n log n) times.
- **Do not compare `float`/`double` with `<`/`>` when `NaN` is reachable.** `Double.compare`
  defines a total order over all values (`NaN` greater than everything, `-0.0` less than
  `0.0`); the relational operators do not, and a sort over data containing `NaN` becomes
  order-dependent.
- **Extract cheaply.** The key extractor runs on every comparison; if it parses, formats,
  normalises or dereferences a lazy association, precompute the key or use a
  decorate-sort-undecorate (`Stream.map` to a pair, sort, map back).
- **Nulls are a design decision, not a `NullPointerException`.** `Comparator.nullsFirst` /
  `nullsLast` state it explicitly; a raw `Comparator.comparing` on a nullable key throws
  during the sort, from inside TimSort, with a stack trace that names none of your code.

## "Comparison method violates its general contract!"

`List.sort`, `Arrays.sort` (object overloads), `Collections.sort` and `Stream.sorted` use
TimSort, which detects some — not all — inconsistent comparators and throws
`IllegalArgumentException: Comparison method violates its general contract!`. Three
properties of this failure make it expensive:

- It is **input-dependent**. Small inputs run the binary-insertion path and never detect
  anything, so unit tests pass and the production dataset fails.
- It is **late**. The exception surfaces during the sort, far from the comparator's
  definition.
- It means the comparator is wrong, **not** that the sort is buggy. Setting
  `java.util.Arrays.useLegacyMergeSort=true` hides the detection and leaves a mis-sorted
  list — never the fix.

The usual causes, in order of frequency:

1. Subtraction overflow (above).
2. A comparator that reads mutable state, so the answer changes mid-sort — a
   comparator over a field another thread is updating, or over "distance from now" computed
   with `Instant.now()` inside the comparison.
3. Non-transitive "fuzzy" comparison: `if (Math.abs(a - b) < epsilon) return 0;` makes
   `a≈b`, `b≈c` but `a<c`, which is the textbook violation.
4. A comparator that special-cases some elements ("nulls last, but errors first, but
   pinned items always first") without those rules forming a single ordering.

The repair is always to reduce the rules to one lexicographic chain of total orders —
`thenComparing` composed from comparisons that are individually total — rather than a series
of `if` branches.

## Total order is a distributed requirement, not a nicety

Any ordering consumed by more than one process, or by more than one query, must break ties
deterministically:

```sql
-- keyset pagination over a non-unique sort key
ORDER BY issued_at DESC, id DESC      -- id is the tiebreaker; without it, rows repeat or vanish
```

- **Paging.** Two pages fetched by separate queries with ties broken arbitrarily can both
  return the same row, or skip one, because the database is free to order equal keys
  differently per execution. The client sees duplicates or gaps with no error anywhere.
- **Cross-service comparison.** If two services sort the same collection to compute a hash, a
  digest, a canonical form or a diff, an unstable tiebreak makes their results differ for
  identical data. Canonical encodings (for signatures, idempotency keys, cache keys) must
  define a total order on every collection they serialise; see idempotency and
  rpc-and-api-contracts.
- **Merges and reconciliations.** Ordering by timestamp alone across replicas is not total —
  clocks collide and are not monotonic between machines. A `(timestamp, node, sequence)`
  tuple is; consistency-models and message-ordering-and-partitioning cover what ordering can
  and cannot be assumed across a network.

## Stability, and when it is load-bearing

`List.sort` / `Arrays.sort` on objects are **stable**: equal elements keep their relative
order. `Arrays.sort` on primitives (dual-pivot quicksort) is not, and stability is meaningless
there since equal primitives are indistinguishable. `Stream.sorted` is stable for ordered
streams; a parallel stream over an _unordered_ source has no such guarantee, and
`Collectors.toMap`/`groupingBy` say nothing about encounter order unless you ask for a
`LinkedHashMap`.

Stability is load-bearing whenever a multi-key sort is expressed as successive sorts (sort by
name, then by department) — a technique that is correct only with a stable sort, and which a
single composed comparator expresses more clearly anyway.

## Locale and text

`String.compareTo` compares UTF-16 code units. It is a total order, it is stable, and it is
**not** alphabetical for any human language: it places `Z` before `a`, and it misorders every
accented character. For anything a user reads, use `Collator.getInstance(locale)`; for
anything a machine reads (keys, ids, canonical forms) keep the code-unit order precisely
because it is locale-independent and reproducible. Mixing the two — sorting in the database
under one collation and in Java under another — produces pages that disagree with themselves;
pick the layer that owns the order and let the other one preserve it.
