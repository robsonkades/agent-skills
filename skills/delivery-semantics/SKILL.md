---
name: delivery-semantics
description: >
  Precise end-to-end delivery and processing semantics: acknowledgement placement, loss and
  duplicate windows, Kafka transactions, visibility leases, ambiguous outcomes and external
  side effects. Use when reviewing "exactly once", consumer commits, redelivery or a handler
  that writes outside its broker. Idempotent handler design belongs to idempotency; retries,
  ordering, poison messages and fault assumptions have their own skills.
---

# Delivery Semantics

## Purpose

Decide which delivery guarantee a path needs, and place the acknowledgement so the code
actually provides it. The guarantee is not a broker setting; it is the position of the ack
relative to the side effect, plus whatever the application does about duplicates.

The failure this prevents is the system designed against a guarantee nobody implemented:
a team believes the platform gives "exactly-once", the handler is not repeat-safe, and the
first rebalance during a slow poll charges a customer twice. The second failure is its
mirror — a consumer that acknowledges first and can silently drop unfinished work on a crash, which
produces no error anywhere and is discovered by reconciliation months later.

## Workflow

Java snippets are partial illustrations using Java 17 syntax, Kafka client 4.1 API and
Jakarta Messaging 3.1 contracts, not complete consumers. Inspect resolved clients/provider,
broker version, framework acknowledgement mode, transaction manager and durability/retention
configuration. Existing project versions govern implementation; do not upgrade to fit a snippet.

1. **Name the required outcome, input identity and each side effect.** Inspect the current
   handler, effective configuration and recovery path before recommending a change. Locate
   effects inside the same broker cluster, in a database, or at a third party; a transaction
   cannot cover participants it does not enlist. Ask for missing loss tolerance or provider
   guarantees when they change the decision; keep an adequate existing path.
2. **Locate confirmed progress relative to durable completion.** Acknowledging first opens
   a loss window; completing first opens a duplicate window. Starting async work is not
   completion. Auto-commit safety depends on the client/framework lifecycle, not a timer
   label: inspect the Kafka coupling below.
3. **Choose the loss/duplication trade explicitly.** Ask what the business does with a lost
   record versus a duplicated one. Even telemetry can require completeness; use the actual
   acceptance/reconciliation contract rather than assuming its loss is free.
4. **Usually prefer at-least-once plus an outcome invariant.** Define which durable effect
   may happen once, how duplicates collapse, how long dedup state lives, and what happens
   after retention expires. Call this _effectively-once_ only with that scope stated. The
   handler mechanics are `idempotency`.
5. **Name the transaction's actual participants.** For a Kafka transaction that means consuming and producing within one cluster with offsets
   committed inside the transaction. See `references/exactly-once-boundary.md`.
   A database transaction or an explicitly supported distributed transaction has a different
   boundary; an annotation alone does not enlist an HTTP service or another store.
6. **Enumerate the duplicate sources that are not retries** — rebalance after a slow poll,
   redelivery after a visibility timeout expires, a duplicate already present upstream —
   and confirm the handler survives each.
7. **Validate relevant ambiguity windows with bounded fault injection:** disconnect, revoke
   a partition, or kill a disposable consumer before/after the effect and acknowledgement;
   reconcile broker position, downstream state and externally visible outcome after recovery.
   Report the exercised cuts and assumptions; a finite test is not proof of every failure.

## Rules

- Write `at-most-once`, `at-least-once`, `effectively-once`, or "exactly-once **within**
  \<named boundary\>". A guarantee with no named boundary is a marketing claim.
- A timeout alone cannot resolve an **ambiguous outcome**. A confirmation proves only what
  its protocol acknowledges: broker acceptance need not mean downstream application.
  Track each effect and progress update separately, retaining known partial completion and
  earlier unresolved attempts. Stopping can risk loss; retrying can risk duplication.
  An exactly-once observable outcome is
  possible only under named assumptions, such as durable unique IDs plus deduplication, or
  one atomic transaction containing both effect and progress. Do not turn this into the
  broader claim that useful exactly-once processing is mathematically impossible.
