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

Give a pipeline a vocabulary of stage shapes, and decide where ordering, state, concurrency
and recovery constrain its implementation.
The shapes are small: **copier** (fan-out to independent consumers), **filter** (drop by
predicate), **splitter** (one input, many outputs), **sharder** (redistribute by key or partition mapping),
**merger/join** (combine streams; a union can interleave without keyed join state).

Semantic parallelism is safe when operations commute/order does not matter, or keyed state and
effects have one current owner with recovery/fencing. Stateless code can still emit ordered or
non-idempotent effects; stateful frameworks can safely parallelize by key. Repartitioning is a
shuffle boundary: inspect whether the logical key or only its partition mapping changes, what
ordering the source/application protocol establishes, and how ownership/state and skew change.
Independent input partitions do not supply a cross-partition order on their own. It does **not** inherently end exactly-once—some engines
include repartition topics/state in one transaction or checkpoint. The two failures prevented are the stage
parallelised because it "looked stateless", and the join that retains every key it has ever
seen without a semantic or capacity bound. A short repeated-key load test can miss growth over
the actual retention and key population.

## Workflow

Use the steps relevant to the question and reuse adequate evidence. A narrow stage explanation
or sound existing topology need not trigger a full graph, split, replay or fault campaign.
Inspect deployed engine/API, connector and Java versions, topology configuration and state
backend before using version-sensitive guarantees; no upgrade is implied. Missing watermark,
checkpoint or sink evidence limits dependent claims, without erasing independently supported
conclusions. Deliver the relevant decision/evidence; include affected stage boundaries, state/backlog
budgets and recovery checks when the requested design/change needs them. Replay, resets and failure injection
must use isolated targets or existing explicit authorization for their effects.

1. **Name the relevant stages by shape.** If an operator combines shapes, model
   each semantic step even when the implementation fuses them; this exposes separate ordering,
   state and failure boundaries without forcing an unnecessary network hop.
2. **For each stage, answer four questions:** what ordering does it preserve, is it safe above
   concurrency 1, what state does it hold, and how does it fail. The table is
   `references/stage-catalogue.md`.
3. **Mark every shuffle/repartition explicitly.** State old/new key, partitioner/count/epoch,
   ordering semantics, framework transaction/checkpoint boundary and recovery. Never inherit an
   exactly-once label across a sink the engine does not control.
4. **For any stateful stage, bound the state.** Specify key count, bytes/events per key,
   multiplicity, and the clock/progress that drives cleanup. A window or TTL alone is not a
   physical bound when progress stalls. See `references/stateful-stages.md`.
5. **Write the late-data policy down** — drop, side stream, or correction. Not deciding is
   accepting an unverified framework default; inspect and instrument it.
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
  event-sourced projection. Unordered execution/emission can reorder it; ordered per-key lanes
  or validated ordered-async operators may preserve the required contract

Do not treat parallelism as a knob when:
- the stage changes the partitioning (sharder) or combines partitions (merger, join).
  Evaluate key ownership, migration and ordering; changing parallelism need not change the key

Push the stage upstream instead when:
- it is a filter with high selectivity and the source can evaluate the predicate

Consider separate pipelines when:
- required resource, failure, security, retention or deployment independence cannot be met
  adequately within the current engine/job; differing branch settings alone do not establish this
- compare per-operator parallelism/state policy and supported isolation with the extra broker,
  serialization, coordination and recovery costs of a split
```

## Rules

- Statelessness alone does not make effects order-insensitive. Parallelize freely only when
  output/effect composition tolerates completion order and duplicates; otherwise preserve a
  serial lane or version/sequence guard. Stateful keyed ownership also needs checkpoint,
  rebalance and stale-task fencing semantics.
- Filter cost and removable upstream work depend on payloads, batching and predicate cost.
  Push a pure predicate earlier only if null/type/time semantics and required audit/security
  observations remain equivalent; a 99% record drop does not imply 99% byte or CPU savings.
- For a **splitter**, establish output multiplicity, ordering, backpressure and partial failure,
  including whether the N outputs must be atomic. If not,
  a crash after output 1 leaves consumers of output 2 with a gap they must tolerate. What a
  transaction covers, and what it does not, is `delivery-semantics`.
- A **sharder/shuffle** changes partition placement and may change the key. Review:
  per-key ordering (including any authoritative sequence/version protocol across inputs),
  the guarantee/checkpoint scope (which may or may not include the shuffle), and skew profile (a new
  key or mapping can change the distribution — `hot-partitions-and-rebalancing`).
- A stream-stream join without eviction can retain unmatched records indefinitely. Table/latest-
  value joins may retain current state per live key and tombstones may remove it; fixed-size
  aggregates need less per-key bytes than raw-event joins. Bound by semantic retention and
  measure distinct keys, unmatched events, bytes and compaction/checkpoint amplification.
- A **copier**—a second consumer group—decouples offsets/failure but adds broker read/network/
  cache and downstream cost. Kafka groups have independent offsets, but share topic retention
  and compaction; another group does not preserve expired input or create independent retention.
- **Say which window and implementation you mean.** Naive sliding windows replicate each record
  across `size/step` windows; pane/incremental aggregation can reduce storage/CPU depending on
  whether the function is algebraically mergeable. Continuous sessions may never finalize,
  but state growth depends on accumulator versus raw-event/join storage.
- A watermark is an engine/source assertion about event-time progress, commonly the minimum
  across active partitions plus out-of-orderness/idleness policy—not a guarantee. It encodes how
  long to wait for stragglers; the late-data policy is a
  separate decision about the one that arrives anyway. Name both — "it probably won't happen" is
  insufficient evidence for a loss policy. Replay behavior depends on how progress is rebuilt.
- **In a log-based boundary, lag is durable backlog, not backpressure to producers.** A slow
  consumer reads later while producers may continue. Retention can make old input unavailable;
  internal queues/state can still OOM before that. Alert on age/bytes/catch-up capacity against
  SLO and effective retention. In-process demand signalling—`request(n)`, credits, bounded buffers
  strategies — is a different mechanism inside one JVM (`reactive-backpressure`).
- Processing-time windows generally produce different buckets on replay; use them only when
  current processing behavior is the intended semantics. Event time improves reproducibility
  only with stable timestamp extraction, watermark/idleness rules, late policy, input snapshot
  and deterministic operators/sinks.
- Replay is not merely "start at offset 0": a full recomputation needs isolated/reset state,
  while checkpoint recovery restores state and source positions consistently. Choose versioned
  output/cutover or a sink protocol that tolerates replay (`idempotency`) before running it.
- Estimate aggregate state from live key/event population, representative weighted per-key bytes
  and window/version multiplicity. Then check hot keys/partitions, physical amplification and
  recovery headroom; an average alone does not establish those limits. Expose actual state size
  and growth before relying on a capacity estimate.

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
  rules and semantic steps within fused operators. Read when designing a topology
  or reviewing whether a stage may be parallelised.
- [Stateful stages](references/stateful-stages.md) — window types with their state cost,
  watermarks and late-data policy options, the unbounded-state failure with the metrics that
  catch it before OOM, state store sizing, and how to test a windowed join deterministically on
  controlled event time. Read before building a join, or when state is growing.
