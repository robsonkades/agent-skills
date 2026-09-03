# An idempotency-key protocol

There are five states to reason about: first request, concurrent duplicate, completed
duplicate, key reused for a different operation, and an attempt whose external outcome is
unknown. A boolean `processed` flag cannot represent the last case.

## Durable record

```java
record IdempotencyRecord(
        String scope,
        String key,
        String fingerprint,
        Status status,
        long attemptEpoch,
        String downstreamOperationId,
        Integer httpStatus,
        String resultReference,
        Instant leaseUntil,
        Instant createdAt,
        Instant expiresAt) {
    enum Status { PENDING, UNKNOWN, COMPLETED, REJECTED }
}
```

The primary key is `(scope, key)`. Keep an operation fingerprint to reject key reuse with
different semantics. `resultReference` may identify the created resource or durable business
result; persist an exact body only when it is bounded, non-secret and valid to replay.

## Case 1: local mutation in the same database

This is the strongest and simplest form. One database transaction:

1. conditionally inserts the idempotency row or locks/reads the existing row;
2. verifies the fingerprint;
3. applies the business mutation and any transactional outbox record;
4. stores the terminal result;
5. commits everything together.

```java
@Transactional
Response handleLocal(Command command) {
    var key = scoped(command);
    var claimed = records.insertIfAbsent(key, fingerprint(command));
    if (!claimed) return replayOrWait(records.currentForUpdate(key), command);

    var result = domain.apply(command); // same transaction and database
    outbox.add(eventsFrom(result));      // same commit, if an external publication follows
    records.complete(key, stableResult(result));
    return response(result);
}
```

The insert must be a unique constraint/conditional write, never `exists()` followed by
`insert()`. Do not place the claim in a `REQUIRES_NEW` transaction: claim-then-crash would
suppress work that never committed. A transaction rollback removes both claim and mutation.

## Case 2: external side effect

No local transaction can atomically commit a remote charge, email or entitlement. Use a
durable operation state machine:

1. atomically claim `(scope, key)` as `PENDING` and allocate a stable downstream operation
   ID;
2. call downstream with that same ID on every retry;
3. on confirmed success, persist `COMPLETED` and the stable result;
4. on a definite pre-dispatch rejection, persist `REJECTED` or make the operation retryable;
5. on timeout, disconnect, cancellation or crash, persist/retain `UNKNOWN` and query or
   reconcile downstream by operation ID;
6. only retry an unknown call when downstream deduplicates that same operation ID or when
   reconciliation proves it did not apply.

```java
try {
    var result = payments.charge(request, record.downstreamOperationId());
    records.completeIfOwner(key, attemptEpoch, stableResult(result));
} catch (DefinitePreDispatchFailure e) {
    records.markRetryableIfOwner(key, attemptEpoch, evidence(e));
} catch (TimeoutException | IOException | CancellationException e) {
    records.markUnknownIfOwner(key, attemptEpoch, evidence(e));
    reconciliation.enqueue(key);
}
```

**Never delete the claim merely because `execute()` threw.** The peer may have applied the
effect before its acknowledgement was lost. Releasing the row turns ambiguity into a second
charge on the next retry.

## Concurrent duplicates

After losing the conditional claim:

- reject a different fingerprint without leaking another tenant's data;
- replay/reconstruct the terminal outcome for `COMPLETED` or `REJECTED`;
- for `PENDING`/`UNKNOWN`, return a documented processing response (often `202` plus an
  operation-status URI), ask the client to retry, or wait through a bounded notification
  mechanism;
- do not hold a database lock or platform thread while waiting on remote work.

An HTTP `409` can be an API choice, but it is not inherently the one correct status and may
mislead clients into treating an in-progress retry as terminal conflict. Whatever contract is
chosen must preserve the same resource/operation identity and publish retry guidance.

## Leases and takeover

A lease elects the current worker; it does not make the external effect exactly once. Size it
from a deadline plus scheduling/GC/storage margin, renew it conditionally, and increment an
`attemptEpoch` on takeover. Completion writes compare the epoch so a paused old worker cannot
overwrite newer local state. Both workers still use the same downstream operation ID because
the old attempt may finish late.

Takeover is safe only when one of these holds:

- local mutation and claim share one rolled-back transaction;
- downstream enforces the stable idempotency key;
- status lookup proves no effect before retry;
- a compensating/reconciliation process can tolerate both outcomes.

TTL expiry is not a takeover protocol. Do not physically delete a live `PENDING`/`UNKNOWN`
row merely because wall-clock retention elapsed.

## Dedup-store outage decision

```text
Fail closed when:
- the effect is irreversible/high value, or a duplicate violates a safety invariant;
- the caller can retry/status-check and availability loss is preferable to ambiguity.

Fail open only when:
- the operation is independently idempotent downstream, or duplicates are explicitly
  acceptable, detectable and repairable;
- the business owner accepted that semantic degradation.
```

A Redis `SET NX` can coordinate concurrent attempts, but eviction, failover and expiry mean
it is not by itself a durable exactly-once boundary. A database unique constraint only guards
effects committed in that same transaction. Name the guarantee actually provided.

## Testing and observability

- race many requests with the same key and assert one business effect plus equivalent
  outcomes; also race the same key with different fingerprints;
- crash after claim, after remote apply/before acknowledgement, and after acknowledgement/
  before local completion; verify downstream state after restart;
- pause the first worker past lease expiry, let a second take over, then release the first;
  assert epoch fencing and one downstream operation ID;
- test expiry, DLQ/operator replay beyond expiry, rolling-version fingerprint compatibility,
  dedup-store failover and cleanup competing with live claims;
- measure new claims, completed replays, in-flight duplicates, fingerprint conflicts,
  unknown age, reconciliation outcomes, takeovers and rows/bytes by status.

Mocks that merely throw before the side effect cannot reproduce an unknown outcome. Use a
proxy or test dependency that applies the operation and then drops the acknowledgement.

## Primary references

- [RFC 9110 §9.2.2: Idempotent Methods](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2)
- [IETF HTTPAPI Idempotency-Key header draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)
- [Stripe API: idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [PostgreSQL unique constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS)
