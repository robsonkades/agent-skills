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

`TreeSet` element lookup and `TreeMap` key lookup use their ordering relation. This does not
replace equality everywhere: `TreeMap.containsValue`, for example, uses value equality.
An ordering inconsistent with equality violates the general `Set`/`Map` contract even though
ordered-key behavior is defined. Swapping a `HashSet` for a `TreeSet` can therefore change
semantics. Document any intentional inconsistency and check the operations consumers use.

Keep ordering inputs stable for the whole membership lifetime, not just during a sort. Mutating
a key field or state captured by the comparator can leave a `TreeSet`/`TreeMap` indexed under its
old order; stable `equals`/`hashCode` does not repair lookup or ordered iteration. Remove a key
under the old order before changing it, then reinsert and check whether the new comparison ties
an existing key. Define rejection, coalescing or replacement rather than silently losing an entry.
If the ordering policy changes, rebuild by inserting entries under the new stable comparator;
do not rely on a bulk copy treating an already-invalid sorted source as sorted. Verify lookup,
iteration order and retained entries after the supported update, under the actual ownership protocol.

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

This is a partial Java 16+ sketch with omitted domain types/imports. Require non-null components
or define nullable-key ordering. A unique id orders distinct rows, but does not by itself make
comparison consistent with record equality: two representations of one id can have amounts
that `Money.byAmount()` treats equal while `Money.equals` distinguishes scale/currency. Test
`compareTo == 0` against `equals`, or document a separate presentation comparator instead.

- **Prefer comparison to subtraction.** Integer differences may overflow or narrow to a wrong
  sign; `(int) (a.amount - b.amount)` can also truncate a fractional difference to a false tie.
  A proven bounded integral difference can be valid, but the `compare`/`comparing*` factories
  express the contract without that range argument.
- **Use primitive-specialised factories** (`comparingInt`, `comparingLong`,
  `comparingDouble`) when a primitive key is hot: generic `comparing` requires a reference key
  and may box/materialize values. A comparison sort invokes extraction O(n log n) times in the
  usual case; profile before sacrificing a clearer domain comparator.
- **Do not compare `float`/`double` with `<`/`>` when `NaN` is reachable.** `Double.compare`
  defines a total order over all values (`NaN` greater than everything, `-0.0` less than
  `0.0`); the relational operators do not, and a sort over data containing `NaN` becomes
  order-dependent.
- **Extract cheaply.** The key extractor runs on every comparison; if it parses, formats,
  normalises or dereferences a lazy association, precompute the key or use a
  decorate-sort-undecorate (`Stream.map` to a pair, sort, map back).
- **Define the null contract.** Reject nulls at the boundary when they are invalid, or use
  `Comparator.nullsFirst` / `nullsLast` at the nullable element/key layer. A raw comparison may
  throw on null when that comparison is reached; exception location is not a contract diagnosis.

## "Comparison method violates its general contract!"

OpenJDK's ordinary object-array/list sorting paths commonly use TimSort, which detects some—not
all—inconsistent comparators and can throw
`IllegalArgumentException: Comparison method violates its general contract!`; the Java API does
not promise that every violation is detected or that every implementation uses that algorithm. Three
properties of this failure make it expensive:

- It is **input-shape-dependent**. Small or convenient inputs may not expose a cycle, so example
  tests pass and a production dataset fails.
- It is **late**. The exception surfaces during the sort, far from the comparator's
  definition.
- It is strong evidence that the comparator or mutable data it observes violates the contract.
  Switching algorithms or implementation properties can hide detection while leaving semantics
  invalid; repair and property-test the comparison relation.

Causes to investigate:

1. Subtraction overflow (above).
2. A comparator that reads mutable state, so the answer changes mid-sort — a
   comparator over a field another thread is updating, or over "distance from now" computed
   with `Instant.now()` inside the comparison.
3. Non-transitive "fuzzy" comparison: `if (Math.abs(a - b) < epsilon) return 0;` makes
   `a≈b`, `b≈c` but `a<c`, which is the textbook violation.
