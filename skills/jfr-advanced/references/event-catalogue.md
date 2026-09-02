# JFR event catalogue and CLI recipes

Every name below has to be re-confirmed against the target build. This table records the
names that are correct on JDK 25 and the plausible-sounding ones that are not.

## Inspecting a recording

```bash
jfr metadata recording.jfr | head -100          # every event type and its field schema
jfr metadata recording.jfr | grep -A 20 "jdk.GarbageCollection"
jfr summary recording.jfr                       # what is present, and at what rate
jfr print --events jdk.GarbageCollection recording.jfr
jfr print --events jdk.CPULoad --json recording.jfr
```

`jfr metadata` is the only reliable way to confirm that an event or field name exists in
**that specific build**. `Recording.enable("does.not.Exist")` and
`RecordingStream.enable("does.not.Exist")` accept the string, do nothing, and throw
nothing — the failure surfaces later as an analysis that produced no data.

`jfr summary` on the most recent production file answers "do I already have this event,
and at what rate" before anyone proposes new instrumentation.

## Events by category

| Category           | Key events                                                                                                                               |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| GC                 | `jdk.GarbageCollection` (fields `sumOfPauses`, `longestPause`, `cause` — **not** `pause`), `jdk.GCPhasePauseLevel3`, `jdk.GCHeapSummary` |
| JIT compilation    | `jdk.Compilation`, `jdk.CompilerInlining`, `jdk.Deoptimization`                                                                          |
| Threads/contention | `jdk.JavaMonitorEnter`, `jdk.JavaMonitorWait`, `jdk.ThreadPark`, `jdk.ThreadStart`                                                       |
| I/O                | `jdk.FileWrite`, `jdk.SocketRead`, `jdk.SocketWrite`                                                                                     |
| Allocation         | `jdk.ObjectAllocationInNewTLAB`, `jdk.ObjectAllocationOutsideTLAB`                                                                       |
| Classes            | `jdk.ClassLoad`, `jdk.ClassDefine`                                                                                                       |
| CPU                | `jdk.CPULoad` (fields include `jvmUser`), `jdk.ExecutionSample`, `jdk.CPUTimeSample`                                                     |
| Virtual threads    | `jdk.VirtualThreadPinned` (`pinnedReason`, `blockingOperation`, `carrierThread`), `jdk.VirtualThreadSubmitFailed`                        |

Names that have circulated in real technical material and do not exist:

| Wrong                     | Correct                          |
| ------------------------- | -------------------------------- |
| `jdk.GCPauseL3`           | `jdk.GCPhasePauseLevel3`         |
| `jdk.AllocationInNewTLAB` | `jdk.ObjectAllocationInNewTLAB`  |
| field `pause` on GC event | `sumOfPauses` and `longestPause` |

The G1 pause hierarchy is `GCPhasePause` → `GCPhasePauseLevel1` → `Level2` → `Level3`,
each level decomposing the pause into progressively more specific sub-phases (object
copy, root set scan).

## The three samplers

| Event                    | Counts                                                                                            | Stock setting                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `jdk.ExecutionSample`    | a thread executing Java code; waiting and native threads excluded                                 | `period` 20 ms (`default`), 10 ms (`profile`) |
| `jdk.NativeMethodSample` | a thread in native code, **executing or waiting**                                                 | `period` 20 ms in both                        |
| `jdk.CPUTimeSample`      | a thread after consuming `throttle` of CPU, native attributed to its Java caller (JEP 509, Linux) | disabled in both; `throttle` 500/s or 10ms    |

The first two are what `hot-methods` and JMC's method profiling aggregate, which is why a
thread parked in `epoll_wait` shows up as hot there. `jdk.ExecutionSample` does not ask the
OS whether the thread was scheduled: on a box with more runnable Java threads than cores it
drifts towards a wall-clock profile of those threads. `jdk.CPUTimeSample` is the only
CPU-proportional one, at the price of being experimental and Linux-only.

`jdk.ObjectAllocationSample` carries a `weight` in bytes — the allocation it stands for —
throttled to 150/s (`default`) or 300/s (`profile`). Sum `weight`, never count events, to
rank allocation sites. `jdk.ObjectAllocationInNewTLAB` / `OutsideTLAB` are off in both
files and record every TLAB event when enabled: they are the expensive exact form.

