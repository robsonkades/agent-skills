---
name: kafka-consumers-in-java
description: >
  Operating a Kafka consumer from Java: the log-not-a-queue model where consumption removes
  nothing and position is an offset; the rebalance as the central operational event, with
  cooperative assignment as the mitigation and where duplicates enter; why slow processing
  trips max.poll.interval.ms, not the session timeout; pause/resume for slow work; commit
  strategies; auto.offset.reset as a data-loss-or-reprocessing decision; and lag as record,
  byte, time and catch-up signals. Use when a group rebalances repeatedly under load, when records are
  reprocessed after a deploy, when enable.auto.commit is left on, when a consumer starts
  from the wrong place after an outage. Not
  ordering scope (message-ordering-and-partitioning), guarantees (delivery-semantics),
  repeat-safe handlers (idempotency), the record that never succeeds
  (poison-messages-and-dlq), deserialisation cost (serialization-performance), in-flight
  bounds (concurrency-limiting-and-bulkheads), or drain (kubernetes-service-lifecycle).
---

# Kafka Consumers In Java

## Purpose

Kafka stores an ordered log per partition and consumer groups layer competing-consumer
semantics over it. Consumption does not delete a record; retention/compaction controls its
lifetime, while each group stores offsets independently and can seek or reset. Additional
groups do not advance one another's offsets, but they do add broker fetch, cache, network and
downstream load. Treat the committed offset as a recovery checkpoint, not proof that a
business effect happened.

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
2. **Choose synchronous processing, manual offset tracking or a framework-managed ack mode.**
   Auto-commit can be at-least-once only when every record from the previous `poll()` finishes
   before the next `poll()`/close; disable it for asynchronous work or when the exact commit
   boundary must be explicit.
3. **Measure the whole poll-cycle tail.** `records returned × per-record time` is a conservative
   estimate only for serial homogeneous work; include deserialization, queueing, retries,
   commits, batch overhead and correlated dependency latency against `max.poll.interval.ms`.
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
- the measured worst credible poll cycle is comfortably below max.poll.interval.ms
- per-partition ordering must hold end to end and the handler is the last step
- the handler is CPU-bound or calls a dependency with a short, bounded tail

Reduce max.poll.records first when:
- the batch, not the record, is what overruns. One setting, no structural change

Move work off the poll thread with pause/resume when:
- a single record's handler can exceed the poll interval on its own, or the dependency's
  latency tail is unbounded or externally controlled
- throughput needs concurrency while the poll thread remains responsive; preserve one ordered
  lane per partition or explicitly spend per-partition ordering, and track the highest
  contiguous completed offset rather than the maximum completion

Hand the work to a task queue instead when:
- the unit takes minutes or must survive independently of the consumer, and per-key
  ordering is not required (task-queues-and-competing-consumers)

Raise max.poll.interval.ms when:
- legitimate bounded processing cannot fit after batch/concurrency changes and the slower
  detection of a live-but-not-polling member is acceptable; process death is normally found
  by the session timeout, with static-membership nuances
```

## Rules

- **Consumption removes nothing.** Reprocessing is a seek, not recovery of deleted data, and a
  second group has independent position but consumes shared broker/downstream resources.
  Conversely there is no queue-style deletion drain: retention removes on
  time or size whether or not anyone consumed.
- Under a normal group assignment, one topic-partition is assigned to at most one member at a
  time. Useful member concurrency is bounded by the assignable partitions across the
  subscription and assignor constraints; local handler concurrency is a separate decision.
  Extra Spring container consumers may idle and enlarge group coordination overhead.
- `enable.auto.commit=true` periodically commits offsets of records returned by prior polls
  as part of consumer polling. If all those records complete synchronously before the next
  poll/close, it can be at-least-once. If records escape to asynchronous workers, offsets can
  advance before effects complete and crash can lose work. Auto-commit does not remove the
  duplicate window.
- **Slow application processing normally trips `max.poll.interval.ms`; process/network
  liveness trips the session timeout.** Heartbeats are independent of record handling in the
  classic Java client, while the newer consumer group protocol lets the broker control the
  heartbeat interval. Static members that exceed the poll interval stop heartbeating and may
  retain assignment until session expiry. Check client/broker protocol and version rather
  than applying one timing diagram universally.
- The fix for a slow handler is a smaller `max.poll.records`, a faster handler, or `pause()` on
  the assigned partitions with the work on a **bounded** executor while the loop keeps polling
  (`concurrency-limiting-and-bulkheads`). Polling into an unbounded executor only moves the
  backlog into the heap.
- A rebalance or crash can redeliver records after the last committed next offset. A graceful
  rebalance does not necessarily duplicate every uncommitted record if revocation commits a
  safe contiguous position, but correctness cannot depend on that callback during eviction or
  process death. Commit granularity is a duplicate-window and broker-load decision.
- Eager rebalancing revokes the current assignment before redistribution; cooperative
  rebalancing can retain partitions that need not move. `CooperativeStickyAssignor` requires a
  compatible staged rollout, and Kafka's newer consumer rebalance protocol changes assignor
  configuration/coordination. Select against deployed client and broker versions.
- Set a stable, unique `group.instance.id` when ungraceful short restarts dominate and delayed
  reassignment is acceptable. Graceful leave, duplicate instance IDs and orchestrator identity
  reuse have different behavior; static membership is not a blanket way to eliminate rolling
  rebalances. The price is partitions remaining unavailable until session expiry after a dead
  member.
- **`auto.offset.reset` applies only when there is no valid committed offset** — a new group, a
  typo in `group.id`, expired offsets, or a committed offset outside retention. `latest`
  silently skips everything produced during the gap; `earliest` replays the whole retained
  topic downstream; `none` fails loudly and makes a human decide.
- **No single lag number is sufficient.** Record lag needs arrival/service rates to estimate
  catch-up; timestamp age can be producer-clock skewed, sparse, compacted or based on create
  versus append time. Track per-partition next-record age where meaningful, oldest in-flight
  age, record/byte lag, arrival and completion rates, and projected catch-up time.
- Consumer shutdown is a drain: stop polling, finish or abandon in-flight work, commit what
  completed, then `close()` so the member leaves the group instead of waiting out the session
  timeout. Sequencing and the grace budget are `kubernetes-service-lifecycle`.
- Deserialisation runs on the poll thread and bills as consumer cost, not handler cost. A record
  that cannot be deserialised is permanently poison and blocks its partition
  (`poison-messages-and-dlq`); the format's own cost is `serialization-performance`.
- `KafkaConsumer` is not thread-safe. Keep `poll`, assignment, pause/resume, seek and commit on
  the owning thread; other threads signal it through a thread-safe queue and `wakeup()`. For
  parallel processing, commit only the next offset after the highest contiguous completed
  record per partition—never the numerically largest completed offset.

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
