---
name: gof-decorator
description: >
  Decorator in modern Java: wrapping an object in something of its own interface to add
  behaviour, stackably, at runtime — and the fact that the stacking order changes the semantics.
  Covers the ordering of retry, timeout, circuit breaker, cache, metrics and logging and what
  each arrangement means, retry amplification across layers, the identity loss that breaks ==,
  instanceof and listener deregistration, when a framework interceptor is the same pattern
  already provided, and the thread-safety a stateful decorator introduces. Use when resilience
  or observability layers are added around a client, when a wrapper chain is reordered, when a
  decorated object fails an instanceof check, when retries appear at two levels, or when a
  wrapper is proposed that changes the interface. Does not cover changing an interface
  (gof-adapter), controlling access to an object (gof-proxy), one entry point over a subsystem
  (gof-facade), or the individual protection policies (circuit-breakers,
  retries-and-backoff, timeouts-and-deadlines).
---

# Decorator

## Purpose

Add behaviour to one object without changing its type, and let several such additions compose.
The defining property is that the wrapper implements the same interface as what it wraps — which
is what makes the layers stackable, and what makes their order meaningful.

Order is not a detail. Retry outside timeout and timeout outside retry are both reasonable
designs with different semantics, and a stack assembled without deciding which one is intended
will behave in whichever way the wiring happened to produce.

Start with the caller's contract and the effective client/framework configuration: ordinary
success, failure, cache hit and cancellation may traverse different layers. Preserve accepted
return values, nullability, failure classification, ownership and mandatory checks across that
composition; implementing the same interface alone does not establish substitutability. Inspect
existing tests and policies before asking about material gaps such as replay safety or cache
eligibility. Keep an adequate existing client or simpler composed class when no added layer is needed.

## When it is the answer

```text
Behaviour must be added to some instances and not others, chosen at
wiring time
        → Decorator. Inheritance would decide it at compile time.

Several independent additions must combine, and combinations
multiply (retry × cache × metrics × tracing)
        → Decorator. Subclasses would be the product; wrappers are the sum.

The addition is cross-cutting and the interface is stable
        → Decorator — or the framework's own mechanism, which is the
          same pattern already implemented (see below).
```

## When it is not

- **The wrapper changes the interface.** That is an Adapter (`gof-adapter`).
- **The primary intent is substituting for another object while controlling access** — lazy
  loading, remoting or access checks. That is usually Proxy. Both patterns commonly implement the
  same interface and may be structurally identical, so classify by responsibility (`gof-proxy`).
- **Only one stable combination is ever used.** A composed class may make the call graph easier to
  inspect, but separate decorators can remain worthwhile for independent ownership, testing or
  framework integration. Compare change coupling rather than counting combinations.
- **The framework already provides it.** Servlet filters, `HandlerInterceptor`, Spring AOP
  advice, `RestClient` request interceptors, Micrometer instrumentation and Resilience4j
  decorators already provide composition mechanisms. Verify their ordering, async-context and
  observability semantics; hand-rolling beside them otherwise puts policy in two places.
- **Behaviour differs by the object's state.** That is State (`gof-state`).

## Ordering is semantics

Examples are partial Java 17 unless a framework is named. Inspect the project's resolved framework,
HTTP provider and instrumentation versions; no decorator choice authorizes upgrades or dependencies.

```text
Read a stack outermost-first. Each layer sees the one below it as
"the call".

  Metrics(          ← counts logical operations, one per caller request
    CircuitBreaker(  ← opens on the outcome of whole operations
      Retry(          ← its attempts are invisible to the breaker above
        Timeout(       ← bounds ONE attempt
          Client)))))

  Metrics(
    Retry(
      CircuitBreaker(  ← sees each attempt; reject open-breaker failures from retry eligibility
        Timeout(
          Client))))
```

| Arrangement                    | Meaning                                                 | Choose when                                      |
| ------------------------------ | ------------------------------------------------------- | ------------------------------------------------ |
| Timeout **inside** Retry       | Per-attempt bound plus backoff/queueing in total        | Pair with remaining caller budget                |
| Timeout **outside** Retry      | Outer completion bound; inner work must honor deadline  | Propagate cancellation and remaining time        |
| Cache **outside** Retry        | A valid hit avoids downstream retries                   | Hit semantics and cache failure policy permit it |
| Cache **inside** Retry         | Each attempt consults cache; concurrent fill may matter | Explicit cache/load/concurrency contract         |
| Breaker **outside** Retry      | The breaker sees logical operations                     | Operation-level failure isolation is intended    |
| Breaker **inside** Retry       | Breaker counts attempts; rejection must not be retried  | Attempt-level failure isolation is intended      |
| Metrics **outside** everything | Latency includes work below this measurement boundary   | Usually retain as logical-operation telemetry    |
| Metrics **inside** Retry       | Per-attempt counts and error rates                      | In addition, under a different metric name       |

A common starting point is **logical metrics → propagated deadline/budget → breaker → retry →
per-attempt timeout → client**, with separate attempt telemetry. It is not universal: breaker
placement decides whether it counts attempts or logical failures, and the retry must derive each
attempt budget from remaining time. Document and test the selected semantics because the type
system does not record them.

