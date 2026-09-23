---
name: java-dependency-inversion
description: >
  Dependency direction in Java: policy versus mechanism, ports and adapters, constructor
  injection as plain Java, factories, composition roots, and JPMS module edges as physical
  enforcement. Use when deciding whether to introduce an interface or port, when domain code
  imports a transport or vendor SDK, when code is only testable with a mocking framework or
  a live external system, or when reviewing a codebase where every class has a matching
  interface. Covers when inversion pays and when it is pure indirection. For the wider
  five-principle review context, use java-solid.
---

# Java Dependency Inversion

## Purpose

Point dependencies from mechanism towards policy — and only where the direction buys
something. The two failure modes this skill exists to prevent are opposites: domain
logic welded to a transport or vendor SDK it cannot be tested without, and a codebase
of interfaces with one implementation each, where every call site pays indirection
for a seam nothing ever uses.

## Workflow

0. **Check the target and evidence available.** Inspect compiler release/toolchains, build
   modules, resolved vendor APIs, DI configuration and runtime wiring. The references use
   Java 17 APIs; the worked records require Java 16+, `String.formatted` Java 15+, JPMS
   Java 9+, and `RandomGenerator` Java 17+. Do not upgrade or add a framework to apply DIP;
   ordinary constructors/interfaces work on older targets. If only imports are available,
   label the graph provisional rather than claiming deployment isolation.
   Reuse the requested outcome and project conventions; investigate the affected edge, not
   every dependency by default. Ask only for unresolved consumer or lifecycle contracts that
   change the decision, and continue independent checks with stated limits.
1. **Draw the actual direction.** Inspect source references and build inputs alongside compiled
   bytecode/package edges and JPMS `requires`; source-retained annotations leave no bytecode edge. Then
   add reflection, `ServiceLoader`, generated types, configuration and wire/schema dependencies.
   Imports can be unused; the compiler graph constrains source/link change but is not the only
   coupling that constrains deployment.
2. **Classify each edge.** Policy decides _what_ happens (pricing rules, order flow,
   eligibility); mechanism is _how_ (HTTP, SQL, SMTP, filesystem, message broker).
   Policy→mechanism edges are inversion candidates. Edges to stable platform types —
   `Instant`, `BigDecimal`, collections — usually need no local wrapper. An operation such
   as obtaining the current time may use the existing JDK `Clock` seam when control of time
   matters to the contract or tests.
3. **Apply the seam test before creating any interface.** Require concrete value: an external or
   separately released boundary, quarantined vendor types, an enforced dependency rule, multiple
   implementations, or deterministic/failure testing that the concrete mechanism prevents. No
   demonstrated change, ownership, failure or test seam means no interface.
4. **Invert when the benefit justifies it.** Define the port next to the policy, named in the policy's vocabulary;
   implement it in an adapter beside the mechanism; construct and connect both in
   the composition root; hand the port in through the constructor.
5. **Verify.** Compile policy into a fresh output directory with the mechanism absent and no
   cached classes or generated outputs masking the dependency. Inspect full module readability
   (including transitive edges), and exercise policy outcomes with a small double. A container
   is unnecessary for that check; separately test adapter translation and runtime wiring.

## Rules

- A policy port normally belongs to the caller: declared with the policy and named for what it
  needs (`ConfirmationSender`), not for the mechanism (`SmtpClientWrapper`). A provider-owned SPI
  or independently governed protocol contract is a different boundary; do not duplicate it just
  to satisfy a slogan.
- A single production implementation is not a verdict. Introduce a port when the seam test
  above demonstrates a benefit, including an owned boundary or failure-testing need; otherwise
  retain the concrete dependency until evidence justifies the abstraction.
- Constructor injection is plain Java: a final field, a constructor parameter, a
  `new` in the composition root. A framework wires it conveniently; it is never a
  prerequisite. `new`-ing a mechanism inside policy code is a hidden dependency.
- Each executable/runtime entry point has a composition root (HTTP process, worker, CLI, tests).
  Keep concrete assembly at those outer boundaries. A service locator or static lookup inside
  policy code re-hides the dependency the constructor exposed.
- A factory is itself a dependency. Inject one when policy legitimately controls creation
  or acquisition timing/scope, including lazy or per-unit-of-work use. Define freshness,
  reuse and cleanup; when one existing instance serves, inject the instance.
- Preserve collaborator scope and concurrency when moving assembly. A `final` injected field
  fixes the reference, not the collaborator's mutable state. Do not turn a confined or per-operation
  instance into a shared singleton unless its contract supports the resulting concurrent calls.
- The JDK already ships some ports — `java.time.Clock` is one. Inject those rather
  than merely renaming them in project-local interfaces. A business calendar or another
  narrower policy contract may still justify its own abstraction.
- Testability is one strong proof, not the only one. A port can pay through vendor quarantine,
  independent release, capability narrowing, security policy or failure simulation even when a
  concrete fake was already easy. State the benefit and verify it.
- Quarantine failure and lifecycle contracts as well as request types. Decide which failures
  cross the port, whether completion means accepted or completed, and who closes resources.
  Translate vendor errors in the adapter; do not move transport exceptions into policy or
  introduce retries merely because the call is now behind an interface.
- Changing an exported constructor or port signature is an API migration. Inspect old
  callers, external implementors and framework wiring; successful policy isolation does
  not prove those consumers remain compatible.

## Deliverable

Report the observed edge, seam benefit and cost, contract owner, smallest change and validation
actually run. For an implementation, include assembly and success/failure checks; distinguish
policy isolation from adapter integration. Name missing runtime/build evidence instead of
claiming a complete boundary from a clean import list.
Keeping the existing dependency is a valid result when no worthwhile seam is missing.
Stop after the relationship and affected contracts are verified, or state the remaining
integration/migration work without reporting it as implemented.

## References

- [Decision guide](references/decision-guide.md) — when to invert an edge, when to
  leave it, and how JPMS makes the decision physical. Read when deciding whether a
  dependency deserves a port.
- [Worked example: notification dispatch](references/worked-example.md) — a policy
  class decoupled from SMTP, with a plain-Java composition root and the test double
  that proves the seam. Read when performing an inversion.
- [Costs and false positives](references/costs-and-false-positives.md) — what
  inversion costs, and single-implementation interfaces that are nonetheless
  justified. Read before a review finding demands a new interface, or when
  reviewing an interface-heavy codebase.
