# Fallbacks, and proving the breaker works

## Choosing a fallback

A breaker's output is a fast failure. The fallback decides what that failure becomes.

| Fallback                     | Honest when                                                                       | Dishonest when                                                             |
| ---------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Stale cached value           | the caller can act on data known to be old, and the age is carried with the value | the age is dropped and stale reads look identical to fresh ones            |
| Static default               | the default is safe in the restrictive direction (no discount, no entitlement)    | the default grants something — access, credit, a limit                     |
| Degraded feature omitted     | the response is explicitly partial and the client can render it                   | an empty list is returned where "none" and "unknown" mean different things |
| Queued write, applied later  | the operation is asynchronous by contract and the queue is durable                | the caller is told the write succeeded and the queue is in heap            |
| Fail fast with a typed error | the caller upstream has its own fallback, or a human does                         | it is called a fallback; it is the absence of one, which is often correct  |

**The wrong-data rule.** A fallback that returns wrong data indistinguishably from right data
converts an availability incident into a data incident, which is slower to detect, harder to
bound and sometimes irreversible. An empty list read as "the customer has no orders" and
written back is the canonical shape. Make the degraded case a different **type**, so the
caller cannot ignore it:

```java
sealed interface Quote {
    record Live(BigDecimal price) implements Quote {}
    record Stale(BigDecimal price, Instant asOf) implements Quote {}
    record Unavailable(String reason) implements Quote {}
}

// The caller cannot silently treat Stale as Live: the switch must be exhaustive.
String render(Quote q) {
    return switch (q) {
        case Quote.Live(var price)         -> price.toPlainString();
        case Quote.Stale(var price, var t) -> price.toPlainString() + " (as of " + t + ")";
        case Quote.Unavailable(var why)    -> "price unavailable";
    };
}
```

A stale value needs a source that survives the dependency's outage — the staleness policy and
the store are `caching-strategies`; the requirement that the age travels with the value is
here. And never let a fallback perform the side effect the primary call would have performed
under a different key or with different data: that is a second write path with no tests.

## Testing a breaker

Three properties, each with an assertion that fails when the configuration is wrong.

**1. It trips on the condition you configured.** Drive the exact number of calls the window
and minimum-call count require, with the exact outcome the predicate should record, and assert
the state changed. Then drive the _same_ number of calls with an outcome the predicate should
**ignore** (a 400) and assert the state did not change. The second assertion is the one that
catches a predicate counting client errors.

```java
// Conceptual: the second half is the assertion usually missing.
for (int i = 0; i < minimumCalls; i++) callReturning(503);
assertEquals(State.OPEN, breaker.getState());

breaker.reset();
for (int i = 0; i < minimumCalls; i++) callReturning(400);
assertEquals(State.CLOSED, breaker.getState());
```

**2. Half-open admits only the configured number of probes.** Move the breaker to half-open
directly — Resilience4j exposes `transitionToOpenState()`, `transitionToHalfOpenState()` and
`transitionToClosedState()` for exactly this, which removes the need to sleep out the wait
duration. Then submit more concurrent calls than the probe limit and assert the excess were
rejected without reaching the stub. Counting **stub invocations**, not exceptions, is what
makes this assertion real.

**3. It closes again.** From half-open, return successes for the probe count and assert the
state is closed and traffic flows. A breaker tested only in the open direction has an untested
recovery path — the half that keeps an outage going after the dependency is back.

Do not sleep to cross the wait duration. Either drive the transitions directly, or inject the
implementation's clock so time can be advanced; the general rule is in
`distributed-systems-testing`.

## Fault injection at the integration level

Unit tests prove the state machine. They do not prove the breaker is wired around the real
call, that the client's exceptions match the predicate, or that a timeout produces the outcome
you assumed. That needs the real client against a controllable server: a stub HTTP server
returning chosen statuses, or a proxy that adds latency and cuts connections
(`distributed-systems-testing` covers the technique and the tooling).

Assert, in this order:

1. The **fault actually occurred** — the stub recorded the call, the latency was applied. A
   failure test that passes because the injection silently did nothing is not evidence.
2. The breaker opened, and the caller's own latency dropped to the fast-failure path.
3. The **fallback's observable behaviour**, not just the absence of an exception: the degraded
   marker is present, the response status is the one the API contract documents, and the
   degraded-response counter incremented.
4. Nothing wrote wrong data. Where the fallback touches state, assert the state afterwards.

Finally, exercise the breaker in a load test: inject dependency latency at capacity and assert
goodput on unrelated endpoints stays flat. That is the property the breaker exists for, and
the one no unit test observes (`cascading-failures`, `load-testing`).
