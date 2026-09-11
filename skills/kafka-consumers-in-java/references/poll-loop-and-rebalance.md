# The poll loop and the rebalance

## The contract

`poll()` returns buffered/fetched records, advances client coordination work and proves the
application is still polling; it does not prove asynchronous effects are progressing.
For subscribed group members, the contract is _temporal_: **call `poll()` again within
`max.poll.interval.ms`.** Everything the handler does between two polls consumes that budget.
Manual `assign()` has no group-coordination eviction; investigate its processing progress
without attributing reassignment to a group timeout.

```java
// Conceptual: error handling, DLQ routing and metrics omitted.
// Required: props has enable.auto.commit=false; every returned record succeeds before commit.
try (var consumer = new KafkaConsumer<String, Payload>(props)) {
    consumer.subscribe(List.of("orders"), rebalanceListener(consumer));
    while (running) {
        var records = consumer.poll(Duration.ofMillis(500));
        for (var record : records) {
            handler.apply(record);                       // repeat-safe — idempotency
        }
        consumer.commitSync();                           // after the side effects
    }
} // default close budget; membership departure depends on protocol/static identity
```

`poll(Duration)` controls the poll call's wait budget, not the permitted processing interval.
Rebalance callbacks can extend the call beyond that duration. Include the observed total
poll cycle in the interval budget; do not treat this argument as a handler deadline.
The sketch uses no-argument `close()`, whose Kafka 4.1 default cleanup timeout is 30 seconds.
For a shorter remaining shutdown budget, use the target client's explicit timeout API
(`close(CloseOptions.timeout(remaining))` in 4.1; `close(Duration)` on older clients).
Reserve time for drain and commit first; `wakeup()` cannot interrupt close. In Kafka 4.1,
callback execution time does not consume the close timeout, so bound callback work separately;
the timeout alone is not a wall-clock shutdown guarantee.

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
deployed protocol: `session.timeout.ms` and `heartbeat.interval.ms` are classic-client
settings; `group.protocol=consumer` uses broker `group.consumer.session.timeout.ms` and
`group.consumer.heartbeat.interval.ms`. A first conservative budget for serial homogeneous work is:

```
poll-cycle tail (not p99.9 × N assumed independent) < max.poll.interval.ms - margin
```

Measure actual batch tails because per-record latency is correlated and batch overhead,
deserialization, retry and commit also consume the interval. `max.poll.records` limits records
returned by one poll, not bytes already fetched into client buffers.

## Moving work off the poll thread

When one record cannot fit the allowed poll interval and the recovery contract rules out
raising it, offload the work while keeping the loop responsive. `pause()` stops records being returned for the given partitions without
leaving the group; timely `poll()` calls avoid poll-interval eviction while heartbeat/session
liveness still applies. Pause does not bound handler duration or establish progress: track
oldest in-flight age and bounded processing/retry deadlines, including external-effect semantics.

```text
State per partition: ownership epoch, retained delivered records, completion outcomes,
                   safe next offset, and bounded worker admission. Auto commit is disabled.
On each owner-thread loop:
  poll; retain new records with their partition and current ownership epoch
  pause partitions with admitted/pending work; submit only within capacity
  drain worker results; accept only results matching current partition ownership
  advance safe next offset only across successfully completed delivered records
  commit an explicit map of safe next offsets for still-owned partitions
  resume only still-owned partitions with capacity and an appropriate completed prefix
On failed/cancelled work: do not mark it successful; retry/route under the delivery contract.
```

This is a state-machine outline, not executable code. Retain each batch across later polls;
do not derive its checkpoint from a subsequent empty poll. `Future.isDone()` includes failure
and cancellation: inspect the result/exception before recording successful completion.

Things this changes, all of which must be accepted deliberately:

- **`poll()` stays on one thread** — `KafkaConsumer` is not thread-safe. The worker must never
  touch the consumer; offsets travel back to the poll thread and are committed there.
- **Concurrency above one worker per partition spends per-partition ordering.** Running one
  partition's records in parallel destroys ordering within it, whatever the broker delivered.
  That is a design decision belonging with `message-ordering-and-partitioning`.
- Completion can be out of order even when submission was ordered. Maintain a per-partition
  delivered-order tracker; numeric offsets need not be consecutive. Commit the next pending
  record's offset or, when a fetched partition batch is exhausted, its `nextOffsets()` entry
  on clients supporting that API (including leader epoch). A completed record's offset + 1
  is a conservative fallback on older clients. Never skip an unfinished delivered record.
