# Choosing and scoping the idempotency key

The key answers one question: **which two arrivals are the same operation?** Every failure
below is that question answered wrongly in one direction or the other — deduplicating two
distinct intents, or failing to deduplicate two copies of one.

## Key source

| Source                                                                                                                                   | What it identifies                        | Use when                                                                             | Failure it produces                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client-supplied request id (`Idempotency-Key` header, a UUID the client generates **once per intent** and reuses across its own retries) | the caller's intent                       | the caller is code you can specify, and retries come from the caller                 | a client that regenerates the id per attempt deduplicates nothing; a client that reuses one id across genuinely distinct intents suppresses real work                                          |
| Deterministic hash of the canonical business payload                                                                                     | the content                               | identical canonical content genuinely defines the same operation or immutable object | two distinct purchases with identical content collapse into one. If distinct intents matter, include a stable intent identifier; a timestamp alone need not be unique or stable across retries |
| Business-operation key (order id + operation kind/version, payment attempt id, external transaction reference)                           | one domain intent                         | the domain defines a stable, non-recycled identity for this operation                | an object id alone may collapse distinct operations on the same object; recycled/imported identifiers require namespace and epoch                                                              |
| Stable transport message identity                                                                                                        | one message within a documented namespace | the identity is preserved across every redelivery covered by the guarantee           | a new identity on republication misses the same business intent unless a stable operation ID is carried across it; delivery tags/attempt IDs do not supply that identity                       |

There is no universal ranking independent of scope. A non-recycled business-operation ID is
usually strongest; a correctly generated caller intent ID is equally useful at an API
boundary. A content-defined contract, such as one immutable blob per verified digest, needs no
extra per-intent field. Payload hash is lossy when identical content can represent distinct
intents. Verify transport identities across redelivery, republication and namespace changes;
producer republication may preserve an application ID or assign a new one.

For RabbitMQ AMQP 0-9-1, a **delivery tag** is a channel-scoped acknowledgement identifier,
not a stable message identity across redelivery. The **Message ID** property is separate,
optional and publisher-set. It is usable for deduplication only if the application ensures
the required uniqueness, scope and preservation; RabbitMQ does not create that intent contract.

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
- the only candidate is an attempt/delivery tag, or a transport message identity that is
  not stable across the business replay paths the guarantee must cover

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

| Scope                                     | Meaning                                                            | Choose when                                                                               | Failure                                                                                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stable tenant/client identity + operation | retries share a namespace across credentials and equivalent routes | when that identity matches the business intent owner                                      | rotating API credentials, route aliases or renamed endpoints must not open a new namespace for an existing intent                                                               |
| Per endpoint, global across clients       | any caller's key can collide with any other's                      | never for client-supplied keys                                                            | one tenant's UUID collision or deliberate replay suppresses another tenant's request. It is also an information leak: the replayed response was computed for a different caller |
| Per client, global across endpoints       | one key namespace per caller                                       | when the client's retry library attaches one id per logical operation regardless of route | a client reusing an id across two different operations gets the first operation's response back from the second endpoint                                                        |
| Per consumer group / per handler          | a broker message deduplicated once per independent consumer        | fan-out, where several consumers must each process the message                            | a shared scope makes the first consumer's processing suppress every other consumer's                                                                                            |

Encode the scope in the primary key (`PRIMARY KEY (scope, key)`), not in application code
that filters after the read — the uniqueness must be the database's, or the concurrent case
is unprotected.
Derive the tenant/principal from authenticated context, not an untrusted body field. Choose
whether credentials acting for the same tenant share an operation namespace; authenticate and
authorize each replay without using a rotating secret itself as the durable identity.

## Retention

Retention is bounded below by every accepted replay path; its upper bound is a product,
legal, privacy and storage decision rather than automatically the business record's lifetime.

| Retention                                                                         | Consequence                                                                                                                                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shorter than the client's total retry window (including a DLQ replay hours later) | the retry can execute again unless another authority still enforces uniqueness; the expired dedup record no longer supplies that guarantee                          |
| Longer than response/business data may legally be retained                        | response snapshots or fingerprints can violate minimization; retain the smallest tombstone/outcome permitted and use a new key for a new intent                     |
| Unbounded                                                                         | new distinct keys accumulate; measure rows, index size and write cost. Permanent business uniqueness may be justified without retaining full responses indefinitely |

Set it from the maximum age of every supported retry/replay source: client policy, transport
redelivery, offline devices, outbox retention, operator replay and DLQ policy. If the system
permits replay beyond dedup retention, document that it may execute again or preserve a
smaller permanent business-operation uniqueness key. Derive the duration; do not cargo-cult
24 hours.

Delete eligible terminal rows in bounded indexed batches. Do not delete `PENDING`/`UNKNOWN`
merely because `expiresAt` elapsed; recover/reconcile them. Coordinate cleanup with claims and
replays, and test the selected database's locking/isolation behavior. An unbounded deletion
can cause large transactions, lock contention and I/O spikes; its cost depends on the plan
and eligible row count.

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

## Primary references

- [RabbitMQ AMQP 0-9-1 delivery tags and acknowledgement scope](https://www.rabbitmq.com/docs/confirms)
- [RabbitMQ message properties versus delivery metadata](https://www.rabbitmq.com/docs/consumers)
