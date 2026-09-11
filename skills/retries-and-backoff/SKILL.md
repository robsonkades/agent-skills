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
failing. It turns one logical operation into multiple attempts. A bounded retry can recover
from an independent transient fault or a temporary shared outage when the next attempt has
useful recovery odds. During sustained overload, extra attempts can instead prolong failure.
It changes the failure distribution and cost; it does not guarantee successful completion.

The decision is made per failure, not per call site: transient, permanent, or **ambiguous**.
The ambiguous class causes the incidents. A timeout is a failure of the wait, not of the
operation: the write may already have been applied. Require replay-safe semantics or
reconciliation evidence before reissuing it; idempotency owns that guarantee.

## Workflow

Match the work to the requested explanation, implementation or policy review. Reuse adequate
configuration and evidence, and retain a sound policy. A narrow arithmetic/contract answer
needs its assumptions and limits, not a new fleet budget, fault campaign or configuration change.

1. **Classify before you retry.** Definite pre-dispatch/rejected, retryable transient,
   terminal for the current intent, and ambiguous outcome need different handling. A typed
   error/status is evidence interpreted with operation semantics—not a universal lookup table.
2. **Resolve the ambiguous class first.** Require safe replay semantics for the same intent,
   or use authoritative status lookup/reconciliation and preserve a durable pending/unknown
   outcome until resolved. A key is one mechanism; conditional protocols can also qualify.
   Blind retry and blind failure are both guesses.
3. **Give one layer ownership of the end-to-end retry budget.** Transport connection retries,
   proxy attempts and application retries may coexist only when their nested attempt/deadline
   budget is explicit and safe; disable hidden defaults elsewhere.
4. **Choose capped full, equal or decorrelated jitter deliberately.** Full jitter is a robust
   default for large correlated fleets; then check total time and attempt timeout against the
   caller's remaining deadline before the policy ships.
5. **Bound aggregate retry work where the policy requires it.** A success-refilled budget is
   one option; preserve an adequate existing admission policy. Attempt counts bound one call
   site; aggregate budgets bound their declared scope, with coordinated grants needed for a
   fleet-wide guarantee.
6. **Respect server guidance within the deadline.** Do not retry before a valid `Retry-After`;
   use at least the greater of local backoff and server delay, unless it cannot fit. Validate/
   reject untrusted or unrepresentable dates. If a valid delay exceeds the allowed wait, stop
   retrying rather than truncating it and retrying early. Another replica may share the quota.
7. **Derive ratios from scoped counters** — attempts per logical call, budget rejections, and
   the dependency's inbound rate against yours. See `references/retry-failure-modes.md`.

## Rules

- Classify from reliable transport phase/outcome evidence and the operation contract.
  Proven non-dispatch or non-application can permit another attempt even without a server
  retryability flag; an exception name or message alone proves neither. Replace
  `if (e.getMessage().contains("timeout"))` with that evidence. rpc-and-api-contracts owns
  the protocol semantics and java-exception-design owns modelling the evidence on the type.
- RFC 9110 defines GET/HEAD/PUT/DELETE/OPTIONS/TRACE method semantics as idempotent, but a
  concrete server may violate them and an idempotent state effect can still return a different
  response. POST/PATCH can be made retry-safe by an operation key/conditional semantics.
- Do not hard-code HTTP status as retryability. 408/425/429/5xx may be retryable for one safe
  operation and ambiguous/terminal for another; 401 may succeed after one credential refresh,
  404 may be eventual, and 409/412 may require reread/recompute rather than replay. The API
  contract must say whether the request could have applied and whether retrying unchanged helps.
- Full jitter is `sleep = random(0, min(cap, base × 2^attempt))` — a uniform draw over the
  whole window, not the window plus a small wobble.
- Unjittered backoff preserves aligned failure cohorts and can concentrate recovery traffic.
  Staggered starts and variable attempt durations need not wake together; inspect the actual
  arrival pattern. Jitter spreads retries but does not create dependency capacity.
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
- Release failed transaction/connection scopes before external dependency backoff; retained
  resources can spread the slowdown through pool exhaustion. A protocol-specific bounded local
  acquisition/statement retry may retain a surrounding scope only if its state remains valid
  and the held-resource cost is explicitly budgeted. It is not permission to reuse a failed
  transaction or hold resources through an unbounded dependency retry.
- Start each retried transaction from fresh transactional state; rollback/release the failed
  attempt before backoff and reread/recompute when the concurrency contract requires it.
- A caller timeout/cancel does not establish that previous work stopped. Propagate cancellation,
  retain accounting until actual completion, and bound any overlapping attempts explicitly.
- Never retry a response already streaming to the caller: bytes delivered cannot be
  withdrawn. Before delivery, bounded buffering may permit retry; after delivery, only an
  explicit resumable/restart protocol can preserve the caller-visible contract.
- Compose retry and breaker deliberately, and state which nesting you chose.
  `Retry(Breaker(call))` presents each attempt to breaker admission and classification;
  `Breaker(Retry(call))` presents the aggregate result/duration while hiding inner attempts
  from that breaker. Recorded success/failure/ignored outcomes, slow calls, minimum samples
  and windows determine tripping, not nesting alone. Do not automatically retry breaker-open
  rejection. A later policy-controlled attempt still needs deadline/budget and breaker
  permission, including half-open probe limits. Tripping policy and the full trade-off are
  circuit-breakers.
- State what a retry achieves and what it does not: it lowers the failure rate for
  recoverable faults when another safe attempt succeeds, at the cost of extra load and latency
  inside the caller's own SLA. Ambiguous replay without safe semantics risks duplicate effects;
  neither duplication nor recovery is guaranteed by the failure class alone.

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
For a material policy decision, report relevant versions, total attempts across layers,
deadline/reserve, retry-safety evidence, observed amplification and remaining validation.
A narrow review can report the supported conclusion and any unresolved evidence. Missing outcome evidence stays unknown; do
not upgrade dependencies or change established retry/API contracts merely to fit an example.

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
