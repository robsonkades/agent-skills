---
name: retries-and-backoff
description: >
  Retry as a policy with a cost: classifying a failure as transient, permanent or ambiguous
  before retrying anything; why a timeout is ambiguous and safe to retry only under
  idempotency; exponential backoff with full jitter; retry budgets rather than attempt
  counts as the only real bound on amplification; retrying at exactly one layer; and
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

1. **Classify before you retry.** Transient (the operation definitely did not happen),
   permanent (it never will with this input), ambiguous (unknown). The classification must
   come from the contract — a status code, a typed error, an explicit flag — never from
   parsing a message.
2. **Resolve the ambiguous class first.** If the operation is not idempotent, either make it
   so or do not retry it. There is no third option that preserves correctness.
3. **Choose one layer to retry at** — the layer that knows the operation's idempotency —
   and set attempts to 1 explicitly everywhere else, so the decision is visible in config.
4. **Use exponential backoff with full jitter**, capped. Then check the total against the
   caller's remaining deadline before the policy ships.
5. **Add a retry budget.** Cap retries as a fraction of successful traffic; attempt counts
   bound one call site, budgets bound the fleet.
6. **Honour what the server said.** `Retry-After` on 429 and 503 overrides your backoff, and
   a dependency shedding load must not be retried harder.
7. **Instrument ratios, not counts** — attempts per logical call, budget rejections, and
   the dependency's inbound rate against yours. See `references/retry-failure-modes.md`.

## Rules

- Retryability is a property the contract carries, not one the client infers.
  `if (e.getMessage().contains("timeout"))` is the shape to delete; rpc-and-api-contracts
  owns putting the flag in the contract and java-exception-design owns modelling it on the
  type.
- By RFC 9110, GET, HEAD, PUT, DELETE, OPTIONS and TRACE are idempotent; POST and PATCH are
  not. A POST retried after a timeout needs an idempotency key before it needs a policy.
- Status classification: 408, 429, 502, 503 and 504 are retryable; 400, 401, 403, 404, 405
  and 422 are not; 409 depends on the resource's semantics. **500 is a defect more often
  than a blip** — retrying it amplifies a bug and rarely fixes anything.
- Full jitter is `sleep = random(0, min(cap, base × 2^attempt))` — a uniform draw over the
  whole window, not the window plus a small wobble.
- Unjittered backoff synchronises clients. They all failed at the same instant, so they all
  wake at the same instant; the wave lands precisely while the dependency is recovering.
- Attempt counts do not bound amplification across layers. L layers each retrying N times is
  N^L requests at the bottom: three layers of three attempts is 27.
- A retry budget does bound it: a token bucket refilled by successes, one token per retry,
  sized at a fraction of success traffic (10% is a common starting point). Amplification is
  then bounded near 1.1× whatever the failure rate. gRPC calls this retry throttling; Envoy
  calls it a retry budget; Resilience4j's retry module has no equivalent.
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
  which is the property that makes this the usual choice. `Breaker(Retry(call))` records one
  outcome per logical call, so the threshold means what it says, but the retries keep reaching
  a dependency the breaker would already have stopped calling. Tripping policy and the full
  trade-off are circuit-breakers.
- State what a retry achieves and what it does not: it lowers the failure rate for
  independent transient faults, at the cost of extra load, extra latency inside the caller's
  own SLA, and duplicates whenever the ambiguous class is retried without idempotency. It
  makes nothing reliable.

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
