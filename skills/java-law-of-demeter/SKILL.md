---
name: java-law-of-demeter
description: >
  Navigation coupling: what the Law of Demeter actually constrains — structure exposure, not
  dot-counting — and how to tell a train wreck from a legitimate chain. Use when reviewing
  chains like order.getCustomer().getAddress().getCity(), when a change to one class's shape
  rippled through files that never mention it, when deciding whether a chain couples the
  caller to structure or merely reads data, or when a proposed fix would add forwarding
  methods to every intermediate class. Does not cover designing fluent chains
  (java-fluent-apis) or where the decision made on the navigated data should live
  (java-tell-dont-ask).
---

# Java Law of Demeter

## Purpose

The law is a coupling rule, not a dot budget: a method talks to its immediate
collaborators — `this`, its parameters, objects it creates, its own fields.
`order.getCustomer().getAddress().getCity()` couples the caller to the shape of three
classes; reorganising any of them breaks code that had no business knowing them. This skill
exists to catch that coupling, and equally to stop the dogmatic fix — forwarding methods
smeared across every intermediate class — which trades one chain for a Middle Man on each
link and is often worse than the chain.

## Workflow

1. **Classify the chain.** Fluent calls on one conceptual receiver and Stream/Optional dataflow
   are not structural navigation by themselves (callbacks still may navigate). Records/DTOs
   expose structure as contract, so walking them is intentional schema coupling rather than
   encapsulation leakage. The suspect case walks _distinct collaborators' private composition_. Read
   `references/detection.md` when the classification is not obvious.
2. **Ask what the caller does with the result.** Decides or mutates on it → move the decision to
   the module that owns the policy and required data, which is not necessarily the data class.
   The placement decision is java-tell-dont-ask's. Only reads a value → consider a stable
   projection/snapshot or narrowing what is passed.
3. **Price the fix against the chain.** Count the forwarding methods it would add and the
   classes it would touch. A `getCustomerCity()` on `Order` that exists to shorten one call
   site is a Middle Man, not an improvement.
4. **Leave boundary code alone.** Mappers, serialisers, reports and test assertions
   navigate structure because structure _is_ their subject.
5. **Verify**: after the fix, the caller's imports no longer name the intermediate types,
   and a change to those types' shape no longer reaches the caller.

## Rules

- Judge chains by exposure, not length: `list.stream().filter(p).toList()` has three dots
  and zero structural coupling; `a.getB().getC()` has two and couples the caller to both
  shapes.
- A chain is coupling when the caller could not do its job without knowing how the
  intermediate objects are composed; it is data access when the objects are records or DTOs
  whose shape is the published contract.
- Fix priority: move the behaviour to the type that owns the data; failing that, pass the
  needed value instead of its container; wrap only when a real abstraction boundary exists,
  never to launder a chain.
- Do not add a forwarding method merely to reduce dots. Even one caller can justify a query that
  protects a real aggregate/module boundary or names stable domain meaning; demonstrate what
  internal shape can now change independently.
- One navigation at an orchestration point — fetching a collaborator once and passing it on
  — is acceptable; the same navigation repeated across call sites is the coupling to remove.
- Getters on a record you own, read locally for data, are not violations. Query, reporting
  and mapping code navigates structure legitimately.
- Chains that mix navigation with mutation (`getX().getY().setZ(...)`) are the worst case:
  both coupling and a decision made outside the owner — hand the decision part to
  java-tell-dont-ask.

## Runtime consequences

- A harmless-looking chain over ORM entities can trigger lazy loads, N+1 queries, a closed-
  session failure or inconsistent reads between hops. That is evidence of a leaky persistence
  boundary; diagnose fetch/round-trip cost with `orm-fetch-and-batching-performance`, not by
  adding getters.
- Repeated remote/proxy navigation is worse: each hop can be a network call with independent
  timeout/failure semantics. Replace it with a coarse-grained operation or projection owned by
  the remote boundary.
- Narrowing to several scalar parameters can destroy snapshot consistency and create long
  parameter lists. Prefer one immutable purpose-specific projection when values must be observed
  together; copy mutable collections at the boundary.
- Hiding a chain may reduce source coupling while leaving semantic/schema coupling unchanged.
  Verify with an actual shape change and runtime query/trace evidence, not import count alone.

## References

- [Detection heuristics and false positives](references/detection.md) — read when deciding
  whether a specific chain is structural coupling or legitimate data access.
- [Worked example: three chains, three outcomes](references/worked-example.md) — read
  before refactoring: one chain fixed by moving behaviour, one by narrowing a parameter,
  one correctly left alone, with trade-offs and verification.
