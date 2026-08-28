# Research brief — `java-legacy-code-testing`

Researcher output. Source-backed. Not a skill draft.
Date of verification: 2026-08-27. All Maven versions read from
`repo1.maven.org/.../maven-metadata.xml`; all API signatures read from upstream source, not
from memory.

---

## 1. Canonical sources with citations

### 1.1 Michael Feathers, _Working Effectively with Legacy Code_ (Prentice Hall, 2004, ISBN 0-13-117705-2)

Quotes below marked **[verbatim, sample PDF]** were read directly from the publisher's sample
pages (`ptgmedia.pearsoncmg.com/images/9780131177055/samplepages/0131177052.pdf`, front matter

- Chapter 1). Quotes marked **[secondary]** are corroborated across independent sources but not
  read from the primary text in this session.

**Legacy code** — **[verbatim, p. xvi]**

> "To me, _legacy code_ is simply code without tests."

and the boxed claim that carries it — **[verbatim, p. xvi]**

> "Code without tests is bad code. It doesn't matter how well written it is; it doesn't matter
> how pretty or object-oriented or well-encapsulated it is. With tests, we can change the
> behavior of our code quickly and verifiably. Without them, we really don't know if our code is
> getting better or worse."

He explicitly discards the two rival definitions on the same page: the "strict definition"
(code inherited from someone else) and the industry slang ("difficult-to-change code we don't
understand"). Worth quoting because it is a _working_ definition chosen for its consequences —
"It is a good working definition, and it points to a solution."

**Why behaviour, not code, is the thing being protected** — **[verbatim, p. 4]**

> "Behavior is the most important thing about software. It is what users depend on. Users like
> it when we add behavior (provided it is what they really wanted), but if we change or remove
> behavior they depend on (introduce bugs), they stop trusting us."

**Seam** — **[secondary; corroborated by Fowler's `bliki/LegacySeam.html`, which cites Feathers
directly]**

> "A seam is a place where you can alter behavior in your program without editing in that
> place."

**Enabling point** — **[secondary; same source]**

> "Every seam has an enabling point, a place where you can make the decision to use one
> behavior or another."

Fowler's own gloss (`martinfowler.com/bliki/LegacySeam.html`) is a usable secondary citation and
adds one thing Feathers does not: seams serve three purposes, not one — breaking dependencies
for testing, **inserting observability probes**, and **redirecting flow to new modules during
strangler displacement**. That third use is the hand-off to `legacy-enterprise-modernization`.

**Seam taxonomy** (Chapter 4, "The Seam Model", pp. 29–44; "Seam Types" begins p. 33) —
three kinds:

| Seam type              | Enabling point                                                 | Available in Java?                                                                                                |
| ---------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Preprocessing seam** | `#define` / `#include` resolved before compilation             | **No.** Java has no preprocessor.                                                                                 |
| **Link seam**          | the classpath / linked binary chosen at assembly time          | Yes, but weakly and unidiomatically.                                                                              |
| **Object seam**        | the call site's _dispatch_ — which object receives the message | Yes. Feathers calls these "pretty much the most useful seams available in object-oriented programming languages". |

**What replaces preprocessing seams in Java** — this is the item the skill must get right, and
it is where most secondary write-ups stop:

- The nearest _literal_ equivalent — build-time source substitution — does not exist and should
  not be simulated. Annotation processors and code generation are not a testing seam; they
  change what is compiled, not what is dispatched.
- The **link seam** survives in Java as: putting a different class of the same fully-qualified
  name earlier on the test classpath (shadowing); a test-scoped Maven dependency replacing a
  compile-scoped one; a different `ServiceLoader` provider on the test classpath; a JPMS
  `provides`/`uses` binding swapped per module path. Feathers's own warning applies with
  extra force: a link seam has **no enabling point in the source**, so a reader of the class
  cannot see that behaviour is substitutable. Treat as a last resort.
- The **bytecode-instrumentation seam** is the modern Java-only third category, and it is what
  actually replaced preprocessing: a Java agent rewriting classes at load time. Mockito's inline
  mock maker (`mockStatic`, `mockConstruction`, final-class mocking) is exactly this, and so was
  PowerMock's custom classloader. It is _technically_ a seam whose enabling point is the
  `try`-with-resources block — but it is invisible from production source, which is why it
  sits at the bottom of every preference ordering (see §3.2).
- The **overwhelming default in Java is the object seam**, and the reason is not taste: since
  constructor injection became standard (§7), the enabling point for most object seams is the
  constructor call in the composition root, which is both visible and already the place the
  application wires itself.

**Dependency-breaking techniques** — Chapter 25, with page numbers read from the book's own
table of contents (sample PDF, pp. x–xi). Full list, exact names, in the book's order; the
one-liners are mine.

| Technique                              | p.  | One line                                                                                                                                                                                                          |
| -------------------------------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adapt Parameter                        | 326 | The parameter's type is untestable (e.g. `HttpServletRequest`); wrap it in a narrow interface you own and pass that instead.                                                                                      |
| Break Out Method Object                | 330 | A long method with tangled locals becomes a class whose fields are those locals and whose `run()` is the body — now instantiable and testable.                                                                    |
| Definition Completion                  | 337 | C/C++ only: declare in the header, supply a test definition. **No Java equivalent.**                                                                                                                              |
| Encapsulate Global References          | 339 | Wrap a global/static in a class so references go through one object that can be replaced.                                                                                                                         |
| Expose Static Method                   | 345 | A chunk of logic that touches no instance state becomes `static`, so it can be tested without constructing the class at all.                                                                                      |
| Extract and Override Call              | 348 | Move an untestable call into its own method, then override that method in a test subclass.                                                                                                                        |
| Extract and Override Factory Method    | 350 | The `new` in the constructor moves to an overridable protected method.                                                                                                                                            |
| Extract and Override Getter            | 352 | The field becomes reachable only through a getter, which a test subclass overrides to return a fake. **Feathers flags this as the riskier variant** — it leaves the field null in production order-of-init terms. |
| Extract Implementer                    | 356 | Instead of extracting an interface, rename the _class_ to `…Impl` and make the original name an interface. Use when the class name is the good name.                                                              |
| Extract Interface                      | 362 | Extract the subset of methods the client actually uses into an interface the client depends on.                                                                                                                   |
| Introduce Instance Delegator           | 369 | Add an instance method that forwards to the static, so callers can be given a substitutable object.                                                                                                               |
| Introduce Static Setter                | 372 | A `static void setInstanceForTesting(...)` on a singleton. Feathers presents it as a last resort, not a pattern.                                                                                                  |
| Link Substitution                      | 377 | Swap the implementation at link/classpath time.                                                                                                                                                                   |
| Parameterize Constructor               | 379 | The collaborator the constructor `new`s becomes a constructor parameter (optionally with a delegating no-arg constructor preserving the old signature).                                                           |
| Parameterize Method                    | 383 | Same move, at method level: the object the method creates internally becomes an overload parameter.                                                                                                               |
| Primitivize Parameter                  | 385 | Add a free function operating on primitive data, so the new logic is testable even though the class is not. Explicitly labelled "ugly, but temporary".                                                            |
| Pull Up Feature                        | 388 | Pull the testable cluster of methods up into a new abstract superclass, leaving the untestable dependencies in the subclass; test the superclass via a test subclass.                                             |
| Push Down Dependency                   | 392 | The inverse: push the problematic dependency _down_ into a new subclass, making the (now abstract) original testable.                                                                                             |
| Replace Function with Function Pointer | 396 | C only. The Java analogue is a `Function`/`Supplier` field — see §7.                                                                                                                                              |
| Replace Global Reference with Getter   | 399 | Every read of a global becomes a call to a protected getter, overridable in a test subclass.                                                                                                                      |
| Subclass and Override Method           | 401 | The general-purpose move: subclass the class under test purely in the test, overriding whatever is untestable.                                                                                                    |
| Supersede Instance Variable            | 404 | A setter that replaces an already-constructed collaborator, for cases where constructor injection is not reachable. Feathers dislikes it in Java and says so.                                                     |
| Template Redefinition                  | 408 | C++ templates / dynamic languages. No Java equivalent.                                                                                                                                                            |
| Text Redefinition                      | 412 | Ruby-style method redefinition at runtime. No Java equivalent.                                                                                                                                                    |

Techniques the brief asked for that are **not** in Chapter 25 — they are Chapter 6, "I Don't
Have Much Time and I Have to Change It":

| Technique         | p.  | One line                                                                                                                                                                                              |
| ----------------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sprout Method** | 59  | Write the new behaviour as a new, fully tested method; call it from one line inside the untested body. The untested code is not read, not understood, not touched beyond that one call.               |
| **Sprout Class**  | 63  | Same, when the new behaviour needs state or the host class cannot be instantiated at all.                                                                                                             |
| **Wrap Method**   | 67  | Rename the old method, create a new method with the old name that calls both the renamed original and your new tested method. Use when the new behaviour must happen _around_ the old, not inside it. |
| **Wrap Class**    | 71  | Decorator: a new class implementing the same interface, holding the legacy one, adding behaviour before/after. Use when the new behaviour applies to every caller.                                    |

Feathers's own caveat on all four (Ch. 6 summary, p. 76): sprouting and wrapping leave the
legacy body untested and the class slightly worse-shaped. They buy _safety of the new code_, not
improvement of the old. They are the honest answer to "I have two days", not the answer to
"how do we fix this".

**The Legacy Code Change Algorithm** (Ch. 2, p. 18) — **[secondary]**: 1. Identify change
points. 2. Find test points. 3. Break dependencies. 4. Write tests. 5. Make changes and
refactor. (Several summaries render step 2 as "identify seams"; the five-step shape is
consistent across sources.)

**Characterization test** (Ch. 13, p. 186; "A Heuristic for Writing Characterization Tests",
p. 195) — **[secondary]**: "a test that characterizes the actual behavior of a piece of code".
Note the chapter title: _"I Need to Make a Change, but I Don't Know What Tests to Write"_ — the
technique is a response to ignorance, not a testing strategy.

**The admission that matters** (Introduction, "How to Use This Book", p. xxi) —
**[verbatim, sample PDF]**:

> "The refactorings in _Dependency-Breaking Techniques_ are special in that they are meant to be
> done **without tests**, in the service of putting tests in place."

This single sentence is the resolution of the "never refactor without tests" argument (§3.4) and
should be quoted in the skill, because it comes from the author most often cited _for_ the rule.

Also from the Preface (p. xvii), the frame that keeps this skill from being dogmatic —
**[verbatim]**: "This work is like surgery. We have to make incisions… Could this patient's
major organs and viscera be better than they are? Yes. … we can't let 'best' be the enemy of
'better'."

### 1.2 Fowler

- **`martinfowler.com/bliki/LegacySeam.html`** — Fowler's own entry, citing Feathers verbatim,
  and extending seams to observability probes and strangler redirection. Good, short, citable.
- **`martinfowler.com/bliki/ApprovalTesting.html` returns HTTP 404** — this URL does _not_
  exist. Do not cite it. Fowler has no bliki entry on approval or characterization testing that
  I could verify.
- The authoritative modern source on approval testing is **Emily Bache**, not Fowler:
  "Approval Testing", _97 Things Every Programmer Should Know_ (O'Reilly), and
  `coding-is-like-cooking.info/2021/03/why-we-should-be-saying-approval-testing-instead-of-golden-master/`,
  where she argues the term "Golden Master" should be retired in favour of "Approval Testing".
  `sammancoaching.org/learning_hours/legacy/approval_testing_intro.html` is the teachable
  version. Bache's own criterion: use it when the output "is returning a String and you're not
  sure exactly what that string should be, but you'll know it's right when you see it."
- Wikipedia's `Characterization_test` article correctly attributes the term to Feathers and
  names "Golden Master Testing" as the synonym; usable as a definitional citation only.

---

## 2. Verified API reality

All versions from `repo1.maven.org` metadata on 2026-08-27.

### JUnit Jupiter

- Latest overall: **`org.junit.jupiter:junit-jupiter:6.1.3`** (2026-08-07).
  Last 5.x line: **5.14.4**. The repo's stated baseline of "JUnit 5.11+" is satisfied by either;
  **use 5.14.4 in examples unless the suite has already moved to 6.x**, because 6.x raised the
  minimum JDK and changed some module/artifact details I did not verify here.
  `UNVERIFIED:` JUnit 6.x minimum JDK and any breaking API change from 5.14 → 6.1.
- `assertAll` — **verified against `junit-jupiter-api/src/main/java/.../Assertions.java`**, six
  overloads exist:
  `assertAll(Executable...)`, `assertAll(String heading, Executable...)`,
  `assertAll(Collection<Executable>)`, `assertAll(String, Collection<Executable>)`,
  `assertAll(Stream<Executable>)`, `assertAll(String, Stream<Executable>)`.
  All throw `MultipleFailuresError`.
  **Relevance to this skill:** `assertAll` is the right tool for a characterization test that
  pins several dimensions of one call, because it reports _every_ dimension that moved, not the
  first. That is the difference between "the refactor broke something" and "the refactor changed
  the exception type and the emitted event, but not the return value".
- `@TestFactory` — exists (`org.junit.jupiter.api.TestFactory`), returns
  `Stream<DynamicTest>` / `Collection<DynamicNode>` etc., built with
  `DynamicTest.dynamicTest(String, Executable)`. **Relevance:** the honest tool for generating a
  characterization suite from a recorded corpus of production inputs, where the number of cases
  is data-driven and unknown at compile time. `@ParameterizedTest` + `@CsvSource` is better
  whenever the cases are hand-chosen and few — which is the common case, and is what
  `java-refactoring/references/safety-workflow.md` already demonstrates.
  `UNVERIFIED:` I did not read `TestFactory.java` source this session; the API is long-stable.

### ApprovalTests for Java

- **`com.approvaltests:approvaltests:31.0.0`** (2026-06-18), `<scope>test</scope>`. Single
  artifact; no separate JUnit 5 module needed. README states it supports JUnit 3, 4, 5 and TestNG
  and is tested on JDK 8–26.
- `Approvals.verify(...)` — **verified by reading
  `approvaltests/src/main/java/org/approvaltests/Approvals.java` on `master`.** The overloads
  actually present include:
  `verify(String)`, `verify(String, Options)`, `verify(Object)`, `verify(Object, Options)`,
  `verify(Verifiable)`, `verify(Path)`, `verify(File)`, `verify(ApprovalWriter)`,
  `verify(ApprovalApprover)`, `verify(ExecutableCommand)`, plus `verifyHtml(String)`,
  `verifyXml(String)` and ~20 `verifyAll(...)` overloads including
  `verifyAll(String label, Iterable<T>)` and
  `verifyAll(Iterable<T> values, Function1<T,String> formatter)`.
  **The single call the skill should show is `Approvals.verify(String)`** — everything else is
  sugar, and `verify(Object)` on a legacy object silently depends on its `toString`, which is
  precisely the "pins garbage with authority" failure.
- `@UseReporter` — **verified**:
  `org.approvaltests.reporters.UseReporter`, `@Retention(RUNTIME)`,
  `Class<? extends ApprovalFailureReporter>[] value()`. Reporter classes verified to exist:
  `DiffReporter`, `QuietReporter`, `Junit5Reporter`, `AutoApproveReporter`, `FileCaptureReporter`,
  `ReportWithVisualStudioCode`, `MultiReporter`, `FirstWorkingReporter`.
  **CI guidance:** `@UseReporter(QuietReporter.class)` or `Junit5Reporter` — a `DiffReporter` on
  a headless agent tries to launch a diff tool.
- `Options` — verified: `withScrubber(Scrubber)`, `withReporter(...)`, `withExtension(String)`,
  `withNamer(...)`, `withBaseName(String)`, `inline(String expected)`. **`withScrubber` is the
  API that answers the "output contains timestamps and UUIDs" objection** — cite it, or every
  reader concludes approval testing cannot handle real output.

### Mockito

- **`org.mockito:mockito-core:5.23.0`** (2026-03-11).
- **`mockito-inline` is NOT needed on Mockito 5.** Verified two ways:
  1. `org.mockito:mockito-inline` latest release is **5.2.0, published 2023-03-09** — dead
     artifact, three years stale.
  2. `Mockito.java` javadoc on `main`, verbatim:
     _"Be aware that starting from 5.0.0 the inline mock maker became the default mock maker and
     this artifact may be abolished in future versions."_
     **Adding `mockito-inline` to a Mockito 5 build is a no-op at best and a version-conflict at
     worst.** This is the single most common stale instruction in legacy-testing material and the
     skill should say so explicitly.
- `mockStatic` — **verified in source**, eight overloads:
  `mockStatic(Class<T>)`, `(Class<T>, Answer)`, `(Class<T>, String)`, `(Class<T>, MockSettings)`,
  plus four reified `T...` variants. Returns `MockedStatic<T>`, which is `AutoCloseable` — it
  **must** be used in try-with-resources or it leaks into the next test on the same thread.
- `mockConstruction` — **verified**, returns `MockedConstruction<T>`, overloads from
  `mockConstruction(Class<T>)` through `(Class<T>, MockInitializer<T>)` and
  `(Class<T>, MockedConstruction.Context → MockSettings, MockInitializer<T>)`, plus reified
  variants and `mockConstructionWithAnswer(Class<T>, Answer, Answer...)`.
- **Java 21+ instrumentation:** `Mockito.java` javadoc carries a section
  _"0.3. Explicitly setting up instrumentation for inline mocking (Java 21+)"_. On modern JDKs
  the inline mock maker self-attaches an agent and JDK 21+ emits a dynamic-agent-loading warning;
  the documented fix is to pass the Mockito jar via `-javaagent`.
  `UNVERIFIED:` the exact Surefire `argLine` incantation and the JDK version at which
  self-attachment becomes an error rather than a warning.

### PowerMock — verified dead

- **`org.powermock:powermock-core:2.0.9`, published 2020-11-01.** No release in almost six years.
- **`powermock-api-mockito2:2.0.9` pins `org.mockito:mockito-core:3.3.3`** — verified by reading
  the published POM. A project on Mockito 5.23 cannot have PowerMock on the same classpath
  without a hard downgrade.
- PowerMock's own documentation claims support only up to JDK 9.
  `UNVERIFIED:` whether 2.0.9 can be coerced to run at all on JDK 21/25 with flags. Treat as
  "no" for the skill; the classpath conflict alone settles it.

### Testcontainers — a major version has landed and renamed everything

- **Latest: `org.testcontainers:testcontainers:2.0.5`** (2026-04-20). Last 1.x: **1.21.4**.
- **Artifact IDs were renamed in 2.x**, verified directly against Maven Central:
  - `org.testcontainers:junit-jupiter` → releases stop at **1.21.4**
  - `org.testcontainers:testcontainers-junit-jupiter` → **2.0.5** ✅
  - `org.testcontainers:postgresql` → stops at **1.21.4**
  - `org.testcontainers:testcontainers-postgresql` → **2.0.5** ✅
    So: **every module artifact gained a `testcontainers-` prefix in 2.x.** Getting this wrong
    produces a dependency that resolves to a stale 1.x or does not resolve at all.
- 2.0 also dropped the JUnit 4 dependency, reduced generics, and requires Docker images to be
  specified explicitly. An OpenRewrite recipe exists
  (`org.openrewrite.java.testing.testcontainers.TestContainers2Migration`).
  `UNVERIFIED:` whether Java _package_ names changed in 2.x — one source says "each container
  class has been given its own package", another says packages are unchanged and only artifact
  IDs moved. **Do not state a package path for a 2.x container class without checking.** The
  safe move for the skill's examples is to pin **1.21.4** and note 2.x exists, or to name only
  the artifact coordinate and not an import.

### ArchUnit

- **`com.tngtech.archunit:archunit-junit5:1.5.0`** (2026-08-04).
- Relevance here is narrow and should stay narrow: one rule class that **fails the build if
  `setXxxForTest`-style methods reappear**, or if production code imports a test-only package.
  Anything broader is `architecture-testing`'s.
  `UNVERIFIED:` I did not verify a specific `ArchRule` DSL expression this session.

### AssertJ

- Last stable: **`org.assertj:assertj-core:3.27.7`**. Latest published is **4.0.0-M1** — a
  _milestone_; do not put it in a skill. The suite spec's "AssertJ 3.26+" is satisfied by 3.27.7.

---

## 3. Live disagreements

### 3.1 Characterization tests: permanent asset or scaffolding to delete?

**Scaffolding position** (this repo already holds it —
`java-refactoring/references/safety-workflow.md` line 5-7: _"It is scaffolding: written fast,
assertion values copied from observed behaviour, deleted or replaced by intent-revealing tests
once the refactoring lands."_). Rationale: the assertions are magic numbers with no stated
intent; a future reader cannot tell a requirement from an accident; and at least one row may
encode a bug (the same file pins one deliberately and files it as SHIP-311).

**Permanent-asset position**: in a system where nobody knows the requirements and the original
authors are gone, the characterization suite _is_ the specification — the only executable
description of what the business currently receives. Deleting it deletes the only artefact that
would catch a regression, and the "intent-revealing tests" that were supposed to replace it are
never written because the intent was never recovered. Approval-testing practitioners (Bache,
Samman Coaching) lean this way for legacy work specifically.

**Where the disagreement actually resolves**: on _whether the intent was recovered_. If the
refactoring produced understanding, promote the rows to named intent tests and delete the
pinning suite. If it did not, keep the suite and label it `characterization` in the test name or
package so nobody mistakes it for a requirement. The failure is doing neither — leaving
anonymous pinned rows in the permanent suite (§4.1).

### 3.2 `mockStatic` to break a dependency, vs refactoring to a seam

**Static-mocking position**: it is a _real_ seam (bytecode instrumentation, enabling point =
the try-with-resources), it is now in `mockito-core` with no extra dependency, and it lets you
test today without a refactoring you have no mandate for. For third-party statics you cannot
wrap, it is the only option short of a wrapper class you did not want.

**Refactor-to-seam position**: `java-test-doubles/references/mockito-hazards.md` already states
the repo's line — _"The technical barrier is gone; the design argument is not."_ A static call is
a dependency invisible in the type's signature, and static mocking makes it testable _without
making it visible_, which removes the pressure that would eventually fix it.

**Current state of PowerMock (settled, not live)**: last release Nov 2020, pins Mockito 3.3.3,
documents JDK ≤ 9. On JDK 21+ with Mockito 5 it is not a choice. Any material recommending
PowerMock for legacy Java is dead material — which is worth saying, because a large fraction of
"legacy code testing" content online predates 2020.

**Honest residue**: even people who agree the design argument is right disagree on the _order_.
Feathers's own answer is Introduce Instance Delegator (p. 369) / Encapsulate Global References
(p. 339) — i.e. refactor, no mock. A pragmatist's answer is `mockStatic` now, ticket the wrap,
and the skill should say what makes that ticket real rather than theatre.

### 3.3 Approval/golden-master vs explicit assertions

**For approval**: the output is large and structured (a rendered document, a generated file, a
tree of DTOs); hand-writing assertions costs hours and produces a test that still misses fields;
`Approvals.verify` gives full coverage of the output for one line of test code. This is exactly
the case where legacy units are larger than TDD-sized units and would otherwise need dozens of
assertions (Bache).

**Against**: an approved file states no intent, so a diff tells you _that_ output changed but
never _why it mattered_; approving a `.received` file is a one-keystroke action that a tired
engineer performs on a genuine regression; and unstable fields (timestamps, ids, hash-ordered
maps) make the test flaky unless scrubbed. The counter to the last point is real —
`Options.withScrubber(...)` — and the skill should show it, because "it can't handle timestamps"
is the objection that kills the technique in practice.

**The line most practitioners actually draw**: assertions when the output is small and the
expected value can be _stated_; approval when the output is large and the expected value can only
be _recognised_. Simple, well-defined outputs → assertions; JSON/HTML/XML/generated code/
serialised forms → approval. `java-refactoring/references/safety-workflow.md` line 147 already
carries a compressed version of this.

### 3.4 "Never refactor without tests" vs Feathers's own admission

Not actually a disagreement once the primary source is read — but it is a live _belief_
disagreement worth defusing, because "no tests, no refactoring" is stated as an absolute in this
very repo (`java-refactoring` Workflow step 1: _"No net, no refactoring."_).

Feathers, Introduction, p. xxi, verbatim: the dependency-breaking refactorings **"are meant to be
done without tests, in the service of putting tests in place."**

The reconciliation, and it is the intellectual core of this skill: there are two categories of
change, and they take different evidence.

1. **Behaviour-preserving-by-construction moves**, safe _because the compiler and the IDE
   guarantee them_, applied only to get a test in: Extract Method, Extract Interface,
   Parameterize Constructor with a delegating old constructor, Rename. Evidence = the tool
   performed it, the signature is preserved, and the change is revertible in one commit.
2. **Everything else** — reordering, merging branches, changing extraction points — which needs
   the pinned suite first.

The rule "no net, no refactoring" is correct for category 2 and is a deadlock for category 1
(you cannot write the test until you have made the change that makes the test possible). Feathers
names the escape and constrains it: Chapter 23, _"How Do I Know That I'm Not Breaking Anything?"_
gives the four disciplines that substitute for a test — Hyperaware Editing, Single-Goal Editing,
**Preserve Signatures**, and **Lean on the Compiler** (pp. 310–317). "Preserve Signatures" is the
key one: if you never change a signature, cut-and-paste is verifiable by eye. That is the
category-1 discipline, and it is _not_ in this repo anywhere.

---

## 4. Field failure modes

Concrete, and each one has a detectable signature.

**4.1 The pinned bug becomes the spec.** A characterization row encodes behaviour nobody
intended. Six months later someone fixes the bug, the row goes red, and — because the row has no
name, no ticket and no comment — they change the expected value to match, or revert the fix.
_Signature_: a test whose expected value is a literal with no explanatory name, in a class with no
`characterization` marker. _Countermeasure_: every pinned-suspicious row carries a ticket
reference in a comment (as `safety-workflow.md`'s SHIP-311 row does), and the class name says
`Characterization`, not `Test` alone.

**4.2 The golden master nobody can diagnose.** A 40 000-line approved file. A change flips one
byte; the diff is unreadable; the reviewer approves it to unblock the build. The suite has
converted from a safety net into a rubber stamp. _Signature_: an `.approved.txt` larger than a
screen that no human has read since the day it was created; a commit history where `.approved`
files change in the same commit as production code, with no explanation. _Countermeasure_: split
the master by concern; scrub what is not being tested; and treat "the diff was too big to read"
as a build failure, not an inconvenience.

**4.3 `mockStatic` everywhere, so the design never improves.** Static mocking removes the pain
that would have forced the dependency to become visible. The class still has invisible
dependencies; the tests are now _coupled to the static call site_, so the eventual refactoring
breaks the tests too — the exact trap the tests were supposed to prevent. _Signature_: a count of
`mockStatic(` occurrences that is growing; a test file with more `try (MockedStatic<...>)` blocks
than assertions. _Countermeasure_: a ceiling, enforced or reviewed, and a wrap-and-inject ticket
per remaining site.

**4.4 The test seam that leaked into production API.** `setClockForTest(Clock)`, a
package-private mutable static, a `protected` factory method overridden only by a test subclass,
`@VisibleForTesting` on something now called from three production classes. The seam was
supposed to be temporary; nothing ever removed it; now production code calls it and the class has
a mutable global. _Signature_: any identifier containing `ForTest`/`ForTesting` reachable from
production; a `static` field that is non-final and settable. _Countermeasure_: this is the one
place ArchUnit earns its place in this skill — a single rule that fails the build when
production code references a `*ForTest*` member, or when a non-final static field appears outside
an allowlist. Note that Feathers himself lists Introduce Static Setter (p. 372) and Supersede
Instance Variable (p. 404) as legitimate techniques _and_ dislikes them; the skill should carry
both halves.

**4.5 The test that re-implements the production logic.** Writing a characterization test by
_reasoning about_ what the method should return rather than _running it and recording_. The test
then encodes the author's model, agrees with the code where the author understood it, and agrees
with the code's bugs nowhere — so it goes red and gets "fixed" by copying the actual output
anyway, but only after wasting the day. Worse variant: the assertion re-derives the expected
value with the same arithmetic the production code uses, so the test can never fail.
_Signature_: an expected value computed in the test rather than written as a literal.
`safety-workflow.md` already states the rule ("Outputs below were produced by running the method,
not by reasoning about it — that is the point") — this skill inherits it rather than restating.

**4.6 "We'll write tests after the refactor."** The refactor lands, is large, the tests are never
written, and the team now has _unfamiliar_ untested code instead of familiar untested code — a
strictly worse position, because the one asset the legacy code had was that someone recognised
it. _Signature_: a branch with a large diff, a green build that runs no test touching the changed
files, and a follow-up ticket with no owner.

**4.7 The seam that was never enabled.** Extract Interface is applied, `PaymentGateway` now has
one implementation and one mock — but the production wiring still `new`s the concrete class
inside the class under test, so the interface exists and the seam does not. _Signature_: an
interface whose only non-test implementor is constructed with `new` inside a consumer. This is
the difference between a seam and an _enabling point_, and it is the single most useful thing
Feathers's vocabulary buys you.

---

## 5. Before/after material

Both examples below were **written to a file and compiled with `javac --release 21` on Temurin
25.0.3, then executed**; the outputs quoted are real. Production code has zero dependencies. The
test snippets compile against **`org.junit.jupiter:junit-jupiter:5.14.4`**,
**`org.mockito:mockito-core:5.23.0`**, **`org.assertj:assertj-core:3.27.7`**.

### (a) Hard-coded collaborator + hidden clock → Parameterize Constructor + injected `Clock`

**Before — untestable.** Two independent obstacles, and the skill should name them separately
because they take different techniques.

```java
final class RenewalService {
    private final RateGateway rates = new RateGateway();   // obstacle 1: Construction Blob
    List<String> due(List<Policy> policies) {
        LocalDate today = LocalDate.now();                 // obstacle 2: hidden global (the clock)
        var out = new ArrayList<String>();
        for (Policy p : policies) {
            if (!p.expiry().isAfter(today.plusDays(30))) out.add(p.id());
        }
        return out;
    }
}
record Policy(String id, LocalDate expiry) {}
```

**The test that was impossible.** Not "hard" — impossible. `new RenewalService()` constructs a
`RateGateway`, which in the real system opens a connection at construction time; and even if it
did not, the assertion has no stable expected value, because `LocalDate.now()` moves. The test
you can write is one that passes today and fails on a date 30 days from now — which is worse than
no test, because it will fail in someone else's build for reasons unrelated to their change.

**After — Parameterize Constructor (p. 379) creating an object seam; enabling point = the
constructor call.**

```java
final class RenewalService {
    private final RateGateway rates;
    private final Clock clock;

    RenewalService(RateGateway rates, Clock clock) {
        this.rates = rates;
        this.clock = clock;
    }

    List<String> due(List<Policy> policies) {
        LocalDate today = LocalDate.now(clock);
        var out = new ArrayList<String>();
        for (Policy p : policies) {
            if (!p.expiry().isAfter(today.plusDays(30))) out.add(p.id());
        }
        return out;
    }
}
```

**The test that is now trivial** — no mocking framework needed for the clock, which is the point:

```java
@Test
void returnsPoliciesExpiringWithinThirtyDays() {
    var clock = Clock.fixed(Instant.parse("2026-03-01T00:00:00Z"), ZoneOffset.UTC);
    var service = new RenewalService(new RateGateway(), clock);

    var due = service.due(List.of(
        new Policy("P1", LocalDate.of(2026, 3, 15)),
        new Policy("P2", LocalDate.of(2026, 9, 1))));

    assertThat(due).containsExactly("P1");
}
```

Verified output of the equivalent `main`: `[P1]`.

**Points the skill must make on this example, none of which are obvious:**

- If `RenewalService` is public and has external callers, the _safe_ version of this step keeps a
  delegating no-arg constructor — `this(new RateGateway(), Clock.systemDefaultZone())` — so the
  signature is preserved (Feathers, "Preserve Signatures", p. 312) and no caller compiles
  differently. Delete it in a later commit once callers move.
- `Clock` is an _object seam over a static_, and it is the Java-8 replacement for Feathers's
  hand-rolled time abstraction (§7). `mockStatic(LocalDate.class)` also makes this test pass and
  leaves the design exactly as broken (§3.2, §4.3).
- `Clock.fixed` is deliberate: `Clock.systemUTC()` in a test is the same bug in a different place.

### (b) Sprout Method into a long legacy method

**Before.** `InvoicePoster.post` is ~600 lines, has no tests, and you must add a rule: lines with
a zero amount or a null account must not be posted. Reading the body is a week you do not have.

**After — Sprout Method (p. 59).** The new behaviour is written _outside_ the body, fully tested,
and reached from a single new line. The 600 lines are neither read nor edited.

```java
final class InvoicePoster {
    void post(Invoice invoice, List<Line> lines) {
        // ... 300 untested lines, untouched ...
        List<Line> postable = retainPostable(lines);   // <-- the only edit
        // ... 300 more untested lines, now using `postable` ...
    }

    static List<Line> retainPostable(List<Line> lines) {
        return lines.stream()
                    .filter(l -> l.cents() != 0 && l.account() != null)
                    .toList();
    }
}
record Line(String account, long cents) {}
```

```java
@Test
void dropsZeroAmountAndUnassignedLines() {
    var kept = InvoicePoster.retainPostable(List.of(
        new Line("100", 5), new Line("100", 0), new Line(null, 7)));

    assertThat(kept).containsExactly(new Line("100", 5));
}
```

Verified output: `[Line[account=100, cents=5]]`.

**Points the skill must make:**

- `static` here is **Expose Static Method (p. 345)** applied at birth: the sprouted method touches
  no instance state, so the test never constructs `InvoicePoster` — which matters, because
  constructing it may be the thing that is impossible. If the sprout needs collaborators or state,
  escalate to Sprout **Class** (p. 63).
- The diff to the untested body is **exactly one line**. That is the whole safety argument, and it
  is why "how many lines of untested code did this commit modify?" is the right review question
  for a legacy change.
- Honest cost: the body remains untested, `post` got one line longer, and the class now has a
  static method that is arguably not its job. Feathers's own Ch. 6 summary concedes this. Sprout
  buys correctness of the _new_ behaviour, not improvement of the old.
- The nearby variant to name: if the new rule had to run _around_ `post` rather than inside it —
  audit logging every posting attempt, say — the technique is **Wrap Method (p. 67)**, not
  Sprout: rename `post` to `postInvoiceLines`, and write a new `post` that calls the tested new
  behaviour and then the renamed original.

---

## 6. Over-application counter-example

The dogmatic version, and why each is worse than the disease. This is the gate item in the suite
spec, so it must be concrete.

**6.1 An interface for every collaborator.** Extract Interface applied uniformly produces
`OrderService`/`OrderServiceImpl`, `RateGateway`/`RateGatewayImpl`, forty pairs, every interface
with exactly one implementation and one mock. Costs: navigation now takes two jumps; the
interface accretes every method the impl has, so it documents nothing; and — the real damage —
the mocks now let every test lie about a collaborator that was never the risk, producing suites
that pass while the wiring is broken. The global CLAUDE.md states the rule directly: _"Interface
com uma única implementação é indireção, não abstração."_ Feathers's own answer is narrower:
extract _the subset of methods the client uses_, and prefer **Extract Implementer** (p. 356) when
the good name belongs to the class. And the seam you need is often already there —
`java-test-doubles` is right that the real collaborator or a hand-written fake beats a mock.

**6.2 A `Clock` injected where time is irrelevant.** Every constructor in the codebase gains a
`Clock` parameter because "injected clock" became a rule. Classes that never read the time now
carry a field they ignore; every test constructs a clock it does not use; the composition root
grew a parameter it must thread everywhere. `Clock` is a seam for a _specific_ hidden dependency —
inject it where `now()` is called, nowhere else.

**6.3 Characterizing code that is about to be deleted.** Two days pinning the behaviour of a
module the strangler removes next sprint. The tests are deleted with the module, having caught
nothing. `java-refactoring/references/safety-workflow.md` line 141 already states the exclusion:
_"The code is about to be deleted or wholesale-replaced with an approved behaviour change —
characterise nothing."_ Corollary the skill must add: if the code is being _replaced_ rather than
deleted, characterize at the **boundary that survives** (the HTTP contract, the batch output),
not at the class level — which is `legacy-enterprise-modernization`'s move.

**6.4 A full harness around genuinely stable code.** A tax-table lookup untouched for six years,
zero incidents, no pending change. Building a test harness for it costs a week, changes nothing
about the risk profile, and — the non-obvious cost — the harness now has to be _maintained_
against a class nobody was going to touch. Feathers's algorithm starts at _"identify change
points"_: no change point, no work. **The correct negative-scope rule for this skill: get code
under test when you are about to change it, or when it changes often and breaks. Coverage of
stable code is a metric, not a benefit.**

**6.5 (worth adding) Seams introduced for their own sake.** Every `new` becomes a factory
method, every static becomes a delegator, in code you are not changing. The result is a codebase
of enabling points nobody enables — indirection with a testing justification attached.

---

## 7. Modernization sweep — what in Feathers (2004) is superseded

The book targets Java 1.4-era Java, C++ and C. The _reasoning_ survives essentially intact; a
significant fraction of the _mechanics_ does not. Mark each explicitly.

| Feathers (2004)                                                                                                                                  | Status in Java 21/25                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| JUnit 3/4 idioms — `extends TestCase`, `setUp()`, `@RunWith`, the "test harness" chapter (Ch. 5, pp. 48–53)                                      | **Superseded.** JUnit 5.14.4 / 6.1.3, `@BeforeEach`, extensions instead of runners. The repo's suite spec forbids JUnit 4 idioms outright.                                                                                                                                                                                                                                                                               |
| Hand-rolled time abstractions to make `System.currentTimeMillis()` substitutable                                                                 | **Superseded by `java.time.Clock` (Java 8).** One constructor parameter, `Clock.fixed(Instant, ZoneId)` in tests. Do not write a `TimeProvider` interface.                                                                                                                                                                                                                                                               |
| Setter injection / Supersede Instance Variable (p. 404) as the realistic way to substitute a collaborator                                        | **Largely superseded.** Constructor injection is the default in Spring and everywhere else; a `final` field set once in the constructor _is_ the seam. Supersede Instance Variable is now a smell, not a technique — it reintroduces a mutable field. Feathers already said he disliked it in Java.                                                                                                                      |
| Replace Function with Function Pointer (p. 396), C-only                                                                                          | **Java equivalent exists and is idiomatic:** a `Supplier<T>` / `Function<A,B>` / `IntUnaryOperator` field or parameter, since Java 8. A single-method behaviour seam no longer needs an interface declaration.                                                                                                                                                                                                           |
| Value objects as hand-written classes with `equals`/`hashCode`/copy constructors; Break Out Method Object (p. 330) producing a mutable field-bag | **Records (JEP 395, Java 16) make value seams trivial.** A parameter object extracted to make a signature testable is one `record` line with correct `equals`, `hashCode` and `toString` for free — which also makes approval output stable and assertions readable. Break Out Method Object's result is still a mutable class (the locals must mutate), so records help the _parameters_, not the method object itself. |
| Hierarchy-based substitution: Subclass and Override Method, Extract Implementer, Push Down Dependency                                            | **Still current and still the workhorse**, with one modern caveat: `sealed` types (JEP 409) _close_ a hierarchy deliberately, and a sealed interface cannot be subclassed in a test. Sealing a type is therefore a decision to give up that seam — usually correct for domain types, and the reason the seam must then come from a parameter, not a subclass.                                                            |
| Extract and Override / test subclasses generally                                                                                                 | **Still current, with a Java caveat Feathers did not face:** `final` classes and methods block it. Since Mockito 5 the inline mock maker can mock `final`, but that is instrumentation, not a seam — the design answer is still Parameterize Constructor.                                                                                                                                                                |
| In-memory / fake databases to get persistence code under test (Ch. 3, "Faking Collaborators", p. 23)                                             | **Superseded by Testcontainers** (`org.testcontainers:testcontainers:2.0.5`, module artifacts now `testcontainers-*`). An HSQLDB stand-in for SQL Server pins behaviour that differs from production — exactly the "test passes, production fails" failure. Feathers's reason for faking (speed) is much weaker now: container reuse and per-class lifecycles make a real database viable.                               |
| `instanceof` chains and downcasts as the shape of legacy dispatch                                                                                | Pattern matching for `switch` (JEP 441) and record deconstruction change the _target_ of the refactoring, not the seam work. Belongs to `java-refactoring`, cited here only so the skill does not accidentally teach a 2004 target shape.                                                                                                                                                                                |
| PowerMock-era advice (post-dates the book but dominates the online legacy-testing corpus)                                                        | **Dead.** 2.0.9, Nov 2020, pins Mockito 3.3.3, documents JDK ≤ 9.                                                                                                                                                                                                                                                                                                                                                        |
| `mockito-inline` as a required extra dependency for static mocking                                                                               | **Dead since Mockito 5.0.0** (Jan 2023). Artifact frozen at 5.2.0.                                                                                                                                                                                                                                                                                                                                                       |
| "The tests are too slow to run often" (Preface, p. xviii — the financial-industry team)                                                          | Partially superseded: JUnit 5 parallel execution, Testcontainers reuse, and modern hardware change the arithmetic. The _design_ argument for small units survives; the _speed_ argument is weaker than in 2004 and should not be the headline reason.                                                                                                                                                                    |

Two things in the book that have **not** been superseded and should be flagged as still-load-bearing,
because modern material rarely covers them: **effect analysis / effect sketches** (Ch. 11,
pp. 151–171 — reasoning about what a change can possibly affect, forward and backward) and
**interception points / pinch points** (Ch. 12, pp. 174–184 — choosing the single narrowest place
to test a cluster of changes). These are the techniques that answer "where do I put the test?" and
nothing in this repo covers them.

---

## 8. Boundary check

`ls skills/` returns **208 directories**; `java-legacy-code-testing` is not among them. Grepped
every `.md` under `skills/` for `seam`, `Feathers`, `sprout`, `Wrap Method`, `characteri[sz]ation`,
`mockStatic`, `PowerMock`, `Clock`.

### What the neighbours already own

**`java-refactoring`** — the heaviest overlap, and it is real. Its frontmatter _leads_ with
"characterisation tests" and its `Use when` includes _"when a change is needed in code that has
no tests"_. `references/safety-workflow.md` (150 lines) is a complete treatment:

- the definition ("pins what the code _does_, not what it should do"), and the scaffolding stance;
- the method (force every branch, boundary values, paste observed output, **pin a bug on purpose
  and file it**);
- a full worked example — a shipping calculator, an 8-row `@ParameterizedTest`/`@CsvSource`
  suite, one deliberately-pinned bug with a ticket number, four commit-sized extraction steps,
  the after-state, trade-offs and a mutation check;
- **pinning non-return-value dimensions** — call count/order via `InOrder`, events via
  `@RecordApplicationEvents`, emitted SQL via Hibernate `Statistics`/`datasource-proxy`,
  iteration order via `containsExactly`;
- **when characterisation is not worth it** — 4 bullets, including "about to be deleted" and a
  one-line golden-master caveat.

So: **characterization-test mechanics are taken. Completely.** This skill must cite that file,
not restate it — any restatement is a house-style violation and a maintenance fork.

What `java-refactoring` does **not** have, verified by dumping every `##` heading in its five
catalogue files: its catalogue is **100% Fowler**. Extract/Inline, Move, Rename, Parameter Object,
Split Phase, guard clauses, Pull Up/Push Down, Replace Conditional with Polymorphism, and so on —
44 entries, **zero Feathers dependency-breaking techniques**. Greps confirm: no `Extract
Interface`, no `Parameterize Constructor`, no `Introduce Instance Delegator`, no `Subclass and
Override Method`, no `Adapt Parameter`, no `Break Out Method Object`, no `Expose Static Method`.
The word `seam` appears **three times in the whole skill**, all incidental
(`catalogue-statements-and-data.md:68`, `safety-workflow.md:122`, `:143`) — never defined, never
taxonomised, no enabling point.

The gap is precise and it is a _precondition_ gap: `java-refactoring` step 1 says "write
characterisation tests first" and assumes you can already call the code. It has nothing for the
case where you **cannot construct the object, cannot reach the method, and cannot run it at all**.
That is Feathers's Part III, and it is absent from this repo.

**`legacy-enterprise-modernization`** — system-level. Workflow step 2 is "pin behaviour with
characterisation tests **at the boundary you will preserve** — usually the HTTP API or the batch
output". Decision rule: "There are no tests → characterisation tests at the outermost stable
boundary, from real production inputs". Then strangler, ACL, data ownership, decommissioning.
Different altitude entirely: it never opens a class. Clean boundary — this skill is the class and
method level, that skill is the system level, and the hand-off is explicit in both directions.

**`java-test-doubles`** — owns `mockStatic`. `references/mockito-hazards.md` lines 59–75 already
carry: inline mock maker is the default since Mockito 5; the design argument survives the
technical one; `MockedStatic` must be closed; the preference ladder _"inject the dependency; wrap
the static call in a small instance-side port; mock statically only for third-party code you
cannot wrap"_; **and the `Instant.now()`/`LocalDate.now()` → inject a `Clock` advice**. It also
says a spy is "defensible as a temporary tool while getting a legacy class under test
(java-refactoring)". So the doubles _policy_ is taken, including the Clock recommendation.

**`java-testing-strategy`** — level selection; `references/test-levels.md` includes
characterisation as one of six levels, with tooling and blind spots. Owns "what a mocked boundary
obliges you to verify elsewhere".

**`java-test-design`** — test naming, one reason to fail, removing uncontrolled inputs (clock,
ordering, locale, randomness).

**`tdd`** — `references/when-tdd-pays.md:41-44` is the most important single find:
_"Legacy code with no seams. You cannot write a unit test for a class that constructs its own
dependencies and reads statics. The order is: characterisation tests at whatever level currently
works, then refactor to create a seam, then unit tests, then change behaviour. **That sequence
belongs to java-refactoring**."_ — a dangling pointer. It routes to a skill that does not contain
seam work. This skill is the correct destination and `tdd` should be re-pointed.

Others checked and clear: `refactoring-automation` (tooling for mass edits),
`architecture-refactoring-paths` (pattern-to-pattern migration),
`technical-debt-decisions` (which debt to repay), `architecture-testing` (ArchUnit at large),
`concurrency-testing`, `distributed-systems-testing`, `humble-objects-and-functional-core`
(mentions seams and Clock in the design sense, not the harness sense),
`java-dependency-inversion` (why to depend on abstractions, not how to retrofit one).

### What is left for THIS skill

1. **The seam model as vocabulary** — seam, enabling point, the taxonomy, and specifically
   _what replaces preprocessing seams in Java_ (link seams via classpath/`ServiceLoader`;
   bytecode instrumentation; and the reason object seams dominate). Nothing in the repo defines
   "seam"; three incidental uses do not count. The seam-vs-enabling-point distinction alone earns
   its place — it is what diagnoses failure mode 4.7.
2. **The dependency-breaking catalogue**, Java-relevant subset, with the precondition and the cost
   of each: Parameterize Constructor, Parameterize Method, Extract Interface, Extract Implementer,
   Extract and Override Call / Factory Method / Getter, Subclass and Override Method, Introduce
   Instance Delegator, Adapt Parameter, Break Out Method Object, Expose Static Method, Pull Up
   Feature, Push Down Dependency, Encapsulate Global References, Replace Global Reference with
   Getter, and — with the health warning — Introduce Static Setter and Supersede Instance
   Variable. Zero of these exist anywhere in the repo. This is a whole reference file.
3. **Sprout and Wrap** — the "I have two days" path, with the honest statement that it does not
   improve the legacy body. Absent from the repo (the only `sprout` hit is a false positive in
   `gof-decorator`).
4. **The Legacy Code Change Algorithm** as the workflow spine, and **effect analysis /
   interception points** as the answer to "where do I put the test?" — §7 flags both as
   not-superseded and neither is anywhere in the repo.
5. **The "safe moves permitted without a test" category**, with Feathers's four Ch. 23
   disciplines — Preserve Signatures, Lean on the Compiler, Single-Goal Editing, Hyperaware
   Editing — resolving the deadlock that `java-refactoring`'s "No net, no refactoring" creates
   for exactly this situation. This is the skill's intellectual payload and it currently
   contradicts a stated rule elsewhere in the repo; leaving it unresolved is worse than not
   having the skill.
6. **Approval testing with verified tooling** — `com.approvaltests:approvaltests:31.0.0`,
   `Approvals.verify(String)`, `@UseReporter(QuietReporter.class)` for CI,
   `Options.withScrubber(...)` for unstable output, and the decision rule against explicit
   assertions. The repo has exactly one line on golden masters
   (`safety-workflow.md:147`) and no coordinates anywhere.
7. **The 2004→2026 sweep** (§7) — `mockito-inline` dead, PowerMock dead and why (Mockito 3.3.3
   pin), Testcontainers 2.x artifact renaming, `Clock` replacing hand-rolled time,
   records for value seams, sealed types closing seams deliberately. High value precisely because
   the online corpus for this topic is 10–20 years old, and an agent will otherwise reproduce it.

### Exclusions the frontmatter must name

`java-refactoring` (characterisation mechanics and the refactoring catalogue),
`legacy-enterprise-modernization` (system-level strangler and ACL),
`java-test-doubles` (mocking policy, `mockStatic` hazards),
`java-testing-strategy` (which level), `tdd` (the loop).

### Honest verdict

**The skill is justified, and the remainder is not thin — it is the larger half of the topic.**
The repo covers _what to do once you can call the code_ (`java-refactoring`) and _what to do at
the system boundary_ (`legacy-enterprise-modernization`). It has no coverage at all of the step
between: getting a class that constructs its own dependencies and reads statics into a test
harness in the first place. Feathers's Part III is 90 pages on exactly that, and the word "seam"
is not defined anywhere in 208 skills.

Two qualifications, stated so the author does not overreach:

- **Roughly 20–25% of the natural scope is already taken and must be ceded by reference, not
  rewritten** — characterisation mechanics (`java-refactoring/references/safety-workflow.md`, which
  is genuinely good and includes the pinned-bug example, the non-return-value dimensions, and the
  "not worth it" list) and `mockStatic` policy (`java-test-doubles/references/mockito-hazards.md`,
  which already contains the Clock advice this brief's §5(a) uses). If the author restates either,
  the skill fails the boundary rule and the review should reject it.
- The strongest single argument for the skill is not the catalogue but the **contradiction it
  resolves**: `tdd` routes seam work to `java-refactoring`, which does not have it; and
  `java-refactoring`'s "No net, no refactoring" is, taken literally, a deadlock for the one case
  where you cannot get the net in. Feathers's own answer — _"meant to be done without tests, in
  the service of putting tests in place"_, constrained by Preserve Signatures and Lean on the
  Compiler — is the missing piece, and it belongs in a skill of its own rather than as a caveat
  bolted onto either neighbour.

---

## Sources

- Michael C. Feathers, _Working Effectively with Legacy Code_, Prentice Hall PTR, 2004,
  ISBN 0-13-117705-2. Front matter + Chapter 1 read verbatim from
  <https://ptgmedia.pearsoncmg.com/images/9780131177055/samplepages/0131177052.pdf>
  (full table of contents with technique names and page numbers on pp. vii–xi).
- [Martin Fowler, _LegacySeam_](https://martinfowler.com/bliki/LegacySeam.html)
- [`martinfowler.com/bliki/ApprovalTesting.html`](https://martinfowler.com/bliki/ApprovalTesting.html) — **404, does not exist**
- [Emily Bache, "Why we should be saying 'Approval Testing' instead of 'Golden Master'"](https://coding-is-like-cooking.info/2021/03/why-we-should-be-saying-approval-testing-instead-of-golden-master/)
- [Emily Bache, "Approval Testing", _97 Things_](https://medium.com/97-things/approval-testing-33946cde4aa8)
- [Samman Coaching, Approval Testing Intro](https://sammancoaching.org/learning_hours/legacy/approval_testing_intro.html)
- [Understand Legacy Code — key points of WELC](https://understandlegacycode.com/blog/key-points-of-working-effectively-with-legacy-code/)
- [Wikipedia, Characterization test](https://en.wikipedia.org/wiki/Characterization_test)
- [ApprovalTests.Java](https://github.com/approvals/ApprovalTests.Java) — `Approvals.java`,
  `Options.java`, `reporters/` read from `master`
- [Mockito `Mockito.java` on `main`](https://github.com/mockito/mockito/blob/main/mockito-core/src/main/java/org/mockito/Mockito.java) — `mockStatic`/`mockConstruction` signatures, inline-mock-maker javadoc
- [Mockito issue #2877 — mockito-inline after 5.0.0](https://github.com/mockito/mockito/issues/2877)
- [Baeldung, Mockito Core vs Mockito Inline](https://www.baeldung.com/mockito-core-vs-mockito-inline)
- [JUnit `Assertions.java` on `main`](https://github.com/junit-team/junit-framework/blob/main/junit-jupiter-api/src/main/java/org/junit/jupiter/api/Assertions.java)
- [PowerMock releases](https://github.com/powermock/powermock/releases);
  `powermock-api-mockito2-2.0.9.pom` read from Maven Central (pins `mockito-core:3.3.3`)
- [OpenRewrite: Migrate to testcontainers-java 2.x](https://docs.openrewrite.org/recipes/java/testing/testcontainers/testcontainers2migration)
- [TestContainers 2 — an upgrade that's well worth it](https://blog.doubleslash.de/en/software-technologien/coding-and-frameworks/testcontainers-2-an-upgrade-worth-it/)
- Maven Central `maven-metadata.xml` for `junit-jupiter`, `approvaltests`, `mockito-core`,
  `mockito-inline`, `testcontainers`, `testcontainers-junit-jupiter`, `junit-jupiter` (TC),
  `testcontainers-postgresql`, `postgresql` (TC), `archunit-junit5`, `assertj-core`,
  `powermock-core`
- Repo files read: `skills/java-refactoring/SKILL.md`,
  `skills/java-refactoring/references/safety-workflow.md`,
  `skills/java-test-doubles/references/mockito-hazards.md`,
  `skills/tdd/references/when-tdd-pays.md`, `skills/legacy-enterprise-modernization/SKILL.md`,
  and the frontmatter of `java-testing-strategy`, `java-test-design`, `refactoring-automation`,
  `architecture-refactoring-paths`, `technical-debt-decisions`, `concurrency-testing`
