# Betting on a Framework

Choosing a framework is a bet with a long settlement period, made under an asymmetry that is
worth naming precisely before deciding how much to hedge.

## The asymmetry

You integrate the framework across the whole system: its wiring, its lifecycle, its
conventions, its idioms in every file a new joiner reads. In return the framework's authors
commit only to published compatibility/support policies, not your system's lifecycle. They may change the programming model, rename packages,
deprecate abstractions, drop platform support, and end the maintenance window on a schedule
set by their release train, not your roadmap.

Two conclusions are commonly drawn from this, and only one survives contact with delivery:

**The one that does not survive delivery** — "keep the framework at arm's length behind your
own abstractions". This produces a second, worse framework that you now maintain, and it does
not deliver the exit it promised, because the expensive couplings (concurrency model,
data-access paradigm) are not the ones an interface can hide.

**The one that does** — "choose deliberately, place the coupling where migration cost is
proportional to code you would touch anyway, and keep upgrading". The realistic risk is not
switching framework, which almost nobody does; it is being unable to move _within_ the one you
chose.

## Questions that predict upgrade pain

Ask these before adopting, and re-ask them at each major version. They predict cost far better
than any architectural principle.

**Support and cadence**

- What is the support window for a given major version, and does a commercial extension exist?
- How often do majors ship, and what has the last two majors' migration actually required?
- Does the project publish a migration guide and tooling, or a release note and good luck?

**Blast radius of its idioms**

- Does it appear in signatures, or only in metadata? Signatures spread; annotations do not.
- Does it require base classes, or is it annotation- and interface-driven?
- Does it dictate the concurrency model? This is the single most expensive coupling available
  and it is rarely counted as one.

**Ecosystem gravity**

- How many transitive decisions does it make for you — serialisation, validation, logging,
  metrics, test harness? Each is a coupling you did not choose separately.
- Is the ecosystem's centre of gravity moving toward or away from it?

**Exit**

- If it were abandoned tomorrow, what would the system do? For a large framework the honest
  answer is usually "stay on it, unsupported, and plan a multi-year replacement" — which is
  fine, provided it was known.

## What real migrations turn out to cost

Costs cluster in places that architectural purity does not protect against. Three recurring
shapes, each with a different lesson:

**A namespace change.** Jakarta EE 9 renamed the `javax.*` packages to `jakarta.*`, and
frameworks adopting it — Spring Boot 3 among them — required every dependency in the graph to
have made the same move. The work in application code was largely mechanical; the schedule was
set by the slowest third-party library. **Lesson:** exit cost is dominated by your dependency
graph, not by your architecture. A pristine hexagonal domain does not help when a driver has
not been republished.

**A removed or renamed test abstraction.** `@MockBean` and `@SpyBean` were deprecated in
Spring Boot 3.4, when `@MockitoBean` and `@MockitoSpyBean` arrived in Spring Framework 6.2,
and removed in Boot 4.0 — the deprecation window is what determines migration timing. The work
is mechanical, but proportional to the number of test classes, often thousands in a mature
system, and it touches tests rather than production code, so it is invisible to
every architecture rule the team wrote. **Lesson:** the test suite is part of the coupled
surface, and is usually the largest part by file count (`architecture-testing`).

**A programming-model shift.** Moving between a blocking servlet stack and a reactive one
changes signatures along every path, changes error handling, changes testing, and changes what
"blocking" means for correctness. This is not a migration; it is a rewrite of every layer the
types touch. **Lesson:** this rung of the ladder must be chosen once, deliberately, with a
driver — and revisited only with the same seriousness (`reactive-and-virtual-thread-selection`,
`blocking-and-nonblocking-io`).

Note what is absent from all three: nobody's cost was dominated by `@Service` annotations or
by constructor injection. The cheap rung stayed cheap.

## Deciding: isolate, adopt, or upgrade

```text
Is the dependency a FRAMEWORK (owns lifecycle, wiring, request flow)
or a LIBRARY (you call it; it does not call you)?

  LIBRARY  → an adapter is cheap and usually worth it. Small surface,
             replaced far more often than frameworks, and the adapter
             also gives you a place to put retry, timeout and error
             translation (timeouts-and-deadlines, retries-and-backoff).

  FRAMEWORK ↓

Does it appear in your SIGNATURES or only in your METADATA?

  METADATA  → accept it. Annotations are the cheapest coupling there is,
              and abstracting them buys nothing.

  SIGNATURES ↓

Is the signature coupling confined to adapters?

  YES → correct placement. This is the design working as intended.
  NO  → this is the expensive rung. Either pull it back to the adapters
        now, while it is smaller than it will ever be again, or accept
        it explicitly as an architectural commitment and record it
        (architecture-decision-making).
```

Upgrade cost often grows nonlinearly when skipped releases compound breaking changes, unsupported
dependencies and lost migration knowledge, but this is a risk model rather than a universal curve.
Choose a cadence from support windows, exposure, compatibility testing and change cost; validate
automated dependency updates instead of assuming every minor is cheap.

## When coupling tightly is the right answer

Stated plainly, because the literature on this topic under-weights it:

- **The framework's abstraction is already neutral.** Spring's `Resource`, its cache
  abstraction, its transaction abstraction and `DataSource` were designed as ports. Wrapping
  them produces a port over a port (`patterns-and-modern-frameworks`).
- **The application is short-lived or small.** A service with a two-year horizon should
  optimise for delivery speed. Isolation is insurance, and insurance on a short policy is
  usually a bad buy.
- **The domain is thin.** CRUD over a schema has no rules to protect. The entity is the model,
  the framework is the application, and a second model is pure overhead
  (`domain-logic-organization`).
- **The team is one team, and the framework is the team's fluency.** Idiomatic framework code
  that everyone can read beats an in-house abstraction that only its author understands.

## When isolation genuinely pays

- **The domain is complex and long-lived** — rules with real invariants, expected to outlast
  two framework generations. Here the mapping cost is repaid by being able to reason about,
  and test, the rules on their own (`humble-objects-and-functional-core`).
- **The dependency is an integration, not a framework.** Payment providers, messaging vendors
  and cloud SDKs are replaced regularly, have small surfaces, and need a seam for failure
  injection anyway (`distributed-systems-testing`).
- **Regulatory or contractual portability is an actual requirement** rather than an
  aspiration — someone has written it down and will audit it.
- **Two implementations exist right now.** Not "might exist": an interface with one
  implementation and no second in prospect is indirection
  (`enterprise-architecture-smells`).
