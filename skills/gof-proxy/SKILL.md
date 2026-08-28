---
name: gof-proxy
description: >
  Proxy in modern Java: a stand-in that controls access to another object behind that object's own
  interface — virtual (lazy), remote, protection and caching variants. Covers the central danger
  of making a network call look like a method call, how a proxy differs from a decorator, the
  self-invocation hole that silently disables @Transactional and @Cacheable, JPA lazy proxies and
  LazyInitializationException, what CGLIB cannot proxy, and safe publication in a virtual proxy. Use when a lazy-loading wrapper is proposed, when a remote
  call hides behind a plain interface, when an annotation on a self-called method does nothing,
  when instanceof fails on an injected bean or a JPA entity, or when authorisation is enforced by
  a wrapper the caller can bypass. Does
  not cover adding stackable behaviour (gof-decorator), changing an interface (gof-adapter),
  sharing instances to save memory (gof-flyweight), lazy loading strategy in JPA
  (orm-behavioral-patterns), or client-side resilience policy (circuit-breakers).
---

# Proxy

## Purpose

Put something in front of an object that controls how it is reached, without the caller knowing.
The four classical kinds differ in what they control: a **virtual** proxy defers creation, a
**remote** proxy hides a different address space, a **protection** proxy checks permission, a
**smart reference** adds accounting — reference counting, caching, logging.

The pattern's risk is inseparable from its purpose. A proxy is a lie told for a good reason, and
the lie gets expensive when what it conceals is a network, a database round trip, or an
authorisation decision that the caller could have bypassed.

## When it is the answer

```text
Creating or loading the subject is expensive and may not be needed
        → virtual proxy — but prefer an explicit lazy accessor
          (Supplier, a load method) when callers can tolerate knowing.

Access must be checked and cannot be bypassed
        → protection proxy, with the subject unreachable otherwise.
          If the subject is reachable directly, the proxy is advisory.

A framework must add behaviour to code it does not own
        → dynamic proxy or bytecode subclass. This is how
          @Transactional, @Cacheable and @Async work.

The subject genuinely lives elsewhere
        → remote proxy, with the remoteness visible in the interface,
          not hidden by it.
```

## When it is not

- **The wrapper adds behaviour rather than controlling access, and stacks.** That is a Decorator
  (`gof-decorator`). The practical difference: decorators are composed by whoever wires them; a
  proxy is usually the only way to reach its subject.
- **The interface changes.** Adapter (`gof-adapter`).
- **Laziness is not needed.** A virtual proxy over something always used is pure overhead plus a
  publication hazard.
- **Authorisation is enforceable closer to the decision.** A permission check inside the domain
  operation cannot be bypassed by a caller who obtained the subject another way.
- **The remoteness would be hidden.** See below — this is the pattern's defining failure.

## The remote proxy problem

```java
// looks local, is not
Customer c = customerService.byId(id);      // a network call
for (Order o : c.orders()) { ... }          // N more network calls
```

A local method call cannot fail halfway, takes nanoseconds, and has no partial results. A remote
call can fail after the work was done, takes milliseconds at best, may never return, and may
succeed at the other end while the caller sees a timeout. A proxy that presents the second as the
first invites callers to write loops that are correct locally and catastrophic remotely.

Rules for any proxy over a boundary:

```text
The interface must carry a deadline or a documented bound.
Failure must be in the signature's vocabulary — a specific exception
  or a result type — not "the same as local, but sometimes".
Granularity must suit a round trip: bulk operations, not per-item calls.
Retries must be explicit and idempotent, not implicit in the proxy.
"Succeeded but the response was lost" must be representable.
```

If those cannot be expressed, the design does not want a transparent proxy; it wants an explicit
client (`rpc-and-api-contracts`, `gof-patterns-and-distribution`).

## Decision rules

