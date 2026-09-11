# Integers, boxing and overflow

Expression-only blocks are REPL illustrations rather than complete Java statements; snippets
omit domain variables/imports. Guidance uses Java 17 as the reference baseline unless stated.

## Overflow is silent

```java
int a = Integer.MAX_VALUE;
a + 1;                                   // -2147483648, no exception, no warning

int millis = (int) Duration.ofDays(30).toMillis();   // 2_592_000_000 does not fit in int
long total = quantity * unitPriceCents;              // both int -> the multiplication is int
```

The third line is the shape that reaches production: the result type of `int * int` is `int`,
and the widening to `long` happens **after** the overflow. Fixes, in order of preference:

- **Use `long` for the operands**, not just the result: `(long) quantity * unitPriceCents`.
- **Use the exact methods** where overflow means a bug: `Math.addExact`, `subtractExact`,
  `multiplyExact`, `incrementExact`, `negateExact`, `toIntExact`. They throw
  `ArithmeticException` instead of wrapping, converting silent corruption into a stack trace at
  the right line.
- **Validate the range at the boundary** where the value enters, so the arithmetic downstream is
  provably safe.

Places to check by habit: id and sequence arithmetic, byte counts and file sizes, durations in
milliseconds or nanoseconds, accumulators in long-running loops, `hashCode` combinations
(overflow there is harmless and intended), and array index arithmetic such as `(low + high) / 2`
— for ordered nonnegative array bounds use `low + ((high - low) >>> 1)`.
Integer division of `MIN_VALUE` by `-1` is another silent overflow, even though division by
zero throws. Explicitly reject that pair for exact division. A narrowing cast can also discard
bits; `Math.toIntExact` checks a long-to-int conversion.

## Negative operands: `%` and `/`

```java
-7 % 3      // -1  (sign follows the dividend)
-7 / 3      // -2  (truncates towards zero)
Math.floorMod(-7, 3)   // 2
Math.floorDiv(-7, 3)   // -3
```

`%` is a remainder, not a modulus. The bug this causes: `hash % partitions` with a negative
hash yields a negative index — `ArrayIndexOutOfBoundsException`, or a partition that never
receives traffic. `Math.floorMod` is correct for bucketing, and note that
`Math.abs(Integer.MIN_VALUE)` is still negative, so `abs(hash) % n` is not a fix.

## Boxed types are objects, with object semantics

```java
Integer a = 127, b = 127;
Integer c = 128, d = 128;
a == b;        // true  — both come from the Integer cache
c == d;        // not portable; usually false with HotSpot's default cache
```

For boxing of constant expressions, the JLS guarantees identity for booleans, ASCII characters
and integral values from `-128` through `127`; implementations may cache more. HotSpot has an
`Integer` cache tuning flag, but application correctness must not depend on it.
`Boolean.valueOf` returns the two constants. Using `==` for boxed value equality is a bug that
unit tests with small numbers can miss; explicit object-identity comparison has a different contract.

Three more behaviours to have memorised:

- **Unboxing throws on null.** `int n = map.get(missing);` and `if (flags.get(k))` throw
  `NullPointerException` from a line containing no visible dereference — the exception message
  can identify unboxing when helpful VM-generated NPE detail is enabled. Message text is not
  a portable exception contract; inspect the actual expression and stack.
- **Mixed operands unbox.** `Integer x; int y; x == y` compares _values_ because `x` is
  unboxed — so the same operator means different things depending on the other operand's type.
  Write `x.intValue() == y` or `Objects.equals(x, y)` and say which you meant.
- **`Integer.equals` is type-sensitive.** `Integer.valueOf(1).equals(Long.valueOf(1))` is
  `false`. A map keyed by `Long` and looked up with an `Integer` finds nothing, silently.

## Choosing primitive or boxed

Primitive by default. Boxed when:

- a collection or generic type parameter requires it (`List<Integer>`, `Map<Long, Order>`);
- the value is genuinely optional and `null` is the encoding of that (a nullable column, an
  unset request field) — and then the nullability belongs in the API contract (java-null-safety);
- the actual framework/lifecycle contract uses a nullable value, such as an unassigned identifier.
  Jakarta Persistence permits primitive and wrapper IDs; inspect mapping and new-entity detection
  rather than treating every JPA identifier as requiring a box.

Avoid a boxed type as a counter, loop variable or accumulator on a material path. The classic:

