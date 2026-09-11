# Removing non-determinism

A test is deterministic when controlled code, inputs and environment produce repeatable results. Every
input below is one the JVM or the machine supplies silently, and each is a source of "green
on my machine, red in CI".

## The controllable inputs

| Hidden input                | Symptom                                                          | Substitution                                                                            |
| --------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| System clock                | Fails at a month boundary, at midnight, or in another zone       | Inject `Clock`; `Clock.fixed(...)` in tests                                             |
| Default time zone           | Off-by-one day in CI                                             | Specify the domain zone, or isolate and restore the tested default                      |
| Default locale              | `toUpperCase`, formatting and parsing differ (Turkish `i`)       | Specify the locale, or isolate and restore the tested default                           |
| Default charset             | Bytes differ from the file on disk                               | Pass an explicit `Charset`; `StandardCharsets.UTF_8`                                    |
| `HashMap` / `HashSet` order | Assertion on "the first element" fails after an unrelated change | Assert order-independently, or use an ordered collection deliberately                   |
| `Random`                    | Fails one run in fifty                                           | Seed/replay the generator or failing input; `ThreadLocalRandom` is not seedable         |
| `UUID.randomUUID()`         | Ids differ per run, so assertions cannot name one                | Inject a supplier, or assert on shape rather than value                                 |
| Filesystem paths and order  | Passes locally, fails in the container                           | `@TempDir`; never rely on `Files.list` ordering                                         |
| Fixed ports                 | Fails when two builds run on one agent                           | Bind port 0 and read back the assigned port                                             |
| Test execution order        | Passes alone, fails in the suite                                 | Remove accidental coupling; make required workflow order and ownership explicit         |
| Wall-clock waiting          | Fails on a loaded CI agent                                       | Await bounded completion; distinguish intentional temporal faults (concurrency-testing) |

Since JDK 18, UTF-8 is the default unless configured otherwise (for example `-Dfile.encoding=COMPAT`), which removes the
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
Advancing a Clock does not advance an executor's scheduler or System.nanoTime; test scheduled
work with an appropriate scheduler seam and bounded completion checks (concurrency-testing).

Scoped static mocking can be a temporary legacy seam when constructor changes are impractical.
Check the installed Mockito/JDK support, close the mock and respect its thread scope; prefer
an injected Clock for new design. Do not assume a mock controls worker-thread calls.

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

Prefer removing accidental sharing; when an external resource must be shared, isolate namespaces,
reset reliably or serialize its participating users with the runner's resource protocol.
`@TestMethodOrder` can mask a defect when tests are meant to be independent. An explicitly ordered
workflow is different: preserve whole-scenario selection, failure reporting and resource cleanup;
do not present dependent steps as independent tests.

Jupiter's default method order is deterministic but intentionally non-obvious; it is not random
coverage of all orders. A pass in that order alone does not establish test independence.

## Flakiness is a defect report

A test that fails one run in twenty is telling you one of three things:

- the test depends on something it does not control — fix per the table above;
- the code has a real race that also exists in production — the most valuable of the three,
  and the one that a retry throws away (concurrency-diagnostics, concurrency-testing);
- the environment is not reproducible — a shared database, a fixed port, an external service.

Retry-until-green and unexplained disabling hide the report. Preserve the test and capture all
outcomes during bounded diagnostic repetition. Do not delete or weaken it to unblock a release.
If repository policy permits quarantine, retain visible failures with an owner, issue and expiry;
quarantine is a tracked limitation, not proof of a fix or permission to bypass required checks.
