# Offsets, commit strategies and lag

## Commit strategies compared

The offset is the only state consumption changes. Where it is written relative to the side
effect decides the guarantee; the vocabulary for those guarantees, and the transaction
boundary, are `delivery-semantics`. What belongs here is the mechanical comparison.

| Strategy                                        | Guarantee                                                                 | Duplicate window                                                    | Cost                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `enable.auto.commit=true`, synchronous handling | at-least-once if every prior-poll record finishes before next poll/close  | Records since last auto commit                                      | Simple; boundary is implicit and unsuitable for escaped async work |
| Commit before processing                        | at-most-once                                                              | None; loses instead                                                 | A crash silently drops the batch                                   |
| `commitSync()` after the batch                  | at-least-once                                                             | The whole batch                                                     | One blocking round trip per batch                                  |
| `commitAsync()` after the batch                 | at-least-once if callbacks/order are handled and effects precede commit   | Since last successful commit                                        | Non-blocking; failures are not automatically retried               |
| Commit per record                               | at-least-once                                                             | One record                                                          | A round trip per record — often the throughput ceiling             |
| Offset and effect in one database transaction   | atomic for that sink and partition checkpoint; broker may still redeliver | No duplicate effect in that database if transaction/invariants hold | Custom assignment seek and single-writer/ordering discipline       |

Notes that decide the choice:

- **`commitAsync` plus a bounded final `commitSync`** is one production shape, not a proof.
  Track which async commits succeeded, commit only owned partitions in revocation, and accept
  that crash/eviction can bypass cleanup. Shutdown commits cannot recover unfinished effects.
- **Out-of-order async commits.** An async commit that fails and is retried can write an
  _older_ offset over a newer one. Do not retry `commitAsync` blindly; either let the next
  commit supersede it or retry only from a monotonically-checked position.
- The last row atomically couples one database sink to a partition checkpoint. It does not
  make other effects atomic, and requires per-partition monotonic updates plus ownership
  control. Kafka transactions are another bounded case for consume-transform-produce within
  Kafka; external systems remain outside that transaction. See `delivery-semantics`.
- In Spring Kafka the same decision appears as the container's ack mode: the automatic modes
  commit for you after the listener returns (per record, or per batch), and the manual modes
  hand an `Acknowledgment` to your code so the commit sits exactly where you put it. The
  decision is identical to the table above; only the name moves.

## `auto.offset.reset`

Current Kafka also supports `by_duration:PnDTnHnMn.nS` in addition to `earliest`, `latest`
and `none`. The setting applies **only when the consumer has no initial offset or the current
offset no longer exists on the server**. Check the deployed client version before using a
new value. This is not a rare case; it is an incident/bootstrap case:

- a brand-new consumer group, including one created by a typo in `group.id`
- a group whose committed offsets expired after a long idle period
- a committed offset that is no longer within retention, because the consumer was down longer
  than the topic keeps data

| Value             | Behaviour with no valid offset                     | The risk you are accepting                                                                                                    |
| ----------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `latest`          | Start from the end                                 | Earlier retained records are intentionally skipped; this is loss if the application contract required them                    |
| `earliest`        | Start from the oldest retained record              | **Mass reprocessing.** The whole retained topic replays at once, into every downstream side effect                            |
| `none`            | Throw on assignment                                | Consumer fails until automation/operator establishes an explicit offset                                                       |
| `by_duration:...` | Resolve an offset from current time minus duration | Time-to-offset lookup, timestamp semantics and retention determine what is actually available; negative durations are invalid |

Decide per consumer contract and environment, not per cluster. Audit/ledger consumers often
fail closed or replay from an explicitly verified point. A replaceable presence projection
may deliberately start latest, but only if bootstrap/current-state recovery exists. Guard
`group.id` through deployment validation and alert on unexpected group creation/reset.

## Lag

Consumer lag is the distance between the consumer's position and the end of the partition. It
comes in two units and they are not interchangeable.

- **Lag in records** — `logEndOffset − committedOffset`. Cheap, exposed by the broker and by
  every tool. Meaningless on its own: 50 000 records is four seconds on a busy topic and four
  hours on a quiet one, and the same number changes meaning when traffic changes. It also drops
  to zero during a producer outage, which reads as "healthy".
- **Lag in time** — often the age of the next unprocessed record. It approximates business
  queueing delay only when timestamps are trustworthy and semantics are known. Producer
  `CreateTime` can be skewed; broker `LogAppendTime` measures a different boundary; sparse or
  compacted partitions can make lookup discontinuous.

What to do with them:

- **Alert on business delay plus inability to recover.** Use next-record/oldest-in-flight age
  where meaningful, and pair it with arrival rate, completion rate and catch-up estimate.
- **Alert per partition, not on the group total.** One blocked partition is invisible in a sum
  across fifty. A blocked partition is exactly the head-of-line case in
  `poison-messages-and-dlq`.
- **Plot lag in records for capacity**, alongside consumption rate and production rate. Lag
  flat and non-zero means keeping up but behind; lag with positive slope means
  `production rate > consumption rate` and no amount of waiting fixes it — that arithmetic is
  `littles-law-and-queueing`.
- Use bytes/work estimates when record cost varies. `records / net drain rate` predicts
  catch-up only while completion exceeds arrival and future rates remain comparable.
- **Watch lag going to zero unexpectedly.** It usually means the producer stopped, not that the
  consumer caught up. Pair the lag alert with a production-rate alert or the outage looks green.

## Testing

- **Kill the consumer mid-batch, assert no loss.** Testcontainers with a real broker. Produce N
  records, let the handler process part of a batch, then `Runtime.getRuntime().halt(1)` before
  the commit. Restart the consumer and assert that all N records are observed downstream — this
  is the at-least-once property — and, with a repeat-safe handler, that each produced exactly
  one effect. If any record is missing, the commit sits ahead of the side effect.
- **Force a rebalance under load.** Start two consumers, produce continuously, then stop one.
  Assert no record is lost and that duplicates, if any, produced no second side effect. This
  test is what catches a handler that is repeat-safe only for retries and not for redelivery.
- **Overrun the poll interval on purpose.** Set a small `max.poll.interval.ms`, make the handler
  slower than it, and assert that the member is evicted and the batch redelivered. It documents
  the failure mode as a test rather than as tribal knowledge, and it fails when someone raises
  `max.poll.records` without checking the budget.
- **Start a group with no committed offset.** Assert the consumer starts where
  `auto.offset.reset` says it should. It is a one-line test for a setting whose behaviour is
  otherwise only observed during an incident.
- **Complete out of order.** Delay a lower offset while a higher one finishes; crash after a
  commit attempt and prove the lower record is not skipped. This catches `max(completed)`
  offset trackers.
- **Expire/truncate offsets.** Exercise offset-out-of-range and retention loss, including the
  operational approval/bootstrap path rather than only asserting the configured reset.

## Primary references

- [KafkaConsumer API: offset commits and auto commit](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)
- [Kafka consumer configuration: `auto.offset.reset`](https://kafka.apache.org/documentation/#consumerconfigs_auto.offset.reset)
- [Kafka design: delivery semantics and transactions](https://kafka.apache.org/documentation/#semantics)
