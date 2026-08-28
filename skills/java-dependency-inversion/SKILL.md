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

1. **Draw the actual direction.** List who imports whom — `import` statements and
   JPMS `requires` edges, not the architecture diagram. The compiler's view is the
   only one that constrains change.
2. **Classify each edge.** Policy decides _what_ happens (pricing rules, order flow,
   eligibility); mechanism is _how_ (HTTP, SQL, SMTP, filesystem, message broker).
   Policy→mechanism edges are inversion candidates. Edges to stable platform types —
   `java.time`, `BigDecimal`, collections — are not: you will never substitute them.
3. **Apply the seam test before creating any interface.** It must have a second
   production implementation today, sit on a boundary you do not own (external
   system, published API), or enable a test double that cannot be built any other
   way. No seam, no interface.
4. **Invert.** Define the port next to the policy, named in the policy's vocabulary;
   implement it in an adapter beside the mechanism; construct and connect both in
   the composition root; hand the port in through the constructor.
5. **Verify.** The policy package compiles with the mechanism off the classpath (or
   the module graph shows no `requires` edge to it), and its tests run with a
   hand-written double of a few lines — no mocking framework, no container.

## Rules

- The port belongs to the caller: declared in the policy's package, named for what
  the policy needs (`ConfirmationSender`), never for the mechanism behind it
  (`SmtpClientWrapper`) and never prefixed (`IEmailService`).
- An interface with a single production implementation and no seam is indirection,
  not abstraction. Introduce the abstraction on the second implementation or at a
  boundary you do not own — not before.
- Constructor injection is plain Java: a final field, a constructor parameter, a
  `new` in the composition root. A framework wires it conveniently; it is never a
  prerequisite. `new`-ing a mechanism inside policy code is a hidden dependency.
- Exactly one composition root constructs concrete types. A service locator or
  static lookup inside policy code re-hides the dependency the constructor exposed.
- A factory is itself a dependency. Inject a factory only when the policy must
  create instances per request; when one instance serves, inject the instance.
- The JDK already ships some ports — `java.time.Clock` is one. Inject those rather
  than wrapping them in project-local interfaces.
- Testability is the honest test: an abstraction that did not make some test simpler
  to write and faster to run has not paid for itself yet.

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
