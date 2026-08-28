---
name: gof-chain-of-responsibility
description: >
  Chain of Responsibility in modern Java, and the pipeline it is usually confused with: the
  classical form where exactly one handler handles and the rest pass, versus the middleware form
  where every stage processes and forwards. Covers choosing between them, the unhandled-request policy that silent
  chains get wrong, ordering discipline when handlers are contributed independently, error
  propagation and partial state when a stage throws mid-chain, and why servlet filters and
  interceptor chains are this pattern already implemented. Use when a request must be offered to
  several possible handlers, when @Order values are tuned to make a chain work, when a request
  falls off the end of a chain and nothing happens, or when a chain is proposed for three fixed
  cases. Does not cover the security framework's own filter configuration, the
  retry and timeout policies applied around a call (gof-decorator, circuit-breakers), or
  message processing across services (streaming-pipeline-topologies).
---

# Chain of Responsibility

## Purpose

Let a request be offered to a sequence of candidate handlers without the sender knowing which one
will deal with it. The sender depends on the chain, not on the handlers, so handlers can be
added, removed and reordered without touching it.

Two shapes travel under this name and behave differently:

```text
Classical CoR      each handler decides "mine?" — the first that says yes
                   handles it and the chain stops. Exactly one handles.
                   Fallthrough to the end is a defined outcome.

Pipeline /         every stage processes and passes on: filters,
middleware         interceptors, Netty handlers, Spring Security's chain.
                   All stages run unless one short-circuits deliberately.
```

Most modern uses are the second. Deciding which you are building is the first design step,
because the unhandled case, the ordering rules and the error semantics all differ.

## When it is the answer

```text
The set of handlers is open — new ones arrive from other modules,
plugins or configuration
        → Chain. A switch would have to be edited by every contributor.

Order is meaningful and must be configurable
        → Chain, with the order stated explicitly rather than implied.

A request may be handled at different levels of specificity
(tenant rule → product rule → default)
        → Classical CoR, with the default as the last link.

Cross-cutting work must wrap request handling
        → Pipeline — and prefer the framework's, which already has
          ordering, error translation and observability.
```

## When it is not

- **Three fixed cases you own.** A `switch` over a sealed type is shorter, exhaustive and
  readable; a chain hides the whole decision behind wiring (`java-composition-over-inheritance`).
- **Every handler must run and none may decline.** That is a pipeline, and calling it a chain
  invites someone to add a short-circuit that silently skips the rest.
- **The framework already provides it.** A hand-rolled chain beside servlet filters or
  `HandlerInterceptor` duplicates ordering and is invisible to the framework's metrics and
  tracing.
- **Handlers need to know about each other.** Then the chain is a workflow with implicit
  coupling; make the sequence explicit or use a mediator (`gof-mediator`).
- **The chain spans services.** A sequence of network hops is a workflow or a saga with partial
  failure at every step, not this pattern (`distributed-transactions-and-sagas`).

## Decision rules

```text
IF nothing handles the request
THEN the behaviour must be defined: a terminal default handler, or an
     explicit exception. A chain that returns silently is the single
     most common defect in this pattern.

IF handler order is expressed as @Order(100), @Order(200)
THEN the ordering rationale exists only in someone's head. Name the
     positions (an enum, an explicit list at the composition root) so
     the reason survives.

IF a handler both handles and forwards, in a chain designed for
"first match wins"
THEN the two shapes have been mixed and downstream handlers now see a
     request that was already handled.

IF a stage mutates shared state and a later stage throws
THEN the request leaves partial effects behind. Either make stages
     pure over a context object and apply effects at the end, or define
     compensation explicitly.

IF handlers hold per-request state in fields
THEN a shared chain is not thread-safe. State belongs in the context
     object passed along the chain, not in the handler.

IF the chain is assembled at every request
THEN it allocates per call for no benefit. Build it once; pass the
     request through it.

IF a chain is used for validation and stops at the first failure
THEN callers get one problem at a time. Decide deliberately: fail fast,
     or collect every violation (java-exception-design).
```

## Modern Java expression

```text
Classical                            Modern
───────────────────────────────────  ───────────────────────────────────
abstract Handler with a successor    a List<Handler> iterated by the
field and setNext()                  chain owner — order is data, not a
                                     linked structure nobody can see

handler.handle(request) returns      Optional<Result> handle(Request),
void and mutates                     with the chain taking the first
                                     non-empty

pipeline via successor calls         Function composition, or the
                                     framework's filter chain

per-request state in ThreadLocal     a context record passed along, or
                                     ScopedValue (scoped-values)
```

A `List<Handler>` plus `stream().flatMap(h -> h.handle(req).stream()).findFirst()` expresses
classical CoR with the order visible at the composition root and no successor wiring at all. Keep
the linked form only when a handler must decide _how_ to invoke the rest — wrapping it in a
try/finally, running it on another thread, or skipping it — which is the pipeline shape.

## Cross-cutting checks

- **Concurrency.** A chain built once and shared is used by every request thread simultaneously,
  so handlers must be stateless and the per-request state must travel in the request or a context
  object. `ThreadLocal` works but leaks across pooled threads if not cleared and does not follow
  work handed to another thread; `ScopedValue` is the modern replacement
  (`scoped-values`, `thread-sizing-and-virtual-threads`).
- **Distribution.** Chains that process messages must define what a mid-chain failure means for
  acknowledgement: a stage that throws after a side effect has been applied, in an at-least-once
  system, will re-run the earlier stages on redelivery. Make stages idempotent or apply effects
  once at the end (`idempotency`, `delivery-semantics`, `poison-messages-and-dlq`). Cancellation
  must also propagate — a chain that ignores an expired deadline keeps working for a caller that
  has gone (`cancellation-and-interruption`).
- **Performance.** Cost is one call per link plus whatever context object is allocated. It is
  rarely significant, but two patterns are: a chain that computes an expensive value for every
  handler to inspect rather than lazily, and a chain long enough that the call site becomes
  megamorphic in a hot path (`jit-inlining-and-escape-analysis`).
- **Testing.** Three distinct tests. Each handler alone, with a trivial context. The chain's
  order, asserting that a request matching two handlers reaches the intended one. And the
  unhandled case, asserting the defined behaviour — the test most often missing, and the one that
  catches a silent drop.

## Review checklist

- [ ] The shape is stated: first-match-wins, or every-stage-runs
- [ ] The unhandled outcome is defined and covered by a test
- [ ] Order is expressed as an explicit list or named positions, not bare numbers
- [ ] Handlers hold no per-request state in fields
- [ ] A mid-chain failure leaves no partial effects, or compensation is defined
- [ ] The chain is built once, not per request
- [ ] Deadlines and cancellation propagate through the chain
- [ ] The framework's own chain was considered for cross-cutting concerns
- [ ] The handler set is genuinely open; a fixed set of three is a `switch`

## References

- [Chain against pipeline](references/chain-vs-pipeline.md) — the two shapes with their differing
  contracts, ordering discipline and how to make it survive contributors, unhandled-request
  policies, error propagation and partial state, and the framework equivalents worth using
  instead. Read before assembling a chain.
- [Worked example](references/worked-example.md) — a payment-authorisation rule chain replacing a
  branching method: the first-match version, the ordering made explicit, the terminal default,
  what happened when a stage acquired a side effect, and the three tests. Read when implementing.