`jdk.VirtualThreadPinned` has a `threshold` of **20 ms in both files**. A pinning audit
after JEP 491 lowers it (`jdk.VirtualThreadPinned#threshold=0ms`) and reads
`pinnedReason`; what the event measures is `virtual-threads-internals`.

## The three contention channels

They are not interchangeable, and mapping a wait to the wrong one hides the cause.

| Blocking mechanism                                                                                                                         | Event                  |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Blocked entering a `synchronized` block (label _Java Monitor Blocked_; fields `monitorClass`, `previousOwner`, `address`)                  | `jdk.JavaMonitorEnter` |
| `Object.wait()`                                                                                                                            | `jdk.JavaMonitorWait`  |
| `LockSupport.park()` — every `j.u.c.` construct, semaphores, `CountDownLatch`, and **connection pools** such as HikariCP's `ConcurrentBag` | `jdk.ThreadPark`       |

All three default to `threshold` = **10 ms** in `profile.jfc` and **20 ms** in
`default.jfc`. Contention finer than that — individually short but significant in
aggregate under high QPS — is absent from the recording until the `.jfc` lowers it.

A worked consequence: a 4.8 s `jdk.ThreadPark` inside `ConcurrentBag.borrow()`,
overlapping in time with a `jdk.GarbageCollection` whose `longestPause` was abnormal,
means the GC pause delayed connection returns and starved the pool. Searching for a
`synchronized` that does not exist is what happens when every wait is assumed to be
`JavaMonitorEnter`.

## What pushes a recording past its budget

The stock files carry their own numbers — `default.jfc` "typically less than 1 % overhead",
`profile.jfc` "typically around 2 %" — and `jfr help configure` names the options that
move them. Ordered by how often they turn a 2 % recording into an incident:

| Option / setting                                  | Why it costs                                                    | Safer form                                             |
| ------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------ |
| `stackTrace=true` on an event above ~10³/s        | stack walking dominates every commit                            | `threshold`, or `stackTrace=false`                     |
| `-XX:FlightRecorderOptions:stackdepth=` above 64  | every stack trace walks and stores more frames                  | raise only for the investigation that needs the roots  |
| `allocation-profiling=maximum`                    | enables the per-TLAB events instead of the throttled sample     | `high` keeps `ObjectAllocationSample` at a higher rate |
| `method-trace=<broad filter>`                     | an event with stack trace on every invocation, `threshold` 0 ms | `method-timing=` for the same methods                  |
| `memory-leaks=gc-roots` / `path-to-gc-roots=true` | a heap walk at dump time pauses the application                 | `stack-traces`; take `gc-roots` on one instance        |
| `exceptions=all`                                  | records every throw with a stack trace                          | `throttled`                                            |
| `class-loading=true`                              | an event per loaded class, noisy at startup and redeploy        | leave off outside a class-loading investigation        |
| `jdk.CPUTimeSample#throttle` at a short period    | more signals and stack walks per CPU second                     | a rate (`500/s`) bounds it independently of load       |

`jcmd JFR.start` prints the same caveat: "if the default event settings are modified,
overhead may exceed 1%".

## Reading duration correctly

```java
event.getDuration();                    // plain begin/end event — no argument
event.getDuration("longestPause");      // event carrying named duration fields
```

`getDuration("pause")` on `jdk.GarbageCollection` compiles and throws at runtime.

In `jfr print --json` output the fields are nested under `"values"`, and durations are
ISO-8601 **strings**:

```json
{
  "type": "jdk.GarbageCollection",
  "values": { "cause": "G1 Evacuation Pause", "longestPause": "PT0.015927S" }
}
```

Reading `event["duration"]` at the root finds nothing; dividing `"PT0.015927S"` by `1e6`
is a type error, not a unit error. Inspect one raw event before writing the parser, and
end every extraction script with a sanity assertion:

```python
assert total > 0, "no matching events found — do not trust the numbers below"
```

Without it, a third mistake of the same class prints an empty table that reads like a
healthy result.
