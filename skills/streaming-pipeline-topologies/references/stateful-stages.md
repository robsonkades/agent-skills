# Stateful stages: windows, watermarks and bounded state

## Windows, and what each one costs

A window is what converts an unbounded stream into a finite computation. The type chosen
decides the state cost as much as it decides the semantics.

| Type         | Definition                                | State per key                                        | Bounded by                                                          |
| ------------ | ----------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| **Tumbling** | Fixed, non-overlapping intervals          | One aggregate per open interval                      | The interval, plus grace                                            |
| **Sliding**  | Fixed size, advancing by a smaller step   | Each record belongs to `size / step` windows at once | The overlap factor — a real multiplier on state                     |
| **Session**  | Activity separated by a gap of inactivity | One open session per active key                      | **The gap timeout only** — a key that never goes quiet never closes |

Sliding is the one under-costed in design: a 1-hour window advancing every minute means every
record is held in sixty windows. Session is the one that has no bound at all if the stream has
no gaps — a bot, a stuck client or a replay with compressed timestamps produces a session that
never ends, and its state grows for the life of the process.

## The unbounded-state failure

The classic pipeline death is not throughput. It is a join or aggregation whose state grows in
**distinct keys seen**, not in records per second:

```
join(orders, shipments) on orderId, no window
  → every orderId ever seen is retained, waiting for a shipment that may never come
  → state grows monotonically with the business, at roughly orders/day × days
  → throughput is fine, latency is fine, and the process dies in week three
```

Why it survives testing: a load test runs 10× traffic for one hour over a small key set. State
is a function of _distinct keys over the retention period_, and one hour of synthetic traffic
with a thousand keys tells you nothing about ninety days with forty million.

**Detect it before the OOM.** Three signals, in order of how early they fire:

- **State store size and entry count, per store, exported as a metric.** The number must exist
  in a dashboard, not only in a heap dump. A monotonically rising entry count with flat
  throughput is the signature, and it is visible weeks ahead.
- **Ratio of state entries to records processed per window.** Stable means the state is
  turning over; rising means keys are entering and never leaving.
- **Old Gen occupancy after collection** for an in-heap store, or the state directory's disk
  growth for an on-disk one. Rising after every full collection is the confirmation, not the
  first warning — by then the runway is short.

**Bound it.** In order of preference: a window whose size comes from how late the other side can
legitimately arrive; an explicit retention on the store with a stated eviction policy; a
key-space bound where the domain provides one (a closed order can be evicted; an open one
cannot). "Emit and forget" is not a bound — it is the absence of one.

## Watermarks and late data

A watermark is an assertion that no event older than time `T` is still expected. It is a
**decision about waiting**, and both ends of it cost something:

- Wait longer → higher completeness, higher latency, more open windows held in state.
- Wait less → lower latency, less state, more late events.

There is no correct value, only a stated one. Derive it from the measured lateness distribution
of the source — the p99 of `processingTime − eventTime` at the ingest point — and re-derive it
when the source changes, exactly as a visibility timeout is re-derived.

Then decide, separately, what happens to an event that arrives after its window closed:

| Policy                | What it does                                      | Choose when                                                                     |
| --------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Drop**              | Discard silently                                  | Only with a **counter and an alert**. A silent drop is unattributable data loss |
| **Side output**       | Route to a separate stream for reconciliation     | The default for anything a business reconciles — it keeps the record            |
| **Emit a correction** | Reopen the window and emit an updated result      | Downstream is an upsert-style sink that can absorb a restatement                |
| **Extend the grace**  | Keep the window open longer for this class of key | Lateness is systematic for a known source, not random                           |

The trap is that "drop" is the default in most frameworks, so not deciding _is_ deciding to
drop. And a replay makes every event late by construction, which is why a pipeline that has
never handled late data breaks the first time it is reprocessed.

## Replay and reprocessing

Replay is the capability windowed state most often destroys:

- **Windows must be on event time.** Bucketing by processing time makes the result a function of
  when the job ran, so no replay reproduces it, and no correction is possible. Carry the event
  timestamp in the payload; do not infer it from broker append time unless that genuinely is the
  event time.
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
  - the same input replayed produces the same output, byte for byte
- **Test state bounds, not only results.** Feed N distinct keys, advance time past the window,
  and assert the store's entry count returns to its baseline. This is the test that catches the
  missing retention, and no correctness assertion on the output will catch it for you.
