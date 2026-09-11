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

Put something in front of an object that controls how it is reached through a compatible consumer contract.
The four classical kinds differ in what they control: a **virtual** proxy defers creation, a
**remote** proxy hides a different address space, a **protection** proxy checks permission, a
**smart reference** adds accounting — reference counting, caching, logging.

The pattern's risk is inseparable from its purpose. A proxy is a lie told for a good reason, and
the lie gets expensive when what it conceals is a network, a database round trip, or an
authorisation decision that the caller could have bypassed.

Start from ordinary consumer calls, a failure path and the required access/lifecycle boundary.
Reuse existing wiring, proxy-mode, transaction, identity and outcome evidence before asking about
material gaps. Keep an adequate direct object, explicit lazy accessor or existing proxy. Finish
with the retained or revised contract, evidence, relevant checks and unresolved limits; distinguish
proposed tests from executed results.

## When it is the answer

```text
Creating or loading the subject is expensive and may not be needed
        → virtual proxy — but prefer an explicit lazy accessor
          (Supplier, a load method) when callers can tolerate knowing.

Access must be checked and cannot be bypassed
        → protection proxy, with no unchecked route for callers subject to that policy.
          Authorized infrastructure may have a separate, deliberate access path.

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

Examples use Java 17 and partial application types. Inspect resolved Spring/Hibernate versions,
proxy versus weaving mode and bytecode enhancement; adopting this skill does not authorize upgrades.

```java
// looks local, is not
Customer c = customerService.byId(id);      // a network call
for (Order o : c.orders()) { ... }          // may issue more calls, depending on lazy access/fetching
```

An in-memory method normally has no network ambiguity, while local I/O can still block, fail and
partially mutate state. A remote call adds independent failure, materially higher/variable
latency, transport queues, deadlines and the possibility that work committed after the response
was lost. A proxy that hides those differences invites locally plausible but operationally
catastrophic loops.

Rules for any proxy over a boundary:

```text
The call path must carry a deadline (parameter, request context, or equivalent) or a documented bound.
Failure must be in the signature's vocabulary — a specific exception
  or a result type — not "the same as local, but sometimes".
Granularity must suit the workload; bound bulk sizes, pagination and concurrency.
Retry ownership and effect safety must be explicit; a hidden second retry layer can amplify calls.
"Succeeded but the response was lost" must be representable.
```

If those cannot be expressed, the design does not want a transparent proxy; it wants an explicit
client (`rpc-and-api-contracts`, `gof-patterns-and-distribution`).

## Decision rules

```text
IF a proxy hides a network call behind an interface designed for a
local object
THEN inspect missing deadline/failure/granularity semantics. Change the contract or supported
     implementation policy where needed; existing compatible interfaces need no gratuitous redesign.

IF a proxied method is called from inside the same object (this.x())
THEN ordinary Spring proxy-based advice is bypassed, so @Transactional, @Cacheable
     and @Async semantics are not applied at that call. AspectJ weaving and explicit
     programmatic mechanisms differ; verify the configured advice mode
     and existing outer transaction before changing the required unit of work
     (java-dependency-inversion).

IF the class or method is final, or the method is private
THEN a subclass-based proxy cannot override/intercept it. An interface-based JDK proxy
     can proxy calls through an interface even when the implementation class is final;
     verify proxy kind and framework diagnostics.

IF callers use concrete-class instanceof, ==, getClass() or raw reflection
THEN behavior depends on proxy kind and equality delegation. Prefer interface/semantic
     contracts; use framework-aware type/annotation utilities or a constrained unwrap
     path only where infrastructure truly needs the target.

IF a virtual proxy initialises lazily and is shared across threads
THEN the target must be safely published. Exactly-once initialization is required only
     when duplicate construction has observable effects or unacceptable cost; otherwise
     benign duplicate creation may be a simpler policy.

IF a lazy proxy may load from a database inside a loop
THEN inspect executed statements: it can create N+1, while batch/subselect fetching or
     an already-initialized persistence context can change the result
     (orm-behavioral-patterns).

IF a caller subject to the protection policy can obtain the target through an unchecked route
THEN that caller can bypass the guard. Restrict that route or enforce the
     required check at the protected operation within the actual trust boundary.

IF a lazy proxy escapes the scope that can initialise it
THEN uninitialized lazy state may fail to load; already initialized values need no session.
     Establish required fetch/lifecycle boundaries and provider settings before changing session scope.
```

## Cross-cutting checks

- **Concurrency.** A shared virtual proxy's lazy field needs safe publication — an unguarded `if (target
== null)` may hand another thread a partially constructed object, and two threads may both
  initialise a subject whose creation has side effects. Use a holder, `volatile` with
  double-checked locking done exactly right, or precompute. A proxy that adds `synchronized` also
  serializes its guarded calls, not unguarded calls through other aliases
  (`java-memory-model`).
- **Distribution.** This is the pattern most likely to make a distributed system look like a
  local one, and the failure is architectural rather than local: latency per call, retries the
  caller did not ask for, partial failure presented as an exception indistinguishable from a
  local bug, and fan-out hidden inside a getter. Every remote proxy needs a timeout, a failure
  vocabulary and a granularity review (`timeouts-and-deadlines`, `failure-models`).
- **Performance.** JDK dynamic proxies route through an `InvocationHandler`; subclass proxies use
  generated overrides. Either can inhibit optimizations depending on call-site profiles and
  advice, but modern reflection internals are version-specific. Costs that usually matter are hidden ones: a lazy proxy
  triggering a query, a caching proxy whose keys are computed by reflection on every call, a
  logging proxy building a message before checking whether the level is enabled
  (`jit-inlining-and-escape-analysis`).
- **Testing.** Concrete identity, annotation lookup and field access depend on proxy kind;
  interface instanceof remains valid. Test through the proxy for advice behavior, and unwrap only
  for a justified infrastructure assertion that cannot bypass required policy. Also test its purpose —
  an expired permission, a subject never initialised, a remote failure — because those paths
  never run in a happy-path test (`java-testing-strategy`).

## Review checklist

- [ ] The proxy controls access; it does not merely add stackable behaviour
- [ ] Remoteness, if any, is visible in the interface: deadline, failure type, granularity
- [ ] Self-invocation behavior matches the configured proxy/weaving mode
- [ ] Proxy kind is compatible with final/private/interface constraints where interception is required
- [ ] Lazy initialization is safely published; duplicate-creation semantics are explicit
- [ ] Callers subject to a protection policy cannot reach the operation through an unchecked route
- [ ] Identity-sensitive infrastructure uses semantic/framework-aware APIs or a constrained unwrap
- [ ] Lazy proxy loops are backed by query-count/fetch-plan evidence
- [ ] Failure paths — denied, unavailable, uninitialised — are covered by tests

## References

- [Kinds and hazards](references/proxy-kinds-and-hazards.md) — the four kinds with what each
  controls, JDK dynamic proxies against bytecode subclassing and what each cannot intercept, the
  self-invocation hole and contract-dependent fixes, JPA lazy proxies and `LazyInitializationException`,
  identity and unwrapping, and Proxy against Decorator in one table. Read when introducing or
  debugging a proxy.
- [Worked example](references/worked-example.md) — a virtual proxy over an expensive report
  engine with correct publication, and a remote proxy rewritten as an honest client after a
  hypothetical transparent one exposed excessive fan-out: the bounded interface changes and
  the tests. Read when implementing.
