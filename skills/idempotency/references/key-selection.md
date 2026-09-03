# Choosing and scoping the idempotency key

The key answers one question: **which two arrivals are the same operation?** Every failure
below is that question answered wrongly in one direction or the other — deduplicating two
distinct intents, or failing to deduplicate two copies of one.

## Key source

| Source                                                                                                                                   | What it identifies  | Use when                                                                                     | Failure it produces                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Client-supplied request id (`Idempotency-Key` header, a UUID the client generates **once per intent** and reuses across its own retries) | the caller's intent | the caller is code you can specify, and retries come from the caller                         | a client that regenerates the id per attempt deduplicates nothing; a client that reuses one id across genuinely distinct intents suppresses real work                                                                          |
| Deterministic hash of the canonical business payload                                                                                     | the content         | no id can be added to the protocol, and identical content genuinely means the same operation | two legitimately identical operations (the same customer buying the same item twice in a minute) collapse into one. Only safe when the payload contains something that varies per intent — an order number, a client timestamp |
| Business-operation key (order id + operation kind/version, payment attempt id, external transaction reference)                           | one domain intent   | the domain defines a stable, non-recycled identity for this operation                        | an object id alone may collapse distinct operations on the same object; recycled/imported identifiers require namespace and epoch                                                                                              |
| Broker message id / delivery id                                                                                                          | one _delivery_      | last resort, and only against redelivery of the same message                                 | an upstream that republishes after its own crash emits a **new** message id for the same intent, and both are processed. It also cannot deduplicate across a topic migration or a producer restart                             |

There is no universal ranking independent of scope. A non-recycled business-operation ID is
usually strongest; a correctly generated caller intent ID is equally useful at an API
boundary. Payload hash is a lossy fallback because identical content may represent distinct
intents. Broker IDs are suitable only for the documented redelivery identity; producer
republication can create a new ID for the same business operation.

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
- the state predicate alone fully defines the contract and no replayed response or external
  effect must be associated with a particular command. Otherwise combine predicate and key
- the only identifier available is a broker delivery id and the upstream can republish;
  the key would give false confidence rather than deduplication

Prefer a unique constraint on the business table instead when:
- the domain already carries a unique identifier for the created object (order number,
  invoice number, external transaction reference). One constraint replaces the dedup
  table for preventing duplicate rows; retain an operation/result record if the API must
  distinguish retries or replay a stable outcome

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

Retention is bounded below by every accepted replay path; its upper bound is a product,
legal, privacy and storage decision rather than automatically the business record's lifetime.

| Retention                                                                         | Consequence                                                                                                                                     |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Shorter than the client's total retry window (including a DLQ replay hours later) | the retry executes again. The dedup store is present, passes tests, and does nothing at the moment it exists for                                |
| Longer than response/business data may legally be retained                        | response snapshots or fingerprints can violate minimization; retain the smallest tombstone/outcome permitted and use a new key for a new intent |
| Unbounded                                                                         | the table grows without limit and its unique index eventually dominates write latency                                                           |

Set it from the maximum age of every supported retry/replay source: client policy, transport
redelivery, offline devices, outbox retention, operator replay and DLQ policy. If the system
permits replay beyond dedup retention, document that it may execute again or preserve a
smaller permanent business-operation uniqueness key. Derive the duration; do not cargo-cult
24 hours.

Delete expired rows with a bounded batch job, not a `DELETE … WHERE expires_at < now()` over
the whole table — the second one is a lock-holding scan that fires during the same incident
that grew the table.

## Payload binding

Store a keyed digest or collision-resistant hash of a canonical operation fingerprint beside
the key. Without it, a client that reuses a key with a different body silently receives the
first result. Canonicalise semantic fields (including operation/version and excluding
transport-only values) before hashing. Excluding a field that changes semantics makes
distinct requests collide; unstable serialization makes equivalent requests differ. Avoid
raw secrets and do not use the digest as the key unless equal content truly means equal
intent.

## What the dedup store's own consistency must be

All competing claims for one scoped key need a single atomic uniqueness/CAS decision. Reads
used to replay or take over must observe an appropriate current version; stale replicas can
misreport `PENDING` or absence. A relational unique constraint works only within the database
and transaction scope where it is enforced. Multi-primary stores require documented
conflict/consensus semantics rather than an assumed compare-and-set. The vocabulary for that
requirement is `consistency-models`.

## Key evolution and compatibility

Include an operation namespace and semantic version when deployments can interpret the same
payload differently. During a rolling upgrade, old and new instances must compute the same
fingerprint for the same accepted request, or ingress must persist the canonical fingerprint.
Do not change namespace or normalization silently: it opens a second dedup universe for
in-flight retries.
