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

1. **Classify the failure from its type, not its count.** Permanent (this input will never
   succeed), transient (the operation did not happen and may later), ambiguous (unknown). The
   signal must come from the contract — a typed error, a status code, a validation result —
   never from a message substring. The classification is `retries-and-backoff`; making it
   machine-readable in the first place is `rpc-and-api-contracts`.
2. **Route each class to a different destination.** Permanent goes to the DLQ on the first
   failure. Transient retries in place or on a delay/retry topic. Ambiguous retries under
   idempotency. The table and its conditions are `references/classification-and-routing.md`.
3. **Decide the ordered-log case explicitly** — block the partition or accept a per-key
   ordering gap. It is a business decision with two acceptable answers and no default.
4. **Design the DLQ record before the DLQ.** Payload plus failure, stack, attempt count,
   origin, timestamps and trace id. Schema in `references/dlq-operations.md`.
5. **Name an owner and an alert.** A DLQ with no owning team, no arrival-rate alert and no
   age alert is a data-loss mechanism.
6. **Build redrive before you need it**, with its preconditions written down: the defect is
   fixed and deployed, the downstream still accepts the record, and replay is repeat-safe
   (`idempotency`).
7. **Test the poison path end to end** — inject a record that cannot succeed, assert it lands
   in the DLQ with a complete record, redrive it, assert one applied side effect.

## Rules

- Never dead-letter on attempt count alone. `attempts > 5 → DLQ` sends the whole in-flight
  stream to the DLQ during a dependency outage, because every message reaches five attempts.
  Count is the bound for the _ambiguous_ class only.
- Never classify on `e.getMessage().contains(...)`. A deserialisation failure, a schema
  mismatch, a validation rejection and a 4xx from a downstream are all permanent, and all of
  them are identifiable by type.
- A message that fails deserialisation is permanent by construction and must be dead-lettered
  on the first failure — it will never parse, and it cannot be retried into success by any
  policy.
- **A DLQ nobody alerts on is a data-loss mechanism with extra steps.** Two alerts, not one:
  arrival rate (something started failing) and age of the oldest record (nobody is acting).
  Alert design and thresholds are `slo-and-alerting`.
- The DLQ record must carry enough to diagnose without the original topic: the payload and
  its headers, the failure type and stack, the attempt count, the source topic/partition/
  offset or queue and receipt, the first- and last-failure timestamps, the consumer group and
  build version, and the trace id (`distributed-tracing-design`). A DLQ holding only a payload
  is unusable, and the information is unrecoverable once the source retention expires.
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
- Redrive at full rate re-creates the incident. Rate-limit the redrive, and redrive into the
  original topic or queue rather than calling the handler directly, so the limits, retries and
  metrics that exist on the normal path still apply.
- **Every message failing after a deploy is an incident, not a data-quality problem.** The DLQ
  is filling with valid data because the _consumer_ is broken. Stop or pause the consumer and
  roll back; do not let the topic drain into the DLQ, because the DLQ preserves neither the
  partition ordering nor the offsets you will want when the fix ships.
- Never let the DLQ producer share the failure mode of the handler. If the handler fails
  because the broker is unreachable and the DLQ is on the same broker, dead-lettering fails
  too — and the fallback must be to stop consuming, not to drop the record.

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
