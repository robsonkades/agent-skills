---
name: gof-bridge
description: >
  Bridge in modern Java: separating an abstraction hierarchy from an implementation hierarchy so
  the two vary independently instead of multiplying into N×M classes. Covers the two-axis test
  that distinguishes it from Strategy, what to do when the matrix has illegal combinations, why the implementor interface must be designed for
  its slowest and least reliable implementation, and the thread-safety contract that belongs to
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
expressed as subclasses, the class count is their product: `EncryptedS3Store`, `PlainS3Store`,
`EncryptedFileStore`, `PlainFileStore`, and four more the day a third of either arrives. Bridge
makes one axis the abstraction, the other an implementor interface held in a field, and the count
becomes their sum.

Mechanically this is "hold an interface in a field and delegate" — which is why the pattern is
rarely named in Java code that already does it. Naming it is still worth something: it says the
field is not an incidental collaborator but the second axis of the design, and that new backends
are expected to arrive without touching the abstraction.

## When it is the answer

```text
Two axes of variation can evolve independently and a product hierarchy
would couple their change rates
        → Bridge is a candidate; compare plain composition and configuration.

An API you publish must outlive the mechanisms that implement it —
drivers, transports, backends contributed by others
        → Bridge. JDBC (Connection/Statement over vendor drivers) and
          SLF4J (API over log backends) are exactly this.

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
- **You are adapting something that already exists.** Bridge is designed in from the start with
  both sides under your control; Adapter is retrofitted around a type you did not design
  (`gof-adapter`).

## Modern Java expression

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

Two consequences worth stating. If the implementor interface has exactly one method, backends
can be lambdas and the "hierarchy" is a set of functions — still a bridge in intent, with no
classes on that side. And if the abstraction side is a closed set you own, a sealed interface
gives exhaustiveness the classical version does not.

## Decision rules

```text
IF class names combine two adjectives (EncryptedS3, PlainFile)
THEN there are two axes. One of them becomes a field.

IF only one axis actually varies today
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

IF the abstraction reaches past the implementor interface — instanceof,
downcast, a getBackend() accessor
THEN the bridge is broken; the abstraction is coupled to a concrete
     backend and the second axis has stopped being free.

IF the implementor interface grows a method for one backend's benefit
THEN every other backend must now implement or reject it. Either the
     operation belongs to the abstraction, or the interface is wrong.

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
- **Distribution.** A bridge is the standard place a remote implementation hides behind a local
  interface. The interface must then carry what remoteness implies: bounded time, a failure
  channel that is not `null`, and enough granularity that callers do not issue one remote call
  per element. An interface designed against an in-memory backend and later implemented over
  HTTP is the reliable way to produce an N+1 remote-call problem (`gof-proxy`,
  `rpc-and-api-contracts`).
- **Performance.** Interface dispatch may inline at stable profiled call sites and may resist
  inlining when highly polymorphic; compilation logs must decide. The real cost usually sits in
  interface granularity: a
  chatty implementor interface multiplies whatever the backend's per-call cost is.
- **Testing.** The point of the seam is that the abstraction is tested once against a fake
  backend, and each backend is tested once against the interface's contract. Write that contract
  as a reusable test the backends share; without it, backends drift and the abstraction's
  guarantees hold only for the one you developed against (`java-test-design`).

## Review checklist

- [ ] Two independently evolving axes or a concrete public-boundary need is demonstrated
- [ ] The abstraction never downcasts, inspects or exposes the concrete implementor
- [ ] The implementor interface has no method that exists for one backend only
- [ ] Illegal combinations are prevented or rejected at a documented construction boundary
- [ ] Sharing, confinement and thread-safety requirements are explicit for every backend
- [ ] The interface's granularity is acceptable for the most expensive backend
- [ ] Failure and timeout semantics are in the contract when any backend is remote
- [ ] A shared contract test runs against every backend

## References

- [Decision and alternatives](references/decision-and-alternatives.md) — the N×M test, Bridge
  against Strategy, Adapter and Abstract Factory, what to do when the matrix has holes, how to
  design an implementor interface for its worst implementation, and the interface-granularity
  trap. Read before introducing a second hierarchy.
- [Worked example](references/worked-example.md) — notifications by severity crossed with
  delivery channels: the eight-class version, the bridge, a remote channel added later and what
  it forced into the interface, the illegal-combination case, and the shared contract test. Read
  when implementing.
