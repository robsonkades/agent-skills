---
name: gof-chain-of-responsibility
description: >
  Chain of Responsibility in modern Java, and the pipeline it is usually confused with: the
  classical first-accepting form versus middleware where stages may all process and forward
  conditionally. Covers choosing between them, the unhandled-request policy that silent
  chains get wrong, ordering discipline when handlers are contributed independently, error
  propagation and partial state when a stage throws mid-chain, and why servlet filters and
  interceptor chains are this pattern already implemented. Use when a request must be offered to
  several possible handlers, when @Order values are tuned to make a chain work, when a request
  falls off the end of a chain and nothing happens, or when a chain is proposed for three fixed
  cases. Does not cover the security framework's own filter configuration,
  call wrapping (gof-decorator), dependency failure protection (circuit-breakers), or
  message processing across services (streaming-pipeline-topologies).
---

# Chain of Responsibility

## Purpose

Let a request be offered to a sequence of candidate handlers without the sender knowing which one
will deal with it. The sender depends on the chain, not on the handlers, so handlers can be
added, removed and reordered without touching it.

Two shapes travel under this name and behave differently:

```text
Classical CoR      each handler decides whether to handle or pass. First-match-wins
                   is common, but a contract may allow handling and continuation.
                   Fallthrough to the end is a defined outcome.

Pipeline /         every stage processes and passes on: filters,
middleware         interceptors, Netty handlers, Spring Security's chain.
                   All stages run unless one short-circuits deliberately.
```

Deciding which contract you need is the first design step,
because the unhandled case, the ordering rules and the error semantics all differ.
The partial Java examples use Java 17 unless labelled otherwise. Pattern switches over sealed
types are final in Java 21; on Java 17 use an enum switch or explicit dispatch without enabling
preview merely for this pattern. Inspect actual framework versions and target toolchains.

Start from a caller and an overlapping-handler example: what counts as handled, which rule
has precedence, and which checks must succeed before a result is usable? Reuse existing wiring,
tests and policy before asking about unresolved authority or fallback behavior. Keep changes
conditional on material unknowns; a sound ordered loop or framework chain may need no redesign.

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

- **A few fixed cases you own.** Compare ordinary conditionals or a loop; use an exhaustive
  `switch` when a discriminator expresses the decision. Overlapping predicates still need their
  priority preserved; handler count alone does not decide (`java-composition-over-inheritance`).
- **Every handler must run and none may decline.** This is the pipeline/middleware variant of CoR;
  name its no-short-circuit contract and failure policy. Required checks must succeed before
  dependent effects/results; this does not promise every stage runs after an exception.
- **The framework already provides it.** A hand-rolled chain beside servlet filters or
  `HandlerInterceptor` needs a distinct domain purpose; otherwise it adds a second order and
  integration work for metrics, tracing and lifecycle.
- **Handlers need to know about each other.** Then the chain is a workflow with implicit
  coupling; make the sequence explicit or use a mediator (`gof-mediator`).
- **The chain spans services.** A sequence of network hops is a workflow or a saga with partial
  failure at every step, not this pattern (`distributed-transactions-and-sagas`).

## Decision rules