4. A comparator that special-cases some elements ("nulls last, but errors first, but
   pinned items always first") without those rules forming a single ordering.

One useful repair is a lexicographic chain of valid component orders. A branch-based comparator
is also valid when its relation satisfies the laws; syntax alone neither fixes nor diagnoses it.

## Total order is a distributed requirement, not a nicety

Pagination of distinct rows needs deterministic tie handling. Canonicalization needs to order
values whose encoded forms differ; identical encoded duplicates can remain interchangeable.
A total preorder sufficient for `Comparator` does not by itself establish either result contract:

```sql
-- keyset pagination over a non-unique sort key
ORDER BY issued_at DESC, id DESC      -- id is the tiebreaker; without it, rows repeat or vanish
```

- **Paging.** Two pages fetched by separate queries with ties broken arbitrarily can both
  return the same row, or skip one, because the database is free to order equal keys
  differently per execution. The client sees duplicates or gaps with no error anywhere.
  A unique tiebreaker resolves ties, not concurrent inserts/updates/deletes: match cursor
  predicates to sort directions and define snapshot/consistency semantics separately.
- **Cross-service comparison.** If two services sort the same collection to compute a hash, a
  digest, a canonical form or a diff, an unstable tiebreak makes their results differ for
  identical data. Specify order for unordered collections whose different serializations matter;
  preserve semantically ordered sequences and allow byte-identical ties. See idempotency and
  rpc-and-api-contracts for canonical encoding contracts.
- **Merges and reconciliations.** Ordering by timestamp alone across replicas is not total —
  clocks collide and are not monotonic between machines. A `(timestamp, node, sequence)`
  tuple distinguishes events only if its generation scope prevents reuse/collision, including
  restarts and sequence resets. consistency-models and message-ordering-and-partitioning cover
  what ordering can and cannot be assumed across a network.

## Stability, and when it is load-bearing

`List.sort` / `Arrays.sort` on objects are specified as **stable**: comparator-equal elements keep
their relative order. Primitive-array sort stability is not specified and equal primitive values
are observationally indistinguishable. `Stream.sorted` is stable for ordered streams; an
unordered source has no encounter-order promise. Default `groupingBy`/`toMap` do not promise map
iteration order; supply an ordered map factory when that is part of the result contract.

Stability is load-bearing whenever a multi-key sort is expressed as successive sorts (sort by
name, then by department) — a technique that is correct only with a stable sort, and which a
single composed comparator expresses more clearly anyway.

## Locale and text

`String.compareTo` compares UTF-16 code units. It is a reproducible total order, and it is
not a locale-sensitive alphabetical order: for example, it places `Z` before `a`. For
human-language sorting, consider `Collator.getInstance(locale)` and specify strength/rules.
For machine keys and canonical forms, follow the protocol's exact ordering; reproducibility alone
does not establish compatibility. [JCS (RFC 8785 §3.2.3)](https://www.rfc-editor.org/rfc/rfc8785.html#section-3.2.3)
orders property names by UTF-16 code units, while
[CBOR core deterministic encoding (RFC 8949 §4.2.1)](https://www.rfc-editor.org/rfc/rfc8949.html#section-4.2.1)
orders map keys by their encoded bytes: `"z"` (`61 7a`) precedes `"aa"` (`62 61 61`), unlike
`String.compareTo`. Preserve the selected encoding profile and verify its test vectors; do not
replace it with Java's natural order or a locale collation. Sorting in the database under one
collation and in Java under another can likewise break paging; pick the layer that owns the
order and let the other preserve it.

## Authoritative references

- [Comparable contract, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Comparable.html)
- [Comparator contract, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Comparator.html)
- [TreeSet ordering and lookup, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/TreeSet.html)
- [String.compareTo, Java SE 25](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/String.html#compareTo(java.lang.String)>)
- [List.sort stability contract, Java SE 25](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/List.html#sort(java.util.Comparator)>)
- [SortedMap equality caveat, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/SortedMap.html)
- [TreeMap key lookup and value equality, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/TreeMap.html)
