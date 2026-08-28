# Design review

The questions to ask of any component that crosses a process boundary, in an order that makes
each one answerable by the time it is asked. Each routes to the skill that owns the decision.
Answers are recorded, not assumed — an unanswered question here is a defect scheduled for later.

## 1. The boundary and the fault model

- Which boundaries does this cross — process, host, AZ, region, organisation?
- Which fault classes do we tolerate? Is this crash-stop or crash-recovery? → `failure-models`
- For every remote call: what happens on the **unknown** outcome, where the request may have been
  applied and we cannot tell? "Retry and hope" is an answer only if the next question is answered.

## 2. Repeat-safety, before anything about retries

- Is each operation naturally idempotent, guarded by state, or does it need a key and a dedup
  store? → `idempotency`
- If a key: what is its source, its scope, and its retention? What does a duplicate return?
- Only once this is settled: what is retryable, with what backoff and what budget?
  → `retries-and-backoff`

## 3. Time

- What is the deadline for the whole operation, and how is it propagated to each hop?
  → `timeouts-and-deadlines`
- Does every remote call have a bound? Does cancellation actually reach the callee, or does the
  caller just stop waiting?
- Does the retry policy's worst case fit inside the caller's budget? Compute it; do not estimate.

## 4. The contract

- What is promised: the operation, the error surface, and which errors are retryable?
  → `rpc-and-api-contracts`
- Can an old consumer read a new producer's payload, and the reverse? Both directions must be
  answered, because a rolling deploy runs both versions at once.
- Is the guarantee stated with a scope — at-least-once, per-partition ordering, a named
  consistency model? → `delivery-semantics`, `consistency-models`

## 5. State and scale

- What in-process state exists, and what breaks at two replicas? → `stateless-service-design`
- Is partitioning actually needed, or is this a cache or a read replica?
  → `sharding-and-partitioning` (its decision block should be able to say no)
- If partitioned: what is the key, how uniform is it _by traffic_, and what query does it forbid?
- Is there singleton work? Can it be partitioned instead of elected? → `leader-election`

## 6. Overload

- What happens at twice the expected load? At ten times?
  → `rate-limiting-and-load-shedding`
- Is every queue and every pool bounded? Name the bound for each.
- Which dependencies are required and which are optional, and what is the defined degraded
  behaviour of each optional one? → `cascading-failures`
- Does a failing dependency stop being called, and does the caller have something useful to do
  with the fast failure? → `circuit-breakers`

## 7. Lifecycle

- What do the three probes check, and does liveness depend on anything outside the pod?
  → `kubernetes-service-lifecycle`
- On SIGTERM: what drains, in what order, and does the grace period cover it? Include the
  non-HTTP work — consumers, schedulers, executors, leases.
- What does a rolling deploy do to in-flight work and to the leader?

## 8. Observability

- Can one request be followed end to end? → `distributed-tracing-design`, `structured-logging`
- What is the SLI, measured where the user crosses the boundary? → `slo-and-alerting`
- Is there a signal for **absence** — a consumer that stopped, a job that has not run? Error-rate
  monitoring cannot see it. → `distributed-failure-catalogue`
- Has anyone computed the cardinality budget of the new metrics? → `metrics-and-cardinality`

## 9. Proof

- Which of these answers has a test? → `distributed-systems-testing`
- At minimum: duplicate delivery, out-of-order delivery, dependency slow, dependency down, crash
  mid-operation, and a rolling deploy with two versions live.
- For each failure test, what invariant is asserted? "No exception" is not an invariant.

## Red flags that end a review early

- No fault model written down.
- "Exactly-once" claimed with no boundary named.
- A retry policy over an operation whose repeat-safety nobody has established.
- A distributed lock protecting a resource that cannot check a fencing token.
- An unbounded queue, an unbounded executor, or a timeout of zero meaning infinite.
- Sharding proposed with no measured growth curve.
- A liveness probe that checks a database.
