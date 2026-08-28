# Configuring a breaker

Parameters are named here by the role they play. Resilience4j is the usual Java
implementation and its property names are given alongside; check the spelling against the
version in your build rather than trusting a snippet.

## Parameters and the failure each wrong value produces

| Role                         | Resilience4j key                        | Too low                                                       | Too high                                                            |
| ---------------------------- | --------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- |
| Window kind                  | `slidingWindowType`                     | `COUNT_BASED` on a bursty endpoint measures a stale minute    | `TIME_BASED` on a rare endpoint holds too few calls to decide       |
| Window size                  | `slidingWindowSize`                     | trips on a momentary blip                                     | reacts minutes after the dependency broke                           |
| Minimum calls to evaluate    | `minimumNumberOfCalls`                  | 1 failure in 2 reads as 50% and trips                         | never reached on a low-traffic endpoint, so the breaker never trips |
| Failure-rate threshold       | `failureRateThreshold`                  | trips on the dependency's normal error rate                   | stays closed through a real outage                                  |
| Slow-call duration           | `slowCallDurationThreshold`             | healthy p99 calls count as slow                               | a 30 s dependency is never "slow"                                   |
| Slow-call rate threshold     | `slowCallRateThreshold`                 | trips on tail latency                                         | the slow-but-succeeding outage is never detected                    |
| Wait before probing          | `waitDurationInOpenState`               | probes a dependency that has not restarted, reopening at once | stays open long after the dependency recovered                      |
| Probes admitted in half-open | `permittedNumberOfCallsInHalfOpenState` | one unlucky probe reopens a healthy dependency                | the recovering instance takes a burst and fails again               |

Two behaviours that surprise people:

- The window size is **a count of calls** under `COUNT_BASED` and **a number of seconds**
  under `TIME_BASED`. The same integer means two different things.
- Without `automaticTransitionFromOpenToHalfOpenEnabled`, the open→half-open move happens on
  the **next call after the wait duration**, not on a timer. On a low-traffic path the breaker
  therefore reports open long after it would have closed, and the first caller after the quiet
  period pays the probe.

```yaml
resilience4j.circuitbreaker:
  instances:
    inventory:
      slidingWindowType: TIME_BASED
      slidingWindowSize: 60 # seconds, because the window is TIME_BASED
      minimumNumberOfCalls: 50 # ≈ the calls this endpoint makes in 60 s
      failureRateThreshold: 50
      slowCallDurationThreshold: 2s # above the dependency's measured p99
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

| Outcome                                       | Counts | Why                                                                        |
| --------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| Connect timeout, read timeout                 | yes    | the dependency is not answering within the bound                           |
| Connection refused or reset, DNS failure      | yes    | transport-level, dependency-wide                                           |
| 500, 502, 503, 504                            | yes    | server-side; correlated across callers                                     |
| Slow call above the slow-call threshold       | yes    | the resource cost is the same as a failure                                 |
| 400, 401, 403, 404, 405, 422                  | **no** | caller's fault; fails identically forever and trips for every client       |
| 409 conflict                                  | no     | a business outcome, not a dependency fault                                 |
| 429 too many requests                         | decide | the dependency is asking for less load — see below                         |
| Domain exception carried over a 200           | **no** | insufficient funds is an answer, not a fault                               |
| `CancellationException` from a caller timeout | decide | count it only if the deadline was the dependency's fault, not the caller's |

**429.** Counting it makes the breaker the backoff mechanism: the caller stops entirely for
the wait duration, which protects a rate-limited dependency but converts a partial throttle
into a total local outage. Not counting it leaves backoff to the retry policy honouring
`Retry-After` (`retries-and-backoff`), which is usually the better division of labour. Decide
once, per dependency, and record the reason.

In Resilience4j this is `recordExceptions` / `ignoreExceptions` for types, or a
`recordFailurePredicate` when the decision needs the response. When the client maps HTTP
status onto exceptions, verify the mapping: a client that throws one exception type for every
non-2xx makes the 4xx/5xx distinction impossible to express.

## Composition with retry

```text
Retry(Breaker(call))    each attempt is recorded → the observed failure rate is inflated
                        relative to the per-logical-call rate, so the breaker trips earlier
                        than the threshold suggests. Once open, remaining attempts fail
                        fast, which is the desirable half of this order.

Breaker(Retry(call))    one outcome per logical call → the threshold means what it says,
                        but each protected call lasts attempts × timeout + Σ backoff, so
                        slow-call detection is measuring the retry policy, and the retries
                        keep reaching a dependency the breaker would have stopped calling.
```

Whichever order is chosen, assert the composed worst case against the caller's budget:
`attempts × per-attempt timeout + Σ backoff ≤ remaining deadline` (`timeouts-and-deadlines`).
Retry policy itself is `retries-and-backoff`.

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

Sharing state across replicas (a distributed counter) buys uniformity and costs a round trip
plus a new dependency on the path a breaker exists to protect — and that store's own outage
must then fail open. Per-instance breakers plus server-side shedding
(`rate-limiting-and-load-shedding`) is the usual answer; a client-side breaker is not the
place to enforce a fleet-wide decision.
