---
name: poison-messages-and-dlq
description: >
  What happens to a message that cannot succeed: separating the permanently poison message
  that fails on its own content from the transiently blocked one whose dependency is down,
  and why an attempt counter cannot tell them apart; the dead-letter queue as a design with
  an owner, an alert and a redrive path; the record captured beside the payload; and the
  head-of-line decision in a partitioned log, where skipping a record trades a complete
  effect sequence for progress. Use when a consumer retries the same record forever, when a DLQ has
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
downstream: payload-intrinsic rejection will recur under the same supported contract until
the defect is repaired or the work is terminally rejected. Retrying burns capacity and can
stop an ordered partition. Quarantining valid work during a dependency outage moves recovery
into an operational backlog; without ownership and sufficient retention it can become loss.

A retry count cannot distinguish those two. Five failures means "five failures"; it does not
say whether the sixth would succeed. The failure this skill prevents is the DLQ used as a
bin: a queue that fills during every incident, that nobody alerts on, that has no redrive
tooling, and whose contents are therefore lost — data loss with extra steps and a dashboard
that says the consumer is healthy.

## Workflow

Inspect the project's Java release, resolved client/framework versions, broker type/version,
acknowledgement settings, transaction boundaries and retention before prescribing APIs or
configuration. The conceptual record uses Java 17 source; adapt to the existing baseline
without upgrading the project. Return the evidence-based classification, routing/ordering
decision, durable transfer boundary, owner/redrive conditions and checks still required.

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
3. **Decide the ordered-log case explicitly** — block dispatch, accept a permitted gap,
   durably park the key, or resynchronize under a compatible projection contract. The
   reference explains their costs; none follows from an attempt count alone.
4. **Design the quarantine record and atomic transfer before the DLQ.** Preserve bounded raw
   bytes or a secure blob reference, origin/identity, schema, failure evidence and operation
   history. Publishing the DLQ record and advancing the source must be atomic where the broker
   supports it, or repeat-safe/reconciled otherwise. Schema in `references/dlq-operations.md`.
5. **Name an owner and an alert.** A DLQ with no owning team, no arrival-rate alert and no
   age alert is a data-loss mechanism.
6. **Build redrive before you need it**, with its preconditions written down: the defect is
   repaired in the active environment, the downstream still accepts the record, and replay is repeat-safe
   (`idempotency`).
7. **Test the poison path end to end** — quarantine a failing record with complete evidence;
   after demonstrated repair, redrive and assert one logical effect despite redelivery.
   Irreparable records instead receive an auditable terminal rejection.

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
  arrival rate (something started failing) and age of the oldest unresolved record.
  Alert design and thresholds are `slo-and-alerting`.
- The DLQ record must carry enough to diagnose without the source: protected raw payload/blob
  reference and safe headers, failure code/evidence, attempt history, source topic/partition/
  offset or queue and stable message ID, original key, first- and last-failure timestamps, consumer group and
  build/schema version, and correlation/trace IDs (`distributed-tracing-design`). Redact
  credentials and bound stack/payload size; DLQs often become long-lived PII stores.
- Give the DLQ a retention longer than the time it takes a human to act on the alert, and know
  what that retention is, including when its clock starts. Budget queue residence, detection,
  investigation and recovery; broker-specific expiry can consume the budget before transfer.
- **Skipping leaves a gap in the complete effect sequence**, even if remaining records
  retain their relative order. Stopping commits alone does not stop already dispatched or
  buffered work. Gate dispatch and account for in-flight effects when preserving order, or
  explicitly tolerate/reconcile the gap. State the chosen policy and why. Key semantics are
  `message-ordering-and-partitioning`.
- A retry topic is not free: moving a record to a delay topic and re-consuming it later
  **removes it from its partition's order**. A retry-topic staircase is therefore an ordering
  decision as much as a timing one. Required per-key order needs durable gating/buffering of
  later records through retries and recovery; one in-flight record alone is insufficient.
- Redrive is an operation with preconditions, not a button. Replaying into a system that has
  moved on — the order was cancelled, the price changed, the account closed — applies stale
  intent as if it were current. Distinguish commands from historical facts: a valid old fact
  may still be required to rebuild a projection. Check the consumer contract before replaying,
  and prefer replaying through the normal consumer over a bespoke script.
- Redrive at full rate can re-create the incident. Use an isolated, rate-limited replay lane
  through the production validation/handler contract. Reinjecting the original topic is one
  option but changes order and may loop into the same DLQ; an admin replay endpoint/job can be
  safer if it shares code, authorization, idempotency and observability.
- **Every message failing after a deploy demands incident investigation.** Pause mass
  quarantine and compare input, producer, build, schema and dependency evidence; roll back
  when the deployed consumer is implicated. A DLQ can preserve original offsets as metadata
  but replay does not restore their original position among live effects.
- Never acknowledge/commit past failed work unless its durable disposition is proven. With Kafka, use a
  consume-transform-produce transaction when its scope/configuration fits, or make DLQ publish
  idempotent and reconcile before advancing. If quarantine storage is unavailable, pause/stop;
  a best-effort `send()` followed by commit is silent loss.

## Anti-patterns

| Anti-pattern                            | Symptom                                                     | Better alternative                                               |
| --------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------- |
| Every 4xx is poison                     | conflicts/rate limits are discarded                         | contract-specific retryability and current-state checks          |
| Deserialize before capture              | poison record cannot be reconstructed                       | intercept raw bytes and metadata at the consumer boundary        |
| Unconfirmed DLQ send then source commit | failed send can lose data; retries can duplicate quarantine | transactional transfer or durable repeat-safe transfer ledger    |
| Infinite in-place retry                 | one partition/key stalls indefinitely                       | bounded budget plus durable delayed/quarantine decision          |
| Blind bulk redrive                      | stale intents and dependency overload recur                 | dry run, semantic validation, rate guardrails and reconciliation |
| Shared unrestricted DLQ                 | PII/credentials outlive source controls                     | encryption, ACLs, minimization, retention and audit              |

## References

- [Classification and routing](references/classification-and-routing.md) — the permanent /
  transient / ambiguous table with the signal that identifies each and its correct
  destination, the retry-topic versus immediate-DLQ versus block-the-partition decision with
  conditions, and the head-of-line blocking trade-off worked through with recovery options. Read
  when deciding where a failed message goes, or when a partition has stopped advancing.
- [Operating a DLQ](references/dlq-operations.md) — the DLQ record schema with the reason each
  field exists, the redrive procedure with preconditions and hazards, what to alert on, and how
  to test a poison path end to end. Read when building a DLQ, before running a redrive, or when
  a DLQ has grown and nobody knows what is in it.
