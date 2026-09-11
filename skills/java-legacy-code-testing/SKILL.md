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

This skill owns reaching a useful test point and demonstrating its first meaningful assertion,
with any untested effects explicit. Building out the characterization net and changing behavior
then belong to `java-refactoring`.

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

Examples compile for Java 21 without preview; applying the skill does not require upgrading a
legacy project. Inspect its release/toolchain, test framework, mock maker, runtime and build
constraints first. Reuse compatible tooling and report missing evidence rather than importing
the version table into the build. Prefer an already reachable boundary before editing a seam.
Use existing caller tests, incidents and the requested assurance objective; ask only about a
material unresolved behavior or ownership contract. No new seam is needed when current access
already supports the required check.

Use Feathers's Legacy Code Change Algorithm (ch. 2, p. 18), adapted here to include an explicit
assurance objective:

1. **Identify change points or the explicit assurance risk.** What must change or become verified?
   Avoid structural work justified only by coverage counts — see Over-application.
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
internally. **The interface alone has not enabled substitution.** Locate or add the point that
selects the collaborator for this test; declaring a type does not supply that selection.

Feathers names three kinds. Java has no built-in preprocessor; instrumentation adds another
mechanism. Prefer the smallest suitable seam, including one the project already supports:

| Seam                         | Enabling point                                             | Verdict                                                                                                    |
| ---------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Object seam**              | the constructor call in the composition root               | **The default.** Visible in source, and already where the application wires itself                         |
| **Link seam**                | test classpath/module configuration and provider selection | Existing provider wiring can suffice; verify discovery/selection and isolation before adding another seam  |
| **Bytecode instrumentation** | scoped mocking setup and teardown                          | Can preserve a constrained legacy API; verify tool support, thread scope and cleanup (`java-test-doubles`) |

Build-selected generated wiring needs an actual enabling point and its own verification;
annotation processing alone does not create one (`references/seams-and-interception.md`).

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
`java-test-design` (`references/determinism.md`) and `java-test-doubles`. Retain an adequate
existing time abstraction, especially for monotonic elapsed time or business-calendar policy.

## What you may change before a test exists

This is where the repo's own rule needs qualifying rather than repeating. `java-refactoring`'s
"no net, no refactoring" is correct for **category 2** below and is a deadlock for **category 1**.

1. **Small changes with a reviewable preservation argument**, applied only to create a seam: Parameterize
   Constructor with a delegating old constructor, Extract Interface, Extract Method, Rename —
   preferably tool-assisted, existing caller contracts preserved, revertible as one small diff.
   Compilation and unchanged signatures are evidence, not proof of unchanged behavior: compare
   construction order, exception timing, virtual dispatch, reflection/DI and resource ownership.
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

State the category and preservation argument in the change summary (and commit message if a
commit is requested). If it cannot be justified, first find a coarser test point or narrow the seam.

## Before and after

Run `scripts/renewal-service/verify.sh` for the isolated teaching fixture: its synthetic gateway
throws at construction, while the injected alternative reaches assertions. It does not contact a
database or prove that every real constructor needs a seam. Requires a POSIX shell and JDK 21+.

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

In this fixture `new RenewalCheck()` throws `IllegalStateException: RateGateway: cannot connect
to policy-db` before the policy assertion. The live date also makes fixed date-sensitive rows
unstable; it does not make every possible assertion impossible.

The after state applies **Extract Interface** under a _new_ name — `interface Rates`, with
`RateGateway implements Rates` keeping the name it already had — and **Parameterize Constructor**,
retaining a delegating `RenewalCheck()` that passes `new RateGateway()` and
`Clock.systemDefaultZone()`. Both halves are Preserve Signatures: no caller of `RateGateway` and no
caller of `RenewalCheck` needs to move. Still compare initialization and dispatch behavior.
`systemDefaultZone`, not `systemUTC`, preserves the chosen local zone if the process default
zone stays stable. The clock captures that zone at construction while `LocalDate.now()` reads
the default on each call: if the application changes it dynamically, preserve that behavior
explicitly. Remove the old constructor only after public, reflective and DI callers are migrated.

Naming the interface `RateGateway` and renaming the class would have been **Extract Implementer**
(p. 356) instead — a different technique with a different cost, because every `new RateGateway()`
in the codebase then stops compiling.

The test then needs no mocking framework: a lambda stub for `Rates`, a fixed clock, and the answer
is `[P1]` for the supplied fixed-clock inputs. Static interception is another possible seam, but
would require compatible instrumentation and deliberate stubbing; this verifier does not test it.

## When there is no time: Sprout and Wrap

You must add behaviour to a 600-line method by Thursday. Reading it is a week you do not have.

- **Sprout Method / Sprout Class** — write the new behaviour as a new, fully tested unit and call
  it from one line inside the untested body. Read the surrounding control flow and effects to
  prove placement, frequency, ordering and error propagation; testing the sprout alone cannot.
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
  can still protect an owned boundary; require an actual substitution or contract benefit
  rather than counting implementations (`java-dependency-inversion`).
