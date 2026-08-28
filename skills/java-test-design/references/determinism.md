# Removing non-determinism

A test is deterministic when its result is a function of the code under test alone. Every
input below is one the JVM or the machine supplies silently, and each is a source of "green
on my machine, red in CI".

## The controllable inputs

| Hidden input                | Symptom                                                          | Substitution                                                                  |
| --------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| System clock                | Fails at a month boundary, at midnight, or in another zone       | Inject `Clock`; `Clock.fixed(...)` in tests                                   |
| Default time zone           | Off-by-one day in CI                                             | Never `LocalDate.now()` without a zone; assert with explicit `ZoneOffset`     |
| Default locale              | `toUpperCase`, formatting and parsing differ (Turkish `i`)       | Pass an explicit `Locale` to every locale-sensitive call                      |
| Default charset             | Bytes differ from the file on disk                               | Pass an explicit `Charset`; `StandardCharsets.UTF_8`                          |
| `HashMap` / `HashSet` order | Assertion on "the first element" fails after an unrelated change | Assert order-independently, or use an ordered collection deliberately         |
| `Random`                    | Fails one run in fifty                                           | Fixed seed: `new Random(42L)`; never `ThreadLocalRandom`, it cannot be seeded |
| `UUID.randomUUID()`         | Ids differ per run, so assertions cannot name one                | Inject a supplier, or assert on shape rather than value                       |
| Filesystem paths and order  | Passes locally, fails in the container                           | `@TempDir`; never rely on `Files.list` ordering                               |
| Fixed ports                 | Fails when two builds run on one agent                           | Bind port 0 and read back the assigned port                                   |
| Test execution order        | Passes alone, fails in the suite                                 | Remove shared state; do not impose an order to fix it                         |
| Wall-clock waiting          | Fails on a loaded CI agent                                       | Await a condition, never a duration (concurrency-testing)                     |

Since JDK 18, `Charset.defaultCharset()` is UTF-8 regardless of platform, which removes the
most common charset surprise — but the _console_ encoding still follows the platform, so a
test that captures `System.out` can still differ. Pass the charset explicitly rather than
relying on the default having converged.

## Clock, concretely

The substitution is a constructor parameter, not a test framework feature:

```java
final class RenewalPolicy {
    private final Clock clock;
    RenewalPolicy(Clock clock) { this.clock = clock; }
    // LocalDate.now(clock) inside
}
```

In production, register `Clock.systemUTC()` (or `Clock.system(zone)` when local dates are
part of the domain) once at the composition root. In tests,
`Clock.fixed(Instant.parse("2026-03-01T10:15:00Z"), ZoneOffset.UTC)`.

For code that must observe time _passing_, use a mutable test clock you advance explicitly —
a small `Clock` subclass over an `AtomicReference<Instant>` — never a sleep. Advancing time
by hand also lets you test the boundary at exactly the timeout, which a sleep cannot.

Mocking `Instant.now()` statically is the alternative offered by Mockito's inline mock maker.
It works and it is the wrong tool: it makes the test pass while leaving production code that
cannot be reasoned about, and it fixes only the calls in the classes you remembered to mock.

## "Passes alone, fails together" — the checklist

Run the failing test alone; if it passes, work down this list.

1. **A `static` mutable field**, in the test or in the code under test — a cache, a registry,
   a counter, a `Locale.setDefault` in a forgotten test.
2. **`@TestInstance(PER_CLASS)`** with mutable fields, so tests inherit each other's state.
3. **A container or database not rolled back**, leaving rows a later test counts.
4. **A singleton initialised on first use**, capturing configuration set by whichever test ran
   first.
5. **A background thread or executor** from an earlier test that is still running.
6. **An unclosed resource** — a connection, a file handle, a mock static — leaking into the
   next test.

The fix is always to remove the sharing. Imposing an order with `@TestMethodOrder` makes the
symptom disappear and preserves the defect: the tests still depend on each other, and the
next person to add a test in the middle gets the failure back.

Jupiter's default order is deterministic but intentionally non-obvious, precisely so that
order-dependence surfaces early rather than in whichever build first runs the tests
differently. Do not defeat it.

## Flakiness is a defect report

A test that fails one run in twenty is telling you one of three things:

- the test depends on something it does not control — fix per the table above;
- the code has a real race that also exists in production — the most valuable of the three,
  and the one that a retry throws away (concurrency-diagnostics, concurrency-testing);
- the environment is not reproducible — a shared database, a fixed port, an external service.

Retry extensions, `@RepeatedTest` as a workaround and `@Disabled` with no ticket all convert
the report into silence. If a test must be removed to unblock a release, delete it and say
so explicitly — a disabled test is worse than no test, because it looks like coverage.
