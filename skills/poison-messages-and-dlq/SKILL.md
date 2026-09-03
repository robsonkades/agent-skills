---
name: poison-messages-and-dlq
description: >
  What happens to a message that cannot succeed: separating the permanently poison message
  that fails on its own content from the transiently blocked one whose dependency is down,
  and why an attempt counter cannot tell them apart; the dead-letter queue as a design with
  an owner, an alert and a redrive path; the record captured beside the payload; and the
  head-of-line decision in a partitioned log, where skipping a record trades per-partition
  ordering for progress. Use when a consumer retries the same record forever, when a DLQ has
  grown and nobody owns it, when a DLQ record holds only the payload, when a deploy makes
  every message fail, when a partition stops advancing behind one record, or when
  dead-lettering is proposed for a dependency outage. Does not cover retry policy
  (retries-and-backoff), safe replay (idempotency), ordering scope
  (message-ordering-and-partitioning), the worker pool
  (task-queues-and-competing-consumers), guarantees (delivery-semantics), or alert
  thresholds (slo-and-alerting).
---

# Poison Messages And DLQ

## Purpose

Decide what a consumer does with work it cannot complete, and make that decision from the
**failure type** rather than from an attempt counter. The classification decides everything
downstream: a message that fails because of its own content will fail identically on every
worker forever, and retrying it burns capacity and — in a partitioned log — stops the
partition. A message that fails because a dependency is down is good work, and dead-lettering
it during an outage discards valid data at exactly the moment the system is least able to
notice.

A retry count cannot distinguish those two. Five failures means "five failures"; it does not
say whether the sixth would succeed. The failure this skill prevents is the DLQ used as a
bin: a queue that fills during every incident, that nobody alerts on, that has no redrive
tooling, and whose contents are therefore lost — data loss with extra steps and a dashboard
that says the consumer is healthy.

## Workflow

1. **Classify from evidence and context, not count or exception name alone.** Distinguish
   payload-intrinsic rejection, environment/version incompatibility, transient dependency,
   overload, ambiguous side effect and programmer defect. HTTP status is input to a policy,
   not the policy: 409/425/429 can be retryable while some 2xx responses carry rejected
   business outcomes. The classification is `retries-and-backoff`; machine-readable contracts
   are `rpc-and-api-contracts`.
2. **Route each class according to recovery.** Proven payload-intrinsic defects can quarantine
   immediately; transient/overload work waits or retries within budgets; ambiguous effects
   require status lookup/idempotency/reconciliation; environment-wide failures stop admission
   and repair the consumer. The table is `references/classification-and-routing.md`.
3. **Decide the ordered-log case explicitly** — block the partition or accept a per-key
   ordering gap. It is a business decision with two acceptable answers and no default.
4. **Design the quarantine record and atomic transfer before the DLQ.** Preserve bounded raw
   bytes or a secure blob reference, origin/identity, schema, failure evidence and operation
   history. Publishing the DLQ record and advancing the source must be atomic where the broker
   supports it, or repeat-safe/reconciled otherwise. Schema in `references/dlq-operations.md`.
5. **Name an owner and an alert.** A DLQ with no owning team, no arrival-rate alert and no
   age alert is a data-loss mechanism.
6. **Build redrive before you need it**, with its preconditions written down: the defect is
   fixed and deployed, the downstream still accepts the record, and replay is repeat-safe
   (`idempotency`).
7. **Test the poison path end to end** — inject a record that cannot succeed, assert it lands
   in the DLQ with a complete record, redrive it, assert one applied side effect.

## Rules

- Never classify on attempt count alone. `attempts > 5 → DLQ` can send the whole in-flight
  stream to the DLQ during a dependency outage, because every message reaches five attempts.
  Counts/deadlines bound transient and ambiguous retries to protect capacity, but exhausting a
  bound does not turn a dependency outage into poison; route to durable delayed work, pause or
  escalate according to the recovery contract.
- Never classify on `e.getMessage().contains(...)`. Typed failures still need context: a
  deserialization error can be corrupt bytes, unknown schema, missing decryption key or a bad
  deployment. Preserve raw bytes before deserialization and compare failure rate/build/schema
  compatibility before deciding record-local quarantine versus stopping the fleet.
