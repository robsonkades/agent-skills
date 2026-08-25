# Costs and false positives

## What inversion costs

Name these costs in any recommendation; a finding that presents inversion as free
is wrong.

- **Navigation.** Every port adds a jump between "what is called" and "what runs".
  IDEs soften this; they do not remove it, and stack traces do not use the IDE.
- **Vocabulary duplication.** A port speaks policy language, so data crossing it is
  translated (a `Confirmation`, not an `SmtpMessage`). That translation code is
  real code with real bugs.
- **API surface.** A public port is a published contract: adding a method breaks
  implementors outside your compilation unit (a `default` method avoids the source
  break at the cost of a possibly meaningless fallback).
- **Dead flexibility.** An unused seam still costs reading time on every visit.
  Speculative ports are inventory, not investment.
- **Object-graph assembly.** Someone must construct and connect the pieces. One
  composition root is cheap; framework configuration spread across annotations and
  files is not, and debugging wiring is time not spent on the domain.

## The interface-per-class codebase

The pattern to name in review: `FooService` + `FooServiceImpl`, pairwise, across
the codebase. Detection is mechanical — for each interface, count production
implementations and look for a seam:

- One implementation, no test double in use, no module boundary → the interface is
  ceremony. The honest fix is deletion (inline the class), not a second
  implementation invented to justify it.
- The interface's methods mirror the impl one-for-one, including parameter names →
  nobody designed a contract; they extracted a surface.
- Callers are all in the same module and the interface is not exported anywhere →
  no boundary exists for it to guard.

Say why it happened without dogma: usually a style rule from the EJB era, or a
mocking framework habit — modern test doubles are hand-written classes against a
port that _earns_ its existence, and classes need no interface to be constructed
in a test.

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

- **Pass-through delegation.** A "use case" interface whose implementation calls
  one repository method and returns the result adds a layer, not a seam. Collapse
  it until there is policy to hold.
- **Adapters wrapping adapters.** A port over your HTTP client that is itself a
  port over the JDK client — one translation boundary per foreign system, not per
  library.
- **Ports for peers.** Two policy classes in the same module separated by an
  interface "for decoupling". Peers may call each other directly; inversion is for
  edges toward mechanisms and boundaries, not for every edge.
- **Abstracting the domain model.** `OrderLike` interfaces over entities so that
  "the domain stays flexible". The domain model is the stable thing everything else
  depends on; abstracting it inverts the wrong way.
