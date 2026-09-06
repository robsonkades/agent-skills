# Configuring a breaker

Parameters are named here by the role they play. Resilience4j is the usual Java
implementation and its property names are given alongside; check the spelling against the
version in your build rather than trusting a snippet.

## Parameters and the failure each wrong value produces

| Role                         | Resilience4j key                        | Too low                                                       | Too high                                                                  |
| ---------------------------- | --------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Window kind                  | `slidingWindowType`                     | Count window spans too much wall time at low rate             | Time window contains too few calls at low rate                            |
| Window size                  | `slidingWindowSize`                     | trips on a momentary blip                                     | reacts minutes after the dependency broke                                 |
| Minimum calls to evaluate    | `minimumNumberOfCalls`                  | 1 failure in 2 reads as 50% and trips                         | never reached on a low-traffic endpoint, so the breaker never trips       |
| Failure-rate threshold       | `failureRateThreshold`                  | trips on the dependency's normal error rate                   | stays closed through a real outage                                        |
| Slow-call duration           | `slowCallDurationThreshold`             | healthy tail calls count as slow                              | threshold exceeds timeout/deadline, so no completed call is recorded slow |
| Slow-call rate threshold     | `slowCallRateThreshold`                 | trips on tail latency                                         | the slow-but-succeeding outage is never detected                          |
| Wait before probing          | `waitDurationInOpenState`               | probes a dependency that has not restarted, reopening at once | stays open long after the dependency recovered                            |
| Probes admitted in half-open | `permittedNumberOfCallsInHalfOpenState` | one unlucky probe reopens a healthy dependency                | the recovering instance takes a burst and fails again                     |

Behaviours that affect diagnosis:

- The window size is **a count of calls** under `COUNT_BASED` and **a number of seconds**
  under `TIME_BASED`. The same integer means two different things.
- Without `automaticTransitionFromOpenToHalfOpenEnabled`, the open→half-open move happens on
  the **next call after the wait duration**, not on a timer. On a low-traffic path the breaker
  therefore reports open long after it would have closed, and the first caller after the quiet
  period pays the probe.
- Automatic transition uses background monitoring so breakers can enter half-open without traffic;
  account for its implementation/threading cost and do not confuse state transition with a probe.
- `maxWaitDurationInHalfOpenState` bounds how long an incomplete probe sample can keep the
  breaker half-open; in Resilience4j 2.3.0 zero means no such bound. A positive bound reopens
  the breaker but does not abort unfinished probes: keep client timeouts/cancellation. Allow
  enough time for the intended sample at the actual arrival rate.

Illustrative Spring Boot configuration fragment, not a universal Java property file. It needs
the matching Resilience4j Spring integration; verify binding on the project's resolved version.

```yaml
resilience4j.circuitbreaker:
  instances:
    inventory:
      slidingWindowType: TIME_BASED
      slidingWindowSize: 60 # seconds, because the window is TIME_BASED
      minimumNumberOfCalls: 50 # ≈ the calls this endpoint makes in 60 s
      failureRateThreshold: 50
      slowCallDurationThreshold: 2s # above healthy tail, below the effective timeout/deadline
      slowCallRateThreshold: 60
      waitDurationInOpenState: 30s
      permittedNumberOfCallsInHalfOpenState: 5
      automaticTransitionFromOpenToHalfOpenEnabled: true
```

Derive `minimumNumberOfCalls` from measured traffic: an endpoint at 2 rps fills a 60 s window
with 120 calls, so 50 is a sample; the same value on an endpoint at 2 requests per minute is
never reached, and the breaker is decoration.

## What counts as a failure

The predicate is the decision that decides whether the breaker works. Configure it by type
and by status class, never by message text.

| Outcome                                       | Counts     | Why                                                                        |
| --------------------------------------------- | ---------- | -------------------------------------------------------------------------- |
| Connect/read timeout                          | usually    | count when attributable to this dependency/scope, not caller cancellation  |
| Connection refused/reset, DNS failure         | decide     | may be backend-wide, local resolver/network, endpoint- or zone-specific    |
| 500, 502, 503, 504                            | usually    | exclude payload-specific failures; split endpoint/failure domains          |
| Slow call above the slow-call threshold       | yes        | the resource cost is the same as a failure                                 |
| 400, 401, 403, 404, 405, 422                  | usually no | validation/domain misses; shared credential/routing faults are exceptions  |
| 408 request timeout                           | decide     | origin, proxy or caller may own the timeout                                |
| 409 conflict                                  | no         | a business outcome, not a dependency fault                                 |
| 429 too many requests                         | decide     | the dependency is asking for less load — see below                         |
| Domain exception carried over a 200           | **no**     | insufficient funds is an answer, not a fault                               |
| `CancellationException` from a caller timeout | decide     | count it only if the deadline was the dependency's fault, not the caller's |