## Decision rules

```text
IF retries exist at more than one layer of the system
THEN attempts can multiply: 3 at the client × 3 at the gateway = 9 requests
     to a struggling dependency. Prefer one owner per failure domain; multiple layers
     require a shared attempt/deadline budget and evidence that they do not amplify
     (retries-and-backoff, cascading-failures).

IF a retry decorator wraps a non-idempotent operation
THEN it can duplicate side effects. Require provider-enforced idempotency within its scope,
     matching parameters/retention, or an independently safe operation; a key alone proves nothing
     (idempotency).

IF callers use ==, instanceof or equals on the decorated object
THEN inspect the actual identity/equality contract. Interface instanceof still works; concrete
     checks may fail. Preserve registration identity; avoid automatic equality forwarding or an
     unrestricted unwrap path that bypasses access, transaction or lifecycle policy.

IF the decorator holds state — a cache, a counter, a breaker
THEN determine whether it is shared or confined. Shared composition must protect each layer's
     invariants and relevant aliases; a thread-safe delegate does not protect wrapper state.

IF the framework has a mechanism for this concern
THEN prefer it when it satisfies the contract; verify ordering, metrics and tracing configuration.
     Custom composition remains valid when integrated explicitly or the framework cannot fit.

IF the stack obscures call order, context propagation or failure attribution
THEN make wiring observable, collapse inseparable policies, or use a framework chain.
     Depth alone is not the decision criterion.

IF a decorator swallows or translates the delegate's exceptions
THEN compare the resulting outcome with the caller's documented contract. Permitted translation
     can remain decoration; silent success or reclassification can hide failure or cause unsafe retry.
```

## Cross-cutting checks

- **Concurrency.** A decorator over a stateless, thread-safe delegate can make the composition
  unsafe: a counter, a cache, an `HashMap` of in-flight keys, a non-atomic read-modify-write of a
  breaker's state. Each stateful layer needs its own memory-model argument. Conversely,
  safety can also come from confinement or separate owned instances; synchronization must cover
  all conflicting access, including aliases outside the wrapper (`java-memory-model`).
- **Distribution.** This is where resilience layers live, so the ordering table above is a
  production concern rather than a stylistic one. Two failures dominate: retry amplification
  across layers, which converts a partial outage into a full one; and a timeout placed so that
  the total call time exceeds the caller's deadline, so the caller gives up while the work
  continues (`timeouts-and-deadlines`, `cascading-failures`).
- **Lifecycle.** Specify owned versus borrowed delegates and who closes returned resources or
  completes asynchronous work. Closing the wrapper, returning from a call or completing a caller
  future must not prematurely close shared resources or release a still-used permit. Inspect all
  entry points, including default/bulk methods and `close`/`flush`, for bypass or double application
  (`java-resource-management`, `cancellation-and-interruption`).
- **Performance.** Each layer adds a dispatch opportunity that HotSpot may inline at stable call
  sites. Costs that often matter more are allocation per call inside a
  layer (a new context object, a lambda capturing state, a `String` built for a log line that is
  then discarded), and lost inlining once the call site is megamorphic
  (`jit-inlining-and-escape-analysis`).
- **Testing.** Test each decorator against a fake delegate — that is the pattern's dividend. Then
  write a composed-stack test with discriminating observations: attempt versus logical counts,
  zero downstream calls on an eligible cache hit, and no new attempt after the budget expires.
  Include failure paths; best-effort telemetry must not replace a business result or mask its
  failure. Mandatory audit behavior needs its own explicit contract.

## Review checklist

- [ ] The wrapper implements the same interface and preserves the accepted caller contract
- [ ] The stacking order is deliberate and documented at the wiring site
- [ ] Retry ownership and the shared attempt/deadline budget prevent cross-layer amplification
- [ ] Retry safety is established by the operation/provider contract, not merely the presence of a key
- [ ] Caller wait and remaining-work enforcement are verified separately against the deadline
- [ ] Stateful layers state their thread-safety guarantee
- [ ] Delegate, returned-result and permit ownership cover initialization, close and async failure
- [ ] Identity-sensitive behavior is eliminated, explicitly delegated, or exposed through a
      constrained standard unwrap contract rather than concrete-type assumptions
- [ ] No decorator silently swallows or reclassifies the delegate's failures
- [ ] A test asserts the composed order, not only each layer alone

Finish with the retained or revised stack, its observation/ownership boundaries, material unresolved
policies and actual validation. Separate proposed tests from executed checks; a review need not add wrappers.

## References

- [Ordering and composition](references/ordering-and-composition.md) — every common layer pair
  with its semantics, retry amplification arithmetic, deadline propagation through a stack,
  identity loss and unwrapping (`java.sql.Wrapper`, AOP proxies, listener deregistration), and
  when a framework interceptor should replace a hand-rolled decorator. Read before assembling or
  reordering a stack.
- [Worked example](references/worked-example.md) — an outbound pricing client decorated for
  metrics, breaking, retry, timeout and caching: the wiring with its order justified, the
  per-layer tests, the order test, and an illustrative amplification scenario. Read when
  implementing.
