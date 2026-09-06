# Tooling, and the 2004 to 2026 sweep

Read this when following older legacy-testing material, or when the output you must pin is too
large to assert on. The online corpus for this topic is dominated by material written between
2004 and 2020, and a large fraction of its mechanics no longer work.

## What is dead, and why it matters

**PowerMock.** Last release `org.powermock:powermock-core:2.0.9`, published 2020-11-01.
`powermock-api-mockito2:2.0.9` declares `org.mockito:mockito-core:3.3.3` in its published POM.
Dependency management may override it, but that does not prove compatibility with Mockito 5.
Do not introduce PowerMock into a newer stack based on old instructions. An existing legacy
stack may depend on it; inspect resolved versions and preserve the working harness while
planning a compatible seam rather than removing it during unrelated work.

**`mockito-inline`.** The inline mock maker became Mockito's **default in 5.0.0**; the Mockito
javadoc states the artifact "may be abolished in future versions", and `org.mockito:mockito-inline`
is frozen at 5.2.0 (2023-03-09). Adding it to a Mockito 5 build is a no-op at best and a version
conflict at worst. This is the single most common stale instruction in this topic.

**Wall-clock abstractions.** Prefer `java.time.Clock` (Java 8+) for instants and dates; it does
not replace a monotonic elapsed-time source or business-calendar policy. How to inject one is in
`java-test-design/references/determinism.md` and
`java-test-doubles/references/mockito-hazards.md`; this skill only records that the 2004 mechanics
are dead.

## Verified coordinates

Read from `repo1.maven.org` metadata on 2026-08-27. Versions move; the point of the table is the
_artifact ids_ and the traps, which move much more slowly.

| Library        | Coordinate                                   | Note                                                                                                                                                     |
| -------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JUnit          | `org.junit.jupiter:junit-jupiter:5.14.4`     | 6.1.3 exists. `UNVERIFIED:` its minimum JDK and any 5.14 → 6.1 breaking change — prefer 5.14.x                                                           |
| Mockito        | `org.mockito:mockito-core:5.23.0`            | Inline mock maker is the default. On JDK 21+ it self-attaches an agent and the JVM warns; the documented fix is passing the Mockito jar via `-javaagent` |
| AssertJ        | `org.assertj:assertj-core:3.27.7`            | 4.0.0-M1 is a milestone — not in a build that matters                                                                                                    |
| ApprovalTests  | `com.approvaltests:approvaltests:31.0.0`     | Single artifact, `<scope>test</scope>`; supports JUnit 3/4/5 and TestNG                                                                                  |
| ArchUnit       | `com.tngtech.archunit:archunit-junit5:1.5.0` | Here, one narrow rule only — see below. Anything broader is `architecture-testing`                                                                       |
| Testcontainers | `org.testcontainers:testcontainers:2.0.5`    | Last 1.x is 1.21.4. **2.x renamed every module artifact with a `testcontainers-` prefix** — see the trap                                                 |

**The Testcontainers 2.x trap.** `org.testcontainers:junit-jupiter` and
`org.testcontainers:postgresql` stop at 1.21.4; the 2.x artifacts are
`org.testcontainers:testcontainers-junit-jupiter` and `org.testcontainers:testcontainers-postgresql`.
Getting it wrong silently resolves a stale 1.x, or does not resolve at all. An OpenRewrite recipe
exists: `org.openrewrite.java.testing.testcontainers.TestContainers2Migration`.
`UNVERIFIED:` whether Java _package_ names changed in 2.x — sources disagree. Do not state an
import path for a 2.x container class without checking it.

## Approval testing

The technique for pinning output you can recognise but cannot state. Emily Bache's criterion: use
it when the code "is returning a String and you're not sure exactly what that string should be,
but you'll know it's right when you see it". The modern authority is Bache, not Fowler — there is
no Fowler bliki entry on approval or characterisation testing.

**The decision rule:**

| Output                                                               | Pin it with                |
| -------------------------------------------------------------------- | -------------------------- |
| Small, and the expected value can be _stated_                        | Explicit assertions        |
| Large and structured — JSON, HTML, XML, a generated file, a DTO tree | `Approvals.verify(String)` |

**The one call to show is `Approvals.verify(String)`.** `verify(Object)` on a legacy object
silently depends on that object's `toString`, which is how a golden master ends up pinning
garbage with authority (`java-refactoring/references/safety-workflow.md`).

**The objection that kills the technique in practice** — "our output has timestamps and UUIDs" —
is answered by `Options.withScrubber(...)`. Show it, or the reader concludes approval testing
cannot handle real output.

