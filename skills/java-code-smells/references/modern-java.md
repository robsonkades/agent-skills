# Smells modern Java dissolved — and the ones it created

The classic catalogue predates records, sealed types and pattern matching. Applying it
unadjusted produces false positives and misses the new failure modes. The partial snippets
below target Java 21 without preview; supply imports, enclosing classes and named constants.
Records are final since Java 16, sealed types since 17, and pattern switches since 21. Inspect
the target project's release before recommending them.

## Dissolved or transformed

### A sealed switch is not the Switch Statements smell

The smell was never the keyword; it was _unchecked repetition of a type dispatch_. A
switch enumerating the variants of a sealed type without a catch-all makes recompilation
expose missing cases when that set changes:

```java
sealed interface PaymentMethod permits Card, Boleto, Pix {}
record Card(String bin, String last4) implements PaymentMethod {}
record Boleto(String barcode) implements PaymentMethod {}
record Pix(String key) implements PaymentMethod {}

BigDecimal feeFor(PaymentMethod method, BigDecimal amount) {
    return switch (method) {
        case Card card     -> amount.multiply(CARD_RATE);
        case Boleto boleto -> BOLETO_FLAT_FEE;
        case Pix pix       -> BigDecimal.ZERO;
    };
}
```

A `default` or unconditional type-pattern case can absorb future variants. Flag it when
the contract requires each variant to receive explicit policy review, not merely because
the label exists. A deliberately tolerant handler may correctly give unknown variants one
behavior; keep its null policy separate. See the evolution discussion below.

### Records dissolve Data Clumps — and half of Primitive Obsession

Records make grouping concise; API and mapping changes still have migration costs:

```java
record DateRange(LocalDate start, LocalDate end) {
    DateRange {
        if (end.isBefore(start)) {
            throw new IllegalArgumentException("end " + end + " before start " + start);
        }
    }
}
```

The _semantics_ half survives: `record Transfer(String iban, long cents)` does not itself
specify IBAN or amount rules. Locate the actual validation and trust boundary before
reporting primitive obsession; a dedicated type earns its place through evidenced invariant,
reuse or confusion benefits. Grouping syntax alone neither supplies nor disproves validation.

### Pattern matching dissolves the instanceof-cast chain's boilerplate — not its design question

Pattern matching removes casts, but an open-supertype switch still needs adequate coverage:
an unconditional type pattern such as `case PaymentMethod other` can supply it without a
literal `default`. That catch-all can intentionally handle later implementations. Decide
whether variants are owned and closed, or callers need a supported extension/fallback contract;
do not seal an open plugin API merely to make dispatch look exhaustive. Polymorphism is another
choice when ownership of the behavior fits; see java-refactoring's decision table.

### Boolean blindness got cheap to fix

A two-element enum or a sealed pair of records costs a handful of lines, removing the
main historical excuse (`boolean` was "lighter").

## Created

### The Optional chain as null-safe navigation

```java
String label = Optional.ofNullable(order)
        .map(Order::customer)
        .map(Customer::address)
        .map(Address::city)
        .orElse(null);
```

Three smells in one: it is a Message Chain wearing gloves (the structural coupling to
every hop is untouched); `orElse(null)` re-imports the null it claimed to remove; and it
hides _which_ hop may legitimately be absent — the design information a maintainer needs.
Detection leads: a chain ending in `orElse(null)`, an `isPresent()`+`get()` pair that merely
recreates a branch, `Optional` stored in persistence/serialization state without an explicit
representation, or `Optional.of` used as a let-expression. None is an automatic finding:
imperative branching may be clearest, and an internal parameter can make optionality explicit.
Fixes and correct usage are java-optional's; nullability contracts are java-null-safety's.

### Record shape versus ownership contract

Component count, nullability and mutable component types are leads, not findings. A record
is shallowly immutable: a claimed snapshot can still change through an aliased list. Check
the promised ownership, equality and lifecycle contract; immutable inputs or ownership
transfer may avoid copying, and an explicitly confined live view may be intentional. A
record can also remain a domain value. Recommend copies or a class only when that contract
requires them; a long component list alone proves neither choice. Depth: java-immutability.

### Sealed sprawl

Sealing a hierarchy that external code was meant to extend. Direct permitted subclasses must
reside in the same named module (or, in the unnamed module, the same package), so an extension
ecosystem cannot add implementations independently. Sealed is for a genuinely _closed_ set
whose release boundary owns every variant. Detect: the permits list grows in most feature PRs
while operations on the hierarchy remain stable — the axis is wrong and ordinary polymorphism
may fit better (java-refactoring's polymorphism-vs-sealed table).

### Exhaustiveness hidden by a convenience default

An exhaustive source switch enumerating current variants without a catch-all makes recompilation
identify newly uncovered variants. No `default` is insufficient if a type pattern already covers
them. A separately evolved binary can still reach a compiler-generated fallback
and throw `MatchException` (Java 21+) rather than execute stale policy. An explicit `default`
trades that fail-fast behavior for fallback behavior. That may be correct for a tolerant
presentation edge, but is suspect in authorization, money or protocol-state decisions. Record
the compatibility policy instead of chanting "never default".

Primary language references for the Java 21 baseline: [JLS §14.11 (`switch`)](https://docs.oracle.com/javase/specs/jls/se21/html/jls-14.html#jls-14.11),
[JLS §8.1.6 (sealed classes)](https://docs.oracle.com/javase/specs/jls/se21/html/jls-8.html#jls-8.1.6),
[JLS §13.4.2 (evolution and `MatchException`)](https://docs.oracle.com/javase/specs/jls/se21/html/jls-13.html#jls-13.4.2),
and [Record's shallow-immutability contract](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Record.html).
