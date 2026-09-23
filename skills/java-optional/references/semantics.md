# Optional semantics and misuse

Contracts below match the Java 21 API. Optional is a value-based class: do not compare
instances with `==`, do not lock on them, and do not rely on identity. It does not
implement `Serializable`—one reason it is often a poor persistence/DTO field type, not a language ban.

## Construction

| Method                   | Contract                                                               |
| ------------------------ | ---------------------------------------------------------------------- |
| `Optional.of(v)`         | throws NPE on null — use when null would be a bug and should fail here |
| `Optional.ofNullable(v)` | empty on null — the bridge from null-returning APIs (`Map.get`)        |
| `Optional.empty()`       | an absent value; do not assume singleton identity                      |

`Optional.ofNullable(map.get(key))` merges an absent key and a key mapped to null when the
map permits null values. Use it only when that distinction is irrelevant or the map enforces
non-null values. If a stored null is corrupt data, reject it rather than report normal absence.

## Transformation

| Method         | Contract                                                                                                               |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `map(fn)`      | applies `fn` if present; a null result becomes empty (as if by `ofNullable`)                                           |
| `flatMap(fn)`  | `fn` returns an Optional; returning null from `fn` throws NPE                                                          |
| `filter(p)`    | keeps the value only if present and `p` holds                                                                          |
| `or(supplier)` | present value or the supplier's Optional; supplier runs only when empty (since 9), with no instance-identity guarantee |
| `stream()`     | zero-or-one element stream; the flatten tool for pipelines (since 9)                                                   |

## Unwrapping — where the bugs live

| Method                                 | Contract                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `orElse(x)`                            | **`x` is evaluated on every call**, present or not — Java evaluates arguments before the call; the method merely ignores the result when present |
| `orElseGet(supplier)`                  | supplier invoked **only when empty**                                                                                                             |
| `orElseThrow()`                        | value or `NoSuchElementException` (since 10) — the honest spelling of `get()`                                                                    |
| `orElseThrow(exSupplier)`              | value or the supplied exception — the boundary between "absence is normal" and "absence is failure here"                                         |
| `get()`                                | identical to `orElseThrow()`; the name reads as safe and is not — prefer `orElseThrow`                                                           |
| `ifPresent(action)`                    | action on the value, nothing when empty                                                                                                          |
| `ifPresentOrElse(action, emptyAction)` | exactly one selected branch, side-effect form (since 9); compare a conditional when it makes the decision clearer                                |

The eager/lazy distinction made concrete:

```java
config.timeout().orElse(loadDefault());          // loadDefault() runs on EVERY call
config.timeout().orElseGet(this::loadDefault);   // runs only when timeout is absent
```

With a constant (`orElse(ZERO)`, `orElse("")`) the difference is a dead cheap expression
— `orElse` is correct and simpler there. The rule is about cost and side effects, not a
blanket preference for `orElseGet`.

Laziness applies to invoking the supplier, not creating it: `orElseGet(makeSupplier())` and
`orElseGet(loadService()::fallback)` evaluate those factory/receiver expressions eagerly.
Use `orElseGet(() -> loadService().fallback())` when that work itself must wait for absence.
`or` requires a non-null Optional from its supplier, whereas `orElseGet` may return null.
Check null callback arguments against the method contract; conditional invocation is not a
blanket promise that passing a null callback is permitted.

## Common smells and exceptions

