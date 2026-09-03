---
name: streaming-pipeline-topologies
description: >
  Composable stage shapes for event-driven pipelines — copier, filter, splitter, sharder,
  merger — with ordering, semantic parallelism, state, shuffle and recovery boundaries;
  exactly-once scope across source, state and sinks; bounded joins and windows; watermarks,
  late-data policy, backlog versus flow control, and reproducible replay. Use when a stage is
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

Semantic parallelism is safe when operations commute/order does not matter, or keyed state and
effects have one current owner with recovery/fencing. Stateless code can still emit ordered or
non-idempotent effects; stateful frameworks can safely parallelize by key. Repartitioning is a
shuffle boundary: old-key order no longer defines order among records sharing a new key, state
must migrate/rebuild and skew changes. It does **not** inherently end exactly-once—some engines
include repartition topics/state in one transaction or checkpoint. The two failures prevented are the stage
parallelised because it "looked stateless", and the join that retains every key it has ever
seen — which passes every load test and dies in week three of memory, not of throughput.

## Workflow

1. **Name each stage by shape** before drawing arrows. If an operator combines shapes, model
   each semantic step even when the implementation fuses them; this exposes separate ordering,
   state and failure boundaries without forcing an unnecessary network hop.
2. **For each stage, answer four questions:** what ordering does it preserve, is it safe above
   concurrency 1, what state does it hold, and how does it fail. The table is
   `references/stage-catalogue.md`.
3. **Mark every shuffle/repartition explicitly.** State old/new key, partitioner/count/epoch,
   ordering semantics, framework transaction/checkpoint boundary and recovery. Never inherit an
   exactly-once label across a sink the engine does not control.
4. **For any stateful stage, bound the state.** A window, a retention, or a key-space bound —
   and a metric on state size before it is a heap dump. See `references/stateful-stages.md`.
5. **Write the late-data policy down** — drop, side stream, or correction. Not deciding is
   deciding to drop silently.
6. **Trace flow control and backlog separately.** Operator queues/credits can backpressure
   upstream within a job; a durable log usually decouples producers, so consumer lag measures
   backlog without slowing production. Bound both internal buffers and log retention/replay.
7. **Specify replay semantics**: use event time when historical event-time answers are required,
   pin timestamp/watermark/late-data rules, and test with controlled time rather than sleeping.

## Decision block

```text
Run a stage above concurrency 1 when:
- records/effects commute or sequence/version checks tolerate completion reordering, or
- state is keyed by the partition key, one current owner is enforced, and checkpoint,
  rebalance and stale-owner behavior are defined

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

- Statelessness alone does not make effects order-insensitive. Parallelize freely only when
  output/effect composition tolerates completion order and duplicates; otherwise preserve a
  serial lane or version/sequence guard. Stateful keyed ownership also needs checkpoint,
  rebalance and stale-task fencing semantics.
- **A filter is cheap per record and expensive per pipeline.** Dropping 99% after the record was
  fetched, decompressed and deserialised means 99% of that I/O and deserialisation bought
  nothing (`serialization-performance`). Push the predicate to the source when the source can
  evaluate it; otherwise say you are paying for it knowingly.
- A **splitter** raises one question and it is transactional: are the N outputs atomic? If not,
  a crash after output 1 leaves consumers of output 2 with a gap they must tolerate. What a
  transaction covers, and what it does not, is `delivery-semantics`.
- A **sharder/shuffle** changes the key and forces three reviews:
  per-key ordering (records sharing a new key may arrive from inputs with no relative order),
  the guarantee/checkpoint scope (which may or may not include the shuffle), and skew profile (a new
  key is a new distribution — `hot-partitions-and-rebalancing`).
- A stream-stream join without eviction can retain unmatched records indefinitely. Table/latest-
  value joins may retain current state per live key and tombstones may remove it; fixed-size
  aggregates need less per-key bytes than raw-event joins. Bound by semantic retention and
  measure distinct keys, unmatched events, bytes and compaction/checkpoint amplification.
- A **copier**—a second consumer group—decouples offsets/failure but adds broker read/network/
  cache and downstream cost. Prefer it over producer fan-out when independent replay/retention
  semantics and infrastructure capacity justify it.
- **Say which window and implementation you mean.** Naive sliding windows replicate each record
  across `size/step` windows; pane/incremental aggregation can reduce storage/CPU depending on
  whether the function is algebraically mergeable. Continuous sessions may never finalize,
  but state growth depends on accumulator versus raw-event/join storage.
- A watermark is an engine/source assertion about event-time progress, commonly the minimum
  across active partitions plus out-of-orderness/idleness policy—not a guarantee. It encodes how
  long to wait for stragglers; the late-data policy is a
  separate decision about the one that arrives anyway. Name both — "it probably won't happen" is
  silent, unattributable data loss, and it happens on every replay.
- **In a log-based boundary, lag is durable backlog, not backpressure to producers.** A slow
  consumer reads later while producers may continue. Retention can make old input unavailable;
  internal queues/state can still OOM before that. Alert on age/bytes/catch-up capacity against
  SLO and effective retention. In-process demand signalling—`request(n)`, credits, bounded buffers
  strategies — is a different mechanism inside one JVM (`reactive-backpressure`).
- Processing-time windows generally produce different buckets on replay; use them only when
  current processing behavior is the intended semantics. Event time improves reproducibility
  only with stable timestamp extraction, watermark/idleness rules, late policy, input snapshot
  and deterministic operators/sinks.
- Replay of a stateful pipeline is not "start at offset 0": window state must be reset or
  rebuilt, the output must land somewhere that tolerates a rewrite, and downstream consumers see
  the whole history again (`idempotency`). Decide where replay output lands before you need it.
- Never size a state store from the average key: size it from distinct keys × per-key state ×
  window multiplicity, and export the real number as a metric. A store whose size is visible
  only in a heap dump has already taken the outage.

## Exactly-once scope

For each engine, enumerate source offsets, shuffle topics, state changelog/checkpoint and sinks
inside one atomic recovery boundary. Kafka Streams `exactly_once_v2` can transactionally couple
Kafka input/output/state changelog, but an external database call is outside. Flink checkpoints
need a replayable source and checkpoint-aware/idempotent/transactional sink; checkpoint success
does not make an arbitrary side effect exactly once. Upgrades, rescaling and savepoint/state-
serializer compatibility are part of the contract.

## Security and operability

- Authenticate/authorize internal topics/state stores and protect replay tools; topology
  duplication can bypass the API's tenant controls.
- Minimize PII in repartition keys/changelogs and apply retention/deletion to derived copies.
- Expose topology version, partition/key distribution, watermark per input, idle partitions,
  late/drop/correction count, state bytes/entries, checkpoint duration/failure and restore time.

## References

- [The stage catalogue](references/stage-catalogue.md) — every shape with its ordering effect,
  parallel-safety condition, state requirement and characteristic failure, plus the composition
  rules and the shapes that are two stages pretending to be one. Read when designing a topology
  or reviewing whether a stage may be parallelised.
- [Stateful stages](references/stateful-stages.md) — window types with their state cost,
  watermarks and late-data policy options, the unbounded-state failure with the metrics that
  catch it before OOM, state store sizing, and how to test a windowed join deterministically on
  controlled event time. Read before building a join, or when state is growing.
