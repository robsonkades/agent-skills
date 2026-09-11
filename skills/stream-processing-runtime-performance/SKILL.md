---
name: stream-processing-runtime-performance
description: >
  Operating Kafka Streams and Apache Flink for predictable throughput, state and recovery:
  separating their execution models, sizing partitions or operator parallelism, diagnosing
  backpressure, bounding native state, and relating commits or checkpoints to result visibility.
  Use when one partition or operator limits a pipeline, checkpoints grow or stall, RocksDB drives
  RSS outside the heap, exactly-once changes latency, or effective runtime configuration differs
  from declared settings. Generic topology and event-time semantics belong to
  streaming-pipeline-topologies; plain Kafka consumer loops to kafka-consumers-in-java.
---

# Stream-Processing Runtime Performance

## Purpose

Turn a streaming symptom into the runtime resource, state or recovery mechanism that owns it.
Kafka Streams is an embedded partition-to-task library; Flink is a distributed operator graph.
They share concepts but not a tuning surface.

## Common contract

Use the parts of this inventory relevant to the question, reusing adequate supplied evidence.
A task-count, TTL or configuration API explanation need not trigger unrelated captures or a change.
Record relevant engine and connector versions, topology/job graph, input partitions and key distribution,
operator/task parallelism, offered/completed events and bytes, per-partition age/lag, backpressure,
state location/size, allocation rate, heap/RSS/container limits, checkpoint/commit configuration,
processing guarantee, sink visibility and recovery objectives.
Inspect the project's JDK/toolchain and engine/connector support matrix; the references use Kafka
4.0 and Flink 2.0 as evidence baselines, not mandatory upgrades. Preserve topology IDs, partitioning,
state schemas and deployment authority when changing runtime settings.

## Workflow

Apply the steps needed to establish the requested diagnosis or decision. Missing evidence leaves
the affected mechanism unresolved; it does not invalidate independent documented facts.

1. Draw source partitions through every shuffle/operator to state and sinks. Mark ownership,
   serialization and atomic recovery boundaries.
2. Locate the limiting partition or operator with aligned rates, waits and resource evidence; aggregates hide skew and head-of-line
   blocking.
3. Separate durable backlog from runtime backpressure. Kafka lag can grow without slowing producers;
   Flink operator credit/backpressure propagates within the job graph.
4. For a capability/default question, use the exact version's API, configuration definition or
   source. For deployed behavior, reconcile declared and effective settings, component ownership
   and precedence using relevant runtime evidence. Verify the exact key/parser path before claiming
   an unknown or deprecated setting is ignored, rejected, warned about or mapped to another key.
5. Account for heap allocation and native/file-backed state separately inside the same container.
6. Retain adequate behavior or propose a bounded, evidenced change. Reuse relevant validation or
   compare the affected steady-state, failure, restore or rescale contract in an authorized scope;
   a narrow answer does not require every campaign. Do not report a proposed test as executed.

## Rules

- Size Kafka partitions from representative workload and per-partition capacity for each required
  consumer group, with producer, broker/network/storage, key/order and recovery constraints plus
  growth/failure headroom. Powers of two or broker multiples are placement heuristics, not laws.
- Size Flink per operator. Raising global parallelism cannot repair one serialized sink, skewed key
  or blocking call.
- Exactly-once has a declared boundary. External effects outside the engine transaction/checkpoint
  need idempotency, fencing or their own transaction protocol.
- Checkpoint success is not automatically sink visibility. State when a two-phase sink commits and
  include that delay in the output-latency contract.
- State size does not determine Java heap by itself. Allocation, retained live state and object
  lifetimes affect GC; RocksDB caches/write buffers and file pages have distinct native/resident
  accounting. Managed memory is a budget, not an additional RSS category to sum twice.
- Backpressure is a symptom location, not necessarily the root. Trace downstream as a starting
  hypothesis, then correlate source starvation, shared CPU/network/storage, async work and
  checkpoint/sink coupling. One low-output vertex does not prove an independent local bottleneck.
- Busy task time is not CPU utilization: blocking callbacks and chained operators need stack,
  I/O and downstream evidence. Healthy throughput with stalled watermarks can instead be an
  event-time/idleness problem; do not add parallelism solely because a window emits nothing.
- Return the scoped answer or retained/proposed decision with its evidence and uncertainty. For
  diagnosis or change, include the competing cause, relevant effective settings and validation;
  distinguish successful visible results from input consumption, dropped events and retries.

## References

- [Kafka Streams operation](references/kafka-streams.md) — read for task/partition capacity,
  transactions, state stores, standby replicas or commit visibility.
- [Flink operation](references/flink.md) — read for operator backpressure, checkpoints, RocksDB,
  watermarks, savepoints or connector lifecycle.
