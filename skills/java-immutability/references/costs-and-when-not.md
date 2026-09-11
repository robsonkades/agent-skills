# Costs, and when not to apply immutability

Deep immutability removes many aliasing/data-race states and simplifies equality; it does not make
methods using mutable external collaborators automatically thread-safe. It
is paid for in allocation, copying and API surface. This reference is the ledger — read it
before converting a mutable class, and before rejecting immutability "for performance".

## The costs, stated as mechanisms

- **Allocation per change.** A changed immutable value normally produces another instance (an
  unchanged operation may return `this` or a canonical value); a wither passes/assigns n
  components. Escape analysis _may_ eliminate the
  allocation when the instance does not escape the compiled scope — it is never a promise,
  and it fails silently under inlining limits and deoptimisation. Claiming "the JIT will
  remove it" and claiming "this allocation is killing us" carry the same burden: an
  allocation profile or a JMH benchmark, before and after. Neither claim is admissible
  without one.
- **Copy on construction.** Materializing a mutable list normally visits/copies its elements.
  `List.copyOf` may reuse recognized immutable inputs; an arbitrary unmodifiable wrapper does
  not guarantee reuse. Measure actual input implementations, sizes and allocation counts;
  neither unmodifiable types nor chained `copyOf` calls establish negligible pipeline cost.
- **Large object graphs.** Path copying in a tree rebuilds nodes on the changed path and can
  share unchanged branches; other graph shapes and representations have different costs.
  Compare copying, a suitable persistent collection library and confined mutation when these
  are viable. The JDK's lack of persistent collection update APIs does not rule out existing
  libraries. A mutable index over immutable nodes is an alternative, not a required redesign;
  version retention, dependency policy and consumer snapshot needs matter.
- **API surface.** Withers, builders and copy-constructors are code that must be written,
  reviewed and versioned. Ten withers for two real state transitions is speculative
  generality.

## When not to apply

- **Local accumulators.** A `StringBuilder`, `ArrayList` or `HashMap` can remain mutable when
  it and its aliases actually stay confined; a method-local variable alone does not prove that.
  Preserve an adequate loop, and isolate the returned result when the boundary promises a
  snapshot (`List.copyOf`/`Stream.toList()` where their contracts fit).
- **Entity frameworks.** Portable Jakarta Persistence entities need framework-compatible
  construction and proxy/access semantics, but they do not universally require public setters;
  field access exists, and Hibernate offers read-only/immutable mappings with limitations.
  Aggregate evolution, lazy associations and dirty checking often make ordinary entities mutable.
  Choose from provider requirements and update semantics; immutable domain values/DTOs around a
  mutable persistence model remain a robust default, not a law.
- **Framework-managed binding targets** generally — configuration holders, form-binding
  beans — where the framework populates fields after construction by design. (Constructor
  binding can support immutable state when the framework and actual lifecycle fit.)
- **Measured hot paths.** When an allocation profile attributes real cost to value
  churn on a hot path, scoped mutability — a reused buffer, a mutable accumulator
  confined to the loop — is a candidate to compare against the measured baseline. Confinement, not finality, is
  what makes it safe. Preserve the API's actual snapshot, borrowing or ownership-transfer contract.
- **Genuinely huge state** — buffers, matrices, byte payloads — where copy-on-write per
  touch is the algorithmic cost, not an implementation detail.

## False positives when "immutability" is the review finding

- A setter-free class with a mutable referent that **never escapes and is never mutated through
  any alias after construction** can be observationally immutable. Prove constructor callers do
  not retain a mutable alias before dismissing the missing copy.
- "This should be a persistent data structure" — compare it only when structural sharing and
  versioned snapshots serve the workload; neither a new library nor a mutable rewrite is automatic.
- "Immutable objects are slower" / "the JIT makes them free" — both unmeasured. The only
  admissible form of either claim names the mechanism and shows the profile.

## Measure the decision

When performance drives a proposed conversion, measure the relevant allocation, retention,
GC, copying or contention costs alongside the required throughput/latency. Use production-shaped
graph sizes and mutation frequency; validate that a “faster” mutable form remains confined under
failure/cancellation and that an immutable form does not accidentally retain old graph versions.

## Authoritative references

- [Jakarta Persistence 3.2 specification](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2.html)
- [Hibernate ORM 7 immutability annotation](https://docs.jboss.org/hibernate/orm/7.0/javadocs/org/hibernate/annotations/Immutable.html)
- [PCollections project](https://github.com/hrldcpr/pcollections) — an example of persistent
  collection APIs outside the JDK; verify a chosen release's compatibility and workload fit.