- **The executor must be bounded**, and paused partitions are the backpressure. An unbounded
  executor with no pause turns the topic into heap.

On revocation, stop admission for those partitions, cancel/wait within a deadline and commit
only safe completions while ownership is valid. On `onPartitionsLost`, ownership may already
belong to another member: invalidate its epoch and discard commit/resume eligibility rather
than attempting a last ownership-based commit. Cancellation does not stop an external effect;
use repeat-safe effects and sink-side fencing where stale writers must be excluded.
Pause state is not preserved across rebalances: reconcile assignments and reapply pauses for
retained work before admitting more. Never let a late old-epoch result advance a new assignment.

## The rebalance sequence, and where duplicates enter

Possible triggers: a member joins (scale-up, rolling deploy), a member leaves (protocol-dependent close, crash,
eviction), a member exceeds `max.poll.interval.ms`, the subscribed topic's partition count
changes. Coordinator changes cause rediscovery and can disrupt coordination; they do not
necessarily require partition reassignment.

```
1  member B joins the group
2  coordinator begins the rebalance
3  EAGER: every member revokes EVERY partition before assignment redistribution
   COOPERATIVE: decide which partitions must move, revoke only those; retain the others
4  onPartitionsRevoked → last chance to commit what has been processed
5  ownership transfer completes according to the protocol; cooperative transfer may take rounds
6  newly acquired partitions initialise from a checkpoint/reset/explicit seek policy
   retained cooperative partitions keep their position and local processing state
7  records after the last committed next offset may be delivered again
```

This is a conceptual handoff, not one callback timeline shared by every protocol. Classic
eager revocation occurs at rebalance start; cooperative revocation follows the decision to
move partitions. Kafka's consumer group protocol has its own coordination flow. Step 7 can
occur with zero retries and zero broker faults. Two
levers narrow it, neither closes it: committing in `onPartitionsRevoked` before the partition
moves (which fails when the member was evicted for being slow — the callback may run too late
to be honoured), and committing more often, per record or per small batch, at the cost of round
trips. Correctness still rests on the handler being repeat-safe.

## Reducing rebalance pain

Described by role — check the names and defaults against your client version rather than
copying numbers:

- **Incremental cooperative assignment for the classic protocol.** Consider
  `CooperativeStickyAssignor` when retaining unchanged partitions would reduce observed
  disruption. Check every member's supported assignor list and migration state; a rollout
  may require stages, while a fleet already advertising both assignors can need only the
  final switch. Under `group.protocol=consumer`, inspect the server-side assignor and
  `group.remote.assignor`; do not copy classic `partition.assignment.strategy` settings.
- **Static group membership** (`group.instance.id`). A stable instance that disappears without
  a graceful leave can rejoin before session expiry without immediate reassignment. A graceful
  close can still leave the group; duplicate IDs fence one member. Cost: a genuinely dead
  instance can stall partitions until session expiry, so align orchestrator identity and
  shutdown behavior deliberately.
- **Smaller `max.poll.records`** — a candidate when the measured batch exceeds the interval
  but individual records fit. It cannot fix a single record that exceeds the budget; check
  throughput and poll/commit overhead after reducing the batch. A raised poll interval must
  fit legitimate bounded processing and acceptable recovery time. Raising it delays detection
  of a live member that stops polling; process death is normally detected by session expiry.
- **Fewer, longer-lived members.** Aggressive autoscaling of a consumer group buys throughput
  and pays rebalances; with many partitions and a short scale interval a group can spend more
  time rebalancing than consuming.
- **Instrument it.** Rebalance rate, rebalance duration and time-since-last-rebalance per group
  distinguish group churn from slow processing when correlated with poll-cycle and effect
  completion evidence; rebalance rate alone does not identify the cause.

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
- [ConsumerRebalanceListener: revoked versus lost partitions](https://kafka.apache.org/41/javadoc/org/apache/kafka/clients/consumer/ConsumerRebalanceListener.html)
- [Kafka 4.1 consumer configuration](https://kafka.apache.org/41/configuration/consumer-configs/)
- [Kafka 4.1.0 source: poll, pause, commits and close](https://github.com/apache/kafka/blob/4.1.0/clients/src/main/java/org/apache/kafka/clients/consumer/KafkaConsumer.java)
- [KIP-848: the next-generation consumer rebalance protocol](https://cwiki.apache.org/confluence/display/KAFKA/KIP-848%3A+The+Next+Generation+of+the+Consumer+Rebalance+Protocol)
