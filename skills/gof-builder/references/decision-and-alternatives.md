# Deciding on Builder, and what replaces it

## Selection table

| Shape of the type                                                    | Use                                         | Why                                                                     |
| -------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| Small, required, semantically distinct components                    | Record canonical constructor                | Compiler checks arity and types; positional readability is adequate     |
| Repeated or weakly typed components                                  | Stronger types, named factories, or builder | Prevents positional mistakes; choose the smallest clear API             |
| 2–3 recurring, nameable configurations                               | Static factories on the record              | `Retry.none()`, `Retry.exponential(3)` — intent in the name             |
| Many or substantially optional components                            | Builder                                     | Simulates named arguments and centralizes defaults                      |
| Required subset + optional subset, must not compile without required | Staged builder                              | Moves "you forgot X" from runtime to compile time                       |
| Deriving a near-copy of an existing instance                         | `withX()` methods                           | One call, no partial state, no builder round trip                       |
| Building from streamed or parsed input                               | Local accumulator + factory, or builder     | Incremental arrival needs temporary state, not necessarily a public API |
| One construction process, several representations                    | GoF builders or shared model + renderers    | Choose using retention, inspection and output requirements              |
| Test fixtures                                                        | Test data builder                           | Valid defaults; tests name only what matters                            |

## GoF representation builders: process, completion and ownership

Use this variant when a parser or director drives representation-independent steps. Keep
the traversal/order in that process and representation choices in builders; a director may
be an existing parser or function, not necessarily another class. Do not force unrelated
outputs behind a shared protocol with meaningless operations.

Compare a simpler baseline: build one intermediate model, then compose it with renderers.
That supports inspection, editing and repeated rendering without rerunning construction.
Direct builders become attractive when representations differ substantially or the model
cannot be retained within the actual memory budget. Streaming can reduce retained state,
but check buffering, nesting and sink behavior; the pattern alone provides no memory bound.
If only one representation is needed, a local accumulator and a validating factory may suffice.

The construction session needs a contract:

- Keep an incomplete in-memory product private. Completion checks structural obligations
  such as balanced nesting and required sections before returning it. If the result is
  mutable, transfer ownership or detach it so resetting/reusing the builder cannot mutate
  the previously returned product.
- On a parsing, callback or output failure, propagate the failure and discard or explicitly
  abort the session. Put cleanup at the owning call boundary, not only in the normal completion
  callback. Define who closes owned resources; borrowed sinks follow their caller's contract.
  Prefer a fresh session unless reset also clears all stacks, errors and retained references.
- Writing directly to a visible stream can expose an incomplete prefix before failure.
  If consumers require all-or-nothing output, stage the result and publish through an
  appropriate commit boundary; this may conflict with retention or latency constraints.
  Otherwise specify how consumers detect and handle truncation. A method named `build()`
  does not roll back emitted bytes or external effects.

For example, Java 17 SAX may throw after a fatal error without calling `endDocument()`.
Its `characters()` events may split contiguous text, so collect the indicated slices rather
than treating one callback as a complete value. An `Attributes` object is valid only during
`startElement()`; copy needed values before retaining them. These are callback-source
contracts, not properties every Builder automatically has.

Verify with a mid-construction failure and a second session: no invalid completed product,
no leaked owned resource or prior-session state, and no mutation of a previous result.
For event input, vary legal callback chunking and test the declared partial-output policy.

## Where validation must live

Three places can validate, and the difference is not stylistic. This Java 17 partial example
uses a legacy two-nullable-field Beneficiary, unlike the sealed alternative in the worked example.
Money, AccountId and Beneficiary are project types; supply their imports and implementations.