```text
IF nothing handles the request
THEN define whether this is a no-op/not-applicable result, a terminal default, or an
     error. Silent fallthrough is correct only when the API makes that outcome visible.

IF handler order is expressed as unexplained @Order(100), @Order(200)
THEN make the precedence rationale and tie policy reviewable. Named positions or an explicit
     list can help; retain documented framework ordering that already enforces the contract.
     Check the actual consumer's assembled chain; testing a list factory alone does not prove
     that dependency injection supplies that list to the consumer.

IF a handler both handles and forwards, in a chain designed for
"first match wins"
THEN the two shapes have been mixed and downstream handlers now see a
     request that was already handled.

IF a stage mutates shared state and a later stage throws
THEN the request leaves partial effects behind. Either make stages
     pure over a context object and apply effects at the end, or define
     an applicable transaction/compensation boundary. Deferring effects alone does not make
     their final application atomic or idempotent under retry.

IF concurrently shared handlers hold mutable per-request state in fields
THEN establish confinement or synchronization throughout its use, including async work, or pass
     state in a request/context. Request-confined handlers may have fields; a copied list or context
     record does not make mutable handlers, dependencies or payloads thread-safe.

IF the chain is assembled at every request
THEN determine whether tenant, capability or request data genuinely changes membership.
     Otherwise precompute immutable chains; when it does, cache bounded variants or
     measure per-call assembly rather than assuming it is free.

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
sequential classical CoR with the order visible at the composition root and no successor wiring.
The returned `Optional` must be non-null: empty means abstention; a present rejection is a handled
decision, not permission to try a later approval. An exception is a failure, not implicit abstention.
Do not use a parallel stream when later handlers must never execute after the first decision;
ordered result selection does not guarantee exclusive invocation. Keep
the linked form only when a handler must decide _how_ to invoke the rest — wrapping it in a
try/finally, running it on another thread, or skipping it — which is the pipeline shape.

## Cross-cutting checks

- **Concurrency.** A shared chain may be used concurrently, so handlers and their dependencies
  need an explicit thread-safety contract; per-request state should travel in the request or a context
  object. `ThreadLocal` can leak across pooled threads if not cleared and does not automatically
  follow arbitrary executor handoffs; `ScopedValue` (final in Java 25) is suited to immutable
  dynamically scoped context, not a general mutable replacement
  (`scoped-values`, `thread-sizing-and-virtual-threads`).
- **Distribution.** Chains that process messages must define what a mid-chain failure means for
  acknowledgement: a stage that throws after a side effect has been applied, in an at-least-once
  system, can re-run earlier stages under its redelivery policy. Make stages idempotent or apply effects
  through an idempotent/transactional commit boundary even if deferred until the end
  (`idempotency`, `delivery-semantics`, `poison-messages-and-dlq`). Cancellation
  must also propagate — a chain that ignores an expired deadline keeps working for a caller that
  has gone (`cancellation-and-interruption`).
- **Performance.** Cost depends on traversal, dispatch and context design; a context may already
  exist and need not be allocated by each link. Important patterns are a chain that computes an expensive value for every
  handler to inspect rather than lazily, and a chain long enough that the call site becomes
  megamorphic in a hot path (`jit-inlining-and-escape-analysis`).
- **Testing.** Three distinct tests. Each handler alone, with a trivial context. The chain's
  order, asserting that a request matching two handlers reaches the intended one. And the
  unhandled case, asserting the defined behaviour — the test most often missing, and the one that
  catches a silent drop.

## Review checklist

- [ ] The shape, handled/abstained/failed outcomes and permitted short-circuits are stated
- [ ] The unhandled outcome is defined and covered by a test
- [ ] Precedence and ties are reviewable; mandatory checks cannot be bypassed by an early result
- [ ] Handler/context ownership supports actual sharing and asynchronous lifetimes
- [ ] Partial effects, final commit failure and redelivery have explicit transaction/idempotency/recovery contracts
- [ ] Chain assembly lifetime matches actual variability and is measured/cached when request-specific
- [ ] Deadlines/cancellation propagate; continuation and cleanup ownership follow actual work completion
- [ ] The framework's own chain was considered for cross-cutting concerns
- [ ] Relevant simpler conditionals, loops or a discriminator switch were considered without changing semantics

Finish with the selected or retained contract, any material unresolved policy, and checks of
precedence, no-handler, short-circuit and failure behavior. Report executed checks separately from
proposed tests; a small review does not require a new chain implementation.

## References

- [Chain against pipeline](references/chain-vs-pipeline.md) — the two shapes with their differing
  contracts, ordering discipline and how to make it survive contributors, unhandled-request
  policies, error propagation and partial state, and the framework equivalents worth using
  instead. Read before assembling a chain.
- [Worked example](references/worked-example.md) — a payment-authorisation rule chain replacing a
  branching method: the first-match version, the ordering made explicit, the terminal default,
  what happened when a stage acquired a side effect, and the three tests. Read when implementing.
