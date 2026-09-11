---
name: gof-bridge
description: >
  Bridge in modern Java: separating an abstraction hierarchy from an implementation hierarchy so
  the two vary independently instead of multiplying into N×M classes. Covers the two-axis test
  that distinguishes it from Strategy, what to do when the matrix has illegal combinations, how
  implementor contracts account for backend cost and failure without losing required capabilities, and the thread-safety contract that belongs to
  the interface rather than to each implementation. Use when class names start combining two
  adjectives, when adding either a variant or a backend requires editing the other side, when a
  transport or storage backend must be swappable, when one backend is remote and the others are
  local, or when someone proposes Bridge for a single axis of variation. Does not cover retrofitting an incompatible existing type (gof-adapter), one varying
  algorithm (gof-strategy), families of matched products (gof-abstract-factory), or choosing a
  hierarchy shape in general (java-composition-over-inheritance).
---

# Bridge

## Purpose

Stop a class hierarchy multiplying. When a design varies along two independent axes and both are
expressed as subclasses, the variation-specific class count is their product: `EncryptedS3Store`,
`PlainS3Store`, `EncryptedFileStore`, `PlainFileStore`, and two more when one axis gains a third
member. Bridge makes one axis the abstraction, the other an implementor interface held in a field.
The variation implementations grow by their sum; shared interfaces and wiring add other types.

Mechanically this is "hold an interface in a field and delegate" — which is why the pattern is
rarely named in Java code that already does it. Naming it is still worth something: it says the
field is not an incidental collaborator but the second axis of the design, and that new backends
are expected to arrive without touching the abstraction.

Start from representative consumer operations, required advanced capabilities and failure/lifecycle
expectations. Reuse accepted boundary decisions, change history and existing tests to establish the
two responsibilities; names and type counts are clues. Ask only for missing evidence that could
change the legal combinations or contract, and retain adequate composition when a second hierarchy
adds no useful separation.

## When it is the answer

```text
Two axes of variation can evolve independently and a product hierarchy
would couple their change rates
        → Bridge is a candidate; compare plain composition and configuration.

An API you publish must outlive the mechanisms that implement it —
drivers, transports, backends contributed by others
        → Separate the public contract from its providers. JDBC and SLF4J
          illustrate API/provider boundaries; a Bridge classification still
          depends on the independent roles in the design under review.

The abstraction has its own hierarchy — refined abstractions with
extra operations — not just one class
        → Bridge proper, as opposed to Strategy.
```

## When it is not

- **One axis varies.** That is Strategy or plain composition; Bridge's second hierarchy would be
  empty (`gof-strategy`).
- **The abstraction is a single stable class and no refined abstraction is expected.** Plain
  composition may describe it better, although the same separation can still protect a public
  API from independently evolving providers.
- **The implementor has one implementation and no boundary reason.** This weakens the case. A
  public SPI, ownership boundary, testable hardware port, or migration seam can justify one
  implementation without inventing a future second one (`gof-pattern-thinking`).
- **The axes are mostly coupled.** A sparse matrix can still use a bridge, but construction must
  encode capabilities or legal combinations. If most pairs are invalid, model named variants
  instead of exposing a misleading Cartesian product.
- **Only interface compatibility is the problem.** Adapter fits an existing type to a target
  interface. Bridge separates evolving roles; it can be introduced during refactoring and use
  adapters as implementors (`gof-adapter`). Timing or authorship alone does not decide the pattern.

## Modern Java expression

Examples target Java 17 without preview: sealed types and records are available. Exhaustive
pattern switches over sealed types require Java 21 for non-preview use. Inspect project compiler
release and dependencies; ordinary interfaces/classes can express Bridge on older baselines.

```text
Classical                            Modern
───────────────────────────────────  ───────────────────────────────────
abstract class Abstraction {         final class Notification {
  protected Implementor impl;          private final Channel channel;
}                                    }
class RefinedAbstraction extends     sealed interface Notification
                                       permits Alert, Digest, Receipt
                                     — refinement as a closed set, with
                                       the channel composed in

interface Implementor                interface Channel — one method
  primitiveOperation()               often means Channel is a functional
                                     interface, and a lambda is a backend

new RefinedAbstraction(              constructor injection; the container
    new ConcreteImplementorA())      picks the backend per environment
```

