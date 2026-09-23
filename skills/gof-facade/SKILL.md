---
name: gof-facade
description: >
  Facade in modern Java: one coherent entry point over a subsystem of collaborators, so callers
  depend on an intention rather than on a sequence. Covers the difference between a facade
  (simplifies, does not forbid) and a boundary (forbids), the god-facade drift where one class
  accumulates unrelated use cases, how application services and gateways can play this role
  while retaining their own boundary responsibilities, and the transaction and fan-out
  decisions a facade method silently owns. Use when callers repeat the
  same orchestration sequence, when a legacy subsystem needs fencing, when unrelated responsibilities
  accumulate in a service, or when a facade method fans out to remote services. Does not cover changing one type's interface
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

Inspect target Java, framework, transaction manager and client versions before applying examples.
Local sketches use Java 17 syntax; the remote scope example explicitly needs Java 25 preview.
Do not upgrade or enable preview merely to adopt Facade. Use existing supported orchestration otherwise.

Start with consumer code for the ordinary operation, an advanced supported use and a misuse or
failure path. Identify the sequence being simplified, capabilities that must remain available,
and who owns returned resources and failures. Inspect existing callers/tests before asking about
missing contracts. Keep an adequate direct call or existing facade; compare extraction or internal
delegation only where it solves an observed coordination or change problem.

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

- **It forwards to one already-simple collaborator.** That is likely a redundant wrapper. A
  facade over one externally complex object can still present a smaller use-case API, stabilize a
  boundary, or hide lifecycle sequencing; state which simplification it owns (`gof-adapter`).
- **It accumulates unrelated responsibilities.** Method/dependency counts and disjoint collaborators
  prompt inspection; split when independent change or policy ownership justifies the extra surface.
- **It absorbs domain invariants owned by entities/value objects.** Sequencing and translation
  belong naturally here; application policies spanning ports may also belong in an application
  service. Move rules according to data and consistency ownership, not every `if`
  (`domain-logic-organization`).
- **Peers need to talk to each other through it.** That is a Mediator, and it has a different
  failure mode — the hub becomes a god object (`gof-mediator`).
- **It is classified only as a local GoF facade despite spanning a network boundary.** An API
  gateway or BFF may provide a facade-like API, but deployment, authentication, compatibility and
  partial failure dominate its architecture and must be named explicitly.

## Modern Java expression

```text
Classical Facade                    Modern equivalent
──────────────────────────────────  ───────────────────────────────────
class OrderFacade with N            an application service / use case
collaborators and coarse methods    entry point; separate implementation
                                    classes when independent change warrants it

one facade per subsystem            one or more use-case-oriented classes
                                    when responsibilities change independently

facade exposes the subsystem too    package-private subsystem types,
                                    or a named module exporting only
                                    the facade package, when direct
                                    access should be restricted
```

A Spring `@Service` can also act as a facade when it simplifies a subsystem, but Service Layer is
an enterprise architecture boundary and is not synonymous with this GoF pattern. Keep the useful
discipline: method names express caller intentions, sequencing is explicit, and domain invariants
remain with their owners (`service-layer-design`).

## Decision rules

```text
IF callers still need the subsystem directly for some cases
THEN it is a facade — keep the subsystem accessible and say so.

IF no caller may reach past it
THEN it is a boundary. Enforce it (package-private types, module
     exports, an architecture test), or the rule is a wish
     (architecture-testing). Check the actual caller scope and deployment:
     package names alone do not hide public types, and JPMS requires named-module use.

IF collaborators change for unrelated reasons or tests require unrelated setup
THEN consider splitting by use case, capability, or subdomain. A stable public facade
     may delegate to those implementations; preserve caller compatibility.
     Dependency count is a review signal, not a threshold.

IF a facade method contains a business rule
THEN place it with the component that owns the required data and invariant. Domain
     invariants usually move inward; cross-port application policy can remain here.

IF the facade method is the transaction boundary
THEN verify invocation, propagation and enlisted resources to establish what commits
     together; trace actual connection acquisition/release
     (enterprise-transactions).

IF a facade method calls several remote services
THEN model the dependency graph, scheduling, deadline and partial effects.
     Concurrent latency follows the critical path plus overhead, not automatically
     the slowest isolated call (scatter-gather).

IF two callers need different subsets of the sequence
THEN distinguish two intentions (preview versus publish) from options of one
     intention (render as HTML or PDF). Prefer named methods for distinct effects;
     a clear option parameter can preserve one coherent operation.
```

