# The API by JDK version

## What "preview" costs in production

| Obligation                                        | Consequence                                                                                                                |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `--enable-preview` to compile                     | `javac --release 25 --enable-preview`; the build must pin the release                                                      |
| `--enable-preview` to run                         | every JVM start, including tests, CI and the container entrypoint                                                          |
| Preview-marked class files are **version-locked** | a class using Java 25 preview features refuses to load on 26 — `UnsupportedClassVersionError`-class failure, not a warning |
| No compatibility promise                          | the API changed in 25, 26 and again in 27; a JDK upgrade can be a code change                                              |
| Public library API risk                           | a library _can_ expose a preview type, but consumers inherit the exact-JDK and preview-flag obligations                    |

The version lock is the decisive one for anything shipped as an artefact: a preview build is
not "a jar that runs on 25+", it is "a jar that runs on exactly this JDK". For an
application or shared library, acceptability depends on all consumers owning that feature-release
and preview contract; it is not a universal prohibition on shared jars.

If that is too expensive, an executor on a compatible final JDK can use explicit joins,
cancellation and termination waits. Completion policy, context and cleanup remain application
responsibilities; its semantics are not automatically identical to a scope.

## Signature drift

| Element                       | JDK 21–24 (JEP 453/462/480/499)                          | JDK 25 (JEP 505)                            | JDK 26 (JEP 525)                    | JDK 27 (JEP 533, delivered)                                                |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------- |
| Construction                  | `new StructuredTaskScope<>()`, `new ShutdownOnFailure()` | `StructuredTaskScope.open(...)`             | unchanged                           | extra `open` overload                                                      |
| All-or-fail policy            | `ShutdownOnFailure` + `throwIfFailed`                    | `open()` or `Joiner.allSuccessfulOrThrow()` | unchanged                           | `…OrThrow` throws `ExecutionException`                                     |
| First success                 | `ShutdownOnSuccess` + `result()`                         | `Joiner.anySuccessfulResultOrThrow()`       | **`Joiner.anySuccessfulOrThrow()`** | overload taking an exception mapper                                        |
| `allSuccessfulOrThrow` result | n/a                                                      | `Stream<Subtask<T>>`                        | **`List<T>`**                       | `List<T>`                                                                  |
| Wait for everything           | `join()` + inspect subtasks                              | `Joiner.awaitAll()`                         | unchanged                           | `awaitAll()` removed; select/customize policy                              |
| Stop at a condition           | n/a                                                      | `Joiner.allUntil(Predicate)`                | unchanged                           | unchanged                                                                  |
| Config parameter              | constructor arguments                                    | `Function<Configuration, Configuration>`    | **`UnaryOperator<Configuration>`**  | `UnaryOperator<Configuration>`                                             |
| Custom joiner callbacks       | n/a                                                      | `onFork`, `onComplete`, `result`            | adds **`onTimeout()`**              | `onTimeout` replaced by `timeout`; exception type parameter                |
| `fork` returns                | `Subtask<T>` (since 21)                                  | `Subtask<T>`                                | `Subtask<T>`                        | `Subtask<T>`                                                               |
| Failure from `join`           | `ExecutionException` via `throwIfFailed`                 | `FailedException`                           | `FailedException`                   | standard `…OrThrow`: `ExecutionException`; custom policy/mapper may differ |

Read one column. Mixing two is how code ends up calling a method that exists in neither.
Examples are partial: supply domain types/functions and imports for the scope, nested
`Subtask`/`Joiner` and collection/time types. Preview requires the matching feature-release
compiler, not just a newer javac's `--release`.
[JDK 27 reached GA on 15 September 2026](https://openjdk.org/projects/jdk/27/);
structured concurrency remains a preview API. Inspect the actual vendor build deployed.
On [JDK 21](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/concurrent/StructuredTaskScope.html),
fork/shutdown may also be called by contained threads, while join/close are owner-only.
Do not carry that fork permission into JDK 25's owner-only API.

## The same fan-out, per version

**JDK 25 — the long-term-support baseline used by major vendors**

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

// After (JDK 25; consult the table before targeting a later preview)
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

| JDK 21–24                                  | JDK 25 migration (recheck 26/27 above)                                |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `new ShutdownOnFailure()`                  | `open()`                                                              |
| `scope.throwIfFailed(f)`                   | `catch (FailedException e)` and map `e.getCause()`                    |
| `new ShutdownOnSuccess<T>()` + `result()`  | 25: `open(Joiner.anySuccessfulResultOrThrow())`, result from `join()` |
| `scope.joinUntil(Instant)`                 | `open(joiner, cf -> cf.withTimeout(duration))`                        |
| `scope.shutdown()`                         | the joiner's `onComplete` returning `true`, or a custom `Joiner`      |
| `subtask.state() == Subtask.State.SUCCESS` | unchanged                                                             |

## Detecting the mismatch early

```bash
# Does this JVM even accept the flag?
java --enable-preview -version

# What is on the classpath — a preview class file will name the exact version it needs
javap -v YourScope.class | grep -i 'major\|minor'   # minor version 65535 == preview
```

A `minor version 65535` in a class file is the preview marker; enabling the compiler flag alone
does not mark a class that uses no preview feature. Seeing the marker in a released
artefact means that artefact is pinned to one JDK, whether or not anyone intended it.

Primary references: [JDK 25 API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/StructuredTaskScope.html),
[JEP 525](https://openjdk.org/jeps/525), [JEP 533](https://openjdk.org/jeps/533).
