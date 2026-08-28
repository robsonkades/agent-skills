---
name: java-legacy-code-testing
description: >
  Getting Java code under test before you change it, when you cannot construct the class or
  reach the method at all: seams and their enabling points, the dependency-breaking
  catalogue (Parameterize Constructor, Extract Interface, Extract and Override, Introduce
  Instance Delegator, Break Out Method Object, Expose Static Method), Sprout and Wrap when
  there is no time, approval testing when the output to pin is too large to assert on, and
  the disciplines that make a change safe while no test exists. Use when a constructor opens
  a connection, when a method reads a static singleton, when a test would need the real
  database, when mockStatic is proposed, when a setXxxForTest is being added, or when
  2004-era advice (PowerMock, mockito-inline) is followed. Does not cover
  characterisation-test mechanics (java-refactoring), strangler work
  (legacy-enterprise-modernization), doubles (java-test-doubles), test level
  (java-testing-strategy), the red-green-refactor loop (tdd), or how a test is written
  (java-test-design).
---

# Java Legacy Code Testing

## Purpose

`java-refactoring` step 1 states "no net, no refactoring" and asks for characterisation tests
first. This skill exists for the situation where you cannot: `new OrderProcessor()` opens a
database connection, the method you must change reads `LocalDate.now()` and a static singleton,
and the class is `final`. There is no test to write yet, and the change that would make one
possible is itself untested.

Feathers's definition is the working one — _"To me, legacy code is simply code without tests"_ —
and
his answer is a category of refactoring meant to be performed **before** any test exists:

> "The refactorings in _Dependency-Breaking Techniques_ are special in that they are meant to be
> done **without tests**, in the service of putting tests in place." — Feathers, p. xxi

This skill owns that step and stops the moment the code is callable. What you do with the net
once you have it is `java-refactoring`.

## Scope

**Covers:** the seam model and enabling points in Java, the dependency-breaking catalogue, Sprout
and Wrap, the disciplines that substitute for a test while you make the seam, and what in
2004-era legacy-testing advice is now dead.

**Does not cover, and routes to:** writing the characterisation tests themselves — method,
worked example, pinning non-return-value dimensions, when it is not worth it
(`java-refactoring/references/safety-workflow.md`) · the refactoring catalogue you apply once
tests exist (`java-refactoring`) · strangler, anti-corruption layer, decommissioning and
characterising at a system boundary (`legacy-enterprise-modernization`) · which double to use and
`mockStatic` policy (`java-test-doubles`) · which level to test at (`java-testing-strategy`) ·
test naming and structure (`java-test-design`) · the red-green-refactor loop (`tdd`) · whether
the debt is worth repaying at all (`technical-debt-decisions`).

## Workflow

Feathers's Legacy Code Change Algorithm (ch. 2, p. 18), unchanged since 2004 because nothing has
superseded it:

1. **Identify change points.** Where must the behaviour differ? No change point, no work — see
   Over-application.
2. **Find test points.** Where can you observe the effect of the change? Not necessarily where
   you make it — if a coarser point is already reachable, pin there first and proceed. The
   deadlock below is only about the narrow test you cannot yet reach. `references/seams-and-interception.md` covers effect analysis and choosing the
   narrowest interception point.
3. **Break dependencies.** Only enough to reach step 4. This is the catalogue below.
4. **Write the tests.** Characterisation, by running the code and recording what it does —
   mechanics in `java-refactoring/references/safety-workflow.md`.
5. **Make the change and refactor.** Now the net exists; `java-refactoring` takes over.

Steps 3 and 4 are the ones people invert, and inverting them is the deadlock this skill resolves.

## Seam and enabling point

> "A seam is a place where you can alter behavior in your program without editing in that place."
>
> "Every seam has an enabling point, a place where you can make the decision to use one behavior
> or another."
>
> — Feathers, ch. 4; corroborated via Fowler, `bliki/LegacySeam.html`

The distinction is the single most useful thing the vocabulary buys, because it diagnoses the
commonest failed attempt: `Extract Interface` is applied, `PaymentGateway` now has one
implementation and one mock — but the class under test still calls `new PaymentGatewayImpl()`
internally. **The seam exists and the enabling point does not.** An interface whose only non-test
implementor is constructed with `new` inside its own consumer has bought nothing.

Feathers names three kinds. In Java one of them is unavailable and a fourth has appeared, and the
ordering below is not taste:

| Seam                         | Enabling point                                        | Verdict                                                                                                                             |
| ---------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Object seam**              | the constructor call in the composition root          | **The default.** Visible in source, and already where the application wires itself                                                  |
| **Link seam**                | the test classpath — shadowing, `ServiceLoader`, JPMS | Last resort: no enabling point exists _in the source_, so a reader cannot see the swap                                              |
| **Bytecode instrumentation** | the `try`-with-resources around `mockStatic`          | Technically a seam, invisible from production code — it removes the pressure that would have fixed the design (`java-test-doubles`) |

Java has **no preprocessing seam**, and annotation processing is not a substitute
(`references/seams-and-interception.md`).

## Choosing the technique

