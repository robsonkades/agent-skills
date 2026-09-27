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

Use these questions before adopting or planning a major upgrade to expose concrete cost drivers.
Reuse answers already established by the project; investigate unknowns that could change the decision.

**Support and cadence**

- Which exact release lines and runtime/dependency combinations remain supported over the
  system's required operating horizon? Distinguish community maintenance from contracted
  coverage; verify eligibility, scope and end dates rather than assuming an extension applies.
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

- If maintenance ended, which required capabilities or support obligations would become
  unsatisfied, and when? Inspect accepted requirements and support terms; do not infer a
  mandatory support policy, or permission to disregard one, from the code's current age.
- Compare feasible options: retain through retirement, use confirmed support coverage, upgrade
  within the framework, stage a replacement, or retire the capability. A wrapper does not
  restore missing maintenance or make an incompatible dependency supported. Continued use
  with a gap needs a bounded rationale consistent with existing requirements and authority;
  otherwise report the unmet constraint and the evidence needed to choose a feasible route.
- Estimate only from the resolved stack, migration guidance and a representative slice.
  Unknown feasibility or duration is a reason for a focused investigation, not an invented
  multi-year estimate or an immediate rewrite.

For example, keeping a stable application can be the least costly choice when its confirmed
support coverage and compatibility extend through its scheduled retirement. With the same
application and retirement date, if required support expires earlier and no extension is
available, unchanged operation no longer satisfies that constraint. Compare a supported upgrade
or earlier retirement before paying for whole-framework replacement; test a representative
upgrade path before committing to its cost. A postponed retirement reopens the first decision.

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
  two framework generations. Independent reasoning and tests can repay mapping cost; verify
  that the proposed boundary actually removes the constraints on those rules
  (`humble-objects-and-functional-core`).
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

- [Spring support policy](https://spring.io/support-policy/): version mapping and support scope
  matter; verify current dates and the coverage applicable to the target system. This policy
  does not establish that a particular organization has purchased or qualifies for support.
- [Java 17 Collections.sort with a Comparator](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/Collections.html#sort(java.util.List,java.util.Comparator)>):
  a library may invoke application-provided behavior without owning the application's lifecycle.
- [Spring Boot 3.0 migration guide](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-3.0-Migration-Guide):
  Java 17 baseline, Jakarta API changes and dependency compatibility; this is historical guidance,
  not authorization to upgrade the target project.
- [Spring Boot 3.5 MockBean API](https://docs.spring.io/spring-boot/3.5/api/java/org/springframework/boot/test/mock/mockito/MockBean.html)
  and [Boot 4.0 migration guide](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide),
  plus [MockitoBean/MockitoSpyBean](https://docs.spring.io/spring-framework/reference/testing/annotations/integration-spring/annotation-mockitobean.html):
  deprecation and replacement semantics. Inspect the versions on both sides of the upgrade.
