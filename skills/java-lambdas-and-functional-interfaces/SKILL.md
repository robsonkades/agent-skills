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

1. **Check the shape first.** One abstract method and no state of its own → lambda. Needs
   fields, several methods, a name, or an abstract class → a class (anonymous, nested, or
   top-level).
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
- Keep lambdas to a few lines. A lambda is unnamed and undocumented by construction; when the
  body needs a comment or a paragraph of logic, extract a named method and pass a method
  reference — the name then does the documenting.
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
  `ObjIntConsumer`, …) on paths that process primitives in bulk. Boxing a `Function<Integer,
Integer>` in a loop allocates per element; the specialised form does not. Do not do the
  reverse — cluttering a cold API with primitive variants — for a cost nobody measured.
- Write your own functional interface when a name carries domain meaning at many call sites
  (`RetryPolicy`, `PricingRule`), when the signature is not expressible with a standard one
  (three parameters, a checked exception, generics with bounds), or when default methods add
  real composition. Annotate it `@FunctionalInterface`: the annotation makes "accidentally
  added a second abstract method" a compile error rather than a broken call site.
- Do not overload a method with two functional-interface parameter types that a lambda could
  match. Overload resolution with an implicit lambda is ambiguous or surprising, and the fix
  after publication is a new method name.
- Checked exceptions do not fit the standard interfaces. Decide once per codebase: wrap at the
  throw site into an unchecked domain exception (usually right — java-exception-design), define
  your own throwing interface and adapt at the boundary, or keep the operation out of the
  pipeline. Never "sneaky throw" a checked exception through a generic cast: the caller cannot
  catch what its signature says cannot happen.
- Non-capturing lambdas are effectively singletons — the JVM links the call site once and
  reuses the instance. Capturing lambdas allocate per evaluation (unless escape analysis
  removes it, which it may or may not). This is a reason to hoist a constant lambda out of a
  loop, and it is not a reason to avoid lambdas; measure before treating either as a cost.
- A call site that receives many different lambda implementations becomes megamorphic and stops
  inlining, which can matter on a genuinely hot path. That is a profiling finding, not a design
  rule — see jit-inlining-and-escape-analysis before restructuring anything for it.
- Do not serialise lambdas. Casting to `Serializable` works and produces a form tied to
  synthetic method names that change with any recompilation; the deserialising side then fails
  in a way that looks like data corruption. Use a named type — see java-serialization-hardening.

## References

- [Capture, composition and exceptions](references/capture-and-composition.md) — read when a
  lambda captures state, when one is stored or scheduled, when composing predicates and
  functions, or when a checked exception has to cross a functional boundary.
- [Standard interfaces and runtime cost](references/standard-interfaces-and-cost.md) — read
  when choosing an interface (including the primitive variants), when deciding whether a custom
  one is justified, or when lambda cost — allocation, linkage, startup, inlining — is under
  discussion.
