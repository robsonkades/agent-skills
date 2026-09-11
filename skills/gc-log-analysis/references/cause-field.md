# The cause field

The value in parentheses is a routing signal, not a root-cause verdict. Interpret it with
the collector, event type, phase lines and the events immediately before it.

| Cause                                 | Meaning                                                         | Investigate                                                                               |
| ------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `G1 Evacuation Pause`                 | G1 evacuation event, including mixed pauses                     | type, duration, frequency and phase/work counts                                           |
| `Evacuation Failure: ...` (G1 suffix) | failure detail, not the triggering cause on the JDK 25 baseline | `Allocation`, `Pinned`, or both; inspect destination capacity and native/pinning evidence |
| `Metadata GC Threshold`               | Metaspace pressure triggered a collection                       | inspect metaspace and class-loader evidence — see `jvm-class-loading`                     |
| `GCLocker Initiated GC` (older logs)  | GC-locker coordination triggered collection                     | establish the older collector/JDK contract; not a JDK 25 G1 cause name                    |
| `System.gc()`                         | explicit collection was requested                               | identify caller and required semantics; compare disable vs concurrent handling            |
| `Allocation Failure`                  | allocation could not be satisfied                               | allocation rate, then heap sizing                                                         |
| `Heap Dump Initiated GC`              | a tool asked for it                                             | tag diagnostic intervention; retain in user-impact totals, separate for tuning            |
| `Proactive`                           | ZGC's proactive policy initiated a collection                   | usually expected; investigate only if CPU/headroom/SLO evidence shows harm                |

`Metadata GC Threshold` recurring is the one most often misread. It looks like a heap
event and appears in the heap log, but raising `-Xmx` does not directly address the metaspace
trigger. Inspect class-loader reachability, churn and metaspace settings rather than asserting
the rest of the heap cannot affect the overall workload.

The [JDK 25.0.3 cause names](https://github.com/openjdk/jdk25u/blob/2fce64f0ecc22355298b9ab9c1ba9477a2f1ec86/src/hotspot/share/gc/shared/gcCause.cpp)
and [G1 failure suffix construction](https://github.com/openjdk/jdk25u/blob/2fce64f0ecc22355298b9ab9c1ba9477a2f1ec86/src/hotspot/share/gc/g1/g1YoungCollector.cpp)
are distinct. Match the target build; a failure suffix must not replace the initiating cause.

## The ZGC log format changed

ZGC is generational on the JDK 25 baseline, and its log reflects that:

- Lines report `Minor Collection` and `Major Collection`.
- Phases are prefixed `y:` (young) and `o:` (old).

Examples showing bare `Pause Mark Start` / `Pause Mark End` describe the **non-generational
ZGC removed in JDK 24**. If a runbook's example lines do not match what you see, the
runbook may target another release/mode. Establish the actual format before deciding whether
the parser or the input assumptions are wrong.
See [JEP 490](https://openjdk.org/jeps/490) for the JDK 24 removal boundary; keep an older
project's collector mode when interpreting its existing logs.

## Investigation signals and alerts

Use the service's existing SLO and response policy to decide which signals warrant paging,
a warning or trend investigation. A cause name or normal warm-up trend alone is not harm.

- [ ] Any unplanned `Pause Full` inside an online service's SLO window
- [ ] Logged STW pause share above its defined budget (not total GC CPU/barrier overhead)
- [ ] Tail pause above its allocated latency budget, with estimator and sample count named
- [ ] Recurring `Metadata GC Threshold` with unexpected class/metaspace pressure or impact
- [ ] Rising post-reclamation floor at comparable phases/load, beyond the expected lifecycle

Duration-only thresholds can miss the frequency case. Include a pause-share condition when
the service's throughput or latency budget requires it.

## During an incident

- [ ] Select pause intervals overlapping the affected request/alert window, after checking clocks
- [ ] Read the cause before forming any hypothesis
- [ ] Check whether the logged pause explains the observed latency; if not, go to the
      safepoint log
- [ ] Check headroom after collection
- [ ] For allocation sources, pass existing evidence to `allocation-profiling`; capture only if needed

A completion decorator marks log emission near the end, not the pause's start. End minus
duration approximates its interval subject to logging delay and timestamp precision; prefer
matching start/end or JFR timing when available. Do not add GC time to the containing
safepoint interval, and do not equate overlap with the request's entire delay.

## After tuning

- [ ] Same load, same duration, before and after
- [ ] Compare frequency, p99, max, total overhead and full-GC count — not just one of them
- [ ] One variable per iteration
- [ ] Result **and mechanism** recorded in the runbook
