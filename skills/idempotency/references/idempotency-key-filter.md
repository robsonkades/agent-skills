# An idempotency-key protocol

There are five states to reason about: first request, concurrent duplicate, completed
duplicate, key reused for a different operation, and an attempt whose external outcome is
unknown. A boolean `processed` flag cannot represent the last case.

## Durable record

The Java record uses Java 17-compatible syntax and requires `java.time.Instant`; it is a
schema sketch, not a persistence implementation. Handler snippets below are pseudocode with
application/framework dependencies. Verify transaction interception, propagation and isolation
against the target stack rather than treating `@Transactional` alone as an atomicity proof.

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
    enum Status { PENDING, UNKNOWN, RETRYABLE, COMPLETED, REJECTED }
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
    if (!claimed) return replayOrProcessing(records.currentForUpdate(key), command);

    var result = domain.apply(command); // same transaction and database
    outbox.add(eventsFrom(result));      // same commit, if an external publication follows
    records.complete(key, stableResult(result));
    return response(result);
}
```

The insert must be a unique constraint/conditional write, never `exists()` followed by
`insert()`. Do not place the claim in a `REQUIRES_NEW` transaction: claim-then-crash would
suppress work that never committed. A transaction rollback removes both claim and mutation.
The replay helper checks the fingerprint and returns a terminal result or processing response;
it does not wait for remote completion while holding this transaction/lock. Send success only
after commit; commit acknowledgement loss requires retrying with the same key.

Implement the repository contract with the selected database's conflict and isolation semantics.
For example, PostgreSQL 17 `INSERT ... ON CONFLICT (scope, key) DO NOTHING RETURNING ...`
can arbitrate the claim. At Read Committed a conflicting row may not appear in that statement's
snapshot; a subsequent read gets a new snapshot. Do not catch a plain unique-violation exception
and continue querying an aborted transaction. Handle serialization/rollback retry and a row
removed by concurrent cleanup without interpreting missing state as permission for an unguarded
effect. Test this against the real database, not just an in-memory repository.

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
6. only retry an unknown call when downstream deduplicates that same operation ID throughout
   the retry window, or reconciliation proves both non-application and that the prior attempt
   cannot subsequently apply. An eventually consistent or point-in-time "not found" is insufficient.

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
Persisted `PENDING`/`UNKNOWN` records must drive recovery even if updating state or enqueueing
reconciliation fails; use a durable scanner/outbox or equivalent recovery path. Handle an epoch
comparison that affects zero rows as loss of ownership and reload state, not successful completion.

## Concurrent duplicates

After losing the conditional claim:

- reject a different fingerprint without leaking another tenant's data;
- replay/reconstruct the terminal outcome for `COMPLETED` or `REJECTED`;
- for `PENDING`/`UNKNOWN`, return a documented processing response (often `202` plus an
  operation-status URI), ask the client to retry, or wait through a bounded notification
  mechanism;
- for `RETRYABLE`, atomically claim a new attempt epoch before dispatch; preserve the same
  operation ID and the evidence that makes retry safe;
- do not hold a database lock while waiting on remote work. Bound admitted waiters and their
  total wait deadline using the project's execution model; a suitably bounded platform-thread
  wait does not by itself require a virtual-thread or asynchronous redesign.

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
- downstream enforces the stable idempotency key for all overlapping/replayed attempts;
- authoritative reconciliation proves no effect and rules out later application by the old attempt.

If the business instead tolerates duplicate effects followed by compensation, document that
weaker recovery guarantee explicitly; it is not idempotent takeover. Check provider retention
as well as local TTL. For example, Stripe documents that a reused key creates a new request after
the old key has been pruned; retaining the local operation ID longer does not extend that promise.

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
- test a status lookup returning absent while an old request is still capable of applying,
  provider key expiry, credential rotation, and cross-tenant attempts to replay another result;
- measure new claims, completed replays, in-flight duplicates, fingerprint conflicts,
  unknown age, reconciliation outcomes, takeovers and rows/bytes by status.

Mocks that merely throw before the side effect cannot reproduce an unknown outcome. Use a
proxy or test dependency that applies the operation and then drops the acknowledgement.

## Primary references

- [RFC 9110 §9.2.2: Idempotent Methods](https://www.rfc-editor.org/rfc/rfc9110#section-9.2.2)
- [IETF HTTPAPI Idempotency-Key header draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) — revision 07 is an expired Internet-Draft, not a published HTTP standard; use the actual API's contract.
- [Stripe API: idempotent requests](https://docs.stripe.com/api/idempotent_requests)
- [PostgreSQL unique constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS)
- [PostgreSQL 17 conflict handling](https://www.postgresql.org/docs/17/sql-insert.html)
- [PostgreSQL 17 transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html)
