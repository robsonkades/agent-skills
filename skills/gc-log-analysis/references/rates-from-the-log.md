# Rates from the log, and the line shapes they depend on

Everything below was captured on Temurin 25.0.3 with
`-Xlog:gc*:file=gc.log:time,uptime,level,tags:filecount=5,filesize=20m`. The shapes are
G1's. Transfer the method only after mapping the other collector's event and accounting
semantics; identical-looking generation numbers need not represent the same lifecycle.

## Anatomy of a line

```
[2026-09-02T02:38:18.646-0300][10.239s][info ][gc,heap       ] GC(2620) Old regions: 136->166
 ^ time decorator              ^ uptime  ^ level  ^ tags (padded)  ^ GC id   ^ message
```

- `uptime` is seconds with an `s` suffix; strip it before arithmetic.
- The tag column is padded with spaces to a fixed width — match `gc,heap`, never
  `[gc,heap]`.
- Correlate collection lines by `GC(n)` within one process. Concurrent cycles have their own IDs;
  do not infer relationships from arithmetic adjacency or reuse IDs across restarts.

The lines the rates come from, per young pause:

```
[gc,heap] GC(42) Eden regions: 9->0(29)          # before->after(target for next cycle)
[gc,heap] GC(42) Survivor regions: 3->2(2)
[gc,heap] GC(42) Old regions: 151->161            # no third number — a regex demanding one matches nothing
[gc,heap] GC(42) Humongous regions: 4->0
[gc      ] GC(42) Pause Young (Normal) (G1 Evacuation Pause) 166M->162M(256M) 1.235ms
[gc,cpu  ] GC(42) User=0.00s Sys=0.00s Real=0.00s
```

The young pause types are `Normal`, `Concurrent Start`, `Prepare Mixed` and `Mixed`; the
full sub-phase block is in g1-internals. Region size is in the `gc,init` block of the
**oldest** file — `Heap Region Size: 1M` — or from `jcmd <pid> GC.heap_info`.

## The arithmetic

```
Eden refill rate ≈ Σ(n=2..N) Eden_before(n) × region_size / (t_N − t_1)
old-growth rate  ≈ Σ(n=2..N) max(0, Old_after(n) − Old_before(n)) × region_size / (t_N − t_1)
survivor-to-Eden =  Survivor_after(n) / Eden_before(n)                 per pause
STW pause share  =  Σ pause_ms inside window / (window_seconds × 1000)
```

Caveats that change the number:

- Eden refill is only an allocation proxy: the first observation belongs partly outside
  the window, allocation can occur during/around events, and humongous objects bypass
  Eden. Add separately estimated humongous allocation only with lifecycle-aware deltas;
  a positive occupancy delta is not total churn when objects are also reclaimed.
- A positive `Old` region delta is **old-region growth**, not a direct byte ledger of
  promoted objects. Region reclassification, mixed reclamation and partially occupied
  regions introduce error; signed deltas can hide simultaneous promotion and reclamation.
- `Survivor_after / Eden_before` excludes objects promoted directly to old and includes
  region-capacity rounding. It is not the total object survival ratio. Use age tables/JFR
  when that distinction drives a decision.
- The pause formula measures logged stop-the-world share, not concurrent collector CPU,
  barrier cost or application slowdown.
- For these rates, use matching first/last completed young events and exclude the first event's
  deltas from both numerators. Pauses/reclamation and missing events still limit the proxy.
  A log starting at 600 s may be rotated, enabled late or excerpted; inspect continuity rather
  than inferring the cause. Never concatenate multiple JVM lifetimes or overlapping rotations.

## The recipe

This POSIX awk recipe targets one chronological G1 process log with seconds-uptime decorators,
integer-M region size and complete Eden/Old lines before each young-pause completion. It joins by
GC ID, excludes the first event from both numerators and rejects unsupported/incomplete windows.
Neither output is an exact allocation or promotion byte counter.

```bash
awk '
/Heap Region Size:/ {
    if ($0 !~ /Heap Region Size: [0-9]+M$/) { bad=1; next }
    s = $0; sub(/.*Heap Region Size: /, "", s); sub(/[^0-9].*/, "", s); region_mb = s + 0
}
/gc,heap/ && /Eden regions:/ {
    if (!match($0, /GC\([0-9]+\)/)) { bad=1; next }
    id=substr($0,RSTART,RLENGTH)
    e=$0; sub(/.*Eden regions: /,"",e); sub(/->.*/,"",e)
    eden[id]=e+0; have_e[id]=1
}
/gc,heap/ && /Old regions:/ {
    if (!match($0, /GC\([0-9]+\)/)) { bad=1; next }
    id=substr($0,RSTART,RLENGTH)
    o = $0; sub(/.*Old regions: /, "", o); split(o, p, "->")
    growth[id]=p[2]-p[1]; have_o[id]=1
}
/\[gc *\]/ && /Pause Full/ && /ms$/ { bad=1 }
/\[gc *\]/ && /Pause Young/ && /[0-9]+([.][0-9]+)?ms$/ {
    if (!match($0,/GC\([0-9]+\)/)) { bad=1; next }
    id=substr($0,RSTART,RLENGTH)
    if (!have_e[id] || !have_o[id] || seen[id]++) { bad=1; next }
    if (!match($0,/\[[0-9]+([.][0-9]+)?s\]/)) { bad=1; next }
    uptime=substr($0,RSTART+1,RLENGTH-3)+0
    if (n && uptime<=last_t) { bad=1; next }
    if (n) {
      eden_mb+=eden[id]*region_mb
      if (growth[id]>0) old_growth_mb+=growth[id]*region_mb
    } else first_t=uptime
    last_t=uptime; n++
    delete have_e[id]; delete have_o[id]
}
END {
    for (id in have_e) bad=1
    if (bad) { print "incomplete, duplicate, nonchronological or unsupported window; split/repair input"; exit 1 }
    if (n < 2 || region_mb == 0) { print "need >= 2 young GCs and a Heap Region Size line (or -v region_mb=N)"; exit 1 }
    span=last_t-first_t
    if (span <= 0 || eden_mb <= 0) { print "non-positive observation span or Eden refill; cannot compute a rate"; exit 1 }
    printf "young GCs=%d  span=%.3fs  region=%dMiB\n", n, span, region_mb
    printf "Eden refill ~ %.1f MiB/s   old growth ~ %.1f MiB/s   (old growth/Eden refill = %.1f%%)\n",
           eden_mb / span, old_growth_mb / span, 100 * old_growth_mb / eden_mb
}' gc.log            # add -v region_mb=4 when the gc,init block is in a rotated-out file
```

