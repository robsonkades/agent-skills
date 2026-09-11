---
name: java-optional
description: >
  Optional as designed: a return type for "no result is a normal outcome". Covers orElse
  versus orElseGet (eager versus lazy), orElseThrow over get, map/flatMap/filter chains
  versus a plain conditional, or(), ifPresentOrElse, stream() integration, the costs of Optional
  in fields, parameters or collections, valid exceptions, and when Optional makes an API worse. Use
  when reviewing Optional.get() without a guard, orElse with a costly or side-effecting
  fallback, isPresent()+get() pairs, Optional-typed fields or parameters, or when deciding
  whether a lookup should return Optional, null or throw. Nullability contracts and
  annotations are java-null-safety.
---

# Java Optional

## Purpose

Use Optional where it earns its keep—a return type that makes absence explicit in the type,
though callers can still ignore or misuse it—and avoid it where it degrades the API. Two failure modes to
prevent: Optional as ambient ceremony (fields, parameters, `isPresent()`+`get()`,
chains re-implementing a plain if); and null-hostility that wraps every internal lookup in
an allocation nobody measured.

## Workflow

Examples use Java 21 without preview. Inspect the target compiler release/toolchain and existing
API/nullability contracts first; adopting this skill does not authorize an upgrade. Java 8 has
Optional but not `or`, `stream`, `ifPresentOrElse` (9), no-arg `orElseThrow` (10), or `isEmpty`
(11). On older targets keep a compatible conditional/API rather than adding preview or libraries.
Reuse caller tests, fallback effects and configured serialization/mapper evidence; ask only about
unresolved absence meanings or compatibility constraints that change the choice. Keep an adequate
nullable API or conditional rather than introducing Optional solely for uniformity.

1. **Classify the absent case.** Optional can expose a normal no-result outcome; preserve an
   adequate nullable contract where appropriate. Do not convert a source failure or broken invariant
   into normal absence. “No elements” from a collection-valued method usually means an empty
   collection; `Optional<List<T>>` is justified only for a distinct state such as not-loaded/not-applicable. Not observable by the caller → keep null local
   and do not wrap.
2. **Choose the unwrap by what the caller does.** An already available fallback → `orElse`;
   work required only on absence → `orElseGet`; absence is failure here → `orElseThrow`
   with a specific exception; two side-effecting branches → `ifPresentOrElse` or an
   honest if-statement.
3. **Keep the decision visible.** `map`/`flatMap`/`filter` suit clear transformations and
   predicates. Multiple statements, state or checked-failure adaptation are signals to compare
   a named operation or conditional, not automatic reasons to reject a lambda.
4. **Check the eager/lazy line.** Every `orElse(expression)` argument is evaluated even
   when the value is present. Defer a query, allocation, log or exception only when the contract
   makes that work conditional. Preserve required unconditional effects, possibly by expressing
   them separately from the fallback.
5. **Verify.** Review unguarded `get()` and redundant `isPresent()`+`get()` pairs; retain clear
   conditionals with established invariants. A test covers the
   affected present and empty paths, including fallback effects and failures. Measure representative
   cost when a hot-path change or performance requirement depends on it; do not require a benchmark
   for a correctness change that makes no performance claim.

## Rules

- `orElse(x)` evaluates `x` before the call, even when present. It is a correctness defect when
  that effect or failure is intended only for absence; making required work lazy is also a defect.
- No-argument `orElseThrow()` communicates an assumed presence more clearly than `get()` and both
  throw `NoSuchElementException` when empty. Guarded/internal `get()` can be correct, but review
  whether the invariant is actually established.
- Optional is primarily a return type. It is not `Serializable` for native Java serialization;
  JSON/ORM/bean support depends on the actual tool and configuration. Fields and parameters can
  complicate consumer use and often lose
  clearer named overloads. These are design costs, not language prohibitions: immutable internal
  models, callbacks or aligned optional slots can have explicit semantics that justify them.
- Usually return an empty collection for “zero results.” Use `Optional<Collection<...>>` only when
  absence is observably different from a present empty result (for example not loaded, unsupported,
  or cache miss), and name/document that distinction.
- In streams, `flatMap(Optional::stream)` converts `Stream<Optional<T>>` to present
  values. Prefer it over `filter(isPresent)`+`map(get)`.
- An Optional chain that replaces a two-line null check must read better than the null
  check, or the null check stays. Chaining is not a virtue; it is a trade.
- A present Optional is an allocation candidate; implementation caching and JIT scalar replacement
  are not API guarantees. On a measured hot
  path, a `@Nullable` return (contract per java-null-safety) is a legitimate choice.
  Require evidence for a performance-motivated switch, while preserving caller semantics.

- `Optional` is a value-based class: do not synchronize on it or use reference identity (`==`,
  `identityHashCode`) as semantics. `map` converts a null mapper result to empty, whereas `flatMap`
  requires the mapper to return a non-null Optional; do not let this silently erase invariant
  violations. `OptionalInt/Long/Double` avoid boxing but have a smaller combinator API.
- A method promising Optional must return an Optional, never null. Distinguish a null Optional
  reference (broken contract) from `Optional.empty()` (normal absence); do not silently flatten
  one into the other. Lazy combinators defer callback invocation, not evaluation of the callback
  expression itself: `orElseGet(makeSupplier())` still calls `makeSupplier()` eagerly.

For a review/change, report the absence contract, preserved or deliberately changed fallback
effects, compatibility impact and present/empty tests actually run. Mark performance reasoning
without measurements as a hypothesis.

## References

- [Semantics and misuse](references/semantics.md) — the per-method contracts (verified
  against the JDK 25 Javadoc) and the misuse table. Read when choosing between
  unwrapping methods or judging a flagged usage.
- [Worked example: a lookup path](references/lookup-refactoring.md) — read when
  refactoring null-returning lookups to Optional, or when deciding which parts of a call
  chain should stay null-based.
