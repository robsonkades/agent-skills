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
Apply the requested scope: a diagnosis or review can finish with supported findings and the next
discriminating check. Execute recovery changes only within the task's authorization; an operational
skill does not turn a findings-only request into permission to restart production capture.

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

For the Debezium 3.3 PostgreSQL and MySQL Kafka Connect connectors, raising `tasks.max` does
not parallelize source capture: each uses one task. More workers or topic partitions do not
divide that task's decoding work. Check the [PostgreSQL task contract](https://debezium.io/documentation/reference/3.3/connectors/postgresql.html#postgresql-property-tasks-max)
and [MySQL task contract](https://debezium.io/documentation/reference/3.3/connectors/mysql.html#mysql-property-tasks-max).
If capture is limiting, examine source transactions, decoding, transformations and publication
throughput. If capture is current and sink application is limiting, keep source progress intact
and tune the downstream stage. Splitting capture into multiple connectors is an architectural
change: prove independent table ownership, source identities/slots, routing and required ordering;
account for extra source load and retained state before choosing it.

Estimate retention runway using actual source log generation and reclamation, including traffic
outside captured tables. For illustration, 120 GiB usable headroom / 6 GiB per hour **net** growth
gives 20 hours before the reserve is consumed if the rate persists. Subtract response and recovery
time; monitor changing rates and disk free space. Catch-up requires sustained drain capacity above
arrival rate. Record/byte/age lag cannot be interchanged without a measured conversion.

## Verify what reaches the sink

When rows remain after deletion or a rebuild appears complete, compare a representative raw CDC
event, the event after configured transformations, and the sink's actual apply behavior. A raw
`op=d` record and a same-key, null-value tombstone serve different contracts: the tombstone enables
Kafka compaction; neither proves deletion from an external store.

For `ExtractNewRecordState`, inspect the deployed `delete.tombstone.handling.mode` and any predicates.
`drop` removes both delete and tombstone records; `rewrite` keeps a flattened deletion marker that
the sink must interpret, and removes the tombstone. Choose a representation the sink supports,
then verify its durable effect. Preserve the envelope if existing consumers need its semantics;
flattening is not a recovery prerequisite. See [Debezium event flattening](https://debezium.io/documentation/reference/3.3/transformations/event-flattening.html).

Exercise deletes and, if the application permits them, key changes through the full configured
path. A connector restart or resnapshot cannot repair a transform that keeps discarding deletes.
Use the engine reference when source identity or incomplete row values are involved.

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

Pass the affected boundary, deployed versions, positions, observed events and required outcome.
Request a concrete contract or verification plan from the receiving specialist. If unavailable,
retain this skill's continuity guards and identify the unresolved downstream obligation explicitly.

- `delivery-semantics` owns acknowledgment/transaction boundaries and transactional outbox design;
  `idempotency` owns repeat-safe sink effects.
- `kafka-consumers-in-java` owns consumer-group offsets and consumer replay after source capture
  is healthy; it cannot recover missing source logs.
- `stream-processing-runtime-performance` owns Flink/Kafka Streams checkpoints, state and runtime
  backpressure. Establish who owns CDC progress before composing its recovery guidance.
- `database-engine-selection-and-migration` owns cross-engine compatibility and cutover;
  `schema-evolution-and-compatibility` owns downstream schema contracts.
