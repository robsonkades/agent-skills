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
Detection: any Optional chain ending in `orElse(null)` / `isPresent()`+`get()`, Optional
in fields or parameters, `Optional.of` used as a let-expression. Fixes and correct usage
are java-optional's; nullability contracts are java-null-safety's.

### The record that should be a class

A record with ten components, half of them nullable, exposing raw mutable collections it
was handed — value semantics claimed, not delivered. Detect: mutable component types
without defensive copies in the compact constructor; component lists that read like a
God Object's field list. Depth: java-immutability.

### Sealed sprawl

Sealing a hierarchy that external code was meant to extend, or sealing across module
boundaries so every new business case needs a release of the core. Sealed is for
_closed_ sets owned by one team. Detect: permits lists that grow in most feature PRs
while the operations on the hierarchy never change — the axis is wrong, polymorphism
fits better (java-refactoring's polymorphism-vs-sealed table).
