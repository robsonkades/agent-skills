# Costs and false positives

## What inversion costs

Name these costs in any recommendation; a finding that presents inversion as free
is wrong.

- **Navigation.** Every port adds a jump between "what is called" and "what runs".
  IDEs soften this; they do not remove it, and stack traces do not use the IDE.
- **Vocabulary duplication.** A port speaks policy language, so data crossing it is
  translated (a `Confirmation`, not an `SmtpMessage`). That translation code is
  real code with real bugs.
- **API surface.** An externally consumed port is a published contract: adding an abstract
  method breaks source recompilation of concrete implementors that lack it. Old binaries
  may still load but fail with `AbstractMethodError` when that method is invoked. A `default`
  may avoid that failure, but needs meaningful semantics and a check for inherited conflicts.
  See [JLS 17 interface evolution](https://docs.oracle.com/javase/specs/jls/se17/html/jls-13.html#jls-13.5.7).
- **Dead flexibility.** An unused seam still costs reading time on every visit.
  Speculative ports are inventory, not investment.
- **Object-graph assembly.** Someone must construct and connect the pieces. One
  composition root is cheap; framework configuration spread across annotations and
  files is not, and debugging wiring is time not spent on the domain.

## The interface-per-class codebase

The pattern to name in review: `FooService` + `FooServiceImpl`, pairwise, across
the codebase. Detection is mechanical — for each interface, count production
implementations and look for a seam:

- One implementation, no test double in use, no module boundary → investigate other seam
  benefits below before deletion. If none exists, inline the interface dependency instead
  of inventing another implementation to justify it.
- Mirroring an implementation's methods is a review signal, not proof of an undesigned
  contract. Inspect exposed types, capabilities, failure semantics and external consumers.
- Same-module, unexported interfaces can still guard package-level capabilities, vendor
  quarantine or deterministic tests; physical module count is not the boundary test.

Do not infer historical motives from naming. Demonstrate the unused seam and check callers,
framework proxies and reflection/configuration before removal. A hand-written double often
clarifies the port contract; a project's existing mocking framework is not itself a defect.

## Single-implementation interfaces that are justified

Do not flag these; each has a genuine seam despite the count:

- **A published boundary.** The interface is exported from a module or shipped as
  an API jar; external implementors may exist that you cannot see. SPI interfaces
  (`java.sql.Driver` pattern) are the extreme case.
- **The second implementation is scheduled, not imagined.** A signed-off migration
  (two payment providers during a cutover) justifies the port before the second
  adapter lands.
- **The double is the second implementation.** When the real implementation cannot
  run in a unit test at all — it talks to a network, a clock, a filesystem — the
  test double is a legitimate implementor, and the port exists for it. This is the
  `Clock` shape: the JDK ships `Clock.systemUTC()` and `Clock.fixed(...)` precisely
  because time needed a seam.
- **A dependency you refuse to spread.** One implementation wraps a vendor SDK; the
  port quarantines its types to one package. The count is one, but the boundary is
  real.

## Inversion that creates layers instead of seams

- **Pass-through delegation.** A "use case" interface whose implementation calls one repository
  method may add only navigation. Before collapsing it, check whether the boundary owns
  authorization, transactions, caching, telemetry, release compatibility or capability
  restriction; those are behavior even when the happy-path body is one line.
- **Adapters wrapping adapters.** A port over your HTTP client that is itself a
  port over the JDK client may repeat translation without adding a seam. Check whether
  each boundary owns distinct policy, vendor, security or lifecycle semantics before
  collapsing it; one foreign system does not imply exactly one useful adapter.
- **Ports for peers.** Two policy classes in the same module usually call directly. A real team,
  release or cyclic-dependency boundary can still justify a contract; "same layer" neither
  proves nor disproves a seam.
- **Speculative domain interfaces.** `OrderLike` merely so that "the domain stays flexible"
  names no consumer benefit. A real read-only role, capability restriction or independently
  owned policy contract can justify an interface over domain objects; the model is not
  necessarily the most stable component.
