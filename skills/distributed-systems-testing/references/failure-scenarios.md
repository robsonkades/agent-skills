# Failure scenarios every distributed component should answer for

Use this as a coverage audit: for each scenario, either point at the test or record the
decision not to have one. Each entry gives what to **inject**, the **invariant** to assert,
and the **wrong assertion** that makes the test pass without proving anything.

## 1. Dependency down

- **Inject** — stop the container, or point the client at a closed port. Both matter: a
  refused connection and a black-holed one fail on different timeouts.
- **Invariant** — the caller fails within its own budget, the fallback ran if there is one,
  and no partial state was written. In-flight counters return to zero afterwards.
- **Wrong assertion** — `assertThrows(Exception.class, …)`. It passes whether the caller
  waited 50 ms or 50 s, and says nothing about the state left behind.

## 2. Dependency slow

- **Inject** — latency above the configured timeout via a proxy toxic. This is the mode that
  causes outages, and the one a stopped container never reproduces.
- **Invariant** — the caller's own latency is bounded by its timeout, the resource it held
  (connection, permit, thread) is released, and the breaker's slow-call path recorded it.
- **Wrong assertion** — asserting only that the call eventually returned. Assert the elapsed
  time against the bound, and assert the pool's available count afterwards.

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
- **Invariant** — exactly one side effect, and both callers observe the same response with
  the same status. Delivery is at-least-once; the application is what makes the outcome
  effectively-once (`idempotency`, `delivery-semantics`).
- **Wrong assertion** — only the sequential case. It passes against `if (exists) return;`
  followed by an insert, which is precisely the shape that duplicates under concurrency.

## 5. Out-of-order delivery

- **Inject** — shuffle the messages within the set whose relative order the design does not
  guarantee, over many seeds.
- **Invariant** — the final state is identical across orders, or is one of an enumerated set
  of legal states. Where a version or timestamp guard exists, assert that a stale update is
  rejected rather than silently applied.
- **Wrong assertion** — testing only the intended order. Ordering holds per partition, never
  globally (`message-ordering-and-partitioning`), and any cross-key sequence is unordered.

## 6. Crash mid-operation

- **Inject** — kill the process or container between the side effect and the acknowledgement,
  and separately between the write and the commit. Then restart it.
- **Invariant** — after recovery there is exactly one business record, no orphaned lock or
  lease, and any partially written state is either completed or reconciled. This is the
  crash-recovery model made concrete (`failure-models`).
- **Wrong assertion** — that the service restarts cleanly. Restarting is not the property;
  the state left behind by the interrupted operation is.

## 7. Lease expiry under a stall

- **Inject** — pause the holder's process or container (not kill it) for longer than the lease
  duration, let a second holder acquire, then resume the first.
- **Invariant** — the resumed holder's writes are **rejected**, because the protected resource
  enforces a fencing token. If they are accepted, the lock does not provide mutual exclusion
  and the test has found the defect it exists for (`distributed-locks-and-leases`).
- **Wrong assertion** — that the second holder acquired the lock. That always works; the
  question is what the first one is still allowed to do.

## 8. Rolling deploy with mixed versions

- **Inject** — run the old and new versions simultaneously against one database and one topic:
  old producer with new consumer, and new producer with old consumer. Both directions.
- **Invariant** — neither combination loses a message, throws on deserialisation, or writes a
  value the other cannot read. Unknown fields are ignored rather than fatal; a new enum
  constant does not crash an old consumer (`rpc-and-api-contracts`).
- **Wrong assertion** — a contract test against the new version alone. It proves the current
  pair agrees, not that the mixed window survives.

## 9. Overload and rejection

- **Inject** — offered load above the configured concurrency limit or queue bound.
- **Invariant** — rejection is the designed response (a 503 with `Retry-After`, a fallback
  value), it is counted, and goodput stays flat rather than collapsing. Nothing is queued
  without bound (`rate-limiting-and-load-shedding`, `concurrency-limiting-and-bulkheads`).
- **Wrong assertion** — that all requests eventually succeeded. Success under overload usually
  means an unbounded queue, which is the defect.

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
fencing check — to confirm it can detect the fault it was written for.
