# Offsets, commit strategies and lag

## Commit strategies compared

The offset is the only state consumption changes. Where it is written relative to the side
effect decides the guarantee; the vocabulary for those guarantees, and the transaction
boundary, are `delivery-semantics`. What belongs here is the mechanical comparison.

| Strategy                                        | Guarantee                         | Duplicate window                           | Cost                                                   |
| ----------------------------------------------- | --------------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| `enable.auto.commit=true`                       | Neither, by design                | Undefined — timer decides                  | None, and it is not worth it                           |
| Commit before processing                        | at-most-once                      | None; loses instead                        | A crash silently drops the batch                       |
| `commitSync()` after the batch                  | at-least-once                     | The whole batch                            | One blocking round trip per batch                      |
| `commitAsync()` after the batch                 | at-least-once                     | The batch, plus in-flight commits on crash | Cheapest; needs a `commitSync` on shutdown             |
| Commit per record                               | at-least-once                     | One record                                 | A round trip per record — often the throughput ceiling |
| Offset stored in the side effect's own database | at-least-once, deduplicated there | None observable                            | The consumer must seek from that table on assignment   |

Notes that decide the choice:

- **`commitAsync` plus a final `commitSync`** is the common production shape: async in the
  loop for throughput, a synchronous commit in the revocation callback and on shutdown so the
  last position is not lost.
- **Out-of-order async commits.** An async commit that fails and is retried can write an
  _older_ offset over a newer one. Do not retry `commitAsync` blindly; either let the next
  commit supersede it or retry only from a monotonically-checked position.
- **The last row is the only one that removes the duplicate**, and only for a side effect that
  lives in one database: write the business row and the consumed offset in the same
  transaction, and seek from that table in `onPartitionsAssigned`. The broker's offset store
  becomes advisory. The boundary conditions are `delivery-semantics`.
- In Spring Kafka the same decision appears as the container's ack mode: the automatic modes
  commit for you after the listener returns (per record, or per batch), and the manual modes
  hand an `Acknowledgment` to your code so the commit sits exactly where you put it. The
  decision is identical to the table above; only the name moves.

## `auto.offset.reset`

Three values — `earliest`, `latest`, `none` — and the setting applies **only when the consumer
has no valid committed offset for the partition**. That is not a rare case; it is an incident
case:

- a brand-new consumer group, including one created by a typo in `group.id`
- a group whose committed offsets expired after a long idle period
- a committed offset that is no longer within retention, because the consumer was down longer
  than the topic keeps data

| Value      | Behaviour with no valid offset        | The risk you are accepting                                                                         |
| ---------- | ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `latest`   | Start from the end                    | **Silent data loss.** Everything produced during the gap is skipped, and nothing reports it        |
| `earliest` | Start from the oldest retained record | **Mass reprocessing.** The whole retained topic replays at once, into every downstream side effect |
| `none`     | Throw on assignment                   | The consumer does not start; a human decides. Loud, and usually correct for anything financial     |

Decide per topic, not per cluster. For an audit or ledger topic, `none` (or `earliest` with a
repeat-safe handler) is right. For a metrics or presence topic, `latest` is right and the loss
is genuinely free. A typo in `group.id` combined with `earliest` is one of the classic ways to
replay a month of events into production; combined with `latest` it is one of the classic ways
to lose a day's.

## Lag

Consumer lag is the distance between the consumer's position and the end of the partition. It
comes in two units and they are not interchangeable.

- **Lag in records** — `logEndOffset − committedOffset`. Cheap, exposed by the broker and by
  every tool. Meaningless on its own: 50 000 records is four seconds on a busy topic and four
  hours on a quiet one, and the same number changes meaning when traffic changes. It also drops
  to zero during a producer outage, which reads as "healthy".
- **Lag in time** — the age of the next record the consumer will read, i.e. `now −
timestamp(next record)`. This is the queueing delay the business cares about, it is
  denominated in the SLO's unit, and it does not move when the production rate does.

What to do with them:

- **Alert on lag in time.** Threshold from the deadline the downstream actually has.
- **Alert per partition, not on the group total.** One blocked partition is invisible in a sum
  across fifty. A blocked partition is exactly the head-of-line case in
  `poison-messages-and-dlq`.
- **Plot lag in records for capacity**, alongside consumption rate and production rate. Lag
  flat and non-zero means keeping up but behind; lag with positive slope means
  `production rate > consumption rate` and no amount of waiting fixes it — that arithmetic is
  `littles-law-and-queueing`.
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
