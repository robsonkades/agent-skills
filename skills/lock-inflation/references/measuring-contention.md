# Measuring and reducing monitor contention

## Capture plan

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
jfr summary /durable/locks.jfr
```

Do not assume stock profile settings answer short-contention questions. Validate metadata, counts,
loss, capture interval and positive-control behavior.

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
wait events/eligible operations
total and percentile acquisition wait per operation (acknowledging overlap/censoring)
maximum/concurrent blocked population and queue duration
owner hold-path frequency and duration proxy
useful throughput/error/deadline/cancel rate
CPU/throttle/GC/safepoint aligned timeline
```

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

Use matched load and capture windows. Verify correctness first, then compare wait/hold/queue,
useful throughput, tail, CPU, allocation/GC, fairness/starvation and the next constrained resource.
Report inconclusive if event opportunity/threshold or workload drift prevents discrimination.

## Authoritative references

- [JDK Flight Recorder runtime guide](https://docs.oracle.com/en/java/javase/25/jfapi/flight-recorder-runtime-guide/index.html)
- [JDK `jcmd`](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
- [Java monitoring API `ThreadInfo`](https://docs.oracle.com/en/java/javase/25/docs/api/java.management/java/lang/management/ThreadInfo.html)
- [JEP 444 thread observability](https://openjdk.org/jeps/444)
