# The API by JDK version

## What "preview" costs in production

| Obligation                         | Consequence                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `--enable-preview` to compile      | `javac --release 25 --enable-preview`; the build must pin the release                                                   |
| `--enable-preview` to run          | every JVM start, including tests, CI and the container entrypoint                                                       |
| Class files are **version-locked** | a class compiled with preview on 25 refuses to load on 26 — `UnsupportedClassVersionError`-class failure, not a warning |
| No compatibility promise           | the API changed in 25, 26 and again in 27; a JDK upgrade can be a code change                                           |
| Libraries cannot ship it           | no library will expose a preview type in its public API, so this stays inside your own code                             |

The version lock is the decisive one for anything shipped as an artefact: a preview build is
not "a jar that runs on 25+", it is "a jar that runs on exactly this JDK". For an
application deployed as a container image with a pinned JDK that is acceptable; for a
library or a shared jar it is not.

If that is too expensive today, the same fan-out with the same **semantics minus the
guarantee** is a virtual-thread executor with explicit joins and an explicit cancel in a
`finally` — more code, no preview flag, and the leak risk back in your hands.

## Signature drift

| Element                       | JDK 21–24 (JEP 453/462/480/499)                          | JDK 25 (JEP 505)                            | JDK 26 (JEP 525)                    | JDK 27 (JEP 533, proposed)             |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------------- | ----------------------------------- | -------------------------------------- |
| Construction                  | `new StructuredTaskScope<>()`, `new ShutdownOnFailure()` | `StructuredTaskScope.open(...)`             | unchanged                           | extra `open` overload                  |
| All-or-fail policy            | `ShutdownOnFailure` + `throwIfFailed`                    | `open()` or `Joiner.allSuccessfulOrThrow()` | unchanged                           | `…OrThrow` throws `ExecutionException` |
| First success                 | `ShutdownOnSuccess` + `result()`                         | `Joiner.anySuccessfulResultOrThrow()`       | **`Joiner.anySuccessfulOrThrow()`** | overload taking an exception mapper    |
| `allSuccessfulOrThrow` result | n/a                                                      | `Stream<Subtask<T>>`                        | **`List<T>`**                       | `List<T>`                              |
| Wait for everything           | `join()` + inspect futures                               | `Joiner.awaitAll()`                         | unchanged                           | result type revised                    |
| Stop at a condition           | n/a                                                      | `Joiner.allUntil(Predicate)`                | unchanged                           | unchanged                              |
| Config parameter              | constructor arguments                                    | `Function<Config, Config>`                  | **`UnaryOperator<Config>`**         | `UnaryOperator<Config>`                |
| Custom joiner callbacks       | n/a                                                      | `onFork`, `onComplete`, `result`            | adds **`onTimeout()`**              | adds exception type parameter          |
| `fork` returns                | `Subtask<T>` (since 21)                                  | `Subtask<T>`                                | `Subtask<T>`                        | `Subtask<T>`                           |
| Failure from `join`           | `ExecutionException` via `throwIfFailed`                 | `FailedException`                           | `FailedException`                   | `ExecutionException`                   |

Read one column. Mixing two is how code ends up calling a method that exists in neither.

## The same fan-out, per version

**JDK 25 (LTS) — the version most production code targets**

```java
Response handle() throws InterruptedException {
    try (var scope = StructuredTaskScope.open()) {          // default policy: fail on first failure
        Subtask<User>    user  = scope.fork(() -> findUser(id));
        Subtask<Integer> order = scope.fork(() -> fetchOrder(id));
        scope.join();                                        // throws FailedException on failure
        return new Response(user.get(), order.get());        // safe only after join
    }
}
```

**JDK 26 — same code, different joiner names when you use them explicitly**

```java
List<Quote> quotes;
try (var scope = StructuredTaskScope.open(Joiner.<Quote>allSuccessfulOrThrow())) {
    suppliers.forEach(s -> scope.fork(() -> quote(s)));
    quotes = scope.join();                                   // 26: List<Quote>. 25: Stream<Subtask<Quote>>.
}
```

**Racing, on each version**

```java
// JDK 25
try (var scope = StructuredTaskScope.open(Joiner.<Price>anySuccessfulResultOrThrow())) { … }

// JDK 26+
try (var scope = StructuredTaskScope.open(Joiner.<Price>anySuccessfulOrThrow())) { … }
```

## Migrating code written against 21–24

```java
// Before (JDK 21–24, now deleted — not deprecated, deleted)
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    Subtask<User> user = scope.fork(() -> findUser(id));
    Subtask<Order> order = scope.fork(() -> fetchOrder(id));
    scope.join();
    scope.throwIfFailed(IllegalStateException::new);
    return new Response(user.get(), order.get());
}

// After (JDK 25+)
try (var scope = StructuredTaskScope.open()) {      // the default policy IS shutdown-on-failure
    Subtask<User> user = scope.fork(() -> findUser(id));
    Subtask<Order> order = scope.fork(() -> fetchOrder(id));
    scope.join();                                   // throws FailedException, cause = the real one
    return new Response(user.get(), order.get());
} catch (StructuredTaskScope.FailedException e) {
    throw new IllegalStateException(e.getCause());  // the mapping throwIfFailed used to do
}
```

Mapping table for the rest:

| JDK 21–24                                  | JDK 25+                                                          |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `new ShutdownOnFailure()`                  | `open()`                                                         |
| `scope.throwIfFailed(f)`                   | `catch (FailedException e)` and map `e.getCause()`               |
| `new ShutdownOnSuccess<T>()` + `result()`  | `open(Joiner.anySuccessfulOrThrow())`, result from `join()`      |
| `scope.joinUntil(Instant)`                 | `open(joiner, cf -> cf.withTimeout(duration))`                   |
| `scope.shutdown()`                         | the joiner's `onComplete` returning `true`, or a custom `Joiner` |
| `subtask.state() == Subtask.State.SUCCESS` | unchanged                                                        |

## Detecting the mismatch early

```bash
# Does this JVM even accept the flag?
java --enable-preview -version

# What is on the classpath — a preview class file will name the exact version it needs
javap -v YourScope.class | grep -i 'major\|minor'   # minor version 65535 == preview
```

A `minor version 65535` in a class file is the preview marker. Seeing it in a released
artefact means that artefact is pinned to one JDK, whether or not anyone intended it.
