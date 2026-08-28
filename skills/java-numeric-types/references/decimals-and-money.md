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

`float` is worse (24 bits) and has no place in business code at all.

## The two defensible representations

| Representation                     | Good for                                                | Watch out for                                                                                       |
| ---------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `BigDecimal` + `Currency`          | general money, tax, rates, anything with variable scale | scale/rounding on every division; equals vs compareTo; allocation on very hot paths                 |
| `long` of minor units + `Currency` | high-volume ledgers, fixed 2-decimal domains            | currencies with 0 or 3 minor units; overflow at ~9.2×10^18 minor units; every display needs scaling |

Both must carry the currency. A bare `BigDecimal` amount with the currency "known from
context" is the same class of defect as a bare `String` id — see java-object-contracts and the
value-object discussion in java-immutability.

```java
public record Money(BigDecimal amount, Currency currency) implements Comparable<Money> {
    public Money {
        Objects.requireNonNull(currency);
        amount = amount.setScale(currency.getDefaultFractionDigits(), RoundingMode.UNNECESSARY);
    }                     // UNNECESSARY throws if the caller passed more precision than the
                          // currency has: that is a bug at the source, not something to round away

    public Money plus(Money other) {
        requireSameCurrency(other);
        return new Money(amount.add(other.amount), currency);
    }

    public Money percentage(BigDecimal rate, RoundingMode mode) {
        return new Money(amount.multiply(rate).setScale(currency.getDefaultFractionDigits(), mode), currency);
    }

    @Override public int compareTo(Money other) { requireSameCurrency(other); return amount.compareTo(other.amount); }
}
```

Points that generalise:

- **Normalise the scale in the constructor**, so every instance of a given currency has the
  same scale and `equals` behaves as a value type should.
- **`RoundingMode.UNNECESSARY` at construction** turns "someone passed 10.005" into an
  exception at the boundary rather than a silent rounding deep in a calculation.
- **Currency mismatch is a domain error**, checked in the type, not at each call site.
- **Every operation that can lose precision takes a rounding mode** — or the type fixes one and
  documents it.

## Rounding

`RoundingMode` has eight values; three matter in practice:

- `HALF_UP` — "round half away from zero", what most people mean by rounding and what most
  invoicing rules specify.
- `HALF_EVEN` (banker's rounding) — removes the upward bias when rounding many values; required
  by some financial and statistical standards.
- `UNNECESSARY` — asserts no rounding is needed; throws otherwise. Excellent as a guard.

`setScale(2)` without a mode throws when rounding is required, which is a safe default only
if you intend the exception. `MathContext` (precision-based) is for scientific computation,
where you care about significant digits; scale-based rounding is for money, where you care
about decimal places. Do not mix them in one domain.

## Splitting and allocating

The classic bug: dividing a total into parts and having them not sum back.

```java
// Wrong: three payments of 33.33 leave a cent unallocated
Money each = total.divide(BigDecimal.valueOf(3), HALF_UP);

// Right: allocate, giving the remainder to the earliest parts by an explicit rule
public List<Money> allocate(int parts) {
    BigDecimal[] divided = amount.divideAndRemainder(BigDecimal.valueOf(parts));
    ...   // distribute the remainder deterministically, one minor unit at a time
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

- Use `compareTo(...) == 0` for numeric equality; use `equals` only when scale is part of the
  identity (rare, and usually a smell).
- `BigDecimal` in a `HashSet`/`HashMap` key position obeys `equals`, so `1.0` and `1.00` are
  two entries; in a `TreeSet`/`TreeMap` they are one. Normalising the scale in a wrapper type
  removes the whole problem, which is another argument for `Money` over raw `BigDecimal`.
- `stripTrailingZeros()` is not normalisation: it changes the scale (so `equals` still
  differs), and its `toString` uses scientific notation for values with trailing zeros before
  the decimal point (`new BigDecimal("600").stripTrailingZeros().toString()` is `6E+2`). Use
  `toPlainString()` for any output a human or another system reads.

## Crossing boundaries

**Database.** `DECIMAL(p, s)` / `NUMERIC(p, s)` with explicit precision and scale; never
`FLOAT`, `REAL` or `DOUBLE PRECISION` for money. Make the Java scale match the column scale —
a mismatch shows up as rounding on write, silently. Sum in the database when summing many
rows, and be aware that a `SUM` of a `DECIMAL` may promote precision.

**JSON and APIs.** A JSON number is parsed as a double by JavaScript and by many parsers, so
`19.99` may arrive as `19.989999999999998`, and a 19-digit id loses its low bits. Serialise
monetary amounts as strings (`"19.99"`) or as an object `{"amount": "19.99", "currency": "BRL"}`,
and configure the mapper accordingly (Jackson:
`enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)` when numbers must be read
losslessly). Document the representation in the contract — rpc-and-api-contracts.

**Aggregation across services.** Summing decimals is associative only if no rounding happens
in between; if each service rounds its own subtotal, the total depends on the partitioning of
the work. Decide where rounding happens — once, at the end, or per line with a documented rule
— and make it part of the contract, not an emergent property of how many shards processed the
batch. distributed-aggregation-and-barriers covers the general problem.

## Performance, in proportion

`BigDecimal` is an immutable object with a `BigInteger` or a compact `long` inside; every
operation allocates. For request-scoped business logic this is irrelevant — a request does
hundreds of these, not millions. It becomes relevant in tight loops over large datasets
(risk engines, batch revaluation), and the answer there is `long` minor units with explicit
scaling, not `double`. Measure before switching: allocation-profiling shows whether
`BigDecimal` is actually on the hot path, and jmh-microbenchmarks is how to compare the two
representations honestly.
