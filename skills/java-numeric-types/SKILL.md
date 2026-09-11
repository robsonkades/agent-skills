---
name: java-numeric-types
description: >
  Choosing and using Java's numeric types correctly: binary floating-point limits for exact
  decimal amounts, BigDecimal construction, scale, rounding and the equals/compareTo split,
  integer overflow and the exact-arithmetic methods, primitives versus boxed types, the
  boxed-value caching that makes == appear to work for some values, unboxing NPEs,
  boxing cost in bulk paths, and what happens to a numeric value when it crosses JSON, a
  database column or a JavaScript client. Use when money or any exact quantity is held in
  double or float, when new BigDecimal(double) appears, when divide() has no rounding mode,
  when BigDecimal values are compared with equals, when boxed types are compared with ==,
  when a nullable Integer is unboxed, when arithmetic on ids, timestamps or sizes could
  overflow, or when large longs are serialised to a browser. Does not cover date and time
  types, general text encoding and locale APIs (java-strings-and-text), or measuring allocation
  (allocation-profiling).
---

# Java Numeric Types

## Purpose

Pick a numeric representation that can hold the values the domain actually has, and keep it
correct through arithmetic, comparison and every boundary it crosses. Two failure modes: the
exact decimal value held in `double`, where error can cross a rounding or reconciliation
boundary after repeated operations; and the boxed primitive whose `==`, `null` and allocation
behaviour differ from the primitive it looks like.

## Workflow

0. **Inspect compatibility and contracts.** Read compiler release/toolchains, serializer and
   JDBC/database versions, schema constraints and consumer numeric types. The references use
   Java 17-compatible code (records and `Stream.toList()` need Java 16+, `RandomGenerator`
   Java 17+). Preserve the target; use existing classes/collectors rather than upgrading.
   If range, rounding or boundary policy is absent, identify the missing decision before
   changing persisted values or a public JSON representation.
1. **Classify the quantity.** Exact decimal (money, tax, decimal contractual units) →
   `BigDecimal` or integral minor units. Counting/identity → `int`/`long`. Physical measurement
   or statistics where bounded floating-point error is acceptable → `double`. Never decide by
   what the JSON happens to contain.
2. **Fix precision, scale and rounding policy with the domain type**, not ad hoc at call sites.
   Any operation that can be inexact needs a specified `RoundingMode` and either result scale or
   `MathContext`; exact-only operations may deliberately throw.
3. **Bound the range.** Check whether any product, sum, difference or conversion can exceed the type —
   ids, byte counts, milliseconds, accumulators — and use exact arithmetic where it can.
4. **Choose primitive or boxed deliberately.** Primitive unless absence is meaningful or a
   generic/collection requires the box.
5. **Check the boundaries.** Database column type and precision, JSON representation, the
   consumer's own numeric limits. A `long` above JavaScript's exact integer range is not safe as
   a browser JSON number.
6. **Verify with adversarial values**: `0.1 + 0.2`, `Integer.MAX_VALUE + 1`, a null `Integer`,
   `1.0` versus `1.00`, a negative operand to `%`, `NaN` in a comparator.

## Rules

- Do not use `float` or `double` where decimal identity or exact conservation is required. They
  are binary floating point: `0.1` has no exact representation, and repeated rounding error can
  accumulate or cancel depending on the algorithm. Use `BigDecimal` or integral units with a
  domain-defined scale. Use floating point when its range, throughput and error model fit—and
  specify tolerances and treatment of NaN/infinity/signed zero.
- Construct a decimal received as text directly from that text; routing it through `double`
  already loses information. `BigDecimal.valueOf(double)` preserves the double's canonical
  decimal rendering and is usually the right conversion when a double is the actual source.
  `new BigDecimal(double)` deliberately captures the exact binary floating-point value
  (`new BigDecimal(0.1)` is `0.1000000000000000055511151231257827…`), which then propagates
  through subsequent operations; use it only when that exact binary value is the intended data.
- `divide(divisor)` throws `ArithmeticException` when the exact quotient has a non-terminating
  decimal expansion—including `1/3`. This can be a useful exactness assertion. Otherwise choose
  an overload with an explicit result scale and rounding mode, or a domain `MathContext` when
  significant-digit precision is the policy. Never invent a default: contractual and regulatory
  rules decide where and how rounding occurs.
- `BigDecimal.equals` compares value **and scale**, so `1.0` does not equal `1.00`. Compare
  numerically with `compareTo(other) == 0`; raw hash keys remain scale-sensitive unless the
  domain canonicalizes them consistently. A naturally ordered `TreeSet` treats these values as
  one element; an explicit comparator defines its own equivalence — see java-object-contracts.
- Normalize to a fixed scale only when defined by the domain/ledger contract—not
  blindly to `Currency.getDefaultFractionDigits()`, which is an ISO default and returns `-1` for
  pseudocurrencies. Use `setScale(domainScale, roundingMode)`, not
  `stripTrailingZeros` for fixed-scale money. For scale-insensitive non-money identity,
  canonicalization may be appropriate. `stripTrailingZeros().toString()` can produce `6E+2`;
  `toPlainString()` avoids exponents but requires bounded precision/scale for untrusted values
  because expansion can be huge. Choose the wire format explicitly.