The obstacle decides, not the technique's popularity. Full catalogue with preconditions and
costs in `references/dependency-breaking-catalogue.md`; read it before applying anything below.

| The obstacle                                                                    | Technique                                                             |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| The constructor `new`s a collaborator that does I/O                             | **Parameterize Constructor**                                          |
| The method creates the object it depends on                                     | **Parameterize Method**                                               |
| A static or singleton is read mid-method                                        | **Introduce Instance Delegator** or **Encapsulate Global References** |
| The collaborator's type is untestable (`HttpServletRequest`, a vendor SDK type) | **Adapt Parameter**                                                   |
| Only a subset of a fat class's methods are needed                               | **Extract Interface** — of that subset only                           |
| The good name belongs to the class, not the interface                           | **Extract Implementer**                                               |
| One awkward call inside an otherwise reachable method                           | **Extract and Override Call**                                         |
| Logic that touches no instance state, in an unconstructible class               | **Expose Static Method**                                              |
| A long method whose locals are hopelessly entangled                             | **Break Out Method Object**                                           |
| Nothing works and the class is `final` with a `private` constructor             | Reconsider **Sprout** below                                           |

Each technique's precondition and cost is in the catalogue reference; do not apply one without
reading its cost. Time is the exception that is not in the table: `LocalDate.now()` and
`Instant.now()` are answered by injecting a `java.time.Clock`, and how to do that is
`java-test-design` (`references/determinism.md`) and `java-test-doubles` — this skill only records
that Feathers's hand-rolled time abstraction is dead.

## What you may change before a test exists

This is where the repo's own rule needs qualifying rather than repeating. `java-refactoring`'s
"no net, no refactoring" is correct for **category 2** below and is a deadlock for **category 1**.

1. **Behaviour-preserving by construction**, applied only to create a seam: Parameterize
   Constructor with a delegating old constructor, Extract Interface, Extract Method, Rename —
   performed by the IDE, signature preserved, revertible in one commit.
2. **Everything else** — reordering statements, merging branches, changing an extraction point,
   altering a condition. These need the pinned suite first, no exceptions.

For category 1, Feathers's four disciplines (ch. 23) substitute for the test you cannot yet have:

- **Preserve Signatures.** Change no signature during the step. If nothing a caller can see
  changed, cut-and-paste is verifiable by eye. This is why the delegating old constructor matters.
- **Lean on the Compiler.** Make the change that _forces_ a compile error at every site that must
  move, then fix them. Deliberately breaking compilation is a search tool, not an accident.
- **Single-Goal Editing.** One goal per editing session. "While I'm in here" is how a category-1
  step becomes a category-2 change with no net.
- **Hyperaware Editing.** Know why every keystroke is safe. If you cannot say why, stop.

State which category a step is in, in the commit message. A reviewer cannot otherwise tell a
compiler-guaranteed move from a rewrite.

## Before and after

Run `scripts/renewal-service/verify.sh` when you need to show a sceptic that the obstacle is real
rather than stylistic — it asserts that the before state cannot be constructed at all.

```java
// Before — two obstacles, needing two different techniques.
final class RenewalCheck {
    private final RateGateway rates = new RateGateway();   // 1: connects at construction
    List<String> due(List<Policy> policies) {
        LocalDate today = LocalDate.now();                 // 2: hidden global
        ...
    }
}
```

The first line of any test — `new RenewalCheck()` — throws before an assertion is reached:
measured, `IllegalStateException: RateGateway: cannot connect to policy-db`. And `LocalDate.now()`
leaves the assertion with no stable expected value, so a test that passes today and fails in
thirty days is worse than no test at all.

The after state applies **Extract Interface** under a _new_ name — `interface Rates`, with
`RateGateway implements Rates` keeping the name it already had — and **Parameterize Constructor**,
retaining a delegating `RenewalCheck()` that passes `new RateGateway()` and
`Clock.systemDefaultZone()`. Both halves are Preserve Signatures: no caller of `RateGateway` and no
caller of `RenewalCheck` compiles differently, and that is what licenses the step with no test in
place. (`systemDefaultZone`, not `systemUTC`: anything else changes behaviour, which this step is
not allowed to do.) Delete the old constructor in a later commit, once callers have moved.

Naming the interface `RateGateway` and renaming the class would have been **Extract Implementer**
(p. 356) instead — a different technique with a different cost, because every `new RateGateway()`
in the codebase then stops compiling.

The test then needs no mocking framework: a lambda stub for `Rates`, a fixed clock, and the answer
is `[P1]` on every machine on every date — measured. `mockStatic(LocalDate.class)` also makes that
test pass, and leaves the design exactly as broken.

## When there is no time: Sprout and Wrap

You must add behaviour to a 600-line method by Thursday. Reading it is a week you do not have.

- **Sprout Method / Sprout Class** — write the new behaviour as a new, fully tested unit and call
  it from one line inside the untested body. You never read the rest.
- **Wrap Method / Wrap Class** — rename the original, give the new method the old name, and have
  it call both. Use when the new behaviour must happen _around_ the old rather than inside it.

Say the honest thing when you use these: they buy safety for the **new** code and leave the legacy
body exactly as untested as it was, plus one more seam in a class that already had too many
shapes. They answer "I have two days"; they do not answer "how do we fix this".