- Confirmed ack before the effect chooses possible loss for that input position. It does
  not eliminate upstream duplicate records or a provider's duplicate-delivery behavior.
  If ack confirmation is ambiguous, do not perform the effect under an at-most-once claim.
- Kafka auto-commit advances offsets for records returned by `poll`, not application
  completion. It can still provide at-least-once only when every returned record finishes
  before the next `poll` or close, as the Kafka client documentation requires. Asynchronous
  workers violate that coupling unless auto-commit is disabled and only completed per-
  partition offsets are committed.
- A consumer rebalance can replay completed records at or after the recovered committed position.
  Replay depends on authoritative progress and recovery policy, not the last client's error.
  Duplicates are possible even with zero application retries and zero broker failures.
- A visibility-timeout queue makes work eligible for redelivery when the handler outlives
  the timeout. Expiry does not stop the first handler; overlapping effects are possible.
- Kafka producer idempotence deduplicates protocol retries from one producer session using
  producer identity and per-partition sequence numbers. It does not recognize the same
  business event reconstructed and sent again by application code, and it does not make an
  external consumer effect idempotent.
- `isolation.level=read_committed` is a **consumer** setting. A transactional producer with
  `read_uncommitted` consumers downstream does not give them committed-only visibility —
  they may read aborted records even though the producer's atomic commit still exists.
- The moment the handler performs a side effect outside the transactional system — an HTTP
  call, a JDBC write to another store, a file — the transaction no longer covers the
  outcome. For a once-only business outcome, establish natural repeat-safety, a provider
  idempotency contract, reconciliation, or an atomic effect/progress reduction; a local
  transaction cannot roll back a remote effect. If the required guarantee is unsupported,
  expose that gap rather than prescribing a local dedup marker as sufficient protection.
  The reductions are in `references/exactly-once-boundary.md`.
- At-least-once is conditional, not immortality: retention expiry, exhausted retries, DLQ
  policy, unrecoverable storage loss and operator deletion can still lose the business work.
  State those assumptions and provide reconciliation for paths where loss is unacceptable.
- Preserve per-partition commit monotonicity. With parallel workers, committing offset 42
  while 41 is unfinished loses 41 on crash; track contiguous completion or pause partitions.
- An acknowledgement response can itself be lost. After a confirmed effect and an offset
  commit timeout, the effect remains known; progress may be unknown. Inspect authoritative
  committed offsets before claiming replay, and make any replay safe for completed effects.
- A happy-path integration test alone does not establish the guarantee. Use a disposable consumer
  process/container or a deterministic fault seam to kill it between effect and commit, and
  assert both recovered state and externally visible outcome.

Deliver the input identity, durable effects and progress store, chosen guarantee/assumptions
and rationale, relevant loss/duplicate/unknown windows, and a bounded recovery test or test
plan. Distinguish documented behavior from executed tests; missing provider or lifecycle
evidence keeps the claim conditional. Scale the artifact to the actual decision.

## References

- [Kafka consumer API: offsets and delivery semantics](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)
- [Jakarta Messaging 3.1 specification](https://jakarta.ee/specifications/messaging/3.1/jakarta-messaging-spec-3.1.pdf)
- [Amazon SQS visibility timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html)

- [Ack placement](references/ack-placement.md) — the three ack positions in a Kafka
  consumer and in a visibility-timeout queue, each with the guarantee it yields and the
  concrete loss or duplication it produces. Read when reviewing or writing a consumer loop,
  or when deciding where a commit goes.
- [The exactly-once boundary](references/exactly-once-boundary.md) — what a Kafka
  transactional producer covers and what it does not, and the transactional outbox and
  idempotent-consumer reductions for a side effect outside it. Read before claiming a path
  is exactly-once, or when the handler writes anywhere other than the broker.
