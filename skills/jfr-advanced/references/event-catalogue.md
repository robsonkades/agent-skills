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
| CPU                | `jdk.CPULoad` (fields include `jvmUser`), `jdk.ExecutionSample`                                                                          |

Names that have circulated in real technical material and do not exist:

| Wrong                     | Correct                          |
| ------------------------- | -------------------------------- |
| `jdk.GCPauseL3`           | `jdk.GCPhasePauseLevel3`         |
| `jdk.AllocationInNewTLAB` | `jdk.ObjectAllocationInNewTLAB`  |
| field `pause` on GC event | `sumOfPauses` and `longestPause` |

The G1 pause hierarchy is `GCPhasePause` → `GCPhasePauseLevel1` → `Level2` → `Level3`,
each level decomposing the pause into progressively more specific sub-phases (object
copy, root set scan).

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
