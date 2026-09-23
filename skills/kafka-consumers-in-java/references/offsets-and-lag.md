# Offsets, commit strategies and lag

## Commit strategies compared

Fetching advances local position; committing updates the recovery checkpoint. Where that
checkpoint is written relative to the side
effect decides the guarantee; the vocabulary for those guarantees, and the transaction
boundary, are `delivery-semantics`. What belongs here is the mechanical comparison.

| Strategy                                        | Guarantee                                                                 | Duplicate window                                                    | Cost                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `enable.auto.commit=true`, synchronous handling | at-least-once if every prior-poll record finishes before next poll/close  | Records since last auto commit                                      | Simple; boundary is implicit and unsuitable for escaped async work |
| Commit before processing                        | at-most-once                                                              | None; loses instead                                                 | A crash silently drops the batch                                   |
| `commitSync()` after the batch                  | at-least-once                                                             | Since last successful commit                                        | One blocking round trip per batch                                  |
| `commitAsync()` after the batch                 | at-least-once if callbacks/order are handled and effects precede commit   | Since last successful commit                                        | Non-blocking; failures are not automatically retried               |
| Commit per record                               | at-least-once                                                             | One record if each explicit commit succeeds                         | A round trip per record — often the throughput ceiling             |
| Offset and effect in one database transaction   | atomic for that sink and partition checkpoint; broker may still redeliver | No duplicate effect in that database if transaction/invariants hold | Custom assignment seek and single-writer/ordering discipline       |

Notes that decide the choice:

- **`commitAsync` plus a bounded final `commitSync`** is one production shape, not a proof.
  Track which async commits succeeded, commit only owned partitions in revocation, and accept
  that crash/eviction can bypass cleanup. Shutdown commits cannot recover unfinished effects.
- **Out-of-order async commits.** An async commit that fails and is retried can write an
  _older_ offset over a newer one. Do not retry `commitAsync` blindly; either let the next
  commit supersede it or retry only from a monotonically-checked position.
- **Per-record means an explicit offset map.** No-argument `commitSync()` commits positions
  from the whole previous poll, even when called inside a record loop. Use a per-partition
  safe next offset; otherwise a crash can skip the remainder of that poll. Batch/record
  duplicate-window estimates assume each intended commit succeeds; failures enlarge it.
- The last row atomically couples one database sink to a partition checkpoint. It does not
  make other effects atomic, and requires per-partition monotonic updates plus ownership
  control. Kafka transactions are another bounded case for consume-transform-produce within
  Kafka; external systems remain outside that transaction. See `delivery-semantics`.
- In Spring Kafka inspect the actual container version and managed Kafka client, `AckMode`, listener type,
  `syncCommits`, transactions and error handler. `MANUAL` queues an acknowledgement with
  batch semantics; `MANUAL_IMMEDIATE` commits immediately when acknowledged on the consumer
  thread. Off-thread acknowledgements, deferred/out-of-order acknowledgements and transactions
  change timing. An `acknowledge()` call is not universally a durable commit at that line.
  The Spring 3.3 reference below describes that container's semantics; it does not establish
  a supported Spring/Kafka 4.1 pairing. Preserve the project's dependency-management policy.

## `auto.offset.reset`

Kafka 4.1 supports `by_duration:PnDTnHnMn.nS` in addition to `earliest`, `latest`
and `none`. The setting applies **per partition, only when the consumer has no initial offset
or the current offset no longer exists on the server**. Check the deployed client version before using a
new value. This is not a rare case; it is an incident/bootstrap case:

- a brand-new consumer group, including one created by a typo in `group.id`
- a group whose committed offsets expired after a long idle period
- a committed offset that is no longer within retention, because the consumer was down longer
  than the topic keeps data
- a newly added partition with no group checkpoint, even when the group's existing partitions
  have valid committed offsets

With `latest`, records produced to a new partition before its initial position is resolved can
be skipped. Include partition expansion in bootstrap policy: if every record is required,
choose a suitable reset policy or establish explicit starting offsets before admitting writes
to the new partitions. Preserve valid checkpoints on existing partitions; initializing a new
partition does not require resetting the whole group.

| Value             | Behaviour with no valid offset                     | The risk you are accepting                                                                                                    |
| ----------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `latest`          | Start from the end                                 | Earlier retained records are intentionally skipped; this is loss if the application contract required them                    |
| `earliest`        | Start from the oldest retained record              | Reprocess retained records in affected partitions; bound the downstream load and preserve repeat safety                       |
| `none`            | Throw when position cannot be established          | Consumer fails until automation/operator establishes an explicit offset                                                       |
| `by_duration:...` | Resolve an offset from current time minus duration | Time-to-offset lookup, timestamp semantics and retention determine what is actually available; negative durations are invalid |

Decide per consumer contract and environment, not per cluster. Audit/ledger consumers often
fail closed or replay from an explicitly verified point. A replaceable presence projection
may deliberately start latest, but only if bootstrap/current-state recovery exists. Guard
`group.id` through deployment validation and alert on unexpected group creation/reset.

## Lag

Name the measurement boundary before interpreting lag: broker group tools commonly use a
committed checkpoint, while client fetch metrics use consumer position. Neither necessarily
tracks completed business effects, especially with offloaded work.