## Cross-cutting checks

- **Concurrency.** A facade is often stateless and shareable. State such as a cache or in-flight
  map gives it lifecycle and thread-safety responsibilities, but does not by itself make it a
  Mediator; classify by whether peer objects communicate through it.
- **Distribution.** A local facade over remote collaborators is where a single method call
  becomes N network calls. The consequences must be designed, not inherited: overall deadline,
  what a partial failure returns, whether the calls can run concurrently, and whether a retry of
  the facade method re-executes work already done (`scatter-gather`, `idempotency`). A local wrapper
  alone does not reduce downstream round trips; batching or moving a remote boundary can
  (`remote-facade-and-dto`). Preserve known partial effects and unresolved outcomes when
  translating errors; a timeout or failed facade call does not establish that nothing happened.
- **Resource lifetime.** A returned stream, cursor or lazy result may still depend on an open
  resource and can fail during consumption. Define ownership, closure and cancellation beyond
  method return; do not close a borrowed client or return a result backed by a resource already
  closed inside the facade (`java-resource-management`).
- **Performance.** Local dispatch is rarely the important cost. Remotely, granularity is the
  design: a coarse call can replace chatty round trips but may over-fetch, lengthen critical
  sections, or create expensive fan-out. Per-item calls may be appropriate for independently
  cached resources or distinct outcomes. Compare actual round-trip, payload and failure costs
  before batching; a local wrapper alone is not evidence of a latency improvement.
- **Testing.** The facade is the natural place for use-case-level tests: real domain objects,
  fakes for the ports, with success and relevant failure cases per intention, including bypass
  paths and cleanup on partial/failed consumption when resources escape. Fakes do not establish
  real transaction or transport behavior. Substantial
  unrelated setup deserves a cohesion review; count alone does not prove a defect
  (`java-testing-strategy`).

## Review checklist

- [ ] Method names are caller intentions, not sequences of subsystem steps
- [ ] Sequencing, application policy and domain invariants are placed with explicit ownership
- [ ] Whether the subsystem remains accessible is a stated choice, and enforced if closed
- [ ] Collaborators share a coherent change/use-case reason; unrelated setup is not accumulated
- [ ] Options express one operation; distinct effects are discoverable to callers
- [ ] The transaction boundary is deliberate and its span is justified
- [ ] Remote fan-out has an overall deadline and a defined partial-failure result
- [ ] Facade simplification is distinguished from gateway/BFF deployment or mediator coordination roles

Report the caller simplification, access policy, invariant/resource owners and relevant failure
contract with evidence and checks. State unresolved transaction/client behavior rather than
assuming that one method call creates atomicity, safety or a strict latency bound.

## References

- [Facade against its neighbours](references/facade-vs-neighbours.md) — the discriminators
  against Adapter, Mediator, Service Layer, Remote Facade, API gateway and BFF; how to detect
  god-facade drift early and how to split one; the access-policy decision (simplify or forbid)
  and how to enforce it. Read when classifying or splitting a coordinating class.
- [Worked example](references/worked-example.md) — a checkout facade over seven collaborators: the
  repeated sequence it replaced, where the transaction boundary went, the split when a second
  use case arrived, a streamed-result ownership example, and the remote fan-out version with its
  deadline and partial-failure result.
  Read when implementing.
