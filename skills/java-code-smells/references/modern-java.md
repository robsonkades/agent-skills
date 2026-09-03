# Smells modern Java dissolved — and the ones it created

The classic catalogue predates records, sealed types and pattern matching. Applying it
unadjusted produces false positives on idiomatic Java 25 and misses the new failure modes.

## Dissolved or transformed

### A sealed switch is not the Switch Statements smell

The smell was never the keyword; it was _unchecked repetition of a type dispatch_. An
exhaustive switch over a sealed type inverts the problem — the compiler enumerates every
dispatch site when a variant is added:

```java
sealed interface PaymentMethod permits Card, Boleto, Pix {}
record Card(String bin, String last4) implements PaymentMethod {}
record Boleto(String barcode) implements PaymentMethod {}
record Pix(String key) implements PaymentMethod {}

BigDecimal feeFor(PaymentMethod method, BigDecimal amount) {
    return switch (method) {
        case Card _   -> amount.multiply(CARD_RATE);
        case Boleto _ -> BOLETO_FLAT_FEE;
        case Pix _    -> BigDecimal.ZERO;
    };
}
```

The **new** smell is `default` (or `case null, default`) on a switch over a sealed type:
it silently absorbs every future variant, buying back the exact defect exhaustiveness
exists to prevent. Flag the `default`, not the switch. A legitimate exception: a
deliberately partial handler that documents why unknown variants share one behaviour.

### Records dissolve Data Clumps — and half of Primitive Obsession

The grouping half is now nearly free:

```java
record DateRange(LocalDate start, LocalDate end) {
    DateRange {
        if (end.isBefore(start)) {
            throw new IllegalArgumentException("end " + end + " before start " + start);
        }
    }
}
```

The _semantics_ half survives: a `record Transfer(String iban, long cents)` still has
primitive obsession inside it — `iban` carries rules no type enforces. A record of
primitives fixes travel, not meaning.

### Pattern matching dissolves the instanceof-cast chain's boilerplate — not its design question

`if (x instanceof Card c)` chains become a clean switch, but a switch over a _non-sealed_
supertype still needs `default` and still misses new subtypes silently. The design
question — close the hierarchy or use polymorphism — remains, and is java-refactoring's
decision table.

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

### The record that should be a class

A record with ten components, half of them nullable, exposing raw mutable collections it
was handed — value semantics claimed, not delivered. Detect: mutable component types
without defensive copies in the compact constructor; component lists that read like a
God Object's field list. Depth: java-immutability.

### Sealed sprawl

Sealing a hierarchy that external code was meant to extend. Direct permitted subclasses must
reside in the same named module (or, in the unnamed module, the same package), so an extension
ecosystem cannot add implementations independently. Sealed is for a genuinely _closed_ set
whose release boundary owns every variant. Detect: the permits list grows in most feature PRs
while operations on the hierarchy remain stable — the axis is wrong and ordinary polymorphism
may fit better (java-refactoring's polymorphism-vs-sealed table).

### Exhaustiveness hidden by a convenience default

An exhaustive source switch without `default` makes recompilation identify every new enum or
permitted subtype; a separately evolved binary can still reach a compiler-generated fallback
and throw `MatchException` (Java 21+) rather than execute stale policy. An explicit `default`
trades that fail-fast behavior for fallback behavior. That may be correct for a tolerant
presentation edge, but is suspect in authorization, money or protocol-state decisions. Record
the compatibility policy instead of chanting "never default".

Primary language references: [JLS §14.11 (`switch`)](https://docs.oracle.com/javase/specs/jls/se25/html/jls-14.html#jls-14.11),
[JLS §8.1.6 (sealed classes)](https://docs.oracle.com/javase/specs/jls/se25/html/jls-8.html#jls-8.1.6),
and [JLS §13.4.2 (evolution and `MatchException`)](https://docs.oracle.com/javase/specs/jls/se25/html/jls-13.html#jls-13.4.2).
