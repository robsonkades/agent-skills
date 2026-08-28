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

### Preprocessing seams — do not exist

The enabling point is `#define`/`#include`, resolved before compilation. Java has no
preprocessor, and there is no substitute worth pursuing. **Annotation processors and code
generation are not a testing seam**: they change what is compiled, not what is dispatched, and
nothing in a test can select between two generated behaviours at the call site.

### Link seams — available, weak, unidiomatic

The enabling point is the classpath or module path chosen at assembly time. In Java that means:

- a class of the same fully-qualified name earlier on the test classpath (shadowing);
- a test-scoped dependency replacing a compile-scoped one;
- a different `ServiceLoader` provider registered on the test classpath;
- a JPMS `provides`/`uses` binding swapped between module paths.

Feathers's warning applies with extra force here: a link seam has **no enabling point in the
source**, so a reader of the class cannot tell that its behaviour is substitutable at all. Use
when nothing else reaches — and leave a comment naming the mechanism, because nobody will find it.

### Object seams — the default, and why

The enabling point is the call site's dispatch: which object receives the message. Feathers calls
these _"pretty much the most useful seams available in object-oriented programming languages"_,
and in modern Java the argument is stronger than he could have made it in 2004. Since constructor
injection became the norm, the enabling point for most object seams is **the constructor call in
the composition root** — which is both visible in source and already the place the application
wires itself. The seam costs a parameter and nothing else.

### Bytecode instrumentation — the modern fourth category

An agent rewriting classes at load time. Mockito's inline mock maker (`mockStatic`,
`mockConstruction`, mocking `final`) is exactly this, and so was PowerMock's classloader. It is
_technically_ a seam whose enabling point is the `try`-with-resources block — but that enabling
point is invisible from production source, which is why it sits at the bottom of every preference
ordering. See `java-test-doubles` for the policy; the design argument survives the technical one.

## Effect analysis: what can this change possibly break?

Feathers ch. 11 (pp. 151–171) is about reasoning forward and backward from a change: what does
this value feed, and what feeds it? He draws these as _effect sketches_ — a scratch diagram of
which fields, returns and side effects a change can propagate to.

The practical use, and the reason it is worth doing before writing a test rather than after: the
set of things the change can affect is almost always much smaller than the set of things the class
touches, and the test you need only has to observe **that** set. Most over-testing of legacy code
comes from testing the class rather than testing the effect.

Effects propagate through exactly four routes in Java, and enumerating them is quick:

1. the return value;
2. parameters the method mutates (including collections it was handed);
3. fields of the instance or of anything it can reach;
4. observable side effects — writes, messages published, logs a downstream consumer parses.

Route 4 is the one that ambushes people, and it is the reason
`java-refactoring/references/safety-workflow.md`'s section on pinning non-return-value dimensions
exists. Use it; do not restate it here.

`UNVERIFIED:` the four-route enumeration above is this skill's framing, not Feathers's wording.

## Interception and pinch points

Feathers ch. 12 (pp. 174–184) asks where to intercept a cluster of changes. An **interception
point** is a place where you can detect the effect; a **pinch point** is an interception point
that covers _several_ change points at once — a narrow place all the effects pass through.

**Not the same term as the strangler's.** `legacy-enterprise-modernization` uses "interception
point" for a place to put a proxy that **redirects** traffic — an HTTP gateway, a facade, CDC.
Feathers's interception point **observes**; the strangler's **diverts**. Same words, different
jobs, and a class-level pinch point is not a candidate for either role in the other's sense.

The decision rule that follows from it:

| Situation                                            | Test at                                                                                |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| One change point, effect visible in a return value   | The method itself                                                                      |
| Several change points in one class, one public entry | That entry — the pinch point. One test covers all of them                              |
| Effects spread across several classes                | The narrowest public API all of them pass through, even if it is a layer up            |
| No narrow point exists                               | That is the finding: the design has no seam, and step 3 has more work than you thought |

The trap is testing at too high a level "because it is easier to reach": a pinch point one layer
too high pins the behaviour of everything else that passes through it, so unrelated changes go
red. Prefer the narrowest point that still sees the whole effect.

For characterising at a **system** boundary — the HTTP contract, the batch output — rather than a
class-level pinch point, the owner is `legacy-enterprise-modernization`.

## Sources

- Michael Feathers, _Working Effectively with Legacy Code_ (2004), ch. 4 (pp. 29–44), ch. 11
  (pp. 151–171), ch. 12 (pp. 174–184). The seam and enabling-point definitions are quoted via
  Fowler, who cites Feathers directly. Chapter content for chs. 11–12 is **[secondary]**,
  corroborated across independent summaries. The primary text was not read for any of it.
- [Martin Fowler, _LegacySeam_](https://martinfowler.com/bliki/LegacySeam.html)
