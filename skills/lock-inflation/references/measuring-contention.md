# Measuring and reducing monitor contention

## Capture plan

Use a new capture only when existing evidence cannot answer the runtime question. Select the
fields and views below for that gap; a static `wait` explanation or source review can use its
applicable contract without manufacturing a recording.

```text
question and suspected invariant:
affected window/load/business denominator:
JDK/build/thread type:
JFR event names/settings/threshold/stacks:
dump cadence/count and target identity:
positive control and expected qualifying events:
overhead/storage/privacy/abort:
```

Discover and validate target commands. A possible bounded JFR shape is:

```bash
jcmd <pid> help JFR.start
jcmd <pid> JFR.start name=locks settings=/approved/locks.jfc duration=60s \
  filename=/durable/locks.jfr
# JFR.start returns before duration expires. Wait boundedly for completion,
# or use a supported JFR.dump to obtain a snapshot of the active recording.
# Verify the resulting file on the target filesystem; transfer only a complete artifact.
jfr summary /durable/locks.jfr
```

Do not assume stock profile settings answer short-contention questions. For the consumed capture,
validate metadata, counts, loss and interval; establish relevant sensitivity using a positive
control or adequate existing validation before treating absent events as evidence.

Inspect `JFR.check` for recording status and the target's `help JFR.dump` if taking an
early snapshot; report the shorter window. A destination path in the start command does
not mean the recording file already exists or is complete.

## Thread evidence

Use repeated dumps with stable PID/start identity. For virtual threads, use the target JDK's
supported virtual-thread dump facility and assess artifact size/impact. Interpret:

```text
BLOCKED -> monitor acquisition candidate and reported owner when available
WAITING/TIMED_WAITING -> wait/park/sleep/join; inspect predicate/resource owner
RUNNABLE -> may be CPU, native or kernel wait depending stack/platform
```

Repeated identical stacks can indicate a long wait/hold but not exact duration without sampling
assumptions. A dump cannot prove short waits are absent.

## Metrics

Prefer:

```text
recorded acquisition count/duration distribution, with threshold and completion coverage
total recorded wait/eligible operations, with compatible cohort and units
per-operation wait distribution only with operation-to-acquisition correlation
maximum/concurrent blocked population and queue duration
owner hold-path frequency and duration proxy
useful throughput/error/deadline/cancel rate
CPU/throttle/GC/safepoint aligned timeline
```

An event percentile describes qualifying recorded acquisitions, not requests. One operation may
acquire several monitors while another has no recorded wait. To estimate per-operation wait,
define the operation cohort, correlate acquisitions and aggregate within it before taking a
quantile. Define whether the quantity is summed thread wait or elapsed/critical-path delay;
parallel waits can overlap. Include genuine zero-wait operations only when observation coverage
supports them. Dividing an event percentile by operation count does not produce an operation
percentile, and event count alone does not give the fraction of requests affected.

Thresholds omit short waits, and an acquisition still blocked at the recording end may not yet
have committed its duration event. Report that unfinished population using thread/queue evidence
and any justified observed lower bounds; a completed-event summary alone cannot rule out a long
wait. Do not turn a missing event into zero duration or an invented completed acquisition.

### Wait event versus wait-call latency

The `Object.wait` contract requires restored monitor ownership before return or an interruption
exception, but an event named `JavaMonitorWait` need not cover that entire interval. In OpenJDK
25 GA's platform-thread `ObjectMonitor::wait` path, `post_monitor_wait_event` commits before the
subsequent `enter` or `reenter_internal` call. Thus the event can finish while the caller still
cannot proceed. Do not assume a separate `JavaMonitorEnter` event accounts for every remaining
reacquisition path; check the target implementation and thread kind.

When the question is full wait-call latency, correlate thread state/owner evidence or use bounded
application timing around the complete call, including exceptional completion. Report separately
what the event measured and what remains unknown. A long condition wait may be intentional;
neither the event's name nor its duration alone establishes harmful monitor contention.

### Previous owner versus hold-time attribution

In the JDK 25 event schema, `JavaMonitorEnter` carries the acquiring thread's stack and a
`previousOwner` thread identity; it does not capture that owner's hold stack or a history of
owners. Other contenders, intervening owners and scheduling can contribute to the observed delay.
Treat the identity as a correlation lead, not evidence that one owner held the monitor for the
whole event duration. Match it with owner samples, guarded code or hold instrumentation before
attributing a slow operation or recommending a lock-scope change.

Instrument hold time at application boundary only if overhead/reentrancy/exceptions are handled and
the critical section is known. High-cardinality monitor/object labels should stay in bounded
diagnostic artifacts, not fleet metrics.

## Redesign checks

For moving work outside:

- Can input/state change before commit?
- Does computation depend on guarded version?
- Can compare/version/CAS validate and retry safely?
- Does callback/event ordering change?
- If external work succeeds but state commit fails, how is it reconciled?

For partitioning:

- Is the invariant truly key-local?
- What handles cross-key operations atomically?
- Does skew leave one hot partition?
- How are shard count/rebalancing and memory priced?
- Is global snapshot/iteration semantics weakened?

## Validation experiment

For a proposed runtime change, use matched load and capture windows. Verify the affected correctness
contract first, then select wait/hold/queue, useful throughput, tail and resource/progress metrics
that can expose the proposed benefit or shifted failure. Reuse adequate evidence for unchanged paths.
Report inconclusive if event opportunity/threshold or workload drift prevents discrimination.

## Authoritative references

- [Java 25 Flight Recorder settings and control API](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.jfr/jdk/jfr/package-summary.html) — event discovery, thresholds, stacks and commitment.
- [OpenJDK 25 GA monitor-event definitions](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/jfr/metadata/metadata.xml) — inspect the actual target schema before consuming fields.
- [OpenJDK 25 GA monitor implementation](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/objectMonitor.cpp) — event commitment, previous-owner recording and wait/reacquisition boundaries.
- [Java 25 Object.wait](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Object.html#wait(long,int)>) — reacquisition before return or interruption exception.
- [JDK `jcmd`](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
- [Java monitoring API `ThreadInfo`](https://docs.oracle.com/en/java/javase/25/docs/api/java.management/java/lang/management/ThreadInfo.html)
- [JEP 444 thread observability](https://openjdk.org/jeps/444)