The script exits non-zero and says why when it cannot compute — the failure mode to design
against is a rate of zero printed with confidence.

Cross-checks when the number looks wrong: sample `jstat -gc <pid> 1000` and account for
Eden resets across young collections rather than treating one `EU` delta as a rate. JFR
`jdk.ThreadAllocationStatistics` provides interval thread totals, while sampled allocation
events answer which sites contributed (allocation-profiling).

## Symptom to cause

| Symptom in the log                                              | Possible causes                                                                             | How to distinguish                                                                                             | What to measure                                                               | Likely remediation                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Frequent short young pauses, each within budget                 | Allocation rate; ergonomic young sizing                                                     | Compare allocation proxy, Eden target and ergonomic predictions; a small target is not its own explanation     | Allocation proxy, pause share and throughput                                  | Adjust only the evidenced allocation or sizing mechanism                                                |
| Young pauses growing with unchanged frequency                   | More survivors: in-flight requests, cache warm-up; RSet coarsening                          | `Old regions` delta and `Survivor` after; `gc+phases` `Object Copy` versus `Merge Heap Roots`                  | Promotion rate; survival ratio; downstream latency                            | Fix the upstream latency; g1-internals for the phase                                                    |
| Comparable post-reclamation floor rising across complete cycles | Retention, changed load/concurrency, delayed reclamation, cache growth, humongous occupancy | Compare the same collector phase and traffic regime; correlate class/humongous counts and live-object evidence | Equivalent-cycle floor over hours                                             | Heap dump (heap-dump-analysis) if retention remains the hypothesis; profile allocation separately       |
| `Pause Full (G1 Compaction Pause)`                              | Marking too late; evacuation failures; humongous fragmentation; explicit collection         | Read preceding cause/failure lines and the initiating actor before assigning mechanism                         | Occupancy at starts, to-space failures, humongous topology, explicit-GC count | g1-concurrent-marking or g1-internals; remove/redirect explicit GC only after establishing its contract |
| `(Evacuation Failure: Allocation)` suffix on young pauses       | Copy allocation unavailable: survival/promotion spike or heap pressure                      | Failure detail, region transitions and humongous occupancy; not proof of zero total free bytes                 | Evacuation demand, available destination capacity and recovery                | Diagnose with g1-internals before changing reserve or heap                                              |
| `(Evacuation Failure: Pinned)`                                  | Pinned regions prevented evacuation; JNI critical access is one source                      | Correlate pinning/native evidence; do not assume every pin has the same caller                                 | Pin duration/count, free regions and allocation pressure                      | Shorten/avoid critical access where causal; also restore evacuation headroom                            |
| Many `Pause Young (Concurrent Start) (G1 Humongous Allocation)` | Objects above half a region allocated continuously                                          | `gc+humongous=debug` per region; `Concurrent Undo Cycle` frequent                                              | Humongous allocations per second                                              | Allocation site or larger `G1HeapRegionSize` (g1-concurrent-marking)                                    |
| `Metadata GC Threshold` recurring                               | Class loading churn, metaspace policy or loader retention                                   | Correlate metaspace, loaded/unloaded classes and loader reachability                                           | Class/metaspace trends                                                        | jvm-class-loading; do not treat heap sizing as a direct fix for the trigger                             |
| `gc,cpu` wall time high relative to aggregate CPU               | Scheduling delay, serial phases, worker imbalance or waits                                  | Compare phase worker times and CPU quotas; dividing by nominal workers assumes full parallel use               | Throttling, runnable time and phase balance                                   | container-awareness, linux-for-jvm; act on the confirmed bottleneck                                     |
| `gc,cpu` `Sys` a large share of `Real`                          | Page faults on first touch, THP compaction, swap                                            | Happens on fresh regions after start or expansion                                                              | Major faults during the pause                                                 | `-XX:+AlwaysPreTouch`, THP policy (linux-for-jvm)                                                       |
| Logged pause small, client latency large                        | Time-to-safepoint or something outside the JVM                                              | `-Xlog:safepoint` `Reaching safepoint` versus `At safepoint`                                                   | Safepoint log at the same timestamp                                           | safepoints, pause-attribution                                                                           |
| Log starts at uptime well above zero                            | Rotation, late enabling, truncation or excerpt                                              | Inspect process identity, timestamps, rotation continuity and startup evidence                                 | Capture coverage and gaps                                                     | Reconstruct the available window; obtain region size from target evidence                               |