```java
Long sum = 0L;
for (long i = 0; i < 1_000_000; i++) sum += i; // boxing each iteration; escaped/materialized cost is runtime-dependent
```

## Boxing cost, in proportion

A materialized box is an object header plus the value—for `Integer`, often 16 bytes on a
64-bit HotSpot configuration with compressed class/oop pointers, but measure with JOL on the
target runtime. Caches and escape analysis may avoid some allocations; boxes that escape into a
collection generally remain. The cost can include allocation/GC, indirection, locality and
memory bandwidth, not merely arithmetic.

Where it matters (bulk data paths, per-element pipelines over millions of items), compare these
candidates against null/absence, key density/range, growth, ordering and public API contracts.
Preserve arithmetic semantics too: `IntStream.sum()` uses wrapping `int` addition, so it cannot
replace a checked reduction unchanged. Wider accumulation still needs its own range proof.

| Instead of                        | Use                                                            |
| --------------------------------- | -------------------------------------------------------------- |
| `Stream<Integer>`                 | `IntStream` (`mapToInt`, `sum`, `summaryStatistics`)           |
| `List<Integer>` as a dense buffer | `int[]`                                                        |
| `Map<Integer, V>` in a hot loop   | an array indexed by the key, or a primitive-collection library |
| `Function<Integer, Integer>`      | `IntUnaryOperator`                                             |
| `Optional<Integer>` in a hot path | `OptionalInt`                                                  |

Where it usually does not matter—request-scoped code touching a few dozen values—the boxed forms
may be clearer and the difference is unlikely to be material. Confirm with allocation-profiling that boxing
is actually on the path before restructuring anything; "boxing is slow" is one of the folklore
claims performance-methodology exists to discipline.

## Ids, and what happens to them at the edges

- **Large `long` ids are unsafe as JavaScript Numbers.** Every integer within
  `[-(2^53-1), 2^53-1]` is safely distinguishable; beyond that some adjacent integers collapse
  even though some larger values are exact. Use a string/lossless contract end-to-end.
- **`int` ids can run out.** A signed 32-bit positive sequence reaches its limit near 2.1 billion,
  but exhaustion time depends on allocation gaps, retries and sequence caching—not just live rows.
  The failure mode is an insert error in production at a time nobody chose. Start with `long`/
  `bigint` unless the table is provably bounded.
- **UUIDs are 128 bits** and do not fit any primitive; stored as `char(36)` they cost index
  space and locality, stored as `binary(16)` they are compact but need a canonical byte order.
  UUIDv7 places a timestamp first to support time ordering; actual index locality and cost still
  depend on storage/comparison order, generation and workload.
- **Random ids need `SecureRandom`** when guessing one has consequences.
  `ThreadLocalRandom`/ordinary `RandomGenerator`s are non-cryptographic regardless of apparent
  statistical quality.

## Review checks

- [ ] Check both signed bounds on products, sums, differences and conversions; use exact methods
      where overflow/underflow is a defect, retaining deliberate modular/hash arithmetic.
- [ ] For bucket indices with positive bucket count, `Math.floorMod` handles negative hashes;
      retain truncating remainder where that is the intended arithmetic contract.
- [ ] Boxed comparisons distinguish value equality from intentional object identity; no accidental
      `==`/`!=` value comparisons.
- [ ] Every unboxing site has a proven non-null source, or the value stays boxed.
- [ ] Boxed accumulators or loop variables on a measured material path have been evaluated.
- [ ] Primitive specialisations preserve absence, range, collection and arithmetic contracts —
      with a profile, not a hunch, when the change costs readability.
- [ ] Large ids retain their exact value through every consumer: use a string contract or a verified
      lossless parser/encoding, preserving compatibility when changing a public representation.

## Authoritative references

- [JLS 17 integer division](https://docs.oracle.com/javase/specs/jls/se17/html/jls-15.html#jls-15.17.2)
- [JLS §5.1.7: Boxing Conversion](https://docs.oracle.com/javase/specs/jls/se25/html/jls-5.html#jls-5.1.7)
- [JLS §5.6: Numeric Contexts and Promotions](https://docs.oracle.com/javase/specs/jls/se25/html/jls-5.html#jls-5.6)
- [Math exact-arithmetic API, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Math.html)
- [IEEE 754 floating-point arithmetic](https://standards.ieee.org/ieee/754/6210/)
