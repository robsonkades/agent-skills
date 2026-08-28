---
name: streaming-pipeline-topologies
description: >
  Composable stage shapes for event-driven pipelines — copier, filter, splitter, sharder,
  merger — each with the ordering it preserves or destroys, whether it is safe above
  concurrency 1, the state it needs and how it fails; a stage parallelises safely only when
  stateless or partitioned by its input key, so re-partitioning is where ordering and
  exactly-once end; the unbounded-state join; watermarks and a named late-data policy; lag
  as backpressure; and replay, which wall-clock windows destroy. Use when a stage is
  parallelised, when a join grows state without bound, when a stage re-keys the stream, when
  late events arrive after a window closed, when a windowed test uses wall-clock, or when
  reprocessing gives a different answer. Not whether to be event-driven
  (event-driven-architecture), ordering scope (message-ordering-and-partitioning), barriers
  (distributed-aggregation-and-barriers), skew (hot-partitions-and-rebalancing), the
  consumer (kafka-consumers-in-java), or in-process demand (reactive-backpressure).
---

# Streaming Pipeline Topologies

## Purpose

Give a pipeline a vocabulary of stage shapes, and decide for each whether it may run at
concurrency above 1 — the single question where correctness is silently traded for throughput.
The shapes are small: **copier** (fan-out to independent consumers), **filter** (drop by
predicate), **splitter** (one input, many outputs), **sharder** (re-partition by a new key),
**merger/join** (combine streams, which needs state).

One rule decides all of them. **A stage is safe to parallelise if it is stateless, or if it is
partitioned by the same key as its input and each partition has one owner.** Anything else must
re-partition first, and re-partitioning is the dangerous operation: it breaks the per-key order
the input carried, and it ends whatever exactly-once boundary the input was inside, because a
different writer now produces the output. The two failures this prevents are the stage
parallelised because it "looked stateless", and the join that retains every key it has ever
seen — which passes every load test and dies in week three of memory, not of throughput.

## Workflow

1. **Name each stage by shape** before drawing arrows. A stage that is two shapes at once —
   filter and sharder in one operator — is where the reasoning breaks down; split it.
2. **For each stage, answer four questions:** what ordering does it preserve, is it safe above
   concurrency 1, what state does it hold, and how does it fail. The table is
   `references/stage-catalogue.md`.
3. **Mark every re-partition explicitly.** Each is a boundary: per-key ordering restarts, the
   guarantee restarts, the key's cardinality changes (`message-ordering-and-partitioning`).
4. **For any stateful stage, bound the state.** A window, a retention, or a key-space bound —
   and a metric on state size before it is a heap dump. See `references/stateful-stages.md`.
5. **Write the late-data policy down** — drop, side stream, or correction. Not deciding is
   deciding to drop silently.
6. **Decide how backpressure is expressed.** In a log-based pipeline it is lag, bounded by
   retention rather than memory — past that boundary it is data loss.
7. **Check the pipeline is replayable**: process on event time, and test windows with
   controlled time rather than the wall clock.

## Decision block

```text
Run a stage above concurrency 1 when:
- it is stateless per record — filter, map, copier — and downstream needs no ordering, or
- its state is keyed and the input is already partitioned by that same key, with exactly
  one owner per partition

Keep a stage at one worker per partition when:
- downstream state is order-sensitive per key: a state machine, a CDC apply, an
  event-sourced projection. Parallelism within a partition reorders it

Do not treat parallelism as a knob when:
- the stage changes the partitioning (sharder) or combines partitions (merger, join).
  Parallelism there is a re-keying decision, and the correct key is the question

Push the stage upstream instead when:
- it is a filter with high selectivity and the source can evaluate the predicate

Split into separate pipelines instead when:
- two branches need different parallelism, ordering or retention. One topology forced to
  satisfy both is sized for the stricter and pays for it twice
```

## Rules

- Parallelism is safe when the stage is stateless or key-partitioned with exclusive ownership.
  Any other parallelisation reorders the stream, and the reordering is invisible until a
  downstream aggregate disagrees with its source.
- **A filter is cheap per record and expensive per pipeline.** Dropping 99% after the record was
  fetched, decompressed and deserialised means 99% of that I/O and deserialisation bought
  nothing (`serialization-performance`). Push the predicate to the source when the source can
  evaluate it; otherwise say you are paying for it knowingly.
- A **splitter** raises one question and it is transactional: are the N outputs atomic? If not,
  a crash after output 1 leaves consumers of output 2 with a gap they must tolerate. What a
  transaction covers, and what it does not, is `delivery-semantics`.
- A **sharder** is the only stage that changes the key, and it invalidates three things at once:
  per-key ordering (records sharing a new key may arrive from partitions with no relative
  order), the guarantee boundary (a new producer writes the output), and the skew profile (a new
  key is a new distribution — `hot-partitions-and-rebalancing`).
- **A merger or join without a window retains every key it has ever seen.** Growth is in
  _distinct keys_, not throughput, so an hour at 10× traffic proves nothing about a month. Size
  every join's window from how late the other side can legitimately arrive.
- A **copier** — a second consumer group on the same log — is the cheapest decoupling available,
  costing the producer and the first consumer nothing. Prefer it over a splitter whenever the
  two consumers are independent.
- **Say which window you mean, and price it.** Tumbling holds one bucket per key per interval;
  sliding holds each record in `size / step` windows at once, a real multiplier on state;
  session holds state until a gap, so a stream with no gaps has no bound at all.
- **A watermark is a decision about how long to wait for stragglers**; the late-data policy is a
  separate decision about the one that arrives anyway. Name both — "it probably won't happen" is
  silent, unattributable data loss, and it happens on every replay.
- **In a log-based pipeline, backpressure is lag** — a slow stage reads later and the log holds
  the buffer. That is bounded by _retention_, not memory, so the failure mode is not OOM but
  unrecoverable loss once lag exceeds retention: alert on lag in time against the retention, not
  only against the SLO. In-process demand signalling — `request(n)`, bounded buffers, overflow
  strategies — is a different mechanism inside one JVM (`reactive-backpressure`).
- **Wall-clock windows are not replayable.** Bucketing by processing time gives a different
  answer on every run, so reprocessing can neither reproduce nor correct history. Use event
  time, carry the timestamp in the payload, and treat processing-time windows as a deliberate
  accuracy trade.
- Replay of a stateful pipeline is not "start at offset 0": window state must be reset or
  rebuilt, the output must land somewhere that tolerates a rewrite, and downstream consumers see
  the whole history again (`idempotency`). Decide where replay output lands before you need it.
- Never size a state store from the average key: size it from distinct keys × per-key state ×
  window multiplicity, and export the real number as a metric. A store whose size is visible
  only in a heap dump has already taken the outage.

## References

- [The stage catalogue](references/stage-catalogue.md) — every shape with its ordering effect,
  parallel-safety condition, state requirement and characteristic failure, plus the composition
  rules and the shapes that are two stages pretending to be one. Read when designing a topology
  or reviewing whether a stage may be parallelised.
- [Stateful stages](references/stateful-stages.md) — window types with their state cost,
  watermarks and late-data policy options, the unbounded-state failure with the metrics that
  catch it before OOM, state store sizing, and how to test a windowed join deterministically on
  controlled event time. Read before building a join, or when state is growing.
