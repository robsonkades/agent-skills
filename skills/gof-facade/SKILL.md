---
name: gof-facade
description: >
  Facade in modern Java: one coherent entry point over a subsystem of collaborators, so callers
  depend on an intention rather than on a sequence. Covers the difference between a facade
  (simplifies, does not forbid) and a boundary (forbids), the god-facade drift where one class
  accumulates a method per use case until it is the application, why an application service is
  this pattern under another name, why an API gateway is not, and the transaction and fan-out
  decisions a facade method silently owns. Use when callers repeat the
  same five-call sequence, when a legacy subsystem needs fencing, when a service class has grown past a dozen
  dependencies, or when a facade method fans out to several remote services. Does not cover changing one type's interface
  (gof-adapter), adding behaviour to one object (gof-decorator), hub-based coordination between
  peers (gof-mediator), the coarse-grained remote boundary and its DTOs (remote-facade-and-dto),
  or transaction-boundary mechanics (enterprise-transactions).
---

# Facade

## Purpose

Give callers one thing to call instead of six, and one vocabulary instead of six. A facade turns
"open a session, resolve the tariff, validate the basket, reserve stock, price it, commit" into
`checkout.place(basket)`, so the ordering knowledge lives in one place rather than in every
caller.

The classical pattern **simplifies without forbidding**: the subsystem stays reachable for
callers with unusual needs. When direct access is prohibited — the types are package-private, the
module does not export them — you have a boundary, which is a stronger and often better design,
but it is a different claim and should be stated as one.

## When it is the answer

```text
Several collaborators are used together in a small number of standard
sequences, and callers repeat the sequence
        → Facade. The sequence is the thing being reused.

A legacy or awkward subsystem must be fenced off while it is replaced
        → Facade as the seam; everything new calls only the facade.

A library exposes forty types where callers need four operations
        → Facade over the library, owned by you.
```

## When it is not

- **It forwards to exactly one collaborator.** That is a wrapper. Delete it, or say which foreign
  model it is bounding (`gof-adapter`).
- **It has grown a method per use case.** A facade with thirty methods and twenty dependencies is
  the application in one class; split by use case or by subdomain.
- **It contains the business rules.** Coordination is a facade's job; deciding is the domain's.
  Rules that migrate into the facade leave an anaemic model behind
  (`domain-logic-organization`).
- **Peers need to talk to each other through it.** That is a Mediator, and it has a different
  failure mode — the hub becomes a god object (`gof-mediator`).
- **It spans a network boundary.** An API gateway or a backend-for-frontend is an architectural
  component with its own deployment, authentication and failure semantics. Calling it a facade
  hides exactly the properties that make it hard.

## Modern Java expression

```text
Classical Facade                    Modern equivalent
──────────────────────────────────  ───────────────────────────────────
class OrderFacade with N            an application service / use case
collaborators and coarse methods    class per use case, each with the
                                    collaborators that use case needs

one facade per subsystem            one class per use case when the
                                    facade passes ~7 dependencies

facade exposes the subsystem too    package-private subsystem types +
                                    an exported package (JPMS or
                                    package structure) when access
                                    should be closed, not merely eased
```

A Spring `@Service` that orchestrates repositories and domain objects into one transactional
operation _is_ this pattern; naming it `…Facade` adds nothing. What is worth keeping from the
pattern is its discipline: the class owns sequencing, not rules, and its method names are the
caller's intentions.

## Decision rules

```text
IF callers still need the subsystem directly for some cases
THEN it is a facade — keep the subsystem accessible and say so.

IF no caller may reach past it
THEN it is a boundary. Enforce it (package-private types, module
     exports, an architecture test), or the rule is a wish
     (architecture-testing).

IF the facade has more than about seven collaborators
THEN it is coordinating more than one thing. Split it by use case.

IF a facade method contains an if that encodes a business rule
THEN move the rule to the domain object that owns the data it tests.

IF the facade method is the transaction boundary
THEN that is a design decision, not an accident: it fixes what commits
     together and how long the connection is held
     (enterprise-transactions).

IF a facade method calls several remote services
THEN its latency is the sum or the slowest of them and its failure is
     partial. Design the fan-out explicitly (scatter-gather).

IF two callers need different subsets of the sequence
THEN do not add flags to one method. Add a second method whose name
     states the second intention.
```

## Cross-cutting checks

- **Concurrency.** A facade should be stateless and therefore shareable. State appearing in it —
  a cache, an in-flight map, a "current" anything — means it has taken on coordination, at which
  point it is a Mediator with a facade's name and needs a thread-safety contract.
- **Distribution.** A local facade over remote collaborators is where a single method call
  becomes N network calls. The consequences must be designed, not inherited: overall deadline,
  what a partial failure returns, whether the calls can run concurrently, and whether a retry of
  the facade method re-executes work already done (`scatter-gather`, `idempotency`). This is also
  the boundary at which coarse-grained methods stop being stylistic and start saving round trips
  (`remote-facade-and-dto`).
- **Performance.** Locally, a facade costs one call. Remotely, its granularity is the design: one
  coarse call replaces five chatty ones and is usually the largest single latency improvement
  available. The opposite failure — a facade that loops over items issuing one downstream call
  each — is the same mistake with the sign reversed.
- **Testing.** The facade is the natural place for use-case-level tests: real domain objects,
  fakes for the ports, one test per intention. A facade that cannot be constructed in a test
  without a dozen mocks has already told you it is doing too much (`java-testing-strategy`).

## Review checklist

- [ ] Method names are caller intentions, not sequences of subsystem steps
- [ ] The facade sequences and delegates; it does not decide
- [ ] Whether the subsystem remains accessible is a stated choice, and enforced if closed
- [ ] Collaborator count is small enough to construct in a test without mocks everywhere
- [ ] No boolean flag parameter selects between two different intentions
- [ ] The transaction boundary is deliberate and its span is justified
- [ ] Remote fan-out has an overall deadline and a defined partial-failure result
- [ ] It is not called a facade when it is a gateway, a BFF or a mediator

## References

- [Facade against its neighbours](references/facade-vs-neighbours.md) — the discriminators
  against Adapter, Mediator, Service Layer, Remote Facade, API gateway and BFF; how to detect
  god-facade drift early and how to split one; the access-policy decision (simplify or forbid)
  and how to enforce it. Read when classifying or splitting a coordinating class.
- [Worked example](references/worked-example.md) — a checkout facade over six collaborators: the
  repeated sequence it replaced, where the transaction boundary went, the split when a second
  use case arrived, and the remote fan-out version with its deadline and partial-failure result.
  Read when implementing.
