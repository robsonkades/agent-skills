---
name: idempotency
description: >
  Making an operation safe to apply more than once: natural idempotency versus an
  idempotency key plus durable operation state; choosing and scoping the key, and why a
  broker message id covers only one redelivery scope; the concurrent in-flight duplicate
  cannot handle; replaying the stored response instead of returning a conflict; and why
  idempotent is not commutative. Use when a retry produces a second row, charge or email,
  when a handler starts with an exists() check before a write, when an Idempotency-Key
  header is being added or ignored, when two identical requests arrive concurrently, or when
  a dedup table has no TTL. Does not cover why duplicates arrive (delivery-semantics),
  compensating actions (distributed-transactions-and-sagas), what the dedup store's own
  consistency must be (consistency-models), or caching (caching-strategies).
---

# Idempotency

## Purpose

Make an operation preserve its declared state, effect and response invariants whether it is
attempted once or five times. Choose natural state idempotence, a conditional domain
transition, a durable operation key, or a combination. Duplicates are a given; why they
arrive is `delivery-semantics`. This skill is only about surviving them.

The failure this prevents is the almost-idempotent handler: a dedup check written as a read
followed by a write, which passes every sequential test and duplicates under the exact
condition it exists for — two copies of the same request in flight at the same time. The
second failure is the handler that detects the duplicate correctly and then returns an
error, so a client that retried after a timeout is told its request conflicts with itself.

## Workflow

1. **Define the equivalence contract.** Separate final business state, external effects and
   protocol response. A full-representation PUT or delete can be state-idempotent while the
   second response has a different version/status. An insert guarded by a natural unique key
   prevents a second row but still needs duplicate recognition if retries must receive the
   original result. `balance = 100` is naturally state-idempotent; `balance += 10` is not.
2. **Choose state predicate, operation key, or both.** A conditional transition
   (`PENDING → CONFIRMED`) prevents an illegal second transition, but an operation key is
   still needed to distinguish a retry from a competing command, replay its result, and
   deduplicate external effects.
3. **Choose the key source, namespace and lifetime** before writing code. Prefer a stable
   business-operation identifier or a caller-generated identifier created once per intent.
   Payload hashes identify content, not intent; broker delivery IDs cover only the broker's
   redelivery scope. See `references/key-selection.md`.
4. **Make the claim and local mutation one atomic state transition.** A conditional insert
   or compare-and-set chooses one owner under concurrency. When the business mutation is in
   the same database, commit claim, mutation and response atomically. For an external effect,
   persist intent first and call downstream with the same idempotency key; otherwise a crash
   necessarily leaves an ambiguous state that requires status lookup/reconciliation.
5. **Persist the stable outcome needed by the contract.** It may be the exact status/body,
   a resource identifier and version from which a response is rebuilt, or a terminal
   business rejection. Do not persist secrets, one-time credentials or unbounded bodies.
6. **Set the retention from the client's retry horizon and the business record**, and say
   what happens after it expires. See `references/idempotency-key-filter.md`.
7. **Test the concurrent case specifically** — two threads, one key, one barrier, assert
   exactly one side effect and two identical responses. A sequential duplicate test proves
   nothing about the race.

## Rules

- State idempotence means repeating the operation does not change the resulting state after
  the first application. API retry equivalence is stronger: it may require the same resource
  identity and semantically equivalent response, not necessarily byte-for-byte replay.
  State which guarantee the interface offers.
- **Idempotent is not commutative.** Idempotency says `f(f(x)) = f(x)`; commutativity says
  `f(g(x)) = g(f(x))`. At-least-once delivery gives you duplicates _and_ reordering across
  keys, so a path that repeats safely can still converge wrongly when two different
  operations arrive out of order. Ordering guarantees are
  `message-ordering-and-partitioning`; a last-writer-wins field needs a version or a
  timestamp, not an idempotency key.
- Never write the guard as `if (repo.existsById(key)) return;` followed by an insert. Two
  concurrent copies both read absent, both proceed, both apply the side effect. The check
  and the claim must be one atomic operation.
- The conditional claim must be **in the same transaction as the side effect** when both
  are in the same store. Claim-then-crash-before-side-effect otherwise leaves a key that
  suppresses the retry forever — a lost operation with no error anywhere.
- Return or reconstruct the original semantic outcome for a completed duplicate. Reject the
  same key with a materially different operation fingerprint without revealing another
  tenant's result. Canonicalization must include every field that changes semantics and the
  relevant API/tenant scope.
- A broker message id usually identifies a _delivery_, not a business request. An
  upstream that republishes after its own crash produces a new message id for the same
  business intent, and the dedup store sees two distinct keys.
- A key retained for less than the maximum replay horizon re-enables old operations. Longer
  retention costs storage and may retain sensitive data, but does not suppress a legitimate
  new intent when clients generate a new key per intent. Define post-expiry semantics,
  archival/DLQ replay limits and legal retention explicitly.
- Increment and append are not naturally idempotent, but an atomic dedup record plus mutation
  can make an operation keyed by intent idempotent. Alternatives are a uniquely keyed delta,
  conditional version transition or absolute target write.
- **Idempotency belongs in durable storage.** A cache is not a dedup store: eviction under
  memory pressure silently re-enables the duplicate, and the cache's own consistency
  becomes part of the guarantee. A cache in front of the durable table is fine;
  `caching-strategies` for that.

## State machine for external effects

```text
ABSENT --atomic claim--> PENDING(attempt, fingerprint)
PENDING --downstream confirms same operation key--> COMPLETED(outcome)
PENDING --definite pre-dispatch rejection--> RETRYABLE or terminal REJECTED
PENDING --timeout/disconnect/crash--> UNKNOWN --status lookup/reconcile--> COMPLETED/RETRYABLE
```

Never delete or reopen `PENDING` merely because the caller received an exception. Cancellation
and timeout describe the caller, not the effect. If a lease allows a new worker to take over,
use an attempt epoch for ownership of local completion and still reuse the stable downstream
operation key. A lease alone cannot prevent the first external attempt from completing late.

## Security and abuse controls

- authenticate before idempotency lookup and namespace by principal/tenant plus operation;
- cap key/body lengths and validate key entropy/format to prevent index and hot-key abuse;
- never reveal whether another tenant used a key; authorize replayed resource/result again;
- encrypt or minimize stored response data and apply retention/redaction requirements;
- rate-limit new claims separately from cheap completed replays, and protect one key from an
  unbounded number of in-flight waiters.

## References

- [The idempotency-key filter](references/idempotency-key-filter.md) — a Java
  implementation for an HTTP API: the conditional-insert claim, the in-flight duplicate,
  response replay, retention, and an explicit fail-closed/fail-open decision for when the
  dedup store is unavailable. Read when implementing or reviewing an idempotent endpoint or
  message handler.
- [Choosing and scoping the key](references/key-selection.md) — a decision table over key
  source, scope, retention and payload binding, with the specific failure each choice
  produces. Read before deciding what the key is, or when a dedup store is deduplicating
  too much or too little.