- **Offset-distance lag** — often `endOffset − committedOffset` for group monitoring. This
  is not necessarily a count of consumable records: compaction and transactional records
  leave gaps. Check the tool's end boundary and isolation; `read_committed` consumption is
  bounded by the last stable offset, so an open transaction can hold back visible progress.
  Arrival/service rates and in-flight work are needed to interpret any distance.
- **Lag in time** — often the age of the next unprocessed record. It approximates business
  queueing delay only when timestamps are trustworthy and semantics are known. Producer
  `CreateTime` can be skewed; broker `LogAppendTime` measures a different boundary; sparse or
  compacted partitions can make lookup discontinuous.

What to do with them:

- **Alert on business delay plus inability to recover.** Use next-record/oldest-in-flight age
  where meaningful, and pair it with arrival rate, completion rate and catch-up estimate.
- **Inspect each partition alongside the aggregate.** A falling group total can hide which
  partition has stopped progressing while others drain. Check its completion and in-flight
  evidence before attributing it to a head-of-line failure (`poison-messages-and-dlq`).
- **Compare backlog with arrival and completion rates over matching windows.** Stable
  non-zero backlog can mean keeping up while behind; sustained arrivals above completion
  prevent catch-up under those rates. A temporary burst can recover when the rates reverse.
  Offset distance is not an exact count of consumable records, and fetched/committed progress
  may differ from completed effects. Keep those boundaries explicit; the stable-system
  arithmetic is `littles-law-and-queueing`.
- Use bytes/work estimates when record cost varies. `records / net drain rate` predicts
  catch-up only while completion exceeds arrival and future rates remain comparable.
- **Watch lag going to zero unexpectedly.** Catch-up, a changed group/reset, or a producer
  outage after the backlog drains can all explain it. A producer outage alone does not erase
  backlog. Check production rate and expected business arrivals independently of consumer lag.

## Testing

Choose cases that exercise the changed contract: crash/commit for delivery boundaries,
rebalance/old epochs for assignment or offload, and bootstrap/retention for reset behavior.
An alert-only change can use recorded metric windows, including skew, a burst and one stalled
partition; it does not require a consumer migration or the entire fault matrix. Broker tests
need an isolated fixture at the intended client/broker/protocol versions. Existing test
infrastructure or Testcontainers can provide it; a local mock/API check cannot prove broker
reassignment, replay, transaction durability or no-loss behavior.

- **Kill the consumer mid-batch, assert no loss.** Testcontainers with a real broker. Produce N
  records, let the handler process part of a batch, then `Runtime.getRuntime().halt(1)` before
  the commit **only in an isolated test consumer child JVM**, never the test runner or a real
  user/agent process. Restart the consumer and assert that all N records are observed downstream — this
  is the at-least-once property — and, with a repeat-safe handler, that each produced exactly
  one effect. Missing records require tracing produced IDs, retention/reset, sink failures and
  commit positions; they do not uniquely prove premature commit.
- **Force a rebalance under load.** Start two consumers, produce continuously, then stop one.
  Assert no record is lost and that duplicates, if any, produced no second side effect. This
  test is what catches a handler that is repeat-safe only for retries and not for redelivery.
- **Overrun the poll interval on purpose.** Set a small `max.poll.interval.ms`, make the handler
  slower than it, and assert the protocol-specific departure/reassignment timing and eventual
  replay from the safe checkpoint; static membership can delay it until session expiry. It documents
  the failure mode as a test rather than as tribal knowledge, and it fails when someone raises
  `max.poll.records` without checking the budget.
- **Start a group with no committed offset.** Assert the consumer starts where
  `auto.offset.reset` says it should; include the intended subscription and retained data.
  Also stop an existing consumer, add a partition, produce identifiable records there and restart
  the same group. Assert the chosen bootstrap result for the new partition while preserving old
  partitions' valid checkpoints. Repeat with a valid checkpoint in the added partition as the
  control: `latest` must not override it. This makes partition expansion part of reset validation.
- **Complete out of order.** Delay a lower offset while a higher one finishes; crash after a
  commit attempt and prove the lower record is not skipped. This catches `max(completed)`
  offset trackers. Include delivered offsets 10 and 14 (no records 11–13), failed/cancelled
  futures, and an old-epoch completion after reassignment. None may advance past pending work.
- **Expire/truncate offsets.** Exercise offset-out-of-range and retention loss, including the
  operational approval/bootstrap path rather than only asserting the configured reset.

## Primary references

- [KafkaConsumer API: offset commits and auto commit](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)
- [Kafka 4.1 consumer configuration: reset and isolation](https://kafka.apache.org/41/configuration/consumer-configs/)
- [Kafka design: delivery semantics and transactions](https://kafka.apache.org/documentation/#semantics)
- [Spring Kafka 3.3 container acknowledgement modes](https://docs.spring.io/spring-kafka/reference/3.3/kafka/receiving-messages/message-listener-container.html)
- [Spring Kafka 3.3.10 acknowledgement dispatch](https://github.com/spring-projects/spring-kafka/blob/v3.3.10/spring-kafka/src/main/java/org/springframework/kafka/listener/KafkaMessageListenerContainer.java)
