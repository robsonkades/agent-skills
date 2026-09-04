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

Record engine and connector versions, topology/job graph, input partitions and key distribution,
operator/task parallelism, offered/completed events and bytes, per-partition age/lag, backpressure,
state location/size, allocation rate, heap/RSS/container limits, checkpoint/commit configuration,
processing guarantee, sink visibility and recovery objectives.

## Workflow

1. Draw source partitions through every shuffle/operator to state and sinks. Mark ownership,
   serialization and atomic recovery boundaries.
2. Locate the slowest partition or downstream operator; aggregates hide skew and head-of-line
   blocking.
3. Separate durable backlog from runtime backpressure. Kafka lag can grow without slowing producers;
   Flink operator credit/backpressure propagates within the job graph.
4. Reconcile declared and effective configuration from runtime APIs/logs. Deprecated keys may warn;
   unknown keys may be ignored.
5. Account for heap allocation and native/file-backed state separately inside the same container.
6. Change one parallelism, state, checkpoint or sink variable and validate steady state plus failure,
   restore and rescale behavior.

## Rules

- Size Kafka partitions from measured per-partition producer and consumer capacity plus growth and
  failure headroom; powers of two or broker multiples are placement heuristics, not laws.
- Size Flink per operator. Raising global parallelism cannot repair one serialized sink, skewed key
  or blocking call.
- Exactly-once has a declared boundary. External effects outside the engine transaction/checkpoint
  need idempotency, fencing or their own transaction protocol.
- Checkpoint success is not automatically sink visibility. State when a two-phase sink commits and
  include that delay in the output-latency contract.
- State size does not determine Java heap by itself. Allocation rate drives GC; RocksDB/cache/write
  buffers and mapped files consume native or resident memory.
- Backpressure is a symptom location, not necessarily the root. Walk downstream to the first
  operator whose output capacity degrades without an upstream cause.

## References

- [Kafka Streams operation](references/kafka-streams.md) — read for task/partition capacity,
  transactions, state stores, standby replicas or commit visibility.
- [Flink operation](references/flink.md) — read for operator backpressure, checkpoints, RocksDB,
  watermarks, savepoints or connector lifecycle.
