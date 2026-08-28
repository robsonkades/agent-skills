---
name: kafka-consumers-in-java
description: >
  Operating a Kafka consumer from Java: the log-not-a-queue model where consumption removes
  nothing and position is an offset; the rebalance as the central operational event, with
  cooperative assignment as the mitigation and where duplicates enter; why slow processing
  trips max.poll.interval.ms, not the session timeout; pause/resume for slow work; commit
  strategies; auto.offset.reset as a data-loss-or-reprocessing decision; and lag in time,
  not records. Use when a group rebalances repeatedly under load, when records are
  reprocessed after a deploy, when enable.auto.commit is left on, when a consumer starts
  from the wrong place after an outage, or when lag alerts fire on record counts. Not
  ordering scope (message-ordering-and-partitioning), guarantees (delivery-semantics),
  repeat-safe handlers (idempotency), the record that never succeeds
  (poison-messages-and-dlq), deserialisation cost (serialization-performance), in-flight
  bounds (concurrency-limiting-and-bulkheads), or drain (kubernetes-service-lifecycle).
---

# Kafka Consumers In Java

## Purpose

**Kafka is a log, not a queue.** Consuming does not remove a record; it stays until retention
expires, and a group's position is an offset it stores. Several groups read the same partition
independently, and a group can be moved backwards. Most confusion in a Kafka consumer — "the
message disappeared", "why did it reprocess" — dissolves once the offset is understood as the
only state consumption changes.

Two decisions follow. **Where the commit sits relative to the work** decides the guarantee (the
vocabulary is `delivery-semantics`; do not re-derive it here). **How long the handler takes
between polls** decides whether the group rebalances, and a rebalance redelivers everything
processed but not committed. The failure this prevents is the consumer that reprocesses a batch
every few minutes under load with no error, no retry and no broker fault: a slow handler trips
the poll interval, the member is evicted, the group rebalances, the batch comes back.

## Workflow

1. **Fix the guarantee first** — where the commit sits relative to the side effect.
   `delivery-semantics` owns the answer; everything below assumes at-least-once plus a
   repeat-safe handler (`idempotency`).
2. **Set `enable.auto.commit=false`** wherever correctness matters, and commit explicitly.
3. **Measure the handler and check the budget:** `max.poll.records × handler p99.9` against
   `max.poll.interval.ms`. If it does not fit with margin, use the decision block below.
4. **Choose the assignment strategy and membership shape** — incremental cooperative
   assignment, plus static membership if rolling restarts dominate rebalances
   (`references/poll-loop-and-rebalance.md`).
5. **Decide `auto.offset.reset` per topic.** It applies only when there is no valid committed
   offset, which is exactly the 3 a.m. situation.
6. **Instrument lag in time, per partition**, and alert on that rather than record counts
   (`references/offsets-and-lag.md`).
7. **Prove it by fault injection** — kill the consumer mid-batch and assert no loss; force a
   rebalance under load and assert the downstream outcome.

## Decision block

```text
Process on the poll thread when:
- max.poll.records × handler p99.9 is comfortably below max.poll.interval.ms
- per-partition ordering must hold end to end and the handler is the last step
- the handler is CPU-bound or calls a dependency with a short, bounded tail

Reduce max.poll.records first when:
- the batch, not the record, is what overruns. One setting, no structural change

Move work off the poll thread with pause/resume when:
- a single record's handler can exceed the poll interval on its own, or the dependency's
  latency tail is unbounded or externally controlled
- throughput needs handler concurrency above one per partition — then per-partition
  ordering is what you are spending, and it must be stated

Hand the work to a task queue instead when:
- the unit takes minutes or must survive independently of the consumer, and per-key
  ordering is not required (task-queues-and-competing-consumers)

Do not raise max.poll.interval.ms first when:
- it also bounds how long the group waits before reassigning a genuinely dead member
```

## Rules

- **Consumption removes nothing.** Reprocessing is a seek, not recovery of deleted data, and a
  second group costs the first nothing. Conversely there is no "drain": retention deletes on
  time or size whether or not anyone consumed.
- One partition is consumed by at most one member of a group at a time, so **group concurrency
  is capped by partition count** — extra members idle. Spring Kafka's container `concurrency`
  creates that many consumers; above the partition count it only enlarges rebalances.
- `enable.auto.commit=true` commits on a timer whatever the poll loop returned, finished or
  not. It loses records on crash _and_ still redelivers on rebalance — not a middle ground.
- **Slow processing trips `max.poll.interval.ms`, not `session.timeout.ms`.** Heartbeats come
  from a background thread, so the group sees the member as alive while the handler runs; what
  expires is the gap between `poll()` calls. Raising the session timeout changes nothing.
- The fix for a slow handler is a smaller `max.poll.records`, a faster handler, or `pause()` on
  the assigned partitions with the work on a **bounded** executor while the loop keeps polling
  (`concurrency-limiting-and-bulkheads`). Polling into an unbounded executor only moves the
  backlog into the heap.
- **A rebalance redelivers everything processed but not committed** — on every member join and
  leave, including every rolling deploy. Duplicates therefore exist with zero retries and zero
  faults, and commit granularity is a duplicate-window decision.
- Eager assignment revokes **all** partitions from **all** members and reassigns from scratch,
  stopping the whole group. Incremental cooperative assignment (`CooperativeStickyAssignor`)
  revokes only the partitions that move. Prefer it; treat the switch as a rolling migration.
- Set `group.instance.id` (static membership) when rolling restarts dominate rebalances: a
  member rejoining within the session timeout keeps its assignment. The price is slower
  detection of one genuinely gone — size the session timeout from how long a stall is tolerable.
- **`auto.offset.reset` applies only when there is no valid committed offset** — a new group, a
  typo in `group.id`, expired offsets, or a committed offset outside retention. `latest`
  silently skips everything produced during the gap; `earliest` replays the whole retained
  topic downstream; `none` fails loudly and makes a human decide.
- **Lag in records misleads; lag in time does not.** 50 000 records is seconds on one topic and
  hours on another, and record lag also falls to zero when the _producer_ stops. Alert on the
  age of the next record to consume, **per partition** — one blocked partition vanishes in a
  group total.
- Consumer shutdown is a drain: stop polling, finish or abandon in-flight work, commit what
  completed, then `close()` so the member leaves the group instead of waiting out the session
  timeout. Sequencing and the grace budget are `kubernetes-service-lifecycle`.
- Deserialisation runs on the poll thread and bills as consumer cost, not handler cost. A record
  that cannot be deserialised is permanently poison and blocks its partition
  (`poison-messages-and-dlq`); the format's own cost is `serialization-performance`.

## References

- [The poll loop and the rebalance](references/poll-loop-and-rebalance.md) — the loop's
  contract, what each timeout actually bounds, the pause/resume shape for slow work, the
  rebalance sequence annotated with where duplicates enter, and the settings that reduce
  rebalance pain by role. Read when a group rebalances under load, or before moving work off
  the poll thread.
- [Offsets and lag](references/offsets-and-lag.md) — commit strategies compared with the
  guarantee and duplicate window each yields, `auto.offset.reset` as an explicit decision, lag
  in time versus records, and the fault-injection tests that prove no loss under at-least-once.
  Read when choosing a commit strategy or building consumer alerts.