- **A `Clock` everywhere.** Every constructor gains a `Clock` because "inject the clock" became a
  rule; classes that never read the time carry a field they ignore and every test constructs a
  clock it does not use. Inject it where `now()` is called. Nowhere else.
- **Characterising code that is about to be deleted.** `java-refactoring` already excludes this;
  the corollary this skill adds is the replacement case. If the code is being _replaced_ rather
  than deleted, characterise at the boundary that survives — the HTTP contract, the batch output — which is
  `legacy-enterprise-modernization`'s move, not this skill's.
- **A harness around genuinely stable code.** A tax-table lookup untouched for six years may
  need no seam work. An explicit assurance objective or uncovered consequential risk can still
  justify tests; age and coverage counts alone decide neither outcome.
- **Seams for their own sake.** Every `new` becomes a factory method, every static a delegator,
  in code nobody is changing — indirection with a testing justification attached.

## Rules

- Break dependencies only as far as step 4 needs. The refactoring you want to do is a separate
  commit, after the tests exist.
- Preserve existing caller signatures where possible through overloads/delegation. Techniques
  that deliberately change a signature or class identity need a caller/compatibility inventory
  and the narrowest reachable checks; the compiler cannot find reflective or external callers.
- A seam without an enabling point is not a seam. Before declaring one done, name the line that
  chooses the behaviour.
- Distinguish temporary test hooks from supported extension points. A mutable global override
  needs isolation/reset and production-access controls; a `protected` factory is not itself a
  mutable global. Track removal when the seam is temporary, and retain a useful owned contract.
  Architecture checks can enforce the chosen boundary (`references/tooling-and-modernization.md`).
- Compare visible injection or a wrapper with retaining a supported instrumentation seam under
  actual compatibility/change constraints (`java-test-doubles`). Static mocks are thread-scoped;
  close them and do not assume they intercept worker-thread calls. Track a wrap only when warranted.
- Do not import old **PowerMock** or **`mockito-inline`** instructions into a newer stack by
  habit. Check the resolved versions/mock maker; preserve a working legacy harness while changing
  its seam. The tooling reference distinguishes artifact age from demonstrated incompatibility.
- "We'll write the tests after the refactor" ends with unfamiliar untested code, which is
  strictly worse than the familiar untested code you started with.

## Verification

- **The chosen test point is reachable without the real side effect that blocked it.** Often
  this means constructing the class without a database; a static or coarser seam can also meet
  the objective. Show the first meaningful assertion, not just successful construction.
- **The enabling point is a line you can point at.** If nobody can name it, the seam is decorative.
- **The test detects a relevant wrong behavior.** Use a targeted negative control such as the
  cutoff mutation in `java-refactoring/references/safety-workflow.md`. A surviving equivalent or
  deliberately unobserved mutation does not establish a missing test; inspect what changed.
- **The step is one reviewable, reversible diff.** Inspect signatures plus construction order,
  exceptions, dispatch and resource ownership; do not infer preservation from compilation alone.
- **The chosen seam stays within its ownership and lifetime.** Review new static mocks and test
  hooks by effect, isolation and cleanup rather than occurrence counts.
- **Time-sensitive assertions control their relevant time source.** Inspect clock reads and
  retain actual time-zone, elapsed-time and business-calendar semantics.

## Review prompts

- What exactly stops this class from being constructed in a test? Name the line.
- Where is the enabling point for this seam, and can a reader of the class see it?
- Is this change behaviour-preserving by construction, or does it need the net first?
- Did any signature change in this commit? If so, why was that necessary now?
- Is this hook temporary or a supported extension contract, and who owns its lifetime?
- Are we pinning behaviour we are about to delete?
- What is the change point? If there is none, why are we here?

## References

- [Dependency-breaking catalogue](references/dependency-breaking-catalogue.md) — read before
  applying any technique: every Java-relevant entry from Feathers ch. 25 plus Sprout and Wrap
  from ch. 6, each with its precondition, its cost, the modern Java caveat, and the two Feathers
  himself disliked.
- [Seams and interception points](references/seams-and-interception.md) — read when the question
  is _where_ to put the test rather than how to reach the code: the seam taxonomy in Java detail,
  what replaces preprocessing seams, effect analysis, and choosing a pinch point whose tests
  expose the relevant effects of a cluster of changes.
- [`scripts/renewal-service/`](scripts/renewal-service/) — `Before.java`, `After.java` and
  `verify.sh`. Run it when someone argues the obstacle is a matter of taste: the before state
  throws at construction, the after state is deterministic, and the script fails if that stops
  being true.
- [Tooling and the 2004 to 2026 sweep](references/tooling-and-modernization.md) — read when
  following older legacy-testing material, or when the output is too large to assert on: verified
  library coordinates, approval testing with scrubbers and a CI-safe reporter, and the table of
  what in Feathers's mechanics has been superseded and by what.
