# Decimals, money and rounding

## Why `double` is disqualified, concretely

```java
System.out.println(0.1 + 0.2);              // 0.30000000000000004
System.out.println(1.03 - 0.42);            // 0.6100000000000001
System.out.println(4.35 * 100);             // 434.99999999999994  -> (long) gives 434
```

`double` stores a binary fraction; decimal fractions like 0.1 are periodic in binary and are
rounded to 53 significant bits. Each operation rounds again. The consequences in a financial
system are not "tiny errors": they are a reconciliation that does not balance, a total that
differs from the sum of the lines shown to the customer, and a rounding direction that is
statistically biased.

`float` has only 24 bits of significand precision. It can still be appropriate for explicitly
error-tolerant, memory/vector-bandwidth-sensitive domains (for example some media or ML data),
but not for exact financial conservation.

## The two defensible representations

| Representation                  | Good for                                                | Watch out for                                                                                   |
| ------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `BigDecimal` + `Currency`       | general money, tax, rates, anything with variable scale | scale/rounding on every division; equals vs compareTo; allocation on very hot paths             |
| integral minor units + currency | high-volume ledgers with a fixed domain scale           | non-2-decimal/custom units; overflow; scaling at every boundary; migrations when policy changes |

Both must carry the currency. A bare `BigDecimal` amount with the currency "known from
context" is the same class of defect as a bare `String` id — see java-object-contracts and the
value-object discussion in java-immutability.

```java
public record Money(BigDecimal amount, Currency currency) implements Comparable<Money> {
    private static final int LEDGER_SCALE = 2; // example policy, not derived blindly from Currency

    public Money {
        Objects.requireNonNull(amount);
        Objects.requireNonNull(currency);
        amount = amount.setScale(LEDGER_SCALE, RoundingMode.UNNECESSARY);
    }                     // UNNECESSARY throws if the caller violates this ledger's input scale

    public Money plus(Money other) {
        requireSameCurrency(other);
        return new Money(amount.add(other.amount), currency);
    }

    public Money percentage(BigDecimal rate, RoundingMode mode) {
        return new Money(amount.multiply(rate).setScale(LEDGER_SCALE, mode), currency);
    }

    @Override public int compareTo(Money other) { requireSameCurrency(other); return amount.compareTo(other.amount); }
}
```

Points that generalise:

- **Normalize the scale in the constructor** when scale is part of the domain representation, so
  `equals` behaves as the value type intends. The scale must come from the product/ledger and may
  vary by instrument, operation or effective date; `Currency.getDefaultFractionDigits()` is only
  ISO metadata and returns `-1` for pseudocurrencies.
- **`RoundingMode.UNNECESSARY` at construction** turns "someone passed 10.005" into an
  exception at the boundary rather than a silent rounding deep in a calculation.
- **Currency mismatch is a domain error**, checked in the type, not at each call site.
- **Every operation that can lose precision takes a rounding mode** — or the type fixes one and
  documents it.

## Rounding

`RoundingMode` has eight values. Common choices illustrate different policies:

- `HALF_UP` — nearest neighbour, with exact ties rounded away from zero; common in human-facing
  decimal rules, but not a universal invoicing default.
