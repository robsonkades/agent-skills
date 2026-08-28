---
name: java-numeric-types
description: >
  Choosing and using Java's numeric types correctly: why float and double cannot represent
  decimal amounts, BigDecimal construction, scale, rounding and the equals/compareTo split,
  integer overflow and the exact-arithmetic methods, primitives versus boxed types, the
  Integer cache that makes == work for small values and fail for large ones, unboxing NPEs,
  boxing cost in bulk paths, and what happens to a numeric value when it crosses JSON, a
  database column or a JavaScript client. Use when money or any exact quantity is held in
  double or float, when new BigDecimal(double) appears, when divide() has no rounding mode,
  when BigDecimal values are compared with equals, when boxed types are compared with ==,
  when a nullable Integer is unboxed, when arithmetic on ids, timestamps or sizes could
  overflow, or when large longs are serialised to a browser. Does not cover date and time
  types, string formatting and parsing (java-strings-and-text), or measuring allocation
  (allocation-profiling).
---

# Java Numeric Types

## Purpose

Pick a numeric representation that can hold the values the domain actually has, and keep it
correct through arithmetic, comparison and every boundary it crosses. Two failure modes: the
monetary or measured value held in `double`, where the error is invisible per operation and
material after a million of them; and the boxed primitive whose `==`, `null` and allocation
behaviour differ from the primitive it looks like.

## Workflow

1. **Classify the quantity.** Exact decimal (money, tax, quantities in units) → `BigDecimal`
   or a `long` of minor units. Counting/identity → `int`/`long`. Physical measurement or
   statistics where relative error is acceptable → `double`. Never decide by what the JSON
   happens to contain.
2. **Fix the scale and rounding policy with the type**, not at each call site: every
   `divide` needs an explicit scale and `RoundingMode`, and the domain must state which one.
3. **Bound the range.** Check whether any product, sum or difference can exceed the type —
   ids, byte counts, milliseconds, accumulators — and use exact arithmetic where it can.
4. **Choose primitive or boxed deliberately.** Primitive unless absence is meaningful or a
   generic/collection requires the box.
5. **Check the boundaries.** Database column type and precision, JSON representation, the
   consumer's own numeric limits. A `long` id is not safe in a browser.
6. **Verify with adversarial values**: `0.1 + 0.2`, `Integer.MAX_VALUE + 1`, a null `Integer`,
   `1.0` versus `1.00`, a negative operand to `%`, `NaN` in a comparator.

## Rules

- Never use `float` or `double` for money or any value that must be exact. They are binary
  floating point: `0.1` has no exact representation, `0.1 + 0.2 != 0.3`, and errors accumulate
  in a direction the business will notice. Use `BigDecimal`, or a `long` holding minor units
  (cents) with the currency's scale known.
- Construct `BigDecimal` from a `String` or from `BigDecimal.valueOf(double)`, never
  `new BigDecimal(double)`: the latter captures the double's exact binary value
  (`new BigDecimal(0.1)` is `0.1000000000000000055511151231257827…`), which then propagates
  through every subsequent operation and comparison.
- `divide` without a scale and `RoundingMode` throws `ArithmeticException` for any
  non-terminating result — including `1/3`. Always pass both; the rounding mode is a business
  decision (`HALF_UP` for most invoicing, `HALF_EVEN` where statistical bias matters, and
  whatever the local tax authority mandates when it mandates one).
- `BigDecimal.equals` compares value **and scale**, so `1.0` does not equal `1.00`. Compare
  numerically with `compareTo(other) == 0`, and never put `BigDecimal` in a `HashSet` or use it
  as a map key expecting numeric identity. `TreeSet` uses `compareTo` and will silently treat
  them as one element — see java-object-contracts.
- Normalise before storing or comparing: `setScale(currency.scale(), roundingMode)`, not
  `stripTrailingZeros`. `stripTrailingZeros().toString()` produces scientific notation for
  values like `600` (`6E+2`); `toPlainString()` is the safe rendering.
- Integer arithmetic wraps silently. Use `Math.addExact`, `subtractExact`, `multiplyExact`,
  `incrementExact` and `toIntExact` wherever an overflow would be a defect rather than a
  wrap — id arithmetic, sizes, durations in millis, accumulators. `(low + high) / 2` in a
  binary search overflows for large arrays; `low + ((high - low) >>> 1)` does not.
- `%` on negative operands yields a negative result, which breaks the standard "hash into a
  bucket" idiom. Use `Math.floorMod(x, n)` (and `Math.floorDiv`) whenever the operand can be
  negative — a partition index computed from a hash is the case that reaches production.
- Never compare boxed types with `==`. The `Integer` cache holds `-128..127` (its upper bound
  is adjustable with `-XX:AutoBoxCacheMax`), so `==` compares equal for small values and
  unequal for large ones — code passes every test with small ids and fails with real ones. Use
  `equals`, or compare the unboxed primitives.
- An unboxing operation on a `null` box throws `NullPointerException` at a place with no
  visible dereference: `map.get(key) > 0`, `int total = nullableInteger`, a ternary mixing
  `Integer` and `int`. Where a value may be absent, keep it boxed and check, or model the
  absence explicitly — see java-null-safety.
- Prefer primitives; use boxed types when a collection, a generic type parameter, or a
  nullable column requires them. In bulk paths, boxing allocates one object per value: use
  `IntStream`/`LongStream`, `int[]`, `IntFunction` and friends rather than `Stream<Integer>`
  and `List<Integer>` — and confirm with allocation-profiling before restructuring code that
  is not hot.
- Mixing a boxed and a primitive operand auto-unboxes the box, so `Integer.equals` semantics
  and `==` semantics can both apply in the same expression depending on the other operand's
  type. Make the conversion explicit rather than relying on the reader to apply the rules.
- `NaN` breaks every comparison: `NaN != NaN`, and `<`/`>` are all false. Compare with
  `Double.compare` (which defines a total order), and validate at input that a computation
  cannot produce `NaN` or infinity where the domain forbids it.
- Do not use `double` for time arithmetic and do not do date arithmetic in millis. `Instant`,
  `Duration` and `Period` exist; `System.nanoTime()` is monotonic and meaningful only as a
  difference, `System.currentTimeMillis()` is wall-clock and can jump backwards.
- For random numbers, use `ThreadLocalRandom` for concurrency, `RandomGenerator` (Java 17+) to
  choose an algorithm explicitly, and `SecureRandom` for anything security-bearing — tokens,
  nonces, ids that must be unguessable. `Math.random()` shares one instance across threads and
  contends.
- Numbers change meaning at boundaries. A JSON number is a IEEE-754 double for many consumers,
  so a `long` above 2^53 loses precision in a browser and in some parsers; serialise large ids
  and monetary decimals as **strings**. In the database, use `DECIMAL/NUMERIC` with an explicit
  precision for money — never `FLOAT`/`REAL` — and make the Java scale match the column's.

## References

- [Decimals, money and rounding](references/decimals-and-money.md) — read when modelling a
  monetary or exact-decimal value, when choosing between `BigDecimal` and minor units, when
  rounding or allocation of a total across parts is involved, or when decimals cross a database
  or an API.
- [Integers, boxing and overflow](references/integers-boxing-and-overflow.md) — read when
  choosing between primitive and boxed types, when arithmetic could overflow, when `==` or
  `null` behaviour on boxed values is in question, or when boxing shows up in an allocation
  profile.