- **A DLQ nobody alerts on is a data-loss mechanism with extra steps.** Two alerts, not one:
  arrival rate (something started failing) and age of the oldest record (nobody is acting).
  Alert design and thresholds are `slo-and-alerting`.
- The DLQ record must carry enough to diagnose without the source: protected raw payload/blob
  reference and safe headers, failure code/evidence, attempt history, source topic/partition/
  offset or queue and receipt, the first- and last-failure timestamps, the consumer group and
  build/schema version, and correlation/trace IDs (`distributed-tracing-design`). Redact
  credentials and bound stack/payload size; DLQs often become long-lived PII stores.
- Give the DLQ a retention longer than the time it takes a human to act on the alert, and know
  what that retention is. A DLQ inheriting a 7-day topic retention silently deletes the
  evidence over a long weekend.
- **In a partitioned log you cannot skip a record without breaking per-partition ordering.**
  The choice is: stop committing and block the partition (per-key ordering held, no progress
  for every key in that partition), or dead-letter and commit past it (progress, and a gap in
  that key's sequence that downstream state must tolerate). State which one this consumer
  chose and why; both are defensible, silence is not. Partition and key semantics are
  `message-ordering-and-partitioning`.
- A retry topic is not free: moving a record to a delay topic and re-consuming it later
  **removes it from its partition's order**. A retry-topic staircase is therefore an ordering
  decision as much as a timing one, and is only safe when per-key ordering is not required.
- Redrive is an operation with preconditions, not a button. Replaying into a system that has
  moved on — the order was cancelled, the price changed, the account closed — applies stale
  intent as if it were current. Check whether the record is still valid before replaying it,
  and prefer replaying through the normal consumer over a bespoke script.
- Redrive at full rate can re-create the incident. Use an isolated, rate-limited replay lane
  through the production validation/handler contract. Reinjecting the original topic is one
  option but changes order and may loop into the same DLQ; an admin replay endpoint/job can be
  safer if it shares code, authorization, idempotency and observability.
- **Every message failing after a deploy is an incident, not a data-quality problem.** The DLQ
  is filling with valid data because the _consumer_ is broken. Stop or pause the consumer and
  roll back; do not let the topic drain into the DLQ, because the DLQ preserves neither the
  partition ordering nor the offsets you will want when the fix ships.
- Never acknowledge/commit the source unless durable quarantine is proven. With Kafka, use a
  consume-transform-produce transaction when its scope/configuration fits, or make DLQ publish
  idempotent and reconcile before advancing. If quarantine storage is unavailable, pause/stop;
  a best-effort `send()` followed by commit is silent loss.

## Anti-patterns

| Anti-pattern                | Symptom                                            | Better alternative                                               |
| --------------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| Every 4xx is poison         | conflicts/rate limits are discarded                | contract-specific retryability and current-state checks          |
| Deserialize before capture  | poison record cannot be reconstructed              | intercept raw bytes and metadata at the consumer boundary        |
| DLQ send then source commit | crash/lost ack yields loss or duplicate quarantine | transactional transfer or idempotent transfer ledger             |
| Infinite in-place retry     | one partition/key stalls indefinitely              | bounded budget plus durable delayed/quarantine decision          |
| Blind bulk redrive          | stale intents and dependency overload recur        | dry run, semantic validation, rate guardrails and reconciliation |
| Shared unrestricted DLQ     | PII/credentials outlive source controls            | encryption, ACLs, minimization, retention and audit              |

## References

- [Classification and routing](references/classification-and-routing.md) — the permanent /
  transient / ambiguous table with the signal that identifies each and its correct
  destination, the retry-topic versus immediate-DLQ versus block-the-partition decision with
  conditions, and the head-of-line blocking trade-off worked through with both outcomes. Read
  when deciding where a failed message goes, or when a partition has stopped advancing.
- [Operating a DLQ](references/dlq-operations.md) — the DLQ record schema with the reason each
  field exists, the redrive procedure with preconditions and hazards, what to alert on, and how
  to test a poison path end to end. Read when building a DLQ, before running a redrive, or when
  a DLQ has grown and nobody knows what is in it.