```text
IF a proxy hides a network call behind an interface designed for a
local object
THEN the interface is wrong, not the proxy. Redesign the contract.

IF a proxied method is called from inside the same object (this.x())
THEN the proxy is not involved and the annotation does nothing —
     @Transactional, @Cacheable, @Async all fail silently this way
     (java-dependency-inversion).

IF the class or the method is final, or the method is private
THEN a subclass-based proxy cannot intercept it. Spring reports some
     cases and silently skips others.

IF callers use instanceof, ==, getClass() or read annotations
reflectively
THEN a proxy breaks them. Provide an unwrap path
     (AopTestUtils.getTargetObject, Hibernate.unproxy).

IF a virtual proxy initialises lazily
THEN the initialisation must be safely published, and must happen at
     most once for a subject with side effects.

IF a lazy proxy loads from a database inside a loop
THEN it is an N+1 query generator, and the loop looks innocent
     (orm-behavioral-patterns).

IF a protection proxy guards an object other code can obtain directly
THEN the check is advisory. Make the subject unreachable or move the
     check into it.

IF a lazy proxy escapes the scope that can initialise it
THEN it fails on first use — LazyInitializationException is exactly
     this, and the fix is at the boundary, not a bigger session.
```

## Cross-cutting checks

- **Concurrency.** A virtual proxy's lazy field needs safe publication — an unguarded `if (target
== null)` may hand another thread a partially constructed object, and two threads may both
  initialise a subject whose creation has side effects. Use a holder, `volatile` with
  double-checked locking done exactly right, or precompute. A proxy that adds `synchronized` also
  changes the subject's concurrency characteristics for every caller
  (`java-memory-model`).
- **Distribution.** This is the pattern most likely to make a distributed system look like a
  local one, and the failure is architectural rather than local: latency per call, retries the
  caller did not ask for, partial failure presented as an exception indistinguishable from a
  local bug, and fan-out hidden inside a getter. Every remote proxy needs a timeout, a failure
  vocabulary and a granularity review (`timeouts-and-deadlines`, `failure-models`).
- **Performance.** Dynamic proxies dispatch reflectively and defeat inlining, which is measurable
  in tight loops but rarely dominant. The costs that matter are the hidden ones: a lazy proxy
  triggering a query, a caching proxy whose keys are computed by reflection on every call, a
  logging proxy building a message before checking whether the level is enabled
  (`jit-inlining-and-escape-analysis`).
- **Testing.** Proxied beans are not the class you wrote, so `instanceof`, `getClass()`,
  annotation lookups and field access all behave differently in an integration test than in a
  unit test. Unwrap deliberately rather than by chance. Also test the case the proxy exists for —
  an expired permission, a subject never initialised, a remote failure — because those paths
  never run in a happy-path test (`java-testing-strategy`).

## Review checklist

- [ ] The proxy controls access; it does not merely add stackable behaviour
- [ ] Remoteness, if any, is visible in the interface: deadline, failure type, granularity
- [ ] No annotated method is invoked through `this` from within the same object
- [ ] No proxied class or method is `final` or `private` where interception is required
- [ ] Lazy initialisation is safely published and happens at most once
- [ ] A protection proxy's subject cannot be obtained by another route
- [ ] Identity-sensitive callers have an unwrap path, and tests use it explicitly
- [ ] No lazy proxy is dereferenced inside a loop over a collection
- [ ] Failure paths — denied, unavailable, uninitialised — are covered by tests

## References

- [Kinds and hazards](references/proxy-kinds-and-hazards.md) — the four kinds with what each
  controls, JDK dynamic proxies against bytecode subclassing and what each cannot intercept, the
  self-invocation hole and its three fixes, JPA lazy proxies and `LazyInitializationException`,
  identity and unwrapping, and Proxy against Decorator in one table. Read when introducing or
  debugging a proxy.
- [Worked example](references/worked-example.md) — a virtual proxy over an expensive report
  engine with correct publication, and a remote proxy rewritten as an honest client after a
  transparent one caused an incident: the interface changes, the fan-out that disappeared, and
  the tests. Read when implementing.
