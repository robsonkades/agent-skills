---
name: idempotency
description: >
  Making an operation safe to apply more than once: natural idempotency versus an
  idempotency key plus a dedup store; choosing and scoping the key, and why a broker message
  id is the weakest source; the concurrent in-flight duplicate that a check-then-act read
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

Make an operation produce the same observable outcome whether it is applied once or five
times, and know which of the two available mechanisms — natural or synthetic — the
operation admits. Duplicates are a given; why they arrive is `delivery-semantics`. This
skill is only about surviving them.

The failure this prevents is the almost-idempotent handler: a dedup check written as a read
followed by a write, which passes every sequential test and duplicates under the exact
condition it exists for — two copies of the same request in flight at the same time. The
second failure is the handler that detects the duplicate correctly and then returns an
error, so a client that retried after a timeout is told its request conflicts with itself.

## Workflow

1. **Ask whether the operation is naturally idempotent.** A full-representation PUT, an
   absolute `SET x = v`, a delete, an insert on a natural unique key — these need no
   machinery. `balance = 100` is naturally idempotent; `balance += 10` is not.
2. **If not, decide whether the guard is a key or a state.** State-machine transitions
   guard on the current state (`if state == PENDING then → CONFIRMED`), and need no dedup
   store. Only reach for a key when there is no state that discriminates.
3. **Choose the key source and its scope** before writing code. Client request id,
   deterministic hash of the business payload, or broker message id, in that order of
   strength. See `references/key-selection.md`.
4. **Make the claim a conditional insert, never a read-then-write.** `INSERT … ON CONFLICT
DO NOTHING`, a unique constraint plus a caught violation, or `SET key NX`. This is the
   only shape that is correct with two copies in flight.
5. **Store the response, not just the fact.** A duplicate must return the original answer,
   with the original status. Returning 409 to a retry is a bug that surfaces as a client
   error you cannot reproduce.
6. **Set the retention from the client's retry horizon and the business record**, and say
   what happens after it expires. See `references/idempotency-key-filter.md`.
7. **Test the concurrent case specifically** — two threads, one key, one barrier, assert
   exactly one side effect and two identical responses. A sequential duplicate test proves
   nothing about the race.

## Rules

- Idempotent means the _observable outcome_ is unchanged by repetition, not that the code
  takes the same branch. A second call that skips the work and returns the stored response
  is idempotent; a second call that returns a different status is not.
- **Idempotent is not commutative.** Idempotency says `f(f(x)) = f(x)`; commutativity says
  `f(g(x)) = g(f(x))`. At-least-once delivery gives you duplicates _and_ reordering across
  keys, so a path that repeats safely can still converge wrongly when two different
  operations arrive out of order. Ordering guarantees are
  `message-ordering-and-partitioning`; a last-writer-wins field needs a version or a
  timestamp, not an idempotency key.
- Never write the guard as `if (repo.existsById(key)) return;` followed by an insert. Two
  concurrent copies both read absent, both proceed, both apply the side effect. The check
  and the claim must be one atomic operation.
- The conditional insert must be **in the same transaction as the side effect** when both
  are in the same store. Claim-then-crash-before-side-effect otherwise leaves a key that
  suppresses the retry forever — a lost operation with no error anywhere.
- Return the stored response for a duplicate, replaying status and body. Only return a
  conflict when the same key arrives with a _different_ payload — that is a client bug and
  is worth surfacing (a payload fingerprint stored beside the key detects it).
- A broker message id is the weakest key: it identifies a _delivery_, not a _request_. An
  upstream that republishes after its own crash produces a new message id for the same
  business intent, and the dedup store sees two distinct keys.
- A key with a TTL shorter than the client's retry horizon deduplicates nothing at the
  moment it matters. A key retained longer than its business record leaves a marker that
  suppresses a legitimate re-submission. Both are decisions with stated conditions — the
  table is in `references/key-selection.md`.
- Increment and append are not idempotent and no wrapper makes them so. Either record the
  delta under its own key and sum, or convert to an absolute write.
- **Idempotency belongs in durable storage.** A cache is not a dedup store: eviction under
  memory pressure silently re-enables the duplicate, and the cache's own consistency
  becomes part of the guarantee. A cache in front of the durable table is fine;
  `caching-strategies` for that.

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