**429.** Counting it can make the breaker a coarse backoff mechanism: the caller stops for
the wait duration, which protects a rate-limited dependency but converts a partial throttle
into a total local outage. Not counting it leaves backoff to the retry policy honouring
`Retry-After` (`retries-and-backoff`), which is usually the better division of labour. Decide
once, per dependency, and record the reason.

In Resilience4j distinguish three treatments: **failure**, **success**, and **ignored**.
An exception rejected by the recording predicate counts as success unless explicitly ignored;
ignored exceptions contribute to neither count and therefore change the sample denominator.
Use `ignoreExceptions`/an ignore predicate when that outcome should not describe dependency
health, and test the recorded call count as well as the failure rate.

`recordExceptions` and the exception predicate (`recordException` in the Java builder;
`recordFailurePredicate` in supported configuration bindings) inspect a Throwable. They do not
receive a normally returned HTTP response. For returned responses, use the supported result
predicate (`recordResult` in the 2.3.0 Java builder) or map outcomes to typed exceptions before
recording. One shared exception class can still expose a status field: inspect that field or
its cause instead of declaring classification impossible or parsing message text. A slow
successful call remains a success for failure rate and separately contributes to slow-call rate.

Source for these API distinctions: [Resilience4j 2.3.0 CircuitBreakerConfig](https://github.com/resilience4j/resilience4j/blob/v2.3.0/resilience4j-circuitbreaker/src/main/java/io/github/resilience4j/circuitbreaker/CircuitBreakerConfig.java).

## Composition with retry

```text
Retry(Breaker(call))    each admitted attempt is recorded; sample size and failure rate
                        describe attempts rather than logical requests. Their relationship
                        depends on retry eligibility and outcomes, not a fixed multiplier.
                        Once open, later attempts fail fast without reaching the dependency.

Breaker(Retry(call))    one outcome per logical call → the threshold means what it says,
                        but each protected call lasts attempts × timeout + Σ backoff, so
                        slow-call detection is measuring the retry policy, and the retries
                        keep reaching a dependency the breaker would have stopped calling.
```

Whichever order is chosen, assert the composed worst case against the caller's budget:
`attempts × per-attempt timeout + Σ backoff ≤ remaining deadline` (`timeouts-and-deadlines`).
Retry policy itself is `retries-and-backoff`.

Normally exclude `CallNotPermittedException` from retries: waiting and retrying local rejection
adds no backend evidence and may synchronize callers with recovery. Verify actual annotation/AOP
order or reactive/CompletionStage decoration at runtime; decorating only future creation or
publisher assembly can miss the eventual failure and record an artificially short duration.

## Per-instance state, and the alternative

A breaker's window lives in the JVM that owns it. Consequences worth stating explicitly:

- Each instance needs `minimumNumberOfCalls` of **its own** traffic before it can trip. With
  20 replicas behind a balancer, per-instance traffic is a twentieth of the fleet's, and a
  threshold sized from fleet traffic will never be reached.
- During a partial dependency outage — some backend instances failing — replicas whose calls
  happened to land on the failing ones open while others stay closed. Fleet behaviour is a
  mixture, not a state.
- After a deploy every breaker starts closed with an empty window, so a rollout re-probes a
  dependency the previous pods had already given up on.

With N independent breakers and P half-open permits each, a synchronized recovery wave can
admit up to N × P probes, before retries or other clients. Budget that aggregate load and
consider supported wait jitter/staggering; do not treat a per-JVM probe count as global control.

Sharing state across replicas via a distributed counter buys uniformity and costs coordination
plus another failure mode. A pushed control-plane decision avoids a per-call round trip but has
propagation/staleness semantics. Define whether control-plane loss preserves the last state or
fails open. Per-instance breakers plus server-side shedding
(`rate-limiting-and-load-shedding`) is the usual answer; a client-side breaker is not the
place to enforce a fleet-wide decision.