```java
public record PaymentInstruction(Money amount, AccountId debtor, Beneficiary beneficiary,
                                 Instant valueDate, String reference) {

    public PaymentInstruction {                       // 1. canonical constructor
        Objects.requireNonNull(amount, "amount");
        Objects.requireNonNull(debtor, "debtor");
        Objects.requireNonNull(beneficiary, "beneficiary");
        Objects.requireNonNull(valueDate, "valueDate");
        if (amount.isNegativeOrZero()) throw new IllegalArgumentException("amount must be positive");
        if ((beneficiary.iban() == null) == (beneficiary.accountId() == null)) {
            throw new IllegalArgumentException("beneficiary requires exactly one of iban and accountId");
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
3. **Individual setters** — can check their arguments (`Objects.requireNonNull`) and reject
   transitions forbidden by an explicit builder protocol. For example, a choose-once recipient
   API can reject selecting the other recipient kind in either order; reject before mutation
   if failure promises to preserve the previous state. Defer checks that would reject legal
   intermediate states: moving a range from `[0, 10]` to `[20, 30]` requires temporarily
   inconsistent bounds when `min(20)` precedes `max(30)`. If arbitrary setter order is promised,
   validate that combined result at construction. Early checks do not replace product invariants.

The failure to avoid: all validation in `build()`, none in the record. The type then has a
public constructor that accepts invalid values, and the invariant holds only for callers who
happened to use the builder.

## Staged builders — and their price

A staged (step) builder makes required fields a compile-time obligation by giving each step its
own interface:

```java
public interface AmountStep { DebtorStep amount(Money amount); }
public interface DebtorStep { BeneficiaryStep debtor(AccountId debtor); }
public interface BeneficiaryStep { DateStep beneficiary(Beneficiary b); }
public interface DateStep { OptionalStep valueDate(Instant date); }
public interface OptionalStep {
    OptionalStep reference(String reference);
    PaymentInstruction build();
}
```

What it buys: `build()` is unreachable until every required value is supplied, and the IDE
offers exactly the legal next call.
It does not prove non-null arguments, valid amounts or business authorization; validate values
at construction. Keep mutable implementations private and document that stages do not confer thread safety.

What it costs: one interface per required field, a fixed call order the caller cannot vary, and
a type that is awkward to construct partially in tests. Use it when the object is central, the
required set is stable, and it is constructed by people who did not write it — a public SDK, a
domain command used across modules. For an internal type with three required fields, a
`build()` that names the missing ones is cheaper and nearly as good.

For a published API, adding/reordering a required stage or changing a chaining return type can
break existing callers. Check retained constructors, entrypoints and stage types against the
compatibility policy; compile old consumer source and run previously compiled clients against
the changed library. If builders support inheritance, include base/subtype chains and inspect
generated bridges instead of assuming covariant source calls establish binary compatibility.

## Lombok `@Builder` — the three failure modes

- **On a JPA entity.** Class-level generation can introduce an all-arguments path without domain
  checks or association defaults. Annotating an explicit validating constructor/factory can preserve
  them. Inspect delomboked code and provider hydration requirements; `@NoArgsConstructor(force=true)`
  initializes final fields to Java defaults rather than establishing invariants. Prefer clear domain factories
  (`domain-logic-organization`, `orm-structural-mapping`).
- **On a record.** Lombok's generated builder normally invokes the canonical constructor, so a
  compact constructor remains the invariant boundary. Verify generated code after Lombok/JDK
  upgrades and ensure framework deserialization follows an equivalent path.
- **Defaults misunderstood.** An unset builder parameter normally supplies `null`/`0`/`false`;
  class-level field initializers are not generally builder defaults without `@Builder.Default`.
  Explicitly supplied null differs from omission. Constructor/method targets and final fields
  can behave differently; verify generated and direct paths rather than assuming equality.

`@Singular` can improve collection ergonomics and Lombok currently emits compact unmodifiable
results, but it is generated-code policy rather than a domain guarantee. Verify null handling,
ordering, duplicate semantics and the concrete Lombok version.

## Collections in builders

```java
public Builder items(List<LineItem> items) {
    this.items = new ArrayList<>(List.copyOf(items)); // mutable private accumulator, reject nulls
    return this;
}
public Builder addItem(LineItem item) {
    this.items.add(Objects.requireNonNull(item, "item"));
    return this;
}
```

Initialize the accumulator to `new ArrayList<>()`. This is a partial builder excerpt.
The product constructor must independently snapshot it, for example `items = List.copyOf(items)`
in a record compact constructor. An unmodifiable view over the builder's mutable backing list
is insufficient: later builder mutations would change prior products. Copies are shallow;
LineItem must be immutable or independently copied. List.copyOf also rejects null elements.

## Reuse hazards

- A builder reused after `build()` continues to hold the previous values; a second `build()`
  produces a near-duplicate that differs only where the caller overwrote fields. Choose and test
  documented snapshot reuse or enforced single-use; do not silently reset unless that is the API
  contract. Define whether failed builds preserve state and ensure later builds cannot mutate earlier products.
- A singleton's builder can mix values across requests when callers share it without ownership
  of a complete construction session. Individually synchronized setters and `build()` still
  allow `A.setDebtor(a)`, `B.setDebtor(b)`, `A.setRecipient(x)`, `A.build()` to produce `(b, x)`.
  If sharing is necessary, isolate the whole populate/build/reuse sequence, including optional
  state and failure cleanup; method-level locking alone does not provide that contract.
- Capturing a builder in an escaping lambda is hazardous when the original caller or another
  task can keep using it. Exclusive transfer can be valid: actions before `ExecutorService`
  submission happen-before the task's actions. The original owner must stop using the builder
  and any shared mutable inputs for the duration of the transfer. Submission does not order
  mutations made by the caller afterward; `Future.get()` provides the result handoff.

The safe default: create the builder, build, discard, within one method.

## Sources

- [SAX ContentHandler, Java 17](https://docs.oracle.com/en/java/javase/17/docs/api/java.xml/org/xml/sax/ContentHandler.html):
  completion may be absent on fatal failure; text can arrive in chunks and callback attributes
  have a limited lifetime. [SAX ErrorHandler](https://docs.oracle.com/en/java/javase/17/docs/api/java.xml/org/xml/sax/ErrorHandler.html)
  defines the fatal-error boundary. Cleanup and publication rules above are design consequences
  of those contracts, not parser-provided rollback guarantees.
- [JLS 17 record constructors](https://docs.oracle.com/javase/specs/jls/se17/html/jls-8.html#jls-8.10.4):
  canonical-constructor invariant placement; inspect framework-specific reconstruction separately.
- [JLS 17 method result types](https://docs.oracle.com/javase/specs/jls/se17/html/jls-13.html#jls-13.4.15):
  changing return types can remove the method descriptor used by compiled callers.
- [List.copyOf, Java 17](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/List.html#copyOf(java.util.Collection)>):
  unmodifiable snapshot semantics, null rejection and mutable-element limitations.
- [Lombok Builder](https://projectlombok.org/features/Builder): constructor/method targets,
  defaults, toBuilder and Singular behavior; verify the project's actual Lombok version.
- [JLS 17 synchronization](https://docs.oracle.com/javase/specs/jls/se17/html/jls-17.html#jls-17.1):
  a synchronized method holds its monitor for that invocation, not a caller's sequence of calls.
- [ExecutorService, Java 17](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/ExecutorService.html):
  submission and result-retrieval happens-before edges; exclusive builder ownership is a separate requirement.
