# The cause field

The value in parentheses is a routing signal, not a root-cause verdict. Interpret it with
the collector, event type, phase lines and the events immediately before it.

| Cause                    | Meaning                                       | Investigate                                                                    |
| ------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------ |
| `G1 Evacuation Pause`    | normal young collection                       | nothing, unless frequency changed                                              |
| `G1 Evacuation Failure`  | evacuation could not obtain usable to-space   | free-region headroom, promotion/survival spike, pinning, humongous topology    |
| `Metadata GC Threshold`  | Metaspace pressure triggered a collection     | **not a heap problem** — see `jvm-class-loading`                               |
| `GCLocker Initiated GC`  | GC-locker coordination triggered collection   | collector/JDK behavior and native critical regions                             |
| `System.gc()`            | explicit collection was requested             | identify caller and required semantics; compare disable vs concurrent handling |
| `Allocation Failure`     | allocation could not be satisfied             | allocation rate, then heap sizing                                              |
| `Heap Dump Initiated GC` | a tool asked for it                           | expected during diagnosis; exclude from analysis windows                       |
| `Proactive`              | ZGC's proactive policy initiated a collection | usually expected; investigate only if CPU/headroom/SLO evidence shows harm     |

`Metadata GC Threshold` recurring is the one most often misread. It looks like a heap
event, it appears in the heap log, and raising `-Xmx` does nothing at all.

## The ZGC log format changed

ZGC is generational on the JDK 25 baseline, and its log reflects that:

- Lines report `Minor Collection` and `Major Collection`.
- Phases are prefixed `y:` (young) and `o:` (old).

Examples showing bare `Pause Mark Start` / `Pause Mark End` describe the **non-generational
ZGC removed in JDK 24**. If a runbook's example lines do not match what you see, the
runbook predates the baseline — that mismatch is information, not a parsing error.

## Alerting on causes

- [ ] Any unplanned `Pause Full` inside an online service's SLO window
- [ ] GC overhead above the defined budget (total pause time / wall time)
- [ ] Tail pause above its allocated latency budget, with estimator and sample count named
- [ ] Recurring `Metadata GC Threshold`
- [ ] Rising trend in heap used **after** collection

Duration-based alerts alone miss the frequency case entirely. Alert on overhead as well as
on individual pauses.

## During an incident

- [ ] Filter pauses at the alert's timestamp using the `time` decorator
- [ ] Read the cause before forming any hypothesis
- [ ] Check whether the logged pause explains the observed latency; if not, go to the
      safepoint log
- [ ] Check headroom after collection
- [ ] If you need the allocation source, JFR with `jdk.ObjectAllocationSample`

## After tuning

- [ ] Same load, same duration, before and after
- [ ] Compare frequency, p99, max, total overhead and full-GC count — not just one of them
- [ ] One variable per iteration
- [ ] Result **and mechanism** recorded in the runbook