**On CI:** annotate with `@UseReporter(QuietReporter.class)` (or `Junit5Reporter`). The default
`DiffReporter` tries to launch a diff tool, which on a headless agent hangs or fails obscurely.

**The honest cost:** an approved file states no intent. A diff tells you _that_ output changed,
never _why it mattered_, and approving a `.received` file is one keystroke that a tired engineer
performs on a genuine regression. Countermeasures: split a large master by concern, scrub what is
not being tested, and treat "the diff was too big to read" as a build failure rather than an
inconvenience.

## Whether the pinned suite survives

Not this skill's call. `java-refactoring/references/safety-workflow.md` owns characterisation
policy: the pinned suite documents the present, not the intent. Replace opaque assertions with
intent-revealing tests when intent is known, retaining valuable regression rows. Do not delete
the only protection merely because it began as characterization; route the retention decision
to that skill rather than imposing a second blanket policy here.

## The one ArchUnit rule that earns its place here

A rule failing the build when production code references a `*ForTest*`/`*ForTesting*` member, or
when a non-final static field appears outside an allowlist. This is the countermeasure for the
seam that leaked into the production API — the `setClockForTest`, the `protected` factory
overridden only by a test, the `@VisibleForTesting` method now called from three production
classes. Everything broader belongs to `architecture-testing`.
`UNVERIFIED:` a specific `ArchRule` DSL expression for this was not verified against 1.5.0.

## The sweep: Feathers's mechanics in Java 21/25

The book's _reasoning_ survives essentially intact. A significant fraction of its _mechanics_ does
not.

| Feathers (2004)                                                                    | Status                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JUnit 3/4 idioms — `extends TestCase`, `setUp()`, `@RunWith`                       | **Superseded.** JUnit 5, `@BeforeEach`, extensions instead of runners                                                                                                                                                               |
| Hand-rolled time abstractions                                                      | Prefer `java.time.Clock` for wall-clock instants/dates; monotonic elapsed time or domain calendars may need another abstraction                                                                                                     |
| Setter injection / Supersede Instance Variable as the realistic substitution route | **Largely superseded.** Constructor injection is the default; a `final` field assigned once in the constructor _is_ the seam. Supersede Instance Variable is now a smell                                                            |
| Replace Function with Function Pointer (C only)                                    | **Java equivalent is idiomatic:** a `Supplier`/`Function` field or parameter. A single-method behaviour seam needs no interface                                                                                                     |
| Value objects as hand-written classes; parameter objects                           | **Records (JEP 395, JDK 16) make value seams trivial** — correct `equals`/`hashCode`/`toString` for free, which also stabilises approval output                                                                                     |
| Subclass and Override, Extract Implementer, Push Down Dependency                   | **Still current, still the workhorse.** Modern caveat: a sealed type restricts direct subclasses to its permits/module/package contract; use an allowed extension seam or injection rather than assuming any test subclass is legal |
| Extract and Override / test subclasses generally                                   | **Still current**, with a caveat Feathers did not face: `final` classes and methods block it. Mockito 5 can mock `final`, but that is instrumentation, not a seam — the design answer is still Parameterize Constructor             |
| In-memory / fake databases to get persistence code under test                      | Use the real database engine for SQL/transaction semantics; a fake port remains useful for isolated domain policy. Testcontainers needs a compatible runtime and does not replace every fake                                        |
| "The tests are too slow to run often"                                              | Partially superseded — parallel execution, container reuse, modern hardware. The _design_ argument for small units survives; the _speed_ argument should not be the headline                                                        |

**Not superseded, and rarely covered by modern material:** effect analysis (ch. 11) and
interception/pinch points (ch. 12). Both are in `references/seams-and-interception.md` — they are
what answers "where do I put the test?".

## Sources

- [Java 21 Clock](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/time/Clock.html) — `systemDefaultZone()` captures the selected zone; it is not a monotonic timer.
- Maven Central metadata, read 2026-08-27, for every coordinate above.
- Mockito javadoc on `main` for the inline-mock-maker default and the JDK 21+ instrumentation note.
- Published `powermock-api-mockito2:2.0.9` POM for the Mockito 3.3.3 pin.
- [Emily Bache on approval testing](https://coding-is-like-cooking.info/2021/03/why-we-should-be-saying-approval-testing-instead-of-golden-master/)
  and `sammancoaching.org/learning_hours/legacy/approval_testing_intro.html`.
- ApprovalTests `Approvals.java`, `UseReporter.java` and `Options` read from source on `master`.
