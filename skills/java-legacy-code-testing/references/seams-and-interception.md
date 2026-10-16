# Seams and interception points

Read this when the question is _where to put the test_, not how to reach the code. Step 2 of the
Legacy Code Change Algorithm ("find test points") is the step people skip, and skipping it is why
a two-line change ends up with eleven new test classes.

## The definitions

> "A seam is a place where you can alter behavior in your program without editing in that place."
>
> "Every seam has an enabling point, a place where you can make the decision to use one behavior
> or another."

— Feathers, ch. 4, "The Seam Model" (pp. 29–44). The quotations are corroborated by Fowler's
`bliki/LegacySeam.html`, which cites Feathers directly.

Fowler adds one thing Feathers does not: seams serve **three** purposes, not one — breaking
dependencies for testing, inserting observability probes, and redirecting flow to new modules
during a strangler migration. The third is the hand-off to `legacy-enterprise-modernization`.

## The three seam types, in Java

Feathers's taxonomy (ch. 4, "Seam Types", from p. 33) is language-general. Its translation to
Java is where most secondary write-ups stop.

### Preprocessing and generated wiring

Java has no built-in `#define`/`#include` preprocessor. A build can nevertheless select generated
implementations or wiring before compilation. Identify that selection and verify the generated
artifact and consumer path; annotation processing alone is not a seam. Prefer existing ordinary
wiring over inventing a second test-only generation pipeline.

### Link seams — inspect the actual selection

The enabling point is the classpath or module path chosen at assembly time. In Java that means:

- a class of the same fully-qualified name earlier on the test classpath (shadowing);
- a test-scoped dependency replacing a compile-scoped one;
- a different `ServiceLoader` provider registered on the test classpath;
- a JPMS `provides`/`uses` binding swapped between module paths.

Classpath shadowing can hide substitution from a consumer and depends on loader behavior.
`ServiceLoader`/JPMS can instead be an explicit supported extension contract: inspect descriptors,
provider choice, no-provider/multiple-provider behavior and the actual loader/module boundaries.
Do not assume first-on-classpath shadowing describes provider selection. Retain adequate existing
wiring and make test selection discoverable.

### Object seams — the default, and why

The enabling point is the call site's dispatch: which object receives the message. Feathers calls
these _"pretty much the most useful seams available in object-oriented programming languages"_,
and in modern Java the argument is stronger than he could have made it in 2004. Since constructor
injection became the norm, the enabling point for most object seams is **the constructor call in
the composition root** — which is both visible in source and already the place the application
wires itself. Check the parameter's caller, ownership and initialization costs before changing it.

### Bytecode instrumentation — the modern fourth category

An agent rewriting classes at load time. Mockito's inline mock maker (`mockStatic`,
`mockConstruction`, mocking `final`) is exactly this, and so was PowerMock's classloader. It is
a seam whose enabling point is scoped mock setup, released by `close()` or managed teardown.
It can be useful when a compatible legacy harness already uses it or production changes are
constrained. Verify instrumentation and thread scope; see `java-test-doubles` for mechanism details.

## Effect analysis: what can this change possibly break?

Feathers ch. 11 (pp. 151–171) is about reasoning forward and backward from a change: what does
this value feed, and what feeds it? He draws these as _effect sketches_ — a scratch diagram of
which fields, returns and side effects a change can propagate to.

The practical use, and the reason it is worth doing before writing a test rather than after: the
set of things the change can affect is almost always much smaller than the set of things the class
touches, and the test you need only has to observe **that** set. Most over-testing of legacy code
comes from testing the class rather than testing the effect.

Use these routes as a review aid, not an exhaustive language taxonomy:

1. the return value;
2. parameters the method mutates (including collections it was handed);
3. fields of the instance or of anything it can reach;
4. observable side effects — writes, messages published, logs a downstream consumer parses.

Also trace thrown exceptions, cancellation, resource lifetime, ordering and dispatch. A seam
can preserve the returned value while changing whether a connection opens or which failure wins.

Route 4 is the one that ambushes people, and it is the reason
`java-refactoring/references/safety-workflow.md`'s section on pinning non-return-value dimensions
exists. Use it; do not restate it here.

The enumeration above is this skill's framing, not Feathers's wording.

## Interception and pinch points

Feathers ch. 12 (pp. 174–184) asks where to intercept a cluster of changes. An **interception
point** is a place where you can detect the effect; a **pinch point** is an interception point
that covers _several_ change points at once — a narrow place all the effects pass through.

**Not the same term as the strangler's.** `legacy-enterprise-modernization` uses "interception
point" for a place to put a proxy that **redirects** traffic — an HTTP gateway, a facade, CDC.
Feathers's interception point **observes**; the strangler's **diverts**. These are different jobs;
a boundary suitable for observing a test is not automatically suitable for redirecting production
traffic, though one location may support both with the appropriate contracts.

The decision rule that follows from it:

| Situation                                            | Test at                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| One change point, effect visible in a return value   | The method itself                                                                                |
| Several change points in one class, one public entry | That entry may be a pinch point; choose inputs/assertions exposing each relevant effect          |
| Effects spread across several classes                | The narrowest public API all of them pass through, even if it is a layer up                      |
| No narrow point exists                               | Use an adequate coarser point, or identify the specific dependency preventing useful observation |