Two consequences worth stating. If the implementor is a functional interface, backends can be
lambdas and the "hierarchy" is a set of functions — still a bridge in intent, with no
classes on that side. And if the abstraction side is a closed set you own, a sealed interface
gives exhaustiveness the classical version does not. Functional-interface eligibility follows
the inherited abstract-method rules; default/static methods do not count, and a sealed interface
is not a lambda target ([JLS 17 section 9.8](https://docs.oracle.com/javase/specs/jls/se17/html/jls-9.html#jls-9.8)).

## Decision rules

```text
IF class names combine two adjectives (EncryptedS3, PlainFile)
THEN investigate whether two independent responsibilities actually vary. Names alone do not
     justify an extra abstraction; compare composition and named legal variants.

IF only one axis varies and no concrete independently evolving boundary is required
THEN Strategy or a field. Do not build the second hierarchy on spec.

IF some (abstraction, implementor) pairs are illegal
THEN prevent invalid construction with capability-specific interfaces, validated
     factories, or named legal combinations. The number and stability of holes decide
     whether the bridge remains useful.

IF one implementor is remote and the others are local
THEN do not pretend costs and failures are identical. Expose bounded failure and
     suitable granularity, or split local and remote capabilities when forcing all
     implementations into one contract would create a lowest-common-denominator API
     (gof-patterns-and-distribution).

IF ordinary abstraction logic depends on a concrete backend through a downcast or accessor
THEN identify the leaked responsibility. Prefer configuration at construction or a truthful
     capability-specific contract; explicit capability negotiation is not a vendor-class switch.

IF the implementor interface grows a method for one backend's benefit
THEN check whether it is common behavior or a required optional capability. Keep the common
     contract truthful; a separate capability surface can preserve useful operations without
     forcing dishonest implementations or discarding the whole bridge.

IF thread-safety differs per backend
THEN make lifetime and concurrency requirements explicit. Either normalize them in
     adapters, expose per-operation/session objects, or constrain callers; one universal
     thread-safe contract is useful but not mandatory.
```

## Cross-cutting checks

- **Concurrency.** State whether abstraction and implementor instances are shared, confined, or
  session-scoped. A uniform thread-safe contract simplifies substitution, but forced internal
  synchronization can destroy affinity or throughput; factories that return confined sessions
  are often a better bridge for stateful drivers.
- **Lifecycle.** Define ownership of injected backends, sessions and returned streams/cursors,
  including close responsibility on failure or cancellation. A borrowed shared backend is not
  closed per call; a stream may outlive the method that returns it. Preserve affinity and the
  actual operation's lifetime rather than inferring cleanup from a caller timeout.
- **Distribution.** A bridge is the standard place a remote implementation hides behind a local
  interface. The interface must then carry what remoteness implies: bounded time, a failure
  channel that is not `null`, and enough granularity that callers do not issue one remote call
  per element. An interface designed against an in-memory backend and later implemented over
  HTTP can expose repeated-call costs when the consumer traverses many items (`gof-proxy`,
  `rpc-and-api-contracts`).
- **Performance.** Interface dispatch may inline at stable profiled call sites and may resist
  inlining when highly polymorphic; compilation logs must decide. The real cost usually sits in
  interface granularity: a
  chatty implementor interface multiplies whatever the backend's per-call cost is.
- **Testing.** The point of the seam is that the abstraction is tested once against a fake
  backend, and each backend is tested once against the interface's contract. Write that contract
  as a reusable test the backends share; without it, backends drift and the abstraction's
  guarantees hold only for the one you developed against (`java-test-design`). Add relevant
  abstraction/backend pair checks where capabilities, state or ordering interact; separate fake
  tests from evidence against actual providers, and state what could not run.

## Review checklist

- [ ] Two independently evolving axes or a concrete public-boundary need is demonstrated
- [ ] Ordinary abstraction behavior does not depend on a concrete vendor class
- [ ] Common operations and optional capabilities have truthful consumer contracts
- [ ] Illegal combinations are prevented or rejected at a documented construction boundary
- [ ] Sharing, confinement and thread-safety requirements are explicit for every backend
- [ ] The interface's granularity is acceptable for the most expensive backend
- [ ] Failure and timeout semantics are in the contract when any backend is remote
- [ ] A shared contract test runs against every backend

Report the evidenced axes or boundary need, chosen form (including no change), legal/capability
constraints and consumer consequences, then the relevant checks and actual results. Do not present
a proposed refactor or unavailable provider test as completed work.

## References

- [Decision and alternatives](references/decision-and-alternatives.md) — the N×M test, Bridge
  against Strategy, Adapter and Abstract Factory, what to do when the matrix has holes, how to
  design an implementor contract for actual backend costs and capabilities, and the interface-granularity
  trap. Read before introducing a second hierarchy.
- [Worked example](references/worked-example.md) — notifications by severity crossed with
  delivery channels: the nine-class version, the bridge, a remote channel added later and what
  it forced into the interface, the illegal-combination case, and the shared contract test. Read
  when implementing.
