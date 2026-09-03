---
name: retries-and-backoff
description: >
  Retry as a policy with a cost: classifying a failure as transient, permanent or ambiguous
  before retrying anything; why a timeout is ambiguous and safe to retry only under
  idempotency or reconciliation; capped jittered backoff; aggregate retry budgets plus
  per-call limits; one layer owning the end-to-end policy; and
  honouring 429, Retry-After and the remaining deadline. Use when a catch block retries on
  Exception or on a message substring, when backoff has no jitter, when several layers each
  retry the same call, when a POST is retried after a timeout, when a dependency's inbound
  rate rises as its success rate falls, when a retry sleeps inside a transaction, or when
  duplicates appear after an outage. Does not cover making the operation safe to repeat
  (idempotency), the bound itself (timeouts-and-deadlines), tripping
  (circuit-breakers), retry storms (cascading-failures), load shedding
  (rate-limiting-and-load-shedding), or the exception type (java-exception-design).
---

# Retries And Backoff

## Purpose

A retry is a policy with a cost, and the cost is paid by the dependency that is already
failing. It turns one failure into N requests. It reduces failures caused by _independent_
transient faults and it makes _correlated_ faults worse — so it changes the shape of the
failure distribution rather than making the call reliable.

The decision is made per failure, not per call site: transient, permanent, or **ambiguous**.
The ambiguous class causes the incidents. A timeout is a failure of the wait, not of the
operation: the write may already have been applied. Retrying it is safe only when the
operation is idempotent, which is idempotency's subject, not this skill's.

## Workflow

1. **Classify before you retry.** Definite pre-dispatch/rejected, retryable transient,
   terminal for the current intent, and ambiguous outcome need different handling. A typed
   error/status is evidence interpreted with operation semantics—not a universal lookup table.
2. **Resolve the ambiguous class first.** If the operation is not idempotent downstream, use
   status lookup/reconciliation or surface a durable pending/unknown outcome; blind retry and
   blind failure are both guesses.
3. **Give one layer ownership of the end-to-end retry budget.** Transport connection retries,
   proxy attempts and application retries may coexist only when their nested attempt/deadline
   budget is explicit and safe; disable hidden defaults elsewhere.
4. **Choose capped full, equal or decorrelated jitter deliberately.** Full jitter is a robust
   default for large correlated fleets; then check total time and attempt timeout against the
   caller's remaining deadline before the policy ships.
5. **Add a retry budget.** Cap retries as a fraction of successful traffic; attempt counts
   bound one call site, budgets bound the fleet.
6. **Respect server guidance within the deadline.** Do not retry before a valid `Retry-After`;
   use at least the greater of local backoff and server delay, unless it cannot fit. Validate/
   cap untrusted or absurd dates and do not assume another replica bypasses a shared quota.
7. **Instrument ratios, not counts** — attempts per logical call, budget rejections, and
   the dependency's inbound rate against yours. See `references/retry-failure-modes.md`.

## Rules

- Retryability is a property the contract carries, not one the client infers.
  `if (e.getMessage().contains("timeout"))` is the shape to delete; rpc-and-api-contracts
  owns putting the flag in the contract and java-exception-design owns modelling it on the
  type.
- RFC 9110 defines GET/HEAD/PUT/DELETE/OPTIONS/TRACE method semantics as idempotent, but a
  concrete server may violate them and an idempotent state effect can still return a different
  response. POST/PATCH can be made retry-safe by an operation key/conditional semantics.
- Do not hard-code HTTP status as retryability. 408/425/429/5xx may be retryable for one safe
  operation and ambiguous/terminal for another; 401 may succeed after one credential refresh,
  404 may be eventual, and 409/412 may require reread/recompute rather than replay. The API
  contract must say whether the request could have applied and whether retrying unchanged helps.
- Full jitter is `sleep = random(0, min(cap, base × 2^attempt))` — a uniform draw over the
  whole window, not the window plus a small wobble.
- Unjittered backoff synchronises clients. They all failed at the same instant, so they all
  wake at the same instant; the wave lands precisely while the dependency is recovering.
- Attempt counts do not bound amplification across hidden layers. L layers allowing N total
  attempts each can produce up to `N^L` bottom calls: three layers × three attempts = 27.
- A retry budget bounds retries over its scope/window according to refill plus initial burst.
  A bucket earning `r` tokens per success permits roughly `r` retries per success in steady
  state after burst—not universally 1.1×. Scope by dependency/operation/priority so one outage
  cannot consume every retry token. gRPC throttling and proxy budgets have different formulas;
  read the deployed implementation.
- Before sleeping, check `backoff + expected attempt cost ≤ remaining deadline` and fail now
  if it does not fit. Sleeping in order to fail later spends the caller's budget on nothing.
  The budget is timeouts-and-deadlines'.
- Never sleep a backoff while holding a transaction or a pooled connection. The dependency's
  slowdown then becomes your pool exhaustion, and the transaction stays open across it.
  Retry outside the transactional boundary.
- Never retry a response already streaming to the caller: bytes delivered cannot be
  withdrawn. Buffer the response or restart the whole operation.
- Compose retry and breaker deliberately, and state which nesting you chose.
  `Retry(Breaker(call))` records **every attempt** in the breaker, so it trips after fewer
  logical calls than the threshold suggests — and once open the remaining attempts fail fast,
  and breaker-open rejection must itself be non-retryable. `Breaker(Retry(call))` records one
  outcome per logical call, so the threshold means what it says, but the retries keep reaching
  a dependency the breaker would already have stopped calling. Tripping policy and the full
  trade-off are circuit-breakers.
- State what a retry achieves and what it does not: it lowers the failure rate for
  independent transient faults, at the cost of extra load, extra latency inside the caller's
  own SLA, and duplicates whenever the ambiguous class is retried without idempotency. It
  makes nothing reliable.

## Anti-patterns and edge cases

| Anti-pattern                      | Failure                                   | Better alternative                                              |
| --------------------------------- | ----------------------------------------- | --------------------------------------------------------------- |
| Retry every exception/status      | permanent bugs and unknown writes amplify | typed evidence plus operation semantics                         |
| Fixed synchronized backoff        | recovery thundering herd                  | capped jitter and server guidance                               |
| Independent layer defaults        | exponential attempt multiplication        | one owner and traceable attempt budget                          |
| Fresh idempotency key per attempt | duplicates remain possible                | one stable intent ID across all attempts                        |
| Retry after deadline/cancel       | work nobody wants consumes capacity       | propagate remaining deadline and cancellation                   |
| Retry while holding locks/tx/pool | resource exhaustion spreads failure       | close scope before delay/re-attempt                             |
| Hedging writes                    | concurrent ambiguous duplicates           | restrict hedging to safe/read-equivalent operations with budget |

Record logical operation ID, attempt ordinal, parent layer, endpoint, per-attempt timeout,
backoff/server delay, classification evidence and final outcome. Keep metric labels bounded;
high-cardinality IDs belong in traces/logs.

## References

- [Retry in Java](references/retry-in-java.md) — when to retry at all as a decision block,
  full-jitter computed correctly, a deadline-aware loop that classifies on a sealed outcome
  type, a retry budget, and the Resilience4j and Spring Retry settings that matter with the
  default that is usually wrong. Read before writing or reviewing retry code.
- [Retry failure modes](references/retry-failure-modes.md) — the storm, layered
  amplification, the non-idempotent write retried after a timeout, retry without a budget,
  retry holding a resource, and the metric that makes each visible with its shape during an
  incident. Read when a dependency's load rises as its success rate falls, or when assessing
  an existing policy's blast radius.
