# Betting on a Framework

Choosing a framework is a bet with a long settlement period, made under an asymmetry that is
worth naming precisely before deciding how much to hedge.

## The asymmetry

You integrate the framework across the whole system: its wiring, its lifecycle, its
conventions, its idioms in every file a new joiner reads. In return the framework's authors
commit only to published compatibility/support policies, not your system's lifecycle. They may change the programming model, rename packages,
deprecate abstractions, drop platform support, and end the maintenance window on a schedule
set by their release train, not your roadmap.

Distinguish two approaches:

**Duplicate the framework API behind wrappers.** This can add maintenance without isolating
concurrency or data-access semantics. A narrow application-owned port is different: it can
bound a contract or testing seam even when replacing the whole framework is not planned.

**Place coupling deliberately.** Aim for migration cost
proportional to the affected surface and maintain a supported upgrade path. Compare a concrete
framework replacement scenario with the more immediate cost of upgrades within the chosen one.

## Questions that predict upgrade pain

Ask these before adopting, and re-ask them at each major version. They predict cost far better
than any architectural principle.

**Support and cadence**

- What is the support window for a given major version, and does a commercial extension exist?
- How often do majors ship, and what has the last two majors' migration actually required?
- Does the project publish a migration guide and tooling, or a release note and good luck?

**Blast radius of its idioms**

- Does it appear in signatures or metadata? Both can spread; annotations may also control
  cross-cutting behavior. Inspect their actual reach, not just syntactic occurrence counts.
- Does it require base classes, or is it annotation- and interface-driven?
- Does it dictate the concurrency model? Trace affected signatures and runtime behavior to
  estimate its reach alongside data-model and protocol constraints.

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

**A namespace change.** Jakarta EE 9 moved relevant enterprise APIs from `javax.*` to `jakarta.*`.
Spring Boot 3 requires compatible versions of libraries participating in those APIs; it does
not rename every `javax` package or require unrelated dependencies to migrate. Java SE APIs such
as `javax.sql.DataSource` remain. Inspect the resolved graph, generated sources and runtime APIs;
do not perform a blanket namespace replacement. **Lesson:** third-party compatibility can
dominate the upgrade schedule even with an isolated domain.

**A removed or renamed test abstraction.** `@MockBean` and `@SpyBean` were deprecated in
Spring Boot 3.4, when `@MockitoBean` and `@MockitoSpyBean` arrived in Spring Framework 6.2,
and removed in Boot 4.0 — the deprecation window is what determines migration timing. The work
includes semantic differences in supported declarations, singleton restrictions, spy targets
and context hierarchies; check the relevant migration guide rather than only replacing imports.
It touches tests as well as production dependencies. **Lesson:** inventory test-framework
coupling and validate context behavior (`architecture-testing`).

**A programming-model shift.** Moving between a blocking servlet stack and a reactive one
changes signatures along every path, changes error handling, changes testing, and changes what
"blocking" means for correctness. It can require substantial redesign, but bounded paths can
migrate in stages if their seams preserve cancellation, backpressure and context. **Lesson:**
price the affected paths and their compatibility, rather than assuming an irreversible choice
(`reactive-and-virtual-thread-selection`,
`blocking-and-nonblocking-io`).

These are migration shapes, not measured cost comparisons for the current project. Use a
representative migration slice to estimate work and test the claimed isolation.

## Deciding: isolate, adopt, or upgrade

```text
Is the dependency a FRAMEWORK (owns application lifecycle, wiring, request flow)
or a LIBRARY (application chooses its use, possibly supplying callbacks)?
Classify actual lifecycle/control ownership; a callback alone does not decide it.

  LIBRARY  → use an adapter for an external protocol/failure boundary or
             application-owned contract; do not wrap stable value APIs by default.
             Retries need a shared budget and evidence of safe repetition,
             such as non-application or repeat-safe operation semantics
             (timeouts-and-deadlines, retries-and-backoff).

  FRAMEWORK ↓

Does it appear in your SIGNATURES or only in your METADATA?

  METADATA  → inspect lifecycle and behavioral effects; accept simple metadata
              where the dependency is allowed, but verify advice and hydration.

  SIGNATURES ↓

Is the signature coupling confined to adapters?

  YES → usually bounded placement; still verify the adapter's external contract.
  NO  → this is the expensive rung. Either pull it back to the adapters
        where that protects a concrete boundary, or accept
        it explicitly as an architectural commitment and record it
        (architecture-decision-making).
```

Upgrade cost often grows nonlinearly when skipped releases compound breaking changes, unsupported
dependencies and lost migration knowledge, but this is a risk model rather than a universal curve.
Choose a cadence from support windows, exposure, compatibility testing and change cost; validate
automated dependency updates instead of assuming every minor is cheap.

## When coupling tightly is the right answer

Stated plainly, because the literature on this topic under-weights it:

- **The existing abstraction fits the contract.** Spring's `Resource`, cache and transaction
  APIs can be appropriate infrastructure ports but still depend on Spring. `javax.sql.DataSource`
  is a Java SE interface. Wrap only when a narrower application contract adds a concrete benefit
  (`patterns-and-modern-frameworks`).
- **The application is short-lived or small.** A shorter horizon can reduce the benefit of
  speculative portability, but does not remove security, consumer or contractual requirements.
  Compare the cheapest adequate boundary with the recurring cost of isolation.
- **The domain is thin.** A separate persistence/domain model may buy little unless schema
  ownership or independently changing contracts require separation; API DTOs are a separate choice
  (`domain-logic-organization`).
- **The team is one team, and the framework is the team's fluency.** Idiomatic framework code
  that everyone can read beats an in-house abstraction that only its author understands.

## When isolation genuinely pays

- **The domain is complex and long-lived** — rules with real invariants, expected to outlast
  two framework generations. Here the mapping cost is repaid by being able to reason about,
  and test, the rules on their own (`humble-objects-and-functional-core`).
- **The integration has a concrete contract or failure boundary.** A payment, messaging or cloud
  adapter can contain external semantics and permit focused failure tests. Inspect the actual
  surface and replacement scenario; a vendor SDK is not inherently small or cheap to replace
  (`distributed-systems-testing`).
- **Regulatory or contractual portability is an actual requirement** rather than an
  aspiration — someone has written it down and will audit it.
- **A concrete boundary benefit exists.** Multiple implementations can justify a port, but
  so can failure isolation, contract ownership or a test seam with one implementation
  (`enterprise-architecture-smells`).

## Primary sources

- [Java 17 Collections.sort with a Comparator](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/Collections.html#sort(java.util.List,java.util.Comparator)>):
  a library may invoke application-provided behavior without owning the application's lifecycle.
- [Spring Boot 3.0 migration guide](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-3.0-Migration-Guide):
  Java 17 baseline, Jakarta API changes and dependency compatibility; this is historical guidance,
  not authorization to upgrade the target project.
- [Spring Boot 3.5 MockBean API](https://docs.spring.io/spring-boot/3.5/api/java/org/springframework/boot/test/mock/mockito/MockBean.html)
  and [Boot 4.0 migration guide](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide),
  plus [MockitoBean/MockitoSpyBean](https://docs.spring.io/spring-framework/reference/testing/annotations/integration-spring/annotation-mockitobean.html):
  deprecation and replacement semantics. Inspect the versions on both sides of the upgrade.
