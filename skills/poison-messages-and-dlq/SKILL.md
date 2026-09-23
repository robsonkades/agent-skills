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
**failure type and recovery contract**, not an attempt counter alone. Payload-intrinsic
rejection will recur under the same supported contract until
the defect is repaired or the work is terminally rejected. Retrying burns capacity and can
stop an ordered partition. Quarantining valid work during a dependency outage moves recovery
into an operational backlog; without ownership and sufficient retention it can become loss.

A retry count cannot distinguish those two. Five failures means "five failures"; it does not
say whether the sixth would succeed. The failure this skill prevents is the DLQ used as a
bin: unresolved work accumulates without an owned recovery/disposition path until its
deadline or retention expires, while a dashboard says the consumer is healthy.

Keep cause separate from storage disposition. A queue named DLQ may intentionally hold
exhausted transient or unknown work under a durable recovery contract; a native attempt
threshold bounds delivery attempts, not the truth of a poison classification.

## Workflow

Inspect the project's Java release, resolved client/framework versions, broker type/version,
acknowledgement settings, transaction boundaries and retention before prescribing APIs or
configuration. The conceptual record uses Java 17 source; adapt to the existing baseline
without upgrading the project. Use the steps relevant to the actual classification, review,
implementation or replay. Preserve adequate existing controls; a narrow explanation need
not redesign the DLQ or run every integration fixture. Return the supported decision and
material uncertainty; for a change, include its affected transfer/ordering boundary,
recovery owner and checks actually run or still required.

1. **Classify from evidence and context, not count or exception name alone.** Distinguish
   payload-intrinsic rejection, environment/version incompatibility, transient dependency,
   overload, ambiguous side effect and programmer defect. HTTP status is input to a policy,
   not the policy: 409/425/429 can be retryable while some 2xx responses carry rejected
   business outcomes. The classification is `retries-and-backoff`; machine-readable contracts
   are `rpc-and-api-contracts`.
2. **Route each class according to recovery.** Proven payload-intrinsic defects can quarantine
   immediately; transient/overload work waits or retries within budgets; ambiguous effects
   require status lookup/idempotency/reconciliation; environment failures contain admission
   in the affected scope while its cause is investigated and repaired. The table is
   `references/classification-and-routing.md`.
3. **Decide the ordered-log case explicitly** — block dispatch, accept a permitted gap,
   durably park the key, or resynchronize under a compatible projection contract. The
   reference explains their costs; none follows from an attempt count alone.
4. **Design the quarantine record and atomic transfer before the DLQ.** Preserve bounded raw
   bytes or a secure blob reference, origin/identity, schema, failure evidence and operation
   history. Publishing the DLQ record and advancing the source must be atomic where the broker
   supports it, or repeat-safe/reconciled otherwise. Schema in `references/dlq-operations.md`.
5. **Verify owned, actionable monitoring.** Detect failed/unresolved work early enough to
   meet its recovery and retention budget; reuse adequate existing signals and routing.
6. **Establish the recovery/disposition path when designing or changing it**, with redrive
   preconditions written down: the cause is
   repaired in the active environment, the downstream still accepts the record, and replay is repeat-safe
   (`idempotency`).
7. **Validate the affected poison-path contract** — for a transfer/replay change, quarantine a failing record with complete evidence;
   after demonstrated repair, redrive and assert one logical effect despite redelivery.
   Irreparable records instead receive an auditable terminal rejection.

## Rules

- Never classify on attempt count alone. `attempts > 5 → DLQ` can send the whole in-flight
  stream to the DLQ during a dependency outage, because every message reaches five attempts.
  Counts/deadlines bound transient and ambiguous retries to protect capacity, but exhausting a
  bound does not turn a dependency outage into poison; route to durable delayed work, pause or
  escalate according to the recovery contract. A DLQ can be that durable holding path when
  cause, recovery ownership, retention and repeat-safe replay remain explicit; do not remove
  a useful native attempt threshold merely because it is not a classifier.
- Never classify on `e.getMessage().contains(...)`. Typed failures still need context: a
  deserialization error can be corrupt bytes, unknown schema, missing decryption key or a bad
  deployment. Preserve raw bytes before deserialization and compare failure rate/build/schema
  compatibility before deciding record-local quarantine versus containing an affected environment.
  A Kafka null value may be a valid tombstone; distinguish original null from a decoder returning
  null on failure before classifying it or constructing the replay envelope.
- Unobserved unresolved work risks missed recovery or expiry; missing a particular alert does
  not establish actual loss. Arrival/failure rate and unresolved age are useful signals;
  assess equivalent business-completeness, backlog/drain and retention controls against the
  response budget. Alert design and thresholds are `slo-and-alerting`.
- The DLQ record must carry enough to diagnose without the source: protected raw payload/blob
  reference and safe headers, failure code/evidence, attempt history, source topic/partition/
  offset or queue and stable message ID, original key, first- and last-failure timestamps, consumer group and
  build/schema version, and correlation/trace IDs (`distributed-tracing-design`). Redact
  credentials and bound the complete serialized envelope, including headers and accumulated
  failure history; a payload below the limit does not prove the DLQ publish will fit. Preserve
  required header bytes/multiplicity instead of assuming a string map is lossless.
  DLQs often become long-lived PII stores.
- Give the DLQ enough remaining retention for detection, investigation and recovery,
  including human response delay when applicable. Verify when its clock starts and budget
  source residence too; broker-specific expiry can consume the budget before transfer.
  Check cleanup/compaction policy too: retaining the latest value per business key does not
  retain every unresolved failure for that key. See `references/dlq-operations.md`.
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
- Redrive can re-create overload. Bound replay rate/concurrency from combined live and replay
  capacity with stop conditions; an isolated replay lane is one option. Replay must go
  through the production validation/handler contract. Reinjecting the original topic is one
  option but changes order and may loop into the same DLQ; an admin replay endpoint/job can be
  safer if it shares code, authorization, idempotency and observability.
- **Every message failing after a deploy demands incident investigation.** Pause mass
  quarantine and compare input, producer, build, schema and dependency evidence; roll back
  when the deployed consumer is implicated. A DLQ can preserve original offsets as metadata
  but replay does not restore their original position among live effects.
- Never acknowledge/commit past failed work unless its durable disposition is proven. With Kafka, use a
  consume-transform-produce transaction when its scope/configuration fits, or make DLQ publish
  idempotent and reconcile before advancing. If quarantine cannot be made durable through
  the configured path or a proven fallback, pause the affected scope and retain source
  recoverability. Independent healthy work may continue when ownership/order permit;
  a best-effort `send()` followed by commit can lose work.

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
