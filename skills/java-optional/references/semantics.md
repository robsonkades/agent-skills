# Optional semantics and misuse

Contracts below match the JDK 25 Javadoc. Optional is a value-based class: do not compare
instances with `==`, do not lock on them, and do not rely on identity. It does not
implement `Serializable` — one of the reasons it is not a field type.

## Construction

| Method                   | Contract                                                               |
| ------------------------ | ---------------------------------------------------------------------- |
| `Optional.of(v)`         | throws NPE on null — use when null would be a bug and should fail here |
| `Optional.ofNullable(v)` | empty on null — the bridge from null-returning APIs (`Map.get`)        |
| `Optional.empty()`       | the canonical absent value                                             |

## Transformation

| Method         | Contract                                                                               |
| -------------- | -------------------------------------------------------------------------------------- |
| `map(fn)`      | applies `fn` if present; a null result becomes empty (as if by `ofNullable`)           |
| `flatMap(fn)`  | `fn` returns an Optional; returning null from `fn` throws NPE                          |
| `filter(p)`    | keeps the value only if present and `p` holds                                          |
| `or(supplier)` | this if present, else the supplier's Optional; supplier runs only when empty (since 9) |
| `stream()`     | zero-or-one element stream; the flatten tool for pipelines (since 9)                   |

## Unwrapping — where the bugs live

| Method                                 | Contract                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `orElse(x)`                            | **`x` is evaluated on every call**, present or not — Java evaluates arguments before the call; the method merely ignores the result when present |
| `orElseGet(supplier)`                  | supplier invoked **only when empty**                                                                                                             |
| `orElseThrow()`                        | value or `NoSuchElementException` (since 10) — the honest spelling of `get()`                                                                    |
| `orElseThrow(exSupplier)`              | value or the supplied exception — the boundary between "absence is normal" and "absence is failure here"                                         |
| `get()`                                | identical to `orElseThrow()`; the name reads as safe and is not — prefer `orElseThrow`                                                           |
| `ifPresent(action)`                    | action on the value, nothing when empty                                                                                                          |
| `ifPresentOrElse(action, emptyAction)` | both branches, side-effect form (since 9) — beyond one statement per branch, an if reads better                                                  |

The eager/lazy distinction made concrete:

```java
config.timeout().orElse(loadDefault());          // loadDefault() runs on EVERY call
config.timeout().orElseGet(this::loadDefault);   // runs only when timeout is absent
```

With a constant (`orElse(ZERO)`, `orElse("")`) the difference is a dead cheap expression
— `orElse` is correct and simpler there. The rule is about cost and side effects, not a
blanket preference for `orElseGet`.

## Misuse table

| Pattern                                                   | Why it is wrong                                                                  | Replace with                                                                                                                                                     |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `opt.isPresent() ? opt.get() : x`                         | null-check ceremony in new clothes                                               | `opt.orElse(x)` / `orElseGet`                                                                                                                                    |
| `if (opt.isPresent()) { use(opt.get()); }`                | same                                                                             | `opt.ifPresent(this::use)`                                                                                                                                       |
| bare `opt.get()`                                          | throws unguarded, name hides it                                                  | `orElseThrow()`                                                                                                                                                  |
| `orElse(repository.findDefault())`                        | fallback query on every present value                                            | `orElseGet(...)`                                                                                                                                                 |
| `Optional.ofNullable(x).orElse(y)`                        | boxing a ternary                                                                 | `Objects.requireNonNullElse(x, y)` (stricter: throws NPE when both are null, where `orElse` returned null — usually the better contract, but a behaviour change) |
| `Optional.ofNullable(x).map(f).orElse(null)`              | wraps to unwrap into null again                                                  | plain `x == null ? null : f(x)` — or fix the API to return Optional throughout                                                                                   |
| `Optional<List<T>>` return                                | absence has an emptier spelling                                                  | empty list                                                                                                                                                       |
| Optional field                                            | not Serializable, extra indirection, still nullable itself                       | absent-capable field with a contract (java-null-safety), Optional only at the getter if callers need it                                                          |
| Optional parameter                                        | forces wrapping at every call site; three states (present, empty, null Optional) | overload, or two named methods                                                                                                                                   |
| `Optional.of(maybeNull)`                                  | NPE at the wrong place with the wrong message                                    | `ofNullable`, or `requireNonNull` first with a message                                                                                                           |
| `opt == Optional.empty()`                                 | identity comparison on a value-based class                                       | `opt.isEmpty()`                                                                                                                                                  |
| stream: `.filter(Optional::isPresent).map(Optional::get)` | two steps, one of them `get`                                                     | `.flatMap(Optional::stream)`                                                                                                                                     |

## When a chain loses to an if

`map`/`flatMap`/`filter` pay off while every step is a pure transformation. Signs the
chain has gone past its domain and an explicit conditional reads better:

- a branch needs more than one statement, a local variable, or a try/catch — checked
  exceptions do not pass through lambdas;
- the same Optional is consulted twice ("if present do X, and separately if it matched Y
  do Z");
- the chain exists to reach a side effect at the end (`.ifPresent(x -> repo.save(...))`
  buried after four transformations) — the reader loses the action in the plumbing;
- you need the empty case to distinguish _why_ it is empty — Optional erases the reason;
  a sealed result type carries it.
