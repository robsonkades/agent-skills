# The Functional Core in Java

How to write the pure half in modern Java without turning the codebase into a functional
programming exercise. Every technique here has a cost; the cost is stated with it.
Examples are partial Java 21 snippets; domain types/imports are omitted. Value types such as
`Money`, `AppliedDiscount`, `Line` and `Instalment` are assumed immutable, with validated
domain values. The loan example illustrates local accumulation, not a complete amortization
or financial rounding/calendar policy.

## What "pure" has to mean to be useful

A working definition, in the order the properties matter:

1. **Deterministic** — same inputs, same result. No clock, no randomness, no environment.
2. **No observable effect** — calling it and discarding the result changes nothing.
3. **Explicit input/error contract** — totality is a separate property from purity. Define
   valid inputs, null policy and expected rejection results; deterministic exceptions for
   contract violations do not by themselves introduce I/O or shared-state effects.

Local mutation is not a violation of any of these. A core that builds an `ArrayList`, sorts
it, and returns `List.copyOf(...)` can be pure when elements and inputs are stable; copying
the list is shallow. Prefer clear code and measure performance when relevant. **The rule is about what escapes, not
about which keywords appear.**

## Inputs: make the ambient explicit

The ambient inputs — time, randomness, identity, configuration — are what silently make a
core impure. Each has a mechanical fix.

```java
// Impure: the result depends on when the test runs.
public boolean isOverdue(Invoice invoice) {
    return invoice.dueDate().isBefore(LocalDate.now());
}
```

```java
// Pure: the caller supplies the moment.
public boolean isOverdue(Invoice invoice, LocalDate today) {
    return invoice.dueDate().isBefore(today);
}
```

For a class with many such methods, inject `java.time.Clock` once rather than threading a
parameter through every signature. `Clock.fixed(...)` in tests, the system clock in
production. This is the whole reason `Clock` exists, and it is under-used.

```java
public final class BillingPolicy {
    private final Clock clock;

    public BillingPolicy(Clock clock) {
        this.clock = clock;
    }

    public boolean isOverdue(Invoice invoice) {
        return invoice.dueDate().isBefore(LocalDate.now(clock));
    }
}
```

**A class holding a `Clock` is not literally a pure function** — it reads state outside its
arguments. It buys the property that matters (determinism under test) at far less ceremony
than a parameter on every method. Take the trade knowingly; sample once in the shell when
one decision must use a consistent instant/date and record the required time zone.

The same distinction applies to id generation: a supplier may still read mutable state or
perform effects. Pass a generated value for purity. A core can also derive a stable ID from
explicit inputs; idempotency requires the same logical operation's key to survive retries,
regardless of where it was generated (`idempotency`).

## Outcomes: return the decision, do not perform it

Where the shell must act, the core returns a description. A sealed interface makes the set of
outcomes closed, so the shell's handling is checked by the compiler.

```java
public sealed interface PricingOutcome {
    record Priced(Money total, List<AppliedDiscount> discounts) implements PricingOutcome {
        public Priced { discounts = List.copyOf(discounts); }
    }
    record Rejected(String reason) implements PricingOutcome { }
    record NeedsApproval(Money total, Money overLimitBy) implements PricingOutcome { }
}
```

```java
PricingOutcome outcome = pricing.price(basket, customer, today);

switch (outcome) {
    case PricingOutcome.Priced p        -> orders.place(basket, p.total());
    case PricingOutcome.Rejected r      -> log.info("rejected: {}", r.reason());
    case PricingOutcome.NeedsApproval a -> approvals.request(basket, a.overLimitBy());
}
```

Because `PricingOutcome` is sealed and the `switch` covers every permitted subtype, no
`default` is needed. Adding a fourth outcome exposes uncovered switches when their source
is recompiled; it does not retroactively validate old binaries. A deliberate catch-all may
reject unknown cases but loses this per-variant compile check. The producer must also honor
the non-null outcome contract (`java-composition-over-inheritance`).

### Result types, and their limit

The same shape expresses success-or-failure without exceptions:

```java
public sealed interface Result<T> {
    record Ok<T>(T value) implements Result<T> { }
    record Err<T>(String code, String detail) implements Result<T> { }
}
```

Useful when failure is an **expected outcome** the caller will branch on — validation,
business rejection, a remote classification. Not useful as a blanket replacement for
exceptions: Java has no syntax for propagating a `Result` up a call chain, so a deep stack of
them turns into manual plumbing that an exception would have handled in one line. Reach for it
at the boundary where a caller genuinely decides, and let genuinely exceptional conditions
throw (`java-exception-design`).

## Inputs and intermediate values: records, and where they stop paying

Records fit transparent data carriers with component-based equality; existing immutable
classes or simple values may already fit. Do not change a public input/output contract
just to use a record. Generated `toString` includes component values, so avoid exposing
sensitive data in test output or logs.

