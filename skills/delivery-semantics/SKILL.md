---
name: delivery-semantics
description: >
  Delivery guarantees stated precisely: at-most-once, at-least-once and effectively-once;
  why exactly-once delivery is unachievable over a lossy channel; where the acknowledgement
  sits relative to the side effect; the exact boundary a Kafka read-process-write
  transaction holds within; and the duplicate causes that are not retries. Use when a design
  says "exactly-once", when a consumer acknowledges before doing the work, when duplicates
  land downstream although no retry exists in the code, when isolation.level or
  transactional.id is being configured, or when a handler makes an HTTP call and then
  commits. Does not cover making the handler safe to repeat (idempotency), retry policy
  (retries-and-backoff), ordering (message-ordering-and-partitioning), the permanently
  failing message (poison-messages-and-dlq), or the fault model (failure-models).
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
4. **Default to at-least-once plus a repeat-safe handler.** This is `effectively-once` and
   it is the competent default. How to make the handler repeat-safe is `idempotency`.
5. **Reach for a transaction only when the whole read-process-write stays inside one
   system.** For Kafka that means consuming and producing within one cluster with offsets
   committed inside the transaction. See `references/exactly-once-boundary.md`.
6. **Enumerate the duplicate sources that are not retries** — rebalance after a slow poll,
   redelivery after a visibility timeout expires, a duplicate already present upstream —
   and confirm the handler survives each.
7. **Prove it by fault injection**, not by reading configuration: kill the consumer between
   the side effect and the commit, and assert the downstream state after recovery.

## Rules

- Write `at-most-once`, `at-least-once`, `effectively-once`, or "exactly-once **within**
  \<named boundary\>". A guarantee with no named boundary is a marketing claim.
- **Exactly-once _delivery_ over an unreliable channel is impossible.** The Two Generals
  result: no finite exchange of messages that can be lost gives both sides common knowledge
  that the message arrived. The sender either stops retrying (risking loss) or keeps
  retrying (risking duplicates). Every product that sells exactly-once sells exactly-once
  _processing_ — deduplication or a transaction — not delivery.
- Ack before the side effect and you have chosen at-most-once. Say so in the code review,
  or move the ack.
- Auto-commit on an interval (`enable.auto.commit=true`) commits offsets the poll loop has
  fetched, whether or not the handler finished them. It is not a middle ground; it loses
  records on crash and still redelivers on rebalance.
- A consumer rebalance redelivers records that were processed but not committed. Duplicates
  therefore exist even in a system with zero retries and zero broker failures.
- A visibility-timeout queue redelivers whenever the handler outlives the timeout. Slow
  handler plus fixed timeout is a duplicate generator with no failure anywhere.
- Kafka's `enable.idempotence=true` deduplicates a **producer's own retries** per partition
  via producer id and sequence number, over a bounded window of recent batches. It does not
  deduplicate a re-sent record from a restarted application, and it says nothing about the
  consumer.
- `isolation.level=read_committed` is a **consumer** setting. A transactional producer with
  `read_uncommitted` consumers downstream buys nothing — the aborted records are read.
- The moment the handler performs a side effect outside the transactional system — an HTTP
  call, a JDBC write to another store, a file — the transaction no longer covers the
  outcome, and the design reduces to at-least-once plus deduplication. The two standard
  reductions are the transactional outbox and an idempotent consumer with a dedup store;
  both are in `references/exactly-once-boundary.md`.
- Do not test the guarantee with a happy-path integration test. Kill the process between
  the side effect and the commit — Testcontainers plus a `Runtime.halt` in the handler is
  enough — and assert the recovered state.

## References

- [Ack placement](references/ack-placement.md) — the three ack positions in a Kafka
  consumer and in a visibility-timeout queue, each with the guarantee it yields and the
  concrete loss or duplication it produces. Read when reviewing or writing a consumer loop,
  or when deciding where a commit goes.
- [The exactly-once boundary](references/exactly-once-boundary.md) — what a Kafka
  transactional producer covers and what it does not, and the transactional outbox and
  idempotent-consumer reductions for a side effect outside it. Read before claiming a path
  is exactly-once, or when the handler writes anywhere other than the broker.
