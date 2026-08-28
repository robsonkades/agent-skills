# Deciding on Builder, and what replaces it

## Threshold table

| Shape of the type                                                    | Use                            | Why                                                               |
| -------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| ≤4 components, all required, distinct types                          | Record canonical constructor   | Compiler checks order and arity; nothing to gain                  |
| ≤4 components, several of the same type                              | Wrapper types, then record     | `new Range(int)` mis-orders silently; `Range(Start,End)` does not |
| 2–3 recurring, nameable configurations                               | Static factories on the record | `Retry.none()`, `Retry.exponential(3)` — intent in the name       |
| 5+ components, or 2+ optional                                        | Builder                        | Named arguments and defaults, which the language lacks            |
| Required subset + optional subset, must not compile without required | Staged builder                 | Moves "you forgot X" from runtime to compile time                 |
| Deriving a near-copy of an existing instance                         | `withX()` methods              | One call, no partial state, no builder round trip                 |
| Building from streamed or parsed input                               | Builder                        | No single point where all arguments exist                         |
| Test fixtures                                                        | Test data builder              | Valid defaults; tests name only what matters                      |

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

1. **The constructed type's constructor** — the only placement that cannot be bypassed.
   Deserialisation, `withX` copies, reflection-based mappers and future call sites all pass
   through it.
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
- **On a record.** `@Builder` does not run the compact constructor's checks unless it routes
  through the canonical constructor — verify it does. If validation is skipped, the builder is
  a hole in the type's invariants.
- **`@Builder.Default` omitted.** A field initialiser is silently ignored by the generated
  builder, so the default becomes `null`/`0` for every builder-constructed instance while
  direct construction still sees the initialiser. Two construction paths, two behaviours.

`@Singular` is the one part worth keeping unreservedly: it produces an unmodifiable copy of the
collection, which hand-written builders routinely forget.

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
