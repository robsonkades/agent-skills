# Stateful stages: windows, watermarks and bounded state

## Windows, and what each one costs

A window is what converts an unbounded stream into a finite computation. The type chosen
decides the state cost as much as it decides the semantics.

| Type         | Definition                                | State per key                                                      | Bounded by                                     |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------- |
| **Tumbling** | Fixed, non-overlapping intervals          | One aggregate per open interval                                    | The interval, plus grace                       |
| **Sliding**  | Fixed size, advancing by a smaller step   | Naive copies overlap; panes/incremental aggregates may share state | Window, step, algorithm and allowed lateness   |
| **Session**  | Activity separated by a gap of inactivity | Accumulator or raw events for each active session                  | Gap, lateness, merge behavior and key activity |

Naively materializing a 1-hour window every minute associates each record with sixty windows.
Pane decomposition or algebraic/incremental aggregation can reduce storage and CPU, but does not
work uniformly for non-associative functions or joins that need raw matches. A session without a
gap may never finalize; a fixed-size accumulator can remain bounded per key while raw events or
merge metadata continue to grow. Price the actual engine representation.

## The unbounded-state failure

The classic pipeline death is a join or table whose state grows in **unmatched events or live
keys over retention**, not merely records per second:

```
streamJoin(orders, shipments) on orderId, no eviction
  → every orderId ever seen is retained, waiting for a shipment that may never come
  → state grows monotonically with the business, at roughly orders/day × days
  → throughput is fine, latency is fine, and the process dies in week three
```

Why it survives testing: a load test runs 10× traffic for one hour over a small key set. State
is a function of _distinct keys over the retention period_, and one hour of synthetic traffic
with a thousand keys tells you nothing about ninety days with forty million.

Table/latest-value joins can retain only the current value per live key and remove it on a
tombstone; a fixed-size aggregate can be bounded per key. They are still unbounded in key count
unless lifecycle eviction exists.

**Detect it before the OOM or disk exhaustion.** Useful leading signals are:

- **State store size and entry count, per store, exported as a metric.** The number must exist
  in a dashboard, not only in a heap dump. A monotonically rising entry count with flat
  throughput is the signature, and it is visible weeks ahead.
- **Ratio of state entries to records processed per window.** Stable means the state is
  turning over; rising means keys are entering and never leaving.
- **Old Gen occupancy after collection** for an in-heap store, or local/remote checkpoint,
  changelog and disk-compaction growth for an on-disk one. Track checkpoint duration, upload
  bytes, restore time and compaction/write amplification; local bytes alone understate cost.

**Bound it.** In order of preference: a window whose size comes from how late the other side can
legitimately arrive; an explicit retention on the store with a stated eviction policy; a
key-space bound where the domain provides one (a closed order can be evicted; an open one
cannot). "Emit and forget" is not a bound — it is the absence of one.

## Watermarks and late data

A watermark is a source/engine assertion or heuristic that event time has progressed to `T`.
Many engines take the minimum across active input partitions, so one idle partition can stall
all windows unless an explicit idleness policy exists. Clock skew, source timestamp quality and
partition discovery are part of this contract. It is a **decision about waiting**:

- Wait longer → higher completeness, higher latency, more open windows held in state.
- Wait less → lower latency, less state, more late events.

There is no universal percentile. Measure the lateness distribution per source/partition and
business class, then choose a completeness/latency/state budget. Selecting p99 knowingly routes
roughly the tail beyond that threshold under the measured workload; shifts, outages and replay
can change it. Measure watermark lag and idle partitions in production.

Then decide, separately, what happens to an event that arrives after its window closed:

| Policy                | What it does                                      | Choose when                                                                     |
| --------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Drop**              | Discard silently                                  | Only with a **counter and an alert**. A silent drop is unattributable data loss |
| **Side output**       | Route to a separate stream for reconciliation     | The default for anything a business reconciles — it keeps the record            |
| **Emit a correction** | Update/retract a prior result                     | Sink supports stable keys, versions and upsert/retraction semantics             |
| **Extend the grace**  | Keep the window open longer for this class of key | Lateness is systematic for a known source, not random                           |

Framework defaults vary. Treat an implicit policy as a defect: even side output needs durable
delivery, retention, access control and a reconciliation owner. Replay does not inherently make
all records late when event-time watermarks are reconstructed from replayed partitions; it can
do so when live and replay traffic share progress, timestamps are compressed, or old records are
injected behind an already advanced watermark. Test the actual mode.

## Replay and reprocessing

Replay is the capability windowed state most often destroys:

- Use **event time** when the answer represents when the business event occurred. Processing-time
  windows deliberately answer when this execution observed the event and generally cannot
  reproduce historical buckets. Event time is still insufficient without pinned timestamp
  extraction, watermark/idleness rules, late policy, code/config versions and deterministic
  state/sink behavior.
- **State must be reset or rebuilt** before the replay, or the run mixes old aggregates with new
  input and produces a number that matches neither.
- **The output must tolerate the rewrite.** An append-only sink accumulates both runs; an
  upsert-keyed sink converges. Decide which the sink is before the replay, not during it.
- **Downstream consumers see the history again**, so they must be repeat-safe (`idempotency`) —
  including the ones nobody remembers subscribing.

## Testing a windowed stage deterministically

Wall-clock time in a windowing test produces a test that is either slow, flaky, or both. The
technique is to make event time an input.

- **Drive event time from the records.** Every test record carries an explicit timestamp; the
  test advances the watermark by feeding a record (or an explicit watermark, where the framework
  exposes one) rather than by sleeping. `Thread.sleep` in a windowing test is the failure.
- **Inject the clock** for anything that reads processing time. A `Clock` parameter, not
  `Instant.now()`, so the test can step it. This is ordinary dependency injection and it is what
  makes the next two tests possible at all.
- **Test the boundary cases explicitly**, and they are the whole point of the test:
  - a record exactly on a window boundary lands in exactly one window
  - a record arriving after the watermark passed follows the stated late-data policy — assert
    the side output or the counter, not just the absence of a crash
  - a session closes after the gap and not before
  - the same versioned input replayed produces semantically equivalent versioned output; require
    byte identity only when serialization/order is itself part of the contract
- **Test state bounds, not only results.** Feed N distinct keys, advance time past the window,
  and assert the store's entry count returns to its baseline. This is the test that catches the
  missing retention, and no correctness assertion on the output will catch it for you.
- **Test recovery and evolution.** Crash between input, checkpoint and sink commit; restore from
  checkpoint/savepoint; rescale/repartition; upgrade state serializers; add an idle partition;
  regress a watermark; and inject a record behind it. Assert no silent loss, duplicate effect or
  orphaned state beyond the declared guarantee.

## State sizing and operational budget

Estimate logical bytes from distinct live keys/events, serialized key/value size, window/pane
multiplicity and versions retained. Then measure physical amplification: indexes, allocator/
object overhead, RocksDB/LSM compaction, changelog replication, checkpoints, local cache and
temporary migration overlap. Capacity must cover steady state plus recovery/rescale headroom,
and restore time must fit the recovery objective—not merely fit disk.

Protect state and replay paths as production data: encrypt where required, restrict queryable
state/checkpoints/internal topics, avoid PII in keys, define deletion/retention propagation and
audit replay/correction operations.

## Primary references

- [Apache Flink event-time and watermarks](https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/time/)
- [Apache Flink state and fault tolerance](https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/stateful-stream-processing/)
- [Kafka Streams state stores](https://kafka.apache.org/documentation/streams/developer-guide/processor-api.html#state-stores)
