# Choosing and scoping the idempotency key

The key answers one question: **which two arrivals are the same operation?** Every failure
below is that question answered wrongly in one direction or the other — deduplicating two
distinct intents, or failing to deduplicate two copies of one.

## Key source

| Source                                                                                                                                   | What it identifies  | Use when                                                                                     | Failure it produces                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Client-supplied request id (`Idempotency-Key` header, a UUID the client generates **once per intent** and reuses across its own retries) | the caller's intent | the caller is code you can specify, and retries come from the caller                         | a client that regenerates the id per attempt deduplicates nothing; a client that reuses one id across genuinely distinct intents suppresses real work                                                                          |
| Deterministic hash of the canonical business payload                                                                                     | the content         | no id can be added to the protocol, and identical content genuinely means the same operation | two legitimately identical operations (the same customer buying the same item twice in a minute) collapse into one. Only safe when the payload contains something that varies per intent — an order number, a client timestamp |
| Business-natural key already in the domain (order number, invoice number, external transaction reference)                                | the domain object   | the domain already has a unique identifier for the thing being created                       | none particular to the key; this is the strongest option and needs no separate dedup table, because a unique constraint on the business table _is_ the dedup store                                                             |
| Broker message id / delivery id                                                                                                          | one _delivery_      | last resort, and only against redelivery of the same message                                 | an upstream that republishes after its own crash emits a **new** message id for the same intent, and both are processed. It also cannot deduplicate across a topic migration or a producer restart                             |

Ranking: business-natural key > client request id > payload hash > broker message id. The
broker id is last because it is the only one that changes when the business intent does
not.

## Decision block — synthetic key and dedup store, or something cheaper

```text
Use a synthetic idempotency key with a dedup store when:
- the operation has an externally visible, irreversible side effect (money, entitlement,
  outbound message) and no natural unique key exists for it
- duplicates arrive from a path you do not control (an at-least-once consumer, a public
  API with client retries)
- the caller can supply, or you can derive, an identifier that is stable across the
  caller's retries and distinct across intents

Avoid a synthetic key when:
- the operation is already naturally idempotent — a full-representation PUT, an absolute
  SET, a delete, an insert that a unique constraint already guards
- the guard is available in the domain state itself: a transition legal only from one
  state (PENDING → CONFIRMED) is self-deduplicating and needs no key
- the only identifier available is a broker delivery id and the upstream can republish;
  the key would give false confidence rather than deduplication

Prefer a unique constraint on the business table instead when:
- the domain already carries a unique identifier for the created object (order number,
  invoice number, external transaction reference). One constraint replaces the dedup
  table, the retention policy and the cleanup job

Prefer an absolute write instead when:
- the operation is an increment or an append that can be restated as a target value plus
  a version predicate. Rewriting the operation is cheaper than deduplicating it
```

## Scope

The scope is the namespace the uniqueness holds within. Getting it wrong is the most common
production defect in an otherwise correct implementation.

| Scope                                  | Meaning                                                             | Choose when                                                                               | Failure                                                                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per client (tenant/API key) + endpoint | two arrivals collide only for the same caller on the same operation | almost always — this is the default                                                       | none material; costs a slightly wider index                                                                                                                                     |
| Per endpoint, global across clients    | any caller's key can collide with any other's                       | never for client-supplied keys                                                            | one tenant's UUID collision or deliberate replay suppresses another tenant's request. It is also an information leak: the replayed response was computed for a different caller |
| Per client, global across endpoints    | one key namespace per caller                                        | when the client's retry library attaches one id per logical operation regardless of route | a client reusing an id across two different operations gets the first operation's response back from the second endpoint                                                        |
| Per consumer group / per handler       | a broker message deduplicated once per independent consumer         | fan-out, where several consumers must each process the message                            | a shared scope makes the first consumer's processing suppress every other consumer's                                                                                            |

Encode the scope in the primary key (`PRIMARY KEY (scope, key)`), not in application code
that filters after the read — the uniqueness must be the database's, or the concurrent case
is unprotected.

## Retention

Retention is bounded below by the client's retry horizon and above by the lifetime of the
business record.

| Retention                                                                         | Consequence                                                                                                                                 |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Shorter than the client's total retry window (including a DLQ replay hours later) | the retry executes again. The dedup store is present, passes tests, and does nothing at the moment it exists for                            |
| Longer than the business record it protects                                       | a legitimate re-submission after the record was deleted or archived is suppressed with no explanation, and the row is a permanent tombstone |
| Unbounded                                                                         | the table grows without limit and its unique index eventually dominates write latency                                                       |

Set it from the observable: the maximum age at which a retry can still arrive. That is the
client's retry policy (`retries-and-backoff`) plus, if messages can be replayed from a
dead-letter queue, the operational latency of that replay (`poison-messages-and-dlq`).
Twenty-four hours is a common answer; the point is that it is derived, not guessed.

Delete expired rows with a bounded batch job, not a `DELETE … WHERE expires_at < now()` over
the whole table — the second one is a lock-holding scan that fires during the same incident
that grew the table.

## Payload binding

Store a hash of the canonical payload beside the key. Without it, a client that reuses a key
with a different body silently receives the first body's response, and the mismatch is
undetectable from the server side. Canonicalise before hashing (sort keys, fix number
formatting) or the same logical payload serialised twice produces two hashes.

## What the dedup store's own consistency must be

The conditional insert has to be atomic _and_ linearizable with respect to the reads that
follow it — a claim that succeeds on one replica while a concurrent claim succeeds on
another is not a claim. A single-primary relational store gives this on a primary-key
constraint. A multi-primary or eventually consistent store does not, without an explicit
compare-and-set on a single owner for the key. The vocabulary for that requirement is
`consistency-models`.
