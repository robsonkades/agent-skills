---
name: java-lambdas-and-functional-interfaces
description: >
  Lambdas, method references and the functional interfaces they implement: what a lambda
  captures and what that costs, why its this differs from an anonymous class's, when a
  method reference is clearer, choosing among the standard java.util.function interfaces
  instead of inventing one, primitive specialisations that avoid boxing, checked exceptions
  inside lambdas, and the runtime shape (invokedynamic, capturing versus non-capturing,
  megamorphic call sites). Use when a lambda captures mutable state or a large object, when
  a codebase reinvents Function or Predicate, when checked exceptions force a try/catch
  inside a pipeline, or when a queued lambda outlives what it captured. Stream pipelines are
  java-streams, inlining is jit-inlining-and-escape-analysis, and per-request context a
  lambda must not capture is scoped-values.
---

# Java Lambdas and Functional Interfaces

## Purpose

Use lambdas where they remove ceremony without hiding behaviour, and pick the interface the
rest of the ecosystem already speaks. Two failure modes: the lambda that captures more than
its author noticed — a large object graph, a request context, an open resource — and outlives
it inside an executor queue or a callback registry; and the codebase that reinvents
`Function`, `Predicate` and `Supplier` under local names, so nothing composes with anything
else.

## Workflow

1. **Check the contract first.** A functional interface permits a lambda, but identity, lifecycle,
   serialization, annotations, diagnostic naming, extra protocol methods and state may justify a
   named implementation even with one abstract method.
2. **Write it as a lambda, then try the method reference.** Keep whichever reads better; a
   method reference that forces the reader to work out which of the four kinds it is has not
   paid for itself.
3. **Take the interface from `java.util.function`** unless you can state what a custom one
   adds: a descriptive name at many call sites, a contract the standard one cannot express, a
   checked exception, or default methods worth having.
4. **Audit the capture.** Every free variable in the body is captured by value at evaluation
   time; every reference to an instance member captures the whole enclosing object. Ask where
   the lambda ends up and how long it lives.
5. **Decide what happens to checked exceptions before writing the pipeline**, not after the
   compiler complains — the answer changes the interface you use.

## Rules

- Prefer a lambda to an anonymous class for a functional interface. Prefer an anonymous class
  when the implementation needs its own fields, needs to reference itself, implements a
  non-functional interface or an abstract class, or is long enough that a name would help.
- A lambda's `this` is the enclosing instance; an anonymous class's `this` is the anonymous
  object. This is not a stylistic difference — code moved from one form to the other changes
  meaning silently, and a lambda that touches `this` (directly or through an unqualified
  instance member) captures the enclosing object.
- Keep a lambda locally comprehensible. Line count is only a signal; extract a named method/type
  when policy, failure semantics, reuse, instrumentation or debugging needs a stable name.
- Captured locals must be effectively final, and captured values are captured by _value_.
  Sidestepping that with a one-element array or an `AtomicInteger` to accumulate state is a
  signal that the code wants a loop or a collector, not a lambda. Where it is genuinely a
  concurrent accumulator, `LongAdder` or a proper reduction is the answer, not a captured
  array.
- Capturing a mutable **object** captures a shared reference, not a snapshot. A lambda handed
  to another thread reads whatever that object contains when it runs, with no happens-before
  edge beyond the one the executor provides — see java-memory-model.
- Watch what a long-lived lambda pins. A lambda stored in a registry, a scheduled task or a
  queued executor task holds every captured value, and — if it touches an instance member —
  its enclosing object. That is a live reference for the lifetime of the holder; see
  java-reference-types-and-leaks.
- Use the standard functional interfaces. The six basics (`Function`, `BiFunction`,
  `Predicate`, `Supplier`, `Consumer`, `UnaryOperator`/`BinaryOperator`) plus their primitive
  specialisations cover nearly everything, compose via `andThen`, `compose`, `negate`, `and`,
  `or`, and are what every library API already accepts.
- Use the **primitive specialisations** (`IntPredicate`, `ToLongFunction`, `IntUnaryOperator`,
  `ObjIntConsumer`, …) on measured paths that process primitives in bulk. A
  `Function<Integer,Integer>` requires boxing semantics; allocation depends on cache ranges,
  escape analysis and surrounding pipeline, while the specialized form avoids that conversion. Do not do the
  reverse — cluttering a cold API with primitive variants — for a cost nobody measured.
- Write your own functional interface when a name carries domain meaning at many call sites
  (`RetryPolicy`, `PricingRule`), when the signature is not expressible with a standard one
  (three parameters, a checked exception, generics with bounds), or when default methods add
  real composition. Annotate it `@FunctionalInterface`: the annotation makes "accidentally
  added a second abstract method" a compile error rather than a broken call site.
- Do not overload a method with two functional-interface parameter types that a lambda could
  match. Overload resolution with an implicit lambda is ambiguous or surprising, and the fix
  after publication is a new method name.
- Checked exceptions do not fit most standard interfaces. Decide per boundary: preserve an API
  that declares the exception, wrap with meaningful unchecked semantics, define
  your own throwing interface and adapt at the boundary, or keep the operation out of the
  pipeline. Never "sneaky throw" a checked exception through a generic cast: the caller cannot
  catch what its signature says cannot happen.
- Lambda object identity is deliberately unspecified. HotSpot commonly reuses a non-capturing
  instance per linked call site and commonly creates state-bearing instances for captures, but
  code must not depend on `==`, identity hash, locking, or allocation count. Measure before hoisting
  or refactoring for allocation.
- A call site receiving many implementation classes can become highly polymorphic and inhibit
  inlining, but thresholds and profile behavior are JVM/tier dependent. That is a profiling finding, not a design
  rule — see jit-inlining-and-escape-analysis before restructuring anything for it.
- Avoid serializing lambdas as durable/public contracts. An intersection cast can request
  `Serializable`, producing a form tied to
  synthetic method names that change with any recompilation; the deserialising side then fails
  in a way that looks like data corruption. Use a named type — see java-serialization-hardening.

- Do not use lambdas as identity-bearing registration keys unless the API returns an explicit
  subscription/token. Recreating textually identical lambdas need not produce an equal or identical
  object, so listener removal and map lookup can fail.

## References

- [Capture, composition and exceptions](references/capture-and-composition.md) — read when a
  lambda captures state, when one is stored or scheduled, when composing predicates and
  functions, or when a checked exception has to cross a functional boundary.
- [Standard interfaces and runtime cost](references/standard-interfaces-and-cost.md) — read
  when choosing an interface (including the primitive variants), when deciding whether a custom
  one is justified, or when lambda cost — allocation, linkage, startup, inlining — is under
  discussion.
