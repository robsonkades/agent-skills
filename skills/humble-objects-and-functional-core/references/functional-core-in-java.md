# The Functional Core in Java

How to write the pure half in modern Java without turning the codebase into a functional
programming exercise. Every technique here has a cost; the cost is stated with it.

## What "pure" has to mean to be useful

A working definition, in the order the properties matter:

1. **Deterministic** — same inputs, same result. No clock, no randomness, no environment.
2. **No observable effect** — calling it and discarding the result changes nothing.
3. **Total over its declared inputs** — every input the type permits produces a result, rather
   than an exception for the cases the author did not think about.

Local mutation is not a violation of any of these. A core that builds an `ArrayList`, sorts
it, and returns `List.copyOf(...)` is pure in every sense that matters, and is usually faster
and clearer than the same logic expressed as a fold. **The rule is about what escapes, not
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
than a parameter on every method. Take the trade knowingly; it is the right one in most
enterprise code.

The same treatment applies to id generation: take a `Supplier<UUID>`, or better, let the
shell generate the id and pass it in. An id decided by the core is an id that cannot be made
idempotent later (`idempotency`).

## Outcomes: return the decision, do not perform it

Where the shell must act, the core returns a description. A sealed interface makes the set of
outcomes closed, so the shell's handling is checked by the compiler.

```java
public sealed interface PricingOutcome {
    record Priced(Money total, List<AppliedDiscount> discounts) implements PricingOutcome { }
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
`default` is needed and adding a fourth outcome fails compilation at every call site that
must change. A `default` branch throws that guarantee away — it is the single most common way
this benefit is lost (`java-composition-over-inheritance`).

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

Records are the right default for the core's inputs and outputs: transparent, equal by value,
free `toString` for test failure messages.

Two costs are worth stating plainly:

- **A record component holding a mutable collection is not immutable.** The canonical
  constructor keeps the caller's `List`, so the caller can still change it afterwards. Copy in
  the compact constructor where the core's purity depends on it — `List.copyOf` also rejects
  nulls, which is usually wanted.

  ```java
  public record Basket(List<Line> lines) {
      public Basket {
          lines = List.copyOf(lines);
      }
  }
  ```

- **Rebuilding a record per step allocates.** In a loop over a large collection this is
  usually irrelevant, because young-generation allocation is cheap. Escape analysis can
  eliminate a record entirely, but only one that never escapes the compiled method — it will
  not eliminate one you accumulate into a collection or return, which escapes by definition,
  and it does nothing at all before C2 compiles the loop. The answer in a measured hot path
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
stream reduction would be longer, slower and harder to read. **Prefer the loop when the
computation is sequential and stateful**; prefer a stream when it is a mapping or a filter.

What must not happen: mutating an argument. A core that modifies the `Basket` it was handed
has an effect, and the caller's next line is now wrong for reasons the signature does not
show.

## Concurrency: the property you get for free

A pure core is safe to call from any number of threads without synchronisation, because there
is nothing to synchronise. Under a thread-per-request model on virtual threads, where a
request may fan out into many concurrent subtasks, this stops being an aesthetic property and
becomes the reason the code is correct at all (`thread-sizing-and-virtual-threads`,
`structured-concurrency`).

The corresponding trap: a "pure" core holding a memoisation cache in a `HashMap` field. It is
now shared mutable state, it is not thread-safe, and the impurity is invisible at the call
site. If memoisation is needed, it belongs in the shell, or in a concurrent structure chosen
deliberately (`caching-strategies`, `java-memory-model`).

## Costs, stated honestly

| Cost                          | When it bites                                        | Mitigation                                                                              |
| ----------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| More types                    | Every outcome becomes a named record                 | Only model outcomes the shell branches on; do not wrap a single boolean                 |
| A second hop to read          | The reader follows shell → core → outcome → shell    | Keep the pair in one package, named for the same concept                                |
| Allocation                    | Records rebuilt in a measured hot loop               | Profile before reacting; EA removes it only if it never escapes                         |
| Data must be fetched up front | Deciding what to fetch requires knowing the decision | Two rounds — decide what is needed, fetch, decide — rather than passing a repository in |
| Over-application              | Components that have no decision get a core anyway   | The workflow's step 6: revert if no test got better                                     |

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
  testing beyond the mapping itself.
