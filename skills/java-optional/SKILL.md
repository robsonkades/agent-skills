---
name: java-optional
description: >
  Optional as designed: a return type for "no result is a normal outcome". Covers orElse
  versus orElseGet (eager versus lazy), orElseThrow over get, map/flatMap/filter chains
  versus a plain conditional, or(), ifPresentOrElse, stream() integration, why Optional does
  not belong in fields, parameters or collections, and when Optional makes an API worse. Use
  when reviewing Optional.get() without a guard, orElse with a costly or side-effecting
  fallback, isPresent()+get() pairs, Optional-typed fields or parameters, or when deciding
  whether a lookup should return Optional, null or throw. Nullability contracts and
  annotations are java-null-safety.
---

# Java Optional

## Purpose

Use Optional where it earns its keep — a return type that makes "no result" impossible to
ignore — and keep it out of the places where it degrades the API. Two failure modes to
prevent: Optional as ambient ceremony (fields, parameters, `isPresent()`+`get()`,
chains re-implementing a plain if); and null-hostility that wraps every internal lookup in
an allocation nobody measured.

## Workflow

1. **Classify the absent case.** Normal outcome → return Optional. Programming error or
   broken invariant → throw. "Nothing" from a collection-valued method → empty
   collection, never `Optional<List<T>>`. Not observable by the caller → keep null local
   and do not wrap.
2. **Choose the unwrap by what the caller does.** Constant fallback → `orElse`; computed
   or side-effecting fallback → `orElseGet`; absence is failure here → `orElseThrow`
   with a specific exception; two side-effecting branches → `ifPresentOrElse` or an
   honest if-statement.
3. **Chain only transformations.** `map`/`flatMap`/`filter` earn their place when each
   step transforms a value. The moment a branch needs statements, local state, or a
   checked exception, unwrap and write the conditional.
4. **Check the eager/lazy line.** Every `orElse(expression)` argument is evaluated even
   when the value is present. Any fallback that allocates, queries, logs or throws
   belongs in `orElseGet`/`orElseThrow`.
5. **Verify.** No `get()` and no `isPresent()`+`get()` pairs remain; a test covers the
   empty path of every Optional-returning method; any hot-path Optional introduction is
   backed by a measurement, not an assumption either way.

## Rules

- `orElse(x)` evaluates `x` unconditionally. With a side-effecting fallback this is a
  correctness bug, not a style issue — the side effect fires on every present value.
- `orElseThrow()` over `get()`: identical behaviour, honest name. Bare `get()` is a
  review finding.
- Optional is a return type. Not a field (an extra indirection that is not Serializable
  and breaks bean conventions), not a parameter (every caller must wrap, and
  present-vs-empty is a boolean hiding in a box — overloads or two named methods read
  better), not a collection element (`Optional.empty()` in a list is absence wrapped in
  presence — filter it out instead).
- Never `Optional<Collection<...>>` — an empty collection already says "nothing".
- In streams, `flatMap(Optional::stream)` converts `Stream<Optional<T>>` to present
  values. Prefer it over `filter(isPresent)`+`map(get)`.
- An Optional chain that replaces a two-line null check must read better than the null
  check, or the null check stays. Chaining is not a virtue; it is a trade.
- Optional per call is an allocation the JIT may or may not eliminate. On a measured hot
  path, a `@Nullable` return (contract per java-null-safety) is a legitimate choice —
  require the measurement before switching either direction.

## References

- [Semantics and misuse](references/semantics.md) — the per-method contracts (verified
  against the JDK 25 Javadoc) and the misuse table. Read when choosing between
  unwrapping methods or judging a flagged usage.
- [Worked example: a lookup path](references/lookup-refactoring.md) — read when
  refactoring null-returning lookups to Optional, or when deciding which parts of a call
  chain should stay null-based.
