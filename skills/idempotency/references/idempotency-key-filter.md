# An idempotency-key filter, and the four cases it must handle

Four cases, not two: first request, duplicate of a completed request, duplicate of a
request still in flight, and duplicate with a different payload under the same key.

## The store

```java
// One row per key. status distinguishes "claimed" from "answered".
// PRIMARY KEY (scope, key) — the uniqueness is what makes the claim atomic.
record IdempotencyRecord(
        String scope, String key, String payloadHash,
        Status status, Integer httpStatus, String responseBody,
        Instant createdAt, Instant expiresAt) {
    enum Status { IN_FLIGHT, COMPLETED }
}
```

## The claim — conditional insert, not check-then-act

```java
// Returns true iff this caller won the claim. One statement, no read first.
boolean claim(String scope, String key, String payloadHash, Instant expiresAt) {
    int inserted = jdbc.update("""
        INSERT INTO idempotency (scope, key, payload_hash, status, created_at, expires_at)
        VALUES (?, ?, ?, 'IN_FLIGHT', now(), ?)
        ON CONFLICT (scope, key) DO NOTHING
        """, scope, key, payloadHash, Timestamp.from(expiresAt));
    return inserted == 1;
}
```

`ON CONFLICT DO NOTHING` returns an affected-row count of 0 for the loser. A store without
upsert syntax gives the same shape by catching the unique-constraint violation — a caught
`DuplicateKeyException` is a _result_ here, not an error. Redis:
`SET scope:key <token> NX PX <ttl>` returns nil to the loser.

## The filter

```java
public ResponseEntity<?> handle(String key, Request request) {
    String hash = sha256(canonical(request));
    Instant expiry = Instant.now().plus(RETENTION);

    if (store.claim(SCOPE, key, hash, expiry)) {
        try {
            var response = service.execute(request);          // the side effect
            store.complete(SCOPE, key, response.status(), response.body());
            return response;
        } catch (RuntimeException e) {
            store.release(SCOPE, key);   // let the retry through; see "the crash case"
            throw e;
        }
    }

    var existing = store.get(SCOPE, key).orElseThrow();
    if (!existing.payloadHash().equals(hash)) {
        return ResponseEntity.status(422).body(problem("key reused with a different body"));
    }
    return switch (existing.status()) {
        case COMPLETED -> ResponseEntity.status(existing.httpStatus())
                                        .body(existing.responseBody());   // replay
        case IN_FLIGHT -> ResponseEntity.status(409)
                                        .header("Retry-After", "1")
                                        .body(problem("original request still in flight"));
    };
}
```

Notes on the four cases:

- **Completed duplicate** replays the original status and body — no re-execution, no
  conflict. The client that timed out and retried gets its answer.
- **In-flight duplicate** justifies the whole design. It cannot be answered (the answer
  does not exist yet) and must not execute. `409` with `Retry-After` is the honest reply;
  blocking until the winner finishes is the alternative and costs a held request thread.
- **Different payload, same key** is a client defect; the payload hash makes it detectable.

## The crash case

If the process dies between `claim` and `complete`, the row is left `IN_FLIGHT` and every
retry gets a conflict until the row expires. Two mitigations, and they are different
decisions:

- **Bound `IN_FLIGHT`** with a short lease (seconds, from the operation's p99.9) separate
  from the record's retention, and treat an expired lease as reclaimable. This admits a
  duplicate side effect if the original was merely slow, not dead.
- **Claim and side effect in one transaction** when both are in the same database. Then the
  crash rolls the claim back with the work, and there is no stale `IN_FLIGHT` at all. This
  is strictly better and is unavailable only when the side effect is external.

## When the dedup store is unavailable — make it a decision

```text
Fail closed (reject the request) when:
- the side effect moves money, issues an entitlement, or is externally visible and
  irreversible
- a duplicate requires manual reconciliation
- the caller can retry (a queue consumer, a client with a retry policy)

Fail open (execute without deduplication) when:
- the side effect is naturally idempotent anyway, and the key is defence in depth
- unavailability of the whole endpoint is a worse outcome than a rare duplicate
  (a duplicated notification, an analytics event)
- and only if a duplicate is detectable downstream

Neither is a default. An unstated choice is fail-open by accident, because an exception
from the dedup store usually propagates to a 500 in one deployment and is swallowed in
another.
```

## Testing

- **Concurrency, not repetition.** Two virtual threads, one `CyclicBarrier`, one key;
  assert exactly one side effect and two responses with the same status and body. A
  sequential double-call test passes against a check-then-act implementation and is
  therefore worthless here.
- **Crash between claim and complete.** Testcontainers with the real database, abort the
  process (or throw from a test-only hook) after `claim`, restart, retry, and assert the
  side effect happened exactly once across both runs.
- **Expiry.** Advance an injected `Clock` past the retention and assert the retry executes
  again — this is the behaviour retention actually buys, and it is usually untested.