## Over-application

- **An interface for every collaborator.** Extract Interface applied uniformly produces forty
  `Thing`/`ThingImpl` pairs, each with one implementation and one mock. Navigation doubles, the
  interface accretes the whole class surface and documents nothing, and the mocks now let every
  test lie about a collaborator that was never the risk. Feathers's own version is narrower:
  extract **the subset the client actually uses**. An interface with one permanent implementation
  is indirection, not abstraction (`java-dependency-inversion`).
- **A `Clock` everywhere.** Every constructor gains a `Clock` because "inject the clock" became a
  rule; classes that never read the time carry a field they ignore and every test constructs a
  clock it does not use. Inject it where `now()` is called. Nowhere else.
- **Characterising code that is about to be deleted.** `java-refactoring` already excludes this;
  the corollary this skill adds is the replacement case. If the code is being _replaced_ rather
  than deleted, characterise at the boundary that survives — the HTTP contract, the batch output — which is
  `legacy-enterprise-modernization`'s move, not this skill's.
- **A harness around genuinely stable code.** A tax-table lookup untouched for six years with no
  pending change and no incidents. The algorithm starts at "identify change points": no change
  point, no work. Coverage of stable code is a metric, not a benefit.
- **Seams for their own sake.** Every `new` becomes a factory method, every static a delegator,
  in code nobody is changing — indirection with a testing justification attached.

## Rules

- Break dependencies only as far as step 4 needs. The refactoring you want to do is a separate
  commit, after the tests exist.
- Never change a signature during a dependency-breaking step. Add, delegate, and delete the old
  path in a later commit.
- A seam without an enabling point is not a seam. Before declaring one done, name the line that
  chooses the behaviour.
- Do not add `setXxxForTest`, a public mutable static, or a `protected` factory method without a
  ticket to remove it. These leak into production and become permanent mutable globals — the one
  place an ArchUnit rule earns its keep here is failing the build when production code reaches one
  (`references/tooling-and-modernization.md`).
- `mockStatic` is the last option, not the first. It is a real seam with an invisible enabling
  point, so it removes exactly the pressure that would have fixed the dependency
  (`java-test-doubles`). If you use it, ticket the wrap.
- Reject any advice built on **PowerMock** (last release 2020, pins Mockito 3.3.3, documents
  JDK ≤ 9) or on adding **`mockito-inline`** (the inline mock maker has been Mockito's default
  since 5.0.0; the artifact is frozen at 5.2.0). Both dominate the online corpus for this topic.
- "We'll write the tests after the refactor" ends with unfamiliar untested code, which is
  strictly worse than the familiar untested code you started with.

## Verification

- **The class is constructible in a test with no container, no database and no agent.** That is
  the whole objective of steps 1–3; everything else is commentary.
- **The enabling point is a line you can point at.** If nobody can name it, the seam is decorative.
- **The test fails when the behaviour changes.** The mutation check is
  `java-refactoring/references/safety-workflow.md`'s; run it here too, because a suite that stays
  green through a deliberate mutation means step 4 did not happen.
- **The step is revertible in one commit** and touched no signature. Check `git diff` for changed
  public signatures before pushing a category-1 step.
- **`grep -c 'mockStatic('` is not rising** across the module, and no identifier matching
  `*ForTest*` is reachable from production code.
- **Time is injected, not frozen by luck.** `grep` for `LocalDate.now()`, `Instant.now()` and
  `System.currentTimeMillis()` in the class you just covered.

## Review prompts

- What exactly stops this class from being constructed in a test? Name the line.
- Where is the enabling point for this seam, and can a reader of the class see it?
- Is this change behaviour-preserving by construction, or does it need the net first?
- Did any signature change in this commit? If so, why was that necessary now?
- Is this `protected` method, test-only setter or interface going to be deleted, and when?
- Are we pinning behaviour we are about to delete?
- What is the change point? If there is none, why are we here?

## References

- [Dependency-breaking catalogue](references/dependency-breaking-catalogue.md) — read before
  applying any technique: every Java-relevant entry from Feathers ch. 25 plus Sprout and Wrap
  from ch. 6, each with its precondition, its cost, the modern Java caveat, and the two Feathers
  himself disliked.
- [Seams and interception points](references/seams-and-interception.md) — read when the question
  is _where_ to put the test rather than how to reach the code: the seam taxonomy in Java detail,
  what replaces preprocessing seams, effect analysis, and choosing a pinch point so one test
  covers a cluster of changes.
- [`scripts/renewal-service/`](scripts/renewal-service/) — `Before.java`, `After.java` and
  `verify.sh`. Run it when someone argues the obstacle is a matter of taste: the before state
  throws at construction, the after state is deterministic, and the script fails if that stops
  being true.
- [Tooling and the 2004 to 2026 sweep](references/tooling-and-modernization.md) — read when
  following older legacy-testing material, or when the output is too large to assert on: verified
  library coordinates, approval testing with scrubbers and a CI-safe reporter, and the table of
  what in Feathers's mechanics has been superseded and by what.
