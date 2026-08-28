# The poll loop and the rebalance

## The contract

`poll()` does three jobs on one thread: it fetches records, it drives the client's group
membership state machine, and it is the liveness proof that the member is still processing.
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

| Setting                 | Bounds                                                   | Exceeded when                               | Symptom                                             |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------- | --------------------------------------------------- |
| `max.poll.interval.ms`  | Wall time between two `poll()` calls — i.e. your handler | The batch takes too long                    | Member evicted, group rebalances, batch redelivered |
| `session.timeout.ms`    | Liveness of the **heartbeat thread**, not the handler    | The process is dead, wedged, or partitioned | Member removed after the timeout                    |
| `heartbeat.interval.ms` | How often that background thread beats                   | —                                           | Set well below the session timeout                  |
| `max.poll.records`      | Records returned per `poll()` — the batch size           | —                                           | The multiplier on handler time per poll             |

The consequence that catches teams: **since heartbeats moved to a background thread, a slow
handler does not look dead.** The group keeps receiving heartbeats while the handler runs, so
the session timeout never fires; what fires is the poll interval. Raising `session.timeout.ms`
to "fix rebalances" therefore changes nothing. The budget to check before shipping:

```
max.poll.records × handler p99.9  <  max.poll.interval.ms × safety factor
```

Both sides move. `max.poll.records` is yours; `handler p99.9` is largely the dependency's, and
it is the term that changes during an incident — which is why rebalance storms start exactly
when the system is already degraded.

## Moving work off the poll thread

When one record can exceed the interval on its own, the loop must keep polling while the work
happens elsewhere. `pause()` stops records being returned for the given partitions without
leaving the group; `poll()` still runs, so the member stays alive.

```java
// Conceptual: bounded executor and a single in-flight batch per partition.
var records = consumer.poll(Duration.ofMillis(500));
if (!records.isEmpty()) {
    consumer.pause(consumer.assignment());              // stop fetching, keep polling
    inFlight = executor.submit(() -> process(records)); // bounded pool
}
if (inFlight != null && inFlight.isDone()) {
    consumer.commitSync(offsetsOf(records));            // commit only what completed
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
- **The executor must be bounded**, and paused partitions are the backpressure. An unbounded
  executor with no pause turns the topic into heap.

On rebalance, in-flight work for a revoked partition is no longer yours: the new owner starts
from the last committed offset. Cancel it or let it finish idempotently — but never commit
offsets for a partition you no longer own.

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
7  records processed after the last commit but before step 4 are delivered again
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
- **Static group membership** (`group.instance.id`). A member that restarts and rejoins within
  the session timeout keeps its assignment, so a rolling deploy of N pods no longer causes N
  group-wide rebalances. Cost: a genuinely dead static member is detected only after the
  session timeout, so set that from how long a stalled partition is tolerable.
- **Smaller `max.poll.records`** — the cheapest lever for a poll-interval eviction, and the
  first to try, because it changes no code. A poll interval, if raised, comes from the measured
  handler tail rather than a copied number, and raising it also delays reassignment of a
  genuinely dead member.
- **Fewer, longer-lived members.** Aggressive autoscaling of a consumer group buys throughput
  and pays rebalances; with many partitions and a short scale interval a group can spend more
  time rebalancing than consuming.
- **Instrument it.** Rebalance rate, rebalance duration and time-since-last-rebalance per group
  turn "the consumer is slow sometimes" into a diagnosis in one look.
