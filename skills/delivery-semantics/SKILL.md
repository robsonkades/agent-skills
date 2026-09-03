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
mirror — a consumer that acknowledges first and silently drops work on every crash, which
produces no error anywhere and is discovered by reconciliation months later.

## Workflow

1. **Name the side effect and where it lands.** Inside the same broker cluster, in a
   database, or across the network at a third party. That single fact decides everything
   below; a transaction cannot span a boundary it does not control.
2. **Locate the acknowledgement in the code.** Ack-then-process is at-most-once.
   Process-then-ack is at-least-once. A timer-driven auto-commit is neither by design — it
   is at-most-once for whatever the timer commits ahead of the work.
3. **Choose the loss/duplication trade explicitly.** Ask what the business does with a lost
   record versus a duplicated one. Losing a metric sample is free; losing a payment is not.
4. **Usually prefer at-least-once plus an outcome invariant.** Define which durable effect
   may happen once, how duplicates collapse, how long dedup state lives, and what happens
   after retention expires. Call this _effectively-once_ only with that scope stated. The
   handler mechanics are `idempotency`.
5. **Reach for a transaction only when the whole read-process-write stays inside one
   system.** For Kafka that means consuming and producing within one cluster with offsets
   committed inside the transaction. See `references/exactly-once-boundary.md`.
6. **Enumerate the duplicate sources that are not retries** — rebalance after a slow poll,
   redelivery after a visibility timeout expires, a duplicate already present upstream —
   and confirm the handler survives each.
7. **Prove every ambiguity window by fault injection:** disconnect, revoke a partition, or
   kill the consumer immediately before/after the effect and acknowledgement; then reconcile
   broker position, downstream state and externally visible outcome after recovery.

## Rules

- Write `at-most-once`, `at-least-once`, `effectively-once`, or "exactly-once **within**
  \<named boundary\>". A guarantee with no named boundary is a marketing claim.
- A transport acknowledgement cannot resolve an **ambiguous outcome**: after request or ack
  loss, the caller cannot know from the timeout alone whether the remote effect committed.
  Stopping risks loss; retrying risks duplication. An exactly-once observable outcome is
  possible only under named assumptions, such as durable unique IDs plus deduplication, or
  one atomic transaction containing both effect and progress. Do not turn this into the
  broader claim that useful exactly-once processing is mathematically impossible.
- Ack before the side effect and you have chosen at-most-once. Say so in the code review,
  or move the ack.
- Kafka auto-commit advances offsets for records returned by `poll`, not application
  completion. It can still provide at-least-once only when every returned record finishes
  before the next `poll` or close, as the Kafka client documentation requires. Asynchronous
  workers violate that coupling unless auto-commit is disabled and only completed per-
  partition offsets are committed.
- A consumer rebalance redelivers records that were processed but not committed. Duplicates
  therefore exist even in a system with zero retries and zero broker failures.
- A visibility-timeout queue redelivers whenever the handler outlives the timeout. Slow
  handler plus fixed timeout is a duplicate generator with no failure anywhere.
- Kafka producer idempotence deduplicates protocol retries from one producer session using
  producer identity and per-partition sequence numbers. It does not recognize the same
  business event reconstructed and sent again by application code, and it does not make an
  external consumer effect idempotent.
- `isolation.level=read_committed` is a **consumer** setting. A transactional producer with
  `read_uncommitted` consumers downstream buys nothing — the aborted records are read.
- The moment the handler performs a side effect outside the transactional system — an HTTP
  call, a JDBC write to another store, a file — the transaction no longer covers the
  outcome. The design needs an idempotency key, effect ledger/query-and-reconcile protocol,
  or a transactional outbox/inbox reduction; a local transaction cannot roll back a remote
  effect. These reductions are in `references/exactly-once-boundary.md`.
- At-least-once is conditional, not immortality: retention expiry, exhausted retries, DLQ
  policy, unrecoverable storage loss and operator deletion can still lose the business work.
  State those assumptions and provide reconciliation for paths where loss is unacceptable.
- Preserve per-partition commit monotonicity. With parallel workers, committing offset 42
  while 41 is unfinished loses 41 on crash; track contiguous completion or pause partitions.
- An acknowledgement response can itself be lost. A successful effect followed by a commit
  timeout is an unknown state; blindly treating timeout as failure is a duplicate generator.
- Do not test the guarantee with a happy-path integration test. Use a disposable consumer
  process/container or a deterministic fault seam to kill it between effect and commit, and
  assert both recovered state and externally visible outcome.

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
