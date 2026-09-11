# Fallbacks, and proving the breaker works

## Choosing a fallback

A breaker's output is a fast failure. The fallback decides what that failure becomes.

| Fallback                     | Honest when                                                                       | Dishonest when                                                              |
| ---------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Stale cached value           | the caller can act on data known to be old, and the age is carried with the value | the age is dropped and stale reads look identical to fresh ones             |
| Static default               | the contract permits that default and its consequences are safe                   | the default invents entitlement, credit or another unsupported outcome      |
| Degraded feature omitted     | the response is explicitly partial and the client can render it                   | an empty list is returned where "none" and "unknown" mean different things  |
| Queued write, applied later  | contract returns accepted/pending, queue is durable, request is idempotent        | caller is told committed success or queue is in heap                        |
| Fail fast with a typed error | the operation cannot be served correctly; no further fallback is required         | failure or an unknown effect is reported as successful or definitely absent |

**The wrong-data rule.** A fallback that returns wrong data indistinguishably from right data
converts an availability incident into a data incident, which is slower to detect, harder to
bound and sometimes irreversible. An empty list read as "the customer has no orders" and
written back is the canonical shape. Make the degraded case a different **type**, so the
caller can handle it explicitly. A sealed hierarchy enables exhaustiveness checks; it cannot
prevent a caller deliberately collapsing all variants to one value. This partial Java 21+
example uses final record patterns and pattern-switch syntax (no preview) and requires
`java.math.BigDecimal` and `java.time.Instant` imports in an enclosing class:

```java
sealed interface Quote {
    record Live(BigDecimal price) implements Quote {}
    record Stale(BigDecimal price, Instant asOf) implements Quote {}
    record Unavailable(String reason) implements Quote {}
}

// Handle each permitted variant explicitly rather than hiding degradation in a default.
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
here. A fallback that writes is a separate write path: define its acceptance, idempotency and
duplicate-effect recovery contract and test it. After a dispatched call times out, opening the
breaker does not prove that write failed. Preserve the unknown outcome; switching keys, data or
providers does not reconcile the first attempt. An open-state rejection proves only that this
attempt was not dispatched, not that earlier attempts had no effect.

## Testing a breaker

Three properties, each with an assertion that fails when the configuration is wrong.

**1. It trips on the condition you configured.** Drive the exact number of calls the window
and minimum-call count require, with the exact outcome the predicate should record, and assert
the state changed. Then drive the _same_ number with an outcome the declared predicate should
ignore (for example, validation 422) and assert the state did not change. Do not encode “all 4xx”
if 408, 429 or a shared-authentication failure has another policy.

```java
// Conceptual: the second half is the assertion usually missing.
for (int i = 0; i < minimumCalls; i++) callReturning(503);
assertEquals(State.OPEN, breaker.getState());

breaker.reset();
for (int i = 0; i < minimumCalls; i++) callReturning(422); // declared validation outcome
assertEquals(State.CLOSED, breaker.getState());
```

**2. An isolated half-open round rejects excess pending probes.** Move the breaker to half-open
directly — Resilience4j exposes `transitionToOpenState()`, `transitionToHalfOpenState()` and
`transitionToClosedState()` for exactly this, which removes the need to sleep out the wait
duration. Then submit more concurrent calls than the probe limit and assert the excess were
rejected without reaching the stub. Counting **stub invocations**, not exceptions, is what
makes this assertion real.

Hold admitted probes inside the stub with a latch/barrier while submitting excess calls.
Assert those excess calls are rejected before releasing the probes; otherwise fast successes
can close the breaker and legitimately admit later calls, making a correct breaker fail the
test. Bound latch waits and always release them in teardown.

Direct transitions test probe gating, not the configured wait duration or automatic transition.
Test timing separately with a controllable clock/scheduler where supported, or a narrowly bounded
integration test; do not make the suite depend on long sleeps.

**3. It closes again.** From half-open, return successes for the probe count and assert the
state is closed and traffic flows. A breaker tested only in the open direction has an untested
recovery path — the half that keeps an outage going after the dependency is back.

Also run the half-open failure direction and an incomplete sample with a configured maximum
half-open wait. Verify reopening, and separately whether outstanding client work terminated.
Include ignored outcomes and calls admitted before a state transition. Check stub invocations,
current-state metrics/permissions and still-pending work separately; a closing sample need not
consist solely of fresh probes in Resilience4j 2.3.0. The isolated probe-gating test above assumes
no earlier calls can complete into the new state.

Prefer controllable time when supported. If the configured scheduler cannot be controlled, use a
short bounded integration test with an event/latch deadline and cleanup; direct transitions alone
do not test a timer. `distributed-systems-testing` owns the general technique.

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
goodput on unrelated endpoints stays within its agreed isolation bound. That is the property the breaker exists for, and
the one no unit test observes (`cascading-failures`, `load-testing`).