The trap is testing at too high a level "because it is easier to reach": a pinch point one layer
too high pins the behaviour of everything else that passes through it, so unrelated changes go
red. Prefer the narrowest point that still sees the whole effect.

For characterising at a **system** boundary — the HTTP contract, the batch output — rather than a
class-level pinch point, the owner is `legacy-enterprise-modernization`.

## Trusting the first reachable test

The seam makes an experiment possible; it does not supply the oracle. Before calling the first
assertion useful, identify what it establishes:

- **Observed behavior:** run the real target for named inputs and controlled collaborator
  responses. Record the result as characterization, not proof of intended behavior. If the
  original target could not run, do not call a post-seam result a before/after comparison;
  retain the preservation argument and state that limit.
- **Required behavior:** an authorized requirement or established contract supplies the expected
  result. A disagreement is evidence to investigate, not a reason to replace the expectation
  with whatever ran. Keep an approved behavior correction distinct from the seam-only step.
- **Substituted behavior:** a double's configured answer is an input to the experiment. Keep
  the legacy decision path real and check its result or relevant effects. A constant stub can
  conceal a wrong lookup key, duplicate acquisition or unexpected call; record arguments/counts
  or fail on unexpected calls where those effects are the preservation risk. Do not assert
  every internal interaction merely because it is observable.

The renewal fixture illustrates this distinction: returning rate `1.0` for every ID lets a
wrong-ID lookup return the expected policy list. Its recording double rejects that lookup;
the verifier compiles a deliberately wrong-ID variant and requires that specific failure.
This demonstrates sensitivity to that fault, not complete coverage or fidelity to the real
gateway. Characterization mechanics and broader case selection remain with `java-refactoring`.

**Keep the production selection observable too.** Trace an existing caller to the retained
constructor, factory or provider selection. An injected test can pass even if that entry now
chooses a dummy collaborator, acquires a resource later or swallows an initialization failure.
Check the retained path when safe; if it requires an unavailable real service, retain the source
comparison and state what was not executed rather than contacting production for a test.
In the synthetic renewal fixture, the no-argument constructor can safely be checked: it still
fails on gateway construction, while the injected constructor reaches policy assertions.
The verifier rejects a second variant that silently replaces the original gateway with a stub.
These assertions cover the fixture's acquisition failure; they do not establish successful
database integration or all initialization effects. Both test points matter; an extra constructor
signature alone protects neither.

## Isolation and changing evidence

Prefer per-test collaborators and inputs. When a legacy seam changes a singleton, system
property, default locale/time zone or provider registry, inventory all readers and writers.
Restore prior values in guaranteed cleanup, including exceptional paths; resetting only before
the next test is insufficient. Await or cancel owned asynchronous work and confirm the underlying
task has stopped before restoring shared state or closing the seam. A fixed delay is not evidence
it finished.

Cleanup prevents later leakage but does not prevent simultaneous tests from seeing the
override. With compatible JUnit Jupiter versions, a shared `@ResourceLock` can coordinate tests
that declare the same resource; `@Isolated` can prevent other Jupiter test classes running
concurrently with a class. These scheduling controls do not restore values, stop application
threads or coordinate separate JVMs. Use an existing isolated process when the state cannot be
reset safely; protect external resources independently. Mockito's static mock is scoped to its
creating thread: serializing tests cannot make it intercept a worker-thread call.

If a test passes alone but fails in the suite, preserve the failing evidence and compare order,
parallelism, state, thread and fixture setup before changing production logic. Reproduce the
smallest relevant sequence or overlap; do not make retries or longer sleeps the proof of a fix.
When evidence shows the seam never intercepted the actual call, revise the seam choice or
enabling point and rerun the real path. When evidence shows a cleanup/isolation fault, repair
that boundary and rerun the previously failing execution mode. Remaining variation is an
unresolved limit, not a stable characterization result or a reason to approve a new snapshot.

## Sources

- Michael Feathers, _Working Effectively with Legacy Code_ (2004), ch. 4 (pp. 29–44), ch. 11
  (pp. 151–171), ch. 12 (pp. 174–184). The seam and enabling-point definitions are quoted via
  Fowler, who cites Feathers directly. Chapter content for chs. 11–12 is **[secondary]**,
  corroborated across independent summaries. The primary text was not read for any of it.
- [Martin Fowler, _LegacySeam_](https://martinfowler.com/bliki/LegacySeam.html)
- [Java 21 ServiceLoader](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/ServiceLoader.html)
- [Java 21 javac annotation-processing options](https://docs.oracle.com/en/java/javase/21/docs/specs/man/javac.html)
- [Michael Feathers, Characterization Testing](https://michaelfeathers.silvrback.com/characterization-testing):
  characterization describes observed behavior; discovering a surprise does not settle correctness.
- [JUnit 5.13.4 ResourceLock](https://docs.junit.org/5.13.4/api/org.junit.jupiter.api/org/junit/jupiter/api/parallel/ResourceLock.html)
  and [Isolated](https://docs.junit.org/5.13.4/api/org.junit.jupiter.api/org/junit/jupiter/api/parallel/Isolated.html):
  scheduling guarantees, including lifecycle-method coverage for resource locks. Check support
  in the project's JUnit version; this is not a reason to upgrade its harness.
- [Mockito 5.23.0 MockedStatic](https://javadoc.io/static/org.mockito/mockito-core/5.23.0/org.mockito/org/mockito/MockedStatic.html):
  creating-thread scope and required release of the mock.
