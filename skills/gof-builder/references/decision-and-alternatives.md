# Deciding on Builder, and what replaces it

## Selection table

| Shape of the type                                                    | Use                                         | Why                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------- |
| Small, required, semantically distinct components                    | Record canonical constructor                | Compiler checks arity and types; positional readability is adequate |
| Repeated or weakly typed components                                  | Stronger types, named factories, or builder | Prevents positional mistakes; choose the smallest clear API         |
| 2–3 recurring, nameable configurations                               | Static factories on the record              | `Retry.none()`, `Retry.exponential(3)` — intent in the name         |
| Many or substantially optional components                            | Builder                                     | Simulates named arguments and centralizes defaults                  |
| Required subset + optional subset, must not compile without required | Staged builder                              | Moves "you forgot X" from runtime to compile time                   |
| Deriving a near-copy of an existing instance                         | `withX()` methods                           | One call, no partial state, no builder round trip                   |
| Building from streamed or parsed input                               | Builder                                     | No single point where all arguments exist                           |
| Test fixtures                                                        | Test data builder                           | Valid defaults; tests name only what matters                        |

## Where validation must live

Three places can validate, and the difference is not stylistic.

```java
public record PaymentInstruction(Money amount, AccountId debtor, Beneficiary beneficiary,
                                 Instant valueDate, String reference) {

    public PaymentInstruction {                       // 1. canonical constructor
        Objects.requireNonNull(amount, "amount");
        if (amount.isNegativeOrZero()) throw new IllegalArgumentException("amount must be positive");
        if (beneficiary.iban() == null && beneficiary.accountId() == null) {
            throw new IllegalArgumentException("beneficiary needs an iban or an accountId");
        }
    }
}
```

1. **The constructed type's constructor** — the strongest normal placement for intrinsic
   invariants. Ordinary construction passes through it, but some serialization/ORM mechanisms
   can allocate or populate objects through provider-specific paths; test those boundaries.
2. **`build()`** — may add checks that need the builder's own state (for example "you called
   `iban()` and `accountId()`; choose one"), which the record cannot see because only one field
   survives. Everything else it checks should be delegated.
3. **Individual setters** — appropriate only for per-argument checks (`Objects.requireNonNull`),
   because a cross-field rule cannot be evaluated before the other field is set. Setters that
   throw on cross-field rules make the builder order-dependent, which defeats its purpose.

The failure to avoid: all validation in `build()`, none in the record. The type then has a
public constructor that accepts invalid values, and the invariant holds only for callers who
happened to use the builder.

## Staged builders — and their price

A staged (step) builder makes required fields a compile-time obligation by giving each step its
own interface:

```java
public interface AmountStep { DebtorStep amount(Money amount); }
public interface DebtorStep { BeneficiaryStep debtor(AccountId debtor); }
public interface BeneficiaryStep { OptionalStep beneficiary(Beneficiary b); }
public interface OptionalStep {
    OptionalStep reference(String reference);
    PaymentInstruction build();
}
```

What it buys: `build()` is unreachable until every required value is supplied, and the IDE
offers exactly the legal next call.

What it costs: one interface per required field, a fixed call order the caller cannot vary, and
a type that is awkward to construct partially in tests. Use it when the object is central, the
required set is stable, and it is constructed by people who did not write it — a public SDK, a
domain command used across modules. For an internal type with three required fields, a
`build()` that names the missing ones is cheaper and nearly as good.

## Lombok `@Builder` — the three failure modes

- **On a JPA entity.** It generates a constructor that bypasses the entity's own invariants and
  leaves associations null, so an entity can be persisted in a state the aggregate forbids. It
  also tends to arrive with `@NoArgsConstructor(force = true)`, which nulls final fields. Keep
  entities constructed through their own named factories
  (`domain-logic-organization`, `orm-structural-mapping`).
- **On a record.** Lombok's generated builder normally invokes the canonical constructor, so a
  compact constructor remains the invariant boundary. Verify generated code after Lombok/JDK
  upgrades and ensure framework deserialization follows an equivalent path.
- **`@Builder.Default` omitted.** A field initialiser is silently ignored by the generated
  builder, so the default becomes `null`/`0` for every builder-constructed instance while
  direct construction still sees the initialiser. Two construction paths, two behaviours.

`@Singular` can improve collection ergonomics and Lombok currently emits compact unmodifiable
results, but it is generated-code policy rather than a domain guarantee. Verify null handling,
ordering, duplicate semantics and the concrete Lombok version.

## Collections in builders

```java
public Builder items(List<LineItem> items) {
    this.items = List.copyOf(items);      // copy in: caller cannot mutate afterwards
    return this;
}
public Builder addItem(LineItem item) {
    this.items = ...;                     // accumulate
    return this;
}
```

Two rules, both routinely broken: copy on the way in, so the caller's later mutation does not
reach the built object; and hand out an unmodifiable view on the way out, so the built object
cannot be mutated through its own accessor. A record component holding a mutable `List` is not
an immutable value however carefully it was built (`java-immutability`).

## Reuse hazards

- A builder reused after `build()` continues to hold the previous values; a second `build()`
  produces a near-duplicate that differs only where the caller remembered to overwrite. Either
  reset in `build()`, or document single-use and enforce it with a flag.
- A builder held in a field of a singleton is shared mutable state under concurrency, and the
  symptom is a value from one request appearing in another's object — rare, non-reproducible,
  and expensive to diagnose.
- A builder captured by a lambda that escapes the constructing method has the same problem with
  a longer fuse.

The safe default: create the builder, build, discard, within one method.