Two costs are worth stating plainly:

- **A record component holding a mutable collection is not immutable.** The canonical
  constructor keeps the caller's `List`, so the caller can still change it afterwards. Copy in
  the compact constructor where the core's purity depends on it — `List.copyOf` also rejects
  nulls. This is a shallow copy: `Line` must itself be immutable or copied appropriately.

  ```java
  public record Basket(List<Line> lines) {
      public Basket {
          lines = List.copyOf(lines);
      }
  }
  ```

- **Rebuilding a record per step may allocate.** Materialized allocation and its cost depend
  on the workload and optimized code. Escape analysis can
  eliminate a record entirely when its uses remain within the optimized compilation graph.
  A source-level return does not prove escape after inlining; a local collection does not
  by itself prove materialization either. Retained/published results constrain elimination.
  The answer in a measured hot path
  comes from a profile, not from this document (`allocation-profiling`,
  `jit-inlining-and-escape-analysis`).

## Where mutation is legitimate inside the core

Local mutation for accumulation is fine and often the clearest code:

```java
public Schedule buildSchedule(Loan loan, LocalDate start) {
    List<Instalment> instalments = new ArrayList<>();   // never escapes as mutable
    Money remaining = loan.principal();
    LocalDate due = start;

    for (int n = 1; n <= loan.termMonths(); n++) {
        Money payment = instalmentFor(loan, remaining, n);
        instalments.add(new Instalment(n, due, payment));
        Money principalPart = payment.minus(interestOn(remaining, loan));
        remaining = remaining.minus(principalPart);
        due = due.plusMonths(1);
    }
    return new Schedule(List.copyOf(instalments));
}
```

The `ArrayList` and the reassigned locals are invisible to every caller. Expressing this as a
stream reduction can obscure this sequential state; performance requires measurement. **Prefer the loop when the
computation is sequential and stateful**; prefer a stream when it is a mapping or a filter.

What must not happen: mutating an argument. A core that modifies the `Basket` it was handed
has an effect, and the caller's next line is now wrong for reasons the signature does not
show.

## Concurrency: the property you get for free

A core with no shared mutable state can run concurrently when its inputs are safely
published and stable for the entire evaluation. Reading a caller-owned list while another
thread mutates it violates that premise even if the core performs no writes. Purity does not
make the shell's read/decide/write sequence atomic (`java-memory-model`).

The corresponding trap is a memoisation `HashMap` shared by concurrent evaluations without
synchronization. Confinement can be adequate; if the cache is shared, define coordination,
key/value stability and retention explicitly. Memoisation may preserve decision results while
introducing hidden mutable state and costs. Put that policy in the shell or choose an explicit
core contract rather than inferring thread safety from pure-looking signatures
(`caching-strategies`, `java-memory-model`).

## Costs, stated honestly

| Cost                          | When it bites                                        | Mitigation                                                                              |
| ----------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| More types                    | Every outcome becomes a named record                 | Only model outcomes the shell branches on; do not wrap a single boolean                 |
| A second hop to read          | The reader follows shell → core → outcome → shell    | Keep the pair in one package, named for the same concept                                |
| Allocation                    | Records rebuilt in a measured hot loop               | Profile materialized allocation; elimination depends on the optimized graph             |
| Data must be fetched up front | Deciding what to fetch requires knowing the decision | Two rounds — decide what is needed, fetch, decide — rather than passing a repository in |
| Over-application              | Components gain a core without a concrete benefit    | Keep adequate seams; compare testability and change cost while retaining boundary tests |

## When not to use a functional core

- **The operation is inherently effectful and has no decision** — streaming a file, a bulk
  `UPDATE`, a batch insert. There is nothing to isolate, and forcing a core produces a class
  whose only job is to return its argument.
- **The set is too large to hold.** Purity that requires materialising a million rows is a
  performance defect wearing a design pattern. Push the predicate into the query.
- **The framework already owns the decision.** Bean validation, Spring Security's
  authorisation rules, the transaction manager's rollback policy — reimplementing these in a
  core to make them pure duplicates behaviour that is already tested and already declarative
  (`patterns-and-modern-frameworks`).
- **The code is a genuine adapter.** Mapping a DTO to a domain type has no branch worth
  extracting when it merely copies fields. Validation, authorization, defaults and lossy
  conversions can still encode consequential decisions even in a mapper.

## Sources

- [Java 21 pattern switches](https://docs.oracle.com/en/java/javase/21/language/pattern-matching-switch.html) — exhaustiveness and null handling.
- [Java 21 List contract](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/List.html) — unmodifiable collections and mutable elements.
- [Java 21 Clock contract](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/time/Clock.html) — injected clocks, fixed test time and zones.
- [Java 21 Record contract](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Record.html) — shallow immutability and generated component-based methods.
