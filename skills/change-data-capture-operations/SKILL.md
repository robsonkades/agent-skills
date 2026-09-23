---
name: change-data-capture-operations
description: >-
  Operating Debezium source CDC through snapshots, lag, restarts, log retention and failover.
  Use when PostgreSQL WAL or MySQL binlogs accumulate, a connector cannot resume, a snapshot
  is interrupted, schema history is missing, or captured tables need controlled resynchronization.
  Covers source continuity and sink replay consequences; consumer offset resets, transactional
  outbox design, stream runtime tuning and cross-engine migration belong to neighboring skills.
---

# Change Data Capture Operations

Preserve a defensible chain from source commits through durable connector progress to visible
sink state. A task marked RUNNING, a saved offset and a completed snapshot each prove different things.

## Establish the recovery contract

Use existing evidence before requesting more. Record only what changes the decision:

- Source engine/version, topology and failover manager; Debezium connector build and decoder;
  Kafka Connect distributed/standalone, Debezium Server, Engine, or another hosting runtime.
- Effective connector identity, source database, captured tables, keys/replica identity,
  transformations, snapshot mode and signaling configuration. Identify any recent DDL or filter changes.
- Durable source offsets, snapshot progress, source log availability, PostgreSQL slot/publication
  or MySQL schema history, and their storage/backup owners. Capture positions and timestamps together.
- Sink purpose: reconstruct current state or preserve every transition; accepted duplicate/loss
  windows, delete handling, side effects, recovery time and retention budget.

The references use Debezium **3.3.2.Final**, PostgreSQL **17** and MySQL **8.4** as concrete
evidence baselines, not upgrade requirements. Inspect deployed image/plugin/JDK and runtime
compatibility before suggesting properties. Connector embedding changes state ownership; never
assume an Engine or Flink source stores offsets in Kafka Connect topics.
[Debezium state storage](https://debezium.io/documentation/reference/3.3/configuration/storage.html)
distinguishes offset storage by runtime and the connectors that require internal schema history.

If versions, positions or retention evidence are missing, continue with read-only inventory and
a conditional recovery decision. Do not assert continuity or prescribe a reset from connector status alone.

## Choose the operational path

| Situation                                              | Decision and evidence                                                                                                                                                                  |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First capture, interrupted snapshot, or table backfill | Read [snapshot and resynchronization](references/snapshots-and-resynchronization.md). Identify initial versus incremental before predicting restart behavior.                          |
| PostgreSQL WAL growth, missing slot, or promotion      | Read [PostgreSQL continuity](references/postgresql-continuity.md). Compare durable progress, slot state and source lineage.                                                            |
| MySQL purged logs, missing history, or source switch   | Read [MySQL continuity](references/mysql-continuity.md). Check binlog/GTID coverage and schema at the replay position independently.                                                   |
| Lag with a connector still running                     | Locate the delaying stage below before changing buffers, retention or parallelism.                                                                                                     |
| Missing retained source range                          | Treat as a recovery gap. Determine whether recoverable source state can supply it; otherwise explicitly choose resynchronization or report that event history cannot be reconstructed. |

**Keep the recovery evidence.** Do not delete offsets, drop/advance a slot, discard schema history,
or change connector identity as a routine restart fix. Those actions can remove the only route
to unread changes. Before an authorized mutation, record the exact affected state, backup or
export, expected replay/loss boundary, sink plan, validation and stopping condition. An offset
backup does not restore expired WAL/binlogs. Never delete a shared Connect offset topic to reset one connector.

## Diagnose lag by stage

Align the sampling window, units and clock provenance. Follow one known change when possible:

| Stage                                   | Evidence to compare                                                                                           | Interpretation to test                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Source commit to capture                | Current source position, captured position, transaction duration, snapshot progress, slot/binlog availability | Source inactivity, long transactions, snapshot work or decoding delay can resemble a stalled connector. |
| Capture to broker acknowledgment        | Connector queue use, source-record write progress, producer errors/retries and broker latency                 | A full queue can be downstream backpressure; increasing it consumes memory and postpones the symptom.   |
| Acknowledgment to durable source offset | Offset flush success/age and durable restart position                                                         | Emitted records can be ahead of durable progress; crash recovery may replay them.                       |
| Broker to sink visibility               | Per-partition consumer lag plus sink apply/commit position, retries and visible result                        | Low consumer lag does not prove the sink committed the effect.                                          |

Connector timestamp lag such as `MilliSecondsBehindSource` is a stage-specific, clock-sensitive
signal; a quiet source can leave it stale. Check source timestamps, connector processing time
and sink commit time separately. A heartbeat demonstrates its own path, not every table's
publication/filter/key correctness. Use the deployed connector's metric definitions with
[Debezium monitoring](https://debezium.io/documentation/reference/3.3/operations/monitoring.html).

Estimate retention runway using actual source log generation and reclamation, including traffic
outside captured tables. For illustration, 120 GiB usable headroom / 6 GiB per hour **net** growth
gives 20 hours before the reserve is consumed if the rate persists. Subtract response and recovery
time; monitor changing rates and disk free space. Catch-up requires sustained drain capacity above
arrival rate. Record/byte/age lag cannot be interchanged without a measured conversion.

## Close the continuity claim

For a proposed or executed recovery, report the observed position/state, the chosen action and
why its prerequisites hold, the replay or missing interval, and the sink validation. Reuse
adequate existing validation; otherwise plan a bounded restart/failover experiment in an isolated
environment with inserts, updates and deletes crossing the interruption. Verify durable restart
progress and final sink contents, not only task health or row counts. Include snapshot records,
duplicate handling and external side effects where they matter.

A snapshot rebuilds state; it does not recreate every intermediate event or previously deleted
row. Require reconciliation for stale sink keys. A connector delivery guarantee does not establish
exactly-once effects in an external sink. Distinguish documented behavior, observed evidence,
inferences and tests still pending.

## Handoffs

- `delivery-semantics` owns acknowledgment/transaction boundaries and transactional outbox design;
  `idempotency` owns repeat-safe sink effects.
- `kafka-consumers-in-java` owns consumer-group offsets and consumer replay after source capture
  is healthy; it cannot recover missing source logs.
- `stream-processing-runtime-performance` owns Flink/Kafka Streams checkpoints, state and runtime
  backpressure. Establish who owns CDC progress before composing its recovery guidance.
- `database-engine-selection-and-migration` owns cross-engine compatibility and cutover;
  `schema-evolution-and-compatibility` owns downstream schema contracts.
