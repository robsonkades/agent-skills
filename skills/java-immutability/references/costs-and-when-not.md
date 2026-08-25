# Costs, and when not to apply immutability

Immutability buys freedom from aliasing bugs, free thread-safety and honest equality. It
is paid for in allocation, copying and API surface. This reference is the ledger — read it
before converting a mutable class, and before rejecting immutability "for performance".

## The costs, stated as mechanisms

- **Allocation per change.** Every state transition allocates a new instance; a wither on
  an n-component record copies n references. Escape analysis _may_ eliminate the
  allocation when the instance does not escape the compiled scope — it is never a promise,
  and it fails silently under inlining limits and deoptimisation. Claiming "the JIT will
  remove it" and claiming "this allocation is killing us" carry the same burden: an
  allocation profile or a JMH benchmark, before and after. Neither claim is admissible
  without one.
- **Copy on construction.** `List.copyOf` on a genuinely mutable input is O(n). On an
  already-unmodifiable input it generally skips the copy. A pipeline that builds immutable lists
  from immutable lists pays almost nothing; one that wraps a fresh `ArrayList` per call
  pays n every time — the profile tells you which one you have.
- **Large object graphs.** Changing one leaf of a deep immutable graph re-allocates the
  spine — every node from the leaf to the root. The JDK has no persistent (structurally
  sharing) collections to make this cheap, and hand-rolling them is a project, not a
  refactoring. A graph that changes often and deep is a poor fit for whole-graph
  immutability; make the _nodes_ immutable values and let a mutable index own the graph.
- **API surface.** Withers, builders and copy-constructors are code that must be written,
  reviewed and versioned. Ten withers for two real state transitions is speculative
  generality.

## When not to apply

- **Local accumulators.** A `StringBuilder`, `ArrayList` or `HashMap` created, filled and
  consumed inside one method is confined — it has no aliasing to defend against.
  Rewriting it as fold-over-immutable-copies adds allocation for zero safety. Mutable
  inside, immutable at the boundary (`List.copyOf`/`Stream.toList()` on return) is the
  idiom.
- **Entity frameworks.** JPA/Hibernate entities are contractually mutable: proxies,
  lazy loading and dirty checking require settable state and no-arg construction. An
  immutable @Entity fights the framework it lives in. Keep entities mutable; put the
  immutability at the domain-value level (embeddables, record DTOs, values mapped in and
  out).
- **Framework-managed binding targets** generally — configuration holders, form-binding
  beans — where the framework populates fields after construction by design. (Constructor
  binding, where the framework supports it, restores immutability; use it when offered.)
- **Measured hot paths.** When an allocation profile attributes real cost to value
  churn on a hot path, scoped mutability — a reused buffer, a mutable accumulator
  confined to the loop — is the correct engineering answer. Confinement, not finality, is
  what makes it safe. Keep the immutable type at the API boundary.
- **Genuinely huge state** — buffers, matrices, byte payloads — where copy-on-write per
  touch is the algorithmic cost, not an implementation detail.

## False positives when "immutability" is the review finding

- A setter-free class with a mutable field that **never escapes and is never mutated
  after construction** is functionally immutable; flag the missing copy only if a route
  actually exists.
- "This should be a persistent data structure" — the JDK does not ship one; the honest
  alternatives are copy-on-write (measure it) or confined mutation.
- "Immutable objects are slower" / "the JIT makes them free" — both unmeasured. The only
  admissible form of either claim names the mechanism and shows the profile.