- Integer arithmetic wraps silently. Use `Math.addExact`, `subtractExact`, `multiplyExact`,
  `incrementExact` and `toIntExact` wherever an overflow would be a defect rather than a
  wrap — id arithmetic, sizes, durations in millis, accumulators. `(low + high) / 2` in a
  binary search can overflow; `low + ((high - low) >>> 1)` is safe for ordered nonnegative
  array bounds. Integer `MIN_VALUE / -1` also overflows silently; reject that pair when exact
  division is required, and range-check narrowing casts before they discard bits.
- `%` with a negative dividend can yield a negative remainder (exact multiples yield zero), which breaks the standard "hash into a
  bucket" idiom. With a positive bucket count, use `Math.floorMod(x, n)` (and understand
  `floorDiv`) when the operand can be negative—a partition index computed from a hash is the
  case that reaches production. Zero divisors still fail, and a negative divisor changes the
  result range.
- Do not use `==` for boxed numeric value equality. Boxing of certain constant expressions in
  the JLS guarantees identity in the `-128..127` range; HotSpot may cache more (for `Integer`,
  implementation flags can affect it), while separately created boxes need not be identical.
  Use null-safe `equals` or deliberately unbox after proving non-null.
- An unboxing operation on a `null` box throws `NullPointerException` at a place with no
  visible dereference: `map.get(key) > 0`, `int total = nullableInteger`, a ternary mixing
  `Integer` and `int`. Where a value may be absent, keep it boxed and check, or model the
  absence explicitly — see java-null-safety.
- Prefer primitives when absence/object identity is not part of the model; use boxed types when a collection, a generic type parameter, or a
  nullable column requires them. In bulk paths, boxes that escape caches/JIT elimination can
  materialize one object per value: use
  `IntStream`/`LongStream`, `int[]`, `IntFunction` and friends rather than `Stream<Integer>`
  and `List<Integer>` — and confirm with allocation-profiling before restructuring code that
  is not hot.
- Mixing a boxed and a primitive operand auto-unboxes the box, so `Integer.equals` semantics
  and `==` semantics can both apply in the same expression depending on the other operand's
  type. Make the conversion explicit rather than relying on the reader to apply the rules.
- NaN makes primitive equality/order surprising: `NaN != NaN`, and `<`/`>` are false.
  `Double.compare` supplies the total order used by Java comparators, including signed zero;
  choose deliberately whether that representation order matches domain equality. Reject NaN
  and infinity at ingress when the domain forbids them.
- Preserve exact temporal arithmetic with appropriate units and `Instant`, `Duration` or `Period`
  rather than treating calendar changes as fixed milliseconds. Approximate elapsed-time statistics
  may use floating point under the stated error model. `System.nanoTime()` is meaningful only as a
  difference, `System.currentTimeMillis()` is wall-clock and can jump backwards.
- For random numbers, use `ThreadLocalRandom` for independent non-secure concurrent draws,
  `RandomGenerator` (Java 17+) when algorithm/splitting/jump semantics matter, and
  `SecureRandom` for security-bearing tokens, nonces and unguessable ids. Do not make performance
  or reproducibility claims about `Math.random()` without measuring the target JDK, and never use
  it for security.
- Numbers change meaning at boundaries. JavaScript Number cannot distinguish every integer
  outside `[-(2^53-1), 2^53-1]`; some larger integers remain exactly representable. Use a
  string contract for large ids/exact decimals when binary-number consumers must preserve them,
  or an explicitly verified lossless parser contract. Treat a number-to-string API change as
  a compatibility migration. In the database, use `DECIMAL/NUMERIC` with an explicit
  precision for decimal money, or a suitably ranged integral column for the declared minor-unit
  contract—not `FLOAT`/`REAL` for exact conservation. Keep Java's scale/rounding policy compatible
  with the column and driver behaviour.

## Deliverable

State the representation, valid range, equality and rounding stages, boundary encoding and
behavior on overflow/absence/non-finite input. Show the failing input and checks actually run;
separate arithmetic tests from serializer/database round trips and measured allocation evidence.

## Diagnostic map

| Symptom                                             | Distinguish with                                                                                        | Likely direction                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| totals differ by cents across paths/services        | capture unrounded operands, scale and rounding stage at every boundary                                  | centralize the contractual rounding/allocation policy; replay the same inputs  |
| `ArithmeticException` in decimal arithmetic         | separate divide-by-zero, non-terminating quotient and `UNNECESSARY` loss                                | fix invalid input or select the specified scale/precision and rounding policy  |
| map/set cannot find a visually equal decimal        | inspect bounded value text, precision/scale and collection/comparator kind; bound plain expansion first | preserve the required numeric or scale-sensitive identity                      |
| negative bucket/index only for some hashes          | reproduce `MIN_VALUE`, negative operands and positive divisor                                           | use `floorMod`; remove `abs(x) % n`                                            |
| id changes only in JavaScript/browser clients       | compare original digits and test values around 2^53                                                     | preserve exact ids with a string contract or verified lossless parser/encoding |
| high allocation rate in an arithmetic/bulk pipeline | profile allocation sites and escaped boxes/`BigDecimal` operations                                      | specialize representation only after correctness and benchmark validation      |

## References

- [Decimals, money and rounding](references/decimals-and-money.md) — read when modelling a
  monetary or exact-decimal value, when choosing between `BigDecimal` and minor units, when
  rounding or allocation of a total across parts is involved, or when decimals cross a database
  or an API.
- [Integers, boxing and overflow](references/integers-boxing-and-overflow.md) — read when
  choosing between primitive and boxed types, when arithmetic could overflow, when `==` or
  `null` behaviour on boxed values is in question, or when boxing shows up in an allocation
  profile.