- `HALF_EVEN` (banker's rounding)—reduces systematic tie bias under suitable data distributions;
  required by some financial and statistical standards.
- `CEILING`/`FLOOR`/`UP`/`DOWN` are directional policies and can be exactly what tax, fee or risk
  rules require, especially for negative values. Their names are not interchangeable.
- `UNNECESSARY` — asserts no rounding is needed; throws otherwise. Excellent as a guard.

`setScale(2)` without a mode throws when rounding is required, which is a safe default only
if you intend the exactness assertion. `MathContext` controls significant-digit precision;
`setScale` controls decimal places. Scientific algorithms often emphasize the former and ledger
posting the latter, but a domain may legitimately need both at different, explicitly named stages.

## Splitting and allocating

The classic bug: dividing a total into parts and having them not sum back.

```java
// Wrong: three rounded payments of 33.33 leave a cent unallocated from 100.00
BigDecimal each = amount.divide(BigDecimal.valueOf(3), LEDGER_SCALE, HALF_UP);

// Right: allocate integral minor units with an explicit, deterministic remainder rule
static List<BigInteger> allocateMinorUnits(BigInteger totalUnits, int parts) {
    if (parts <= 0) throw new IllegalArgumentException("parts must be positive");
    BigInteger[] qr = totalUnits.divideAndRemainder(BigInteger.valueOf(parts));
    int extras = qr[1].abs().intValueExact(); // remainder magnitude is less than parts
    BigInteger adjustment = BigInteger.valueOf(qr[1].signum());
    return IntStream.range(0, parts)
        .mapToObj(i -> qr[0].add(i < extras ? adjustment : BigInteger.ZERO))
        .toList();
}
```

Any split — instalments, tax across lines, a discount over a basket — needs an allocation
routine with a stated remainder rule, and a test asserting that the parts sum exactly to the
whole. This is the single most common source of "off by one cent" tickets.

## Comparison and collections

```java
new BigDecimal("1.0").equals(new BigDecimal("1.00"));      // false — scale differs
new BigDecimal("1.0").compareTo(new BigDecimal("1.00"));   // 0     — numerically equal
```

- Use `compareTo(...) == 0` for numeric equality; use `equals` when representation/scale is
  intentionally part of identity. Encode that choice in a domain type rather than alternating
  conventions at call sites.
- `BigDecimal` in a `HashSet`/`HashMap` key position obeys `equals`, so `1.0` and `1.00` are
  two entries; in a `TreeSet`/`TreeMap` they are one. Normalising the scale in a wrapper type
  removes the whole problem, which is another argument for `Money` over raw `BigDecimal`.
- `stripTrailingZeros()` can canonicalize numerically equal cohorts, but it may produce a negative
  scale and scientific notation (`new BigDecimal("600").stripTrailingZeros().toString()` is
  `6E+2`). It is therefore not a fixed-scale money policy. `toPlainString()` avoids exponent
  notation, but an API still needs an explicit lexical scale/trailing-zero contract.

## Crossing boundaries

**Database.** `DECIMAL(p, s)` / `NUMERIC(p, s)` with explicit precision and scale; never
`FLOAT`, `REAL` or `DOUBLE PRECISION` for money. Make the Java policy compatible with the column
scale and verify the driver/database rounding-or-rejection mode—a mismatch need not fail loudly.
Sum in the database when summing many
rows, and be aware that a `SUM` of a `DECIMAL` may promote precision.

**JSON and APIs.** A JSON number is parsed as a double by JavaScript and by many parsers, so
`19.99` may arrive as `19.989999999999998`, and a 19-digit id loses its low bits. Serialise
monetary amounts as strings (`"19.99"`) or as an object `{"amount": "19.99", "currency": "BRL"}`,
and configure the mapper accordingly (Jackson:
bind directly to `BigDecimal`; `USE_BIG_DECIMAL_FOR_FLOATS` affects untyped `Object`/`Number`/map
content rather than typed `BigDecimal` properties). A decimal token can be parsed without binary
loss, but lexical scale and trailing-zero preservation are separate contract choices. Document
the representation in the contract—rpc-and-api-contracts.

**Aggregation across services.** Summing decimals is associative only if no rounding happens
in between; if each service rounds its own subtotal, the total depends on the partitioning of
the work. Decide where rounding happens — once, at the end, or per line with a documented rule
— and make it part of the contract, not an emergent property of how many shards processed the
batch. distributed-aggregation-and-barriers covers the general problem.

## Performance, in proportion

`BigDecimal` is immutable and commonly stores either a compact `long` or a `BigInteger`; many
operations produce new values, though constants/reuse and JIT optimization affect actual
allocation. For ordinary request-scoped business logic this is often negligible, but only a
profile establishes that. It becomes relevant in tight loops over large datasets
(risk engines, batch revaluation), and the answer there is `long` minor units with explicit
scaling, not `double`. Measure before switching: allocation-profiling shows whether
`BigDecimal` is actually on the hot path, and jmh-microbenchmarks is how to compare the two
representations honestly.

## Authoritative references

- [BigDecimal API, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/math/BigDecimal.html)
- [RoundingMode API, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/math/RoundingMode.html)
- [Currency API, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Currency.html)
- [RFC 8259: JSON number interoperability](https://www.rfc-editor.org/rfc/rfc8259#section-6)
