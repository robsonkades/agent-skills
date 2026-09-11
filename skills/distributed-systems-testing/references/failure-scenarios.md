# Failure scenarios every distributed component should answer for

Use this as a coverage audit: for each scenario, either point at the test or record the
decision not to have one. Each entry gives what to **inject**, the **invariant** to assert,
and the **wrong assertion** that makes the test pass without proving anything.

## 1. Dependency down

- **Inject** — use a closed port for refusal and a controlled packet DROP for a blackhole.
  Stopping a container alone does not establish which network failure the client observes.
- **Invariant** — the caller returns the contracted outcome within its budget, including a
  fallback only where required. Assert permitted durable/pending state and recovery separately:
  loss of a response need not mean non-application. Observe remaining work and its cleanup bound.
  When the transaction contract requires atomic rollback, assert that strict state invariant at
  its authority; a timeout alone neither proves nor relaxes it.
- **Wrong assertion** — `assertThrows(Exception.class, …)`. It passes whether the caller
  waited 50 ms or 50 s, and says nothing about the state left behind.

## 2. Dependency slow

- **Inject** — latency above the configured timeout via a proxy toxic. This is the mode that
  causes outages, and the one a stopped container never reproduces.
- **Invariant** — caller latency meets the applicable deadline. Track client cleanup and actual
  protected work separately through their declared bounds; do not release a work permit merely
  because the caller stopped waiting. If a breaker is configured, assert the outcome recording
  required by its predicate and decorator order, not an assumed slow-call event.
- **Wrong assertion** — asserting only that the call eventually returned. Assert the elapsed
  time against the bound and observe release at the resource's actual lifetime boundary.

## 3. Dependency failing intermittently

- **Inject** — a fixed failure rate (say 30%) across a few hundred calls, mixing retryable
  and non-retryable outcomes.
- **Invariant** — attempts per logical call stay within the retry budget; non-retryable
  failures were not retried at all; the downstream received no more than the multiplier
  allows. Counting requests at the stub is what makes this falsifiable.
- **Wrong assertion** — asserting the overall success rate improved. Amplification, not
  success, is the property under test (`retries-and-backoff`).

## 4. Duplicate delivery

- **Inject** — deliver the same message or request twice: sequentially, and then two copies
  concurrently released by a barrier.
- **Invariant** — exactly one side effect, and both callers receive the documented duplicate
  response (replayed success or an explicit in-progress/conflict result, as the contract permits).
  Delivery is at-least-once; the application is what makes the outcome
  effectively-once (`idempotency`, `delivery-semantics`).
- **Wrong assertion** — only the sequential case. It passes against `if (exists) return;`
  followed by an insert, which is precisely the shape that duplicates under concurrency.

## 5. Out-of-order delivery

- **Inject** — shuffle the messages within the set whose relative order the design does not
  guarantee, over many seeds.
- **Invariant** — the final state is identical across orders, or is one of an enumerated set
  of legal states. Where a version or timestamp guard exists, assert that a stale update is
  rejected rather than silently applied.
- **Wrong assertion** — testing only the intended order. Derive ordering scope from the actual
  protocol; partitioned brokers often order within a partition, while retries, consumer execution
  and other systems have different guarantees (`message-ordering-and-partitioning`).

## 6. Crash mid-operation

- **Inject** — kill the process or container between the side effect and the acknowledgement,
  and separately between the write and the commit. Then restart it.
- **Invariant** — within the recovery budget, accepted work and protected effects satisfy the
  declared delivery/commit contract, with no unintended duplicate or lost accepted effect.
  Pending state, locks and leases reach their specified terminal or recoverable condition;
  a crash before commit need not leave a business record (`failure-models`).
- **Wrong assertion** — that the service restarts cleanly. Restarting is not the property;
  the state left behind by the interrupted operation is.

## 7. Lease expiry under a stall

- **Inject** — pause the holder's process or container (not kill it) for longer than the lease
  duration, let a second holder acquire, then resume the first.
- **Invariant** — the protected resource preserves the stated business invariant despite a
  stale holder. For fencing, wait until the successor's claim is accepted by the resource, then
  release the stale action and assert rejection. A resource-local conditional transition or an
  explicitly repeat-safe effect may satisfy the contract without a fencing token; assert that
  mechanism's invariant (`distributed-locks-and-leases`).
- **Wrong assertion** — only that the second holder acquired the lock. That observes a grant,
  not what the first holder is still able to do at the protected resource.

## 8. Rolling deploy with mixed versions

- **Inject** — exercise reader/writer and application/store pairs reachable during the actual
  rollout, rollback and retained-history replay. Include both directions when both can occur;
  a staged rollout can deliberately exclude a pair if that exclusion is verified.
- **Invariant** — required data, effect and response semantics survive each reachable pair,
  including deliberate rejection where the contract requires it. Do not mandate ignoring unknown
  fields or enums. Use `schema-evolution-and-compatibility` for serialized wire pairs and
  `rpc-and-api-contracts` for API behavior; relational DDL and application/backfill/cutover safety
  require engine behavior and the project's migration conventions/tests as separate evidence.
- **Wrong assertion** — a contract test against the new version alone. It proves the current
  pair agrees, not that the mixed window survives.

## 9. Overload and rejection

- **Inject** — offered load above the configured concurrency limit or queue bound.
- **Invariant** — rejection follows the actual response contract, is counted, and useful work
  stays within the declared degraded-load objective. A flat goodput curve is not universal. Nothing is queued
  without bound (`rate-limiting-and-load-shedding`, `concurrency-limiting-and-bulkheads`).
- **Wrong assertion** — that all requests eventually succeeded without observing arrival,
  queue age/size and completion bounds. Eventual success alone does not establish bounded load handling.

## Auditing coverage

For each component, fill this in; a blank cell is a decision, not an oversight.

```text
Scenario                    Test?   If not, why the risk is accepted
dependency down
dependency slow
intermittent failure
duplicate delivery
out-of-order delivery
crash mid-operation
lease expiry under a stall
mixed versions
overload
```

Two closing rules. **A scenario with no invariant does not need a test yet** — it needs the
invariant written down first, otherwise the test will assert whatever the code currently does.
And **make each test fail once on purpose** — remove the idempotency guard, disable the
fencing check in an isolated test variant — to confirm detection. Never disable production
safeguards merely to validate a test oracle.
