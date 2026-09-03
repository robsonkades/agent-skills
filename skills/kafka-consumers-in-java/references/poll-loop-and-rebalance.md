# The poll loop and the rebalance

## The contract

`poll()` returns buffered/fetched records, advances client coordination work and proves the
application is still making processing progress.
The contract is therefore _temporal_: **call `poll()` again within `max.poll.interval.ms`.**
Everything the handler does between two polls is spent against that budget.

```java
// Conceptual: error handling, DLQ routing and metrics omitted.
try (var consumer = new KafkaConsumer<String, Payload>(props)) {
    consumer.subscribe(List.of("orders"), rebalanceListener(consumer));
    while (running) {
        var records = consumer.poll(Duration.ofMillis(500));
        for (var record : records) {
            handler.apply(record);                       // repeat-safe — idempotency
        }
        consumer.commitSync();                           // after the side effects
    }
} // close() leaves the group; without it the group waits out session.timeout.ms
```

`poll(Duration)` — the timeout argument — is only how long to wait for records. It has nothing
to do with `max.poll.interval.ms`, and confusing the two is common enough to be worth checking
in review.

## What each timeout bounds

| Setting                 | Bounds                                                                             | Exceeded when                                | Symptom                                                  |
| ----------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------- |
| `max.poll.interval.ms`  | Maximum delay between `poll()` calls before application is considered failed       | Processing/queueing blocks the poll loop     | Reassignment; static members have delayed-removal nuance |
| `session.timeout.ms`    | Group membership heartbeat liveness                                                | Process/network/consumer coordination stalls | Member removed after timeout                             |
| `heartbeat.interval.ms` | Classic protocol client heartbeat cadence; broker-managed in the consumer protocol | —                                            | Version/protocol-specific tuning                         |
| `max.poll.records`      | Records returned per `poll()` — the batch size                                     | —                                            | The multiplier on handler time per poll                  |

The common classic-client case is that a slow handler keeps heartbeating but violates the poll
interval. Raising `session.timeout.ms` does not fix that. With static membership, a poll-
interval breach stops heartbeats and reassignment waits for session timeout; the newer
consumer group protocol also moves heartbeat timing to broker configuration. Check the
deployed protocol. A first conservative budget for serial homogeneous work is:

```
poll-cycle tail (not p99.9 × N assumed independent) < max.poll.interval.ms - margin
```

Measure actual batch tails because per-record latency is correlated and batch overhead,
deserialization, retry and commit also consume the interval. `max.poll.records` limits records
returned by one poll, not bytes already fetched into client buffers.

## Moving work off the poll thread

When one record can exceed the interval on its own, the loop must keep polling while the work
happens elsewhere. `pause()` stops records being returned for the given partitions without
leaving the group; `poll()` still runs, so the member stays alive.

```java
// Conceptual only: production code tracks records and offsets independently per partition.
var records = consumer.poll(Duration.ofMillis(500));
if (!records.isEmpty()) {
    consumer.pause(consumer.assignment());              // stop returning assigned records
    inFlight = executor.submit(() -> process(records)); // bounded pool
}
if (inFlight != null && inFlight.isDone()) {
    consumer.commitSync(nextContiguousOffsets(records)); // commit next offset, per partition
    consumer.resume(consumer.assignment());
    inFlight = null;
}
```

Three things this changes, all of which must be accepted deliberately:

- **`poll()` stays on one thread** — `KafkaConsumer` is not thread-safe. The worker must never
  touch the consumer; offsets travel back to the poll thread and are committed there.
- **Concurrency above one worker per partition spends per-partition ordering.** Running one
  partition's records in parallel destroys ordering within it, whatever the broker delivered.
  That is a design decision belonging with `message-ordering-and-partitioning`.
- Completion can be out of order even when submission was ordered. Maintain a per-partition
  completion gap tracker and commit `lastContiguousCompletedOffset + 1`; committing the
  maximum completed offset loses unfinished lower records on crash.
- **The executor must be bounded**, and paused partitions are the backpressure. An unbounded
  executor with no pause turns the topic into heap.

On revocation, stop admission for those partitions, cancel/wait within a deadline, commit only
safe contiguous completions while ownership is valid, and make late work idempotent. A commit
can fail because the generation changed; never let an old worker mutate a non-idempotent sink
after ownership moves.

## The rebalance sequence, and where duplicates enter

Triggers: a member joins (scale-up, rolling deploy), a member leaves (`close()`, crash,
eviction), a member exceeds `max.poll.interval.ms`, the subscribed topic's partition count
changes, or the group coordinator moves.

```
1  member B joins the group
2  coordinator begins the rebalance
3  EAGER: every member revokes EVERY partition and stops consuming (group-wide stall)
   COOPERATIVE: only partitions that must move are revoked; other members keep going
4  onPartitionsRevoked → last chance to commit what has been processed
5  assignment computed and distributed
6  onPartitionsAssigned → members resume from the LAST COMMITTED OFFSET
7  records after the last committed next offset may be delivered again
```

Step 7 is the duplicate source, and it exists with zero retries and zero broker faults. Two
levers narrow it, neither closes it: committing in `onPartitionsRevoked` before the partition
moves (which fails when the member was evicted for being slow — the callback may run too late
to be honoured), and committing more often, per record or per small batch, at the cost of round
trips. Correctness still rests on the handler being repeat-safe.

## Reducing rebalance pain

Described by role — check the names and defaults against your client version rather than
copying numbers:

- **Incremental cooperative assignment.** `CooperativeStickyAssignor` revokes only moving
  partitions, so a rebalance no longer stops the whole group. Switching from an eager assignor
  is itself a staged rolling change; do it as a planned migration.
- **Static group membership** (`group.instance.id`). A stable instance that disappears without
  a graceful leave can rejoin before session expiry without immediate reassignment. A graceful
  close can still leave the group; duplicate IDs fence one member. Cost: a genuinely dead
  instance can stall partitions until session expiry, so align orchestrator identity and
  shutdown behavior deliberately.
- **Smaller `max.poll.records`** — the cheapest lever for a poll-interval eviction, and the
  first to try, because it changes no code. A poll interval, if raised, comes from the measured
  handler tail rather than a copied number, and raising it also delays reassignment of a
  genuinely dead member.
- **Fewer, longer-lived members.** Aggressive autoscaling of a consumer group buys throughput
  and pays rebalances; with many partitions and a short scale interval a group can spend more
  time rebalancing than consuming.
- **Instrument it.** Rebalance rate, rebalance duration and time-since-last-rebalance per group
  turn "the consumer is slow sometimes" into a diagnosis in one look.

## Shutdown and rebalance checklist

1. stop accepting new lifecycle work, signal the consumer thread and call `wakeup()` from the
   control thread;
2. on the consumer thread, stop/pause admission and bound the wait for in-flight work;
3. commit only contiguous completed offsets for partitions still owned;
4. persist/route unfinished work according to the delivery contract; do not advance past it;
5. close within the orchestrator grace period and observe commit/rebalance errors.

Do not call arbitrary consumer methods from worker or shutdown-hook threads; `wakeup()` is the
documented cross-thread escape hatch.

## Primary references

- [KafkaConsumer API (Kafka 4.1)](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html)
- [Kafka consumer configuration](https://kafka.apache.org/documentation/#consumerconfigs)
- [KIP-848: the next-generation consumer rebalance protocol](https://cwiki.apache.org/confluence/display/KAFKA/KIP-848%3A+The+Next+Generation+of+the+Consumer+Rebalance+Protocol)