| Pattern                                                   | Review concern                                             | Alternatives                                                                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `opt.isPresent() ? opt.get() : x`                         | may be simpler as an unwrap                                | `orElse` for an already available value or `orElseGet` for conditional work; retain a clear ternary                              |
| `if (opt.isPresent()) { use(opt.get()); }`                | may be simpler as one conditional action                   | consider `opt.ifPresent(this::use)`; keep a guarded block when it makes the work clearer                                         |
| bare `opt.get()`                                          | absence may be unhandled                                   | establish presence or handle absence; `orElseThrow()` clarifies an intentional failure but still throws                          |
| `orElse(repository.findDefault())`                        | query runs even when present                               | `orElseGet(...)` when the query is required only on absence                                                                      |
| `Optional.ofNullable(x).orElse(y)`                        | wrapper may add no useful contract                         | a plain conditional; `Objects.requireNonNullElse(x, y)` (Java 9+) only when both-null must fail, since the original returns null |
| `Optional.ofNullable(x).map(f).orElse(null)`              | wraps to unwrap into null again                            | `x == null ? null : f.apply(x)` for stable `x` and non-null `f`; preserve callback evaluation as described below                 |
| `Optional<List<T>>` when absence means zero results       | absence has an emptier spelling                            | empty list; retain Optional only for a documented not-loaded/not-applicable state                                                |
| Optional field in persistence/bean DTO                    | native serialization unsupported; other codecs vary        | nullable/explicit result state, or retain Optional with a verified tool/consumer contract and a non-null Optional reference      |
| Optional parameter with no composition benefit            | forces wrapping; three states if null Optional is accepted | reject null and prefer overload/two named methods; retain when a functional API genuinely composes Optional                      |
| `Optional.of(maybeNull)`                                  | NPE if null occurs                                         | keep `of` for invalid null; use `ofNullable` only for legitimate absence, or an explicit check for the required diagnostic       |
| `opt == Optional.empty()`                                 | identity comparison on a value-based class                 | `opt.isEmpty()`                                                                                                                  |
| stream: `.filter(Optional::isPresent).map(Optional::get)` | two steps, one of them `get`                               | `.flatMap(Optional::stream)`                                                                                                     |

## When a chain loses to an if

The patterns above are review leads, not unconditional rewrites. In particular, a ternary
evaluates only its selected branch: replace a computed/side-effecting fallback with
`orElseGet(() -> x)`, not eager `orElse(x)`. Preserve the contract when both values can be null;
`Objects.requireNonNullElse` would change it. `Optional.of` is appropriate when null is a defect,
and an explicit guarded `get` can be the clearest way to express several related operations.

The `map(f)` rewrite assumes an already evaluated, non-null `Function`. `map` rejects a null
mapper even when the Optional is empty, whereas the conditional skips `f.apply` when `x` is null.
Preserve that validation if null callbacks are possible. A factory expression such as
`map(makeMapper())` is also evaluated on the empty path; moving the factory into only the
present branch would change its effects or failures. Preserve evaluation order and count.

`map`/`flatMap`/`filter` pay off when transformations and predicates remain clear. Signs the
chain has gone past its domain and an explicit conditional reads better:

- a branch hides state or failure handling in several statements. Optional's `Function`/`Predicate`
  callbacks cannot directly propagate an unhandled checked exception; use a conditional or an
  explicit adaptation policy. `orElseThrow(() -> new IOException(...))` instead returns an exception
  value from its supplier, and `orElseThrow` propagates it through its generic `throws X` contract;
- the same Optional is consulted twice ("if present do X, and separately if it matched Y
  do Z");
- the chain exists to reach a side effect at the end (`.ifPresent(x -> repo.save(...))`
  buried after four transformations) — the reader loses the action in the plumbing;
- you need the empty case to distinguish _why_ it is empty — a single empty Optional erases the
  reason; an existing domain result, enum/tagged state or sealed result may make it explicit.

These are clarity and contract checks, not a statement-count limit. Preserve any meaningful
missing/explicit-null/empty distinctions at a wire boundary; a codec must carry states that one
Optional cannot distinguish. Do not flatten positional empty slots or nested absence states unless
their loss is intended by the consumer contract.

## Source

- [Java 21 Optional API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Optional.html) — callback/null contracts and method introduction versions.
- [Java 21 Map API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Map.html) — `get` may return null for either an absent key or a stored null value.
