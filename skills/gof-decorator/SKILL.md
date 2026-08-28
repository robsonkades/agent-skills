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
  (gof-facade), or the retry and timeout policies themselves (circuit-breakers,
  retries-and-backoff).
---

# Decorator

## Purpose

Add behaviour to one object without changing its type, and let several such additions compose.
The defining property is that the wrapper implements the same interface as what it wraps — which
is what makes the layers stackable, and what makes their order meaningful.

Order is not a detail. Retry outside timeout and timeout outside retry are both reasonable
designs with different semantics, and a stack assembled without deciding which one is intended
will behave in whichever way the wiring happened to produce.

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
- **The wrapper controls access rather than adding behaviour** — lazy loading, remoting, access
  checks. That is a Proxy, and the distinction matters because a Proxy's caller believes it holds
  the real object (`gof-proxy`).
- **Only one combination is ever used.** Then the "stack" is a fixed pipeline; write it as one
  class and keep the call graph readable.
- **The framework already provides it.** Servlet filters, `HandlerInterceptor`, Spring AOP
  advice, `RestClient` request interceptors, Micrometer instrumentation and Resilience4j
  decorators are all this pattern with ordering, configuration and observability already solved.
  Hand-rolling beside them puts the policy in two places.
- **Behaviour differs by the object's state.** That is State (`gof-state`).

## Ordering is semantics

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
      CircuitBreaker(  ← sees each attempt; retries hammer an open breaker
        Timeout(
          Client))))
```

| Arrangement                    | Meaning                                                  | Choose when                                              |
| ------------------------------ | -------------------------------------------------------- | -------------------------------------------------------- |
| Timeout **inside** Retry       | Per-attempt deadline; total time is attempts × timeout   | Attempts are cheap and the caller has budget             |
| Timeout **outside** Retry      | One overall budget; retries stop when it is spent        | The caller has a deadline (usually correct in a service) |
| Cache **outside** Retry        | A hit avoids retries entirely; failures are never cached | Normal                                                   |
| Cache **inside** Retry         | Each attempt consults the cache — usually pointless      | Almost never                                             |
| Breaker **outside** Retry      | The breaker sees logical operations                      | Normal                                                   |
| Breaker **inside** Retry       | Retries beat on an open breaker, failing fast N times    | Only with a deliberate reason                            |
| Metrics **outside** everything | Latency includes retries — the caller's true experience  | Always have this one                                     |
| Metrics **inside** Retry       | Per-attempt counts and error rates                       | In addition, under a different metric name               |

The safest default for a service with a request deadline: **Metrics → Breaker → Retry → Timeout
→ Client**, with a second, separately named metric inside the retry if attempt-level data is
needed. Whichever you choose, the order belongs in a comment beside the wiring, because nothing
in the type system records it.

## Decision rules

```text
IF retries exist at more than one layer of the system
THEN attempts multiply: 3 at the client × 3 at the gateway = 9 requests
     to a struggling dependency. Retry at exactly one layer
     (retries-and-backoff, cascading-failures).

IF a retry decorator wraps a non-idempotent operation
THEN it can duplicate side effects. Retry only with an idempotency key
     or a provably safe operation (idempotency).

IF callers use ==, instanceof or equals on the decorated object
THEN wrapping breaks them: the wrapper is a different object of a
     different class. Provide an unwrap path, or do not decorate.

IF the decorator holds state — a cache, a counter, a breaker
THEN the composed object is stateful and shared. Its thread safety is
     now the decorator's responsibility, not the delegate's.

IF the framework has a mechanism for this concern
THEN use it. A hand-rolled chain is invisible to the framework's
     ordering, metrics and tracing.

IF the stack is more than four or five deep
THEN stack traces and debugging get expensive. Consider one composed
     class for the fixed part.

IF a decorator swallows or translates the delegate's exceptions
THEN it is changing the contract, not decorating it. State that
     explicitly; it is the layer most likely to hide an outage.
```

## Cross-cutting checks

- **Concurrency.** A decorator over a stateless, thread-safe delegate can make the composition
  unsafe: a counter, a cache, an `HashMap` of in-flight keys, a non-atomic read-modify-write of a
  breaker's state. Each stateful layer needs its own memory-model argument. Conversely,
  a decorator cannot make an unsafe delegate safe unless it serialises every call — which usually
  defeats the delegate's purpose (`java-memory-model`).
- **Distribution.** This is where resilience layers live, so the ordering table above is a
  production concern rather than a stylistic one. Two failures dominate: retry amplification
  across layers, which converts a partial outage into a full one; and a timeout placed so that
  the total call time exceeds the caller's deadline, so the caller gives up while the work
  continues (`timeouts-and-deadlines`, `cascading-failures`).
- **Performance.** Each layer is one more virtual call, and the JIT inlines a short chain over a
  monomorphic call site well. The costs that actually show up are allocation per call inside a
  layer (a new context object, a lambda capturing state, a `String` built for a log line that is
  then discarded), and lost inlining once the call site is megamorphic
  (`jit-inlining-and-escape-analysis`).
- **Testing.** Test each decorator against a fake delegate — that is the pattern's dividend. Then
  write one test for the composed stack that asserts the _order_: that a timeout during a retry
  produces N attempts, that a cache hit performs zero calls. Order is the property nothing else
  checks, and it is the one that regresses when someone reorders the wiring.

## Review checklist

- [ ] The wrapper implements the same interface as what it wraps
- [ ] The stacking order is deliberate and documented at the wiring site
- [ ] Retry exists at exactly one layer in the whole call path
- [ ] Any retried operation is idempotent or carries an idempotency key
- [ ] The total time of the stack fits the caller's deadline
- [ ] Stateful layers state their thread-safety guarantee
- [ ] Identity-sensitive callers have an unwrap path, or none exist
- [ ] No decorator silently swallows or reclassifies the delegate's failures
- [ ] A test asserts the composed order, not only each layer alone

## References

- [Ordering and composition](references/ordering-and-composition.md) — every common layer pair
  with its semantics, retry amplification arithmetic, deadline propagation through a stack,
  identity loss and unwrapping (`java.sql.Wrapper`, AOP proxies, listener deregistration), and
  when a framework interceptor should replace a hand-rolled decorator. Read before assembling or
  reordering a stack.
- [Worked example](references/worked-example.md) — an outbound pricing client decorated for
  metrics, breaking, retry, timeout and caching: the wiring with its order justified, the
  per-layer tests, the order test, and the reordering that caused a real outage. Read when
  implementing.
