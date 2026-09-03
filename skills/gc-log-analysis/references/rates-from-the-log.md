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
- Every line of one collection carries the same `GC(n)`; a concurrent marking cycle has its
  **own** id, one higher than the pause that started it.

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
Eden refill rate ≈ Σ Eden_before(n) × region_size / (t_last − t_first)
old-growth rate  ≈ Σ max(0, Old_after(n) − Old_before(n)) × region_size / (t_last − t_first)
survivor-to-Eden =  Survivor_after(n) / Eden_before(n)                 per pause
STW pause share  =  Σ pause_ms / ((t_last − t_first) × 1000)
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
- The span is between the first and the last pause in the file, not the process lifetime.
  With the default rotation (5 files × 20 MB, applied even when `filecount`/`filesize` are
  omitted) the current file may begin minutes after start — a log that "starts" at uptime
  600 s has rotated, not restarted.

## The recipe

POSIX awk only, as everywhere in this skill. Validated against one 15-second G1 run: it
reported ~4.0 GB/s of Eden refill and ~3.6 GB/s of positive old-region growth on a workload
built to promote almost everything it kept, and the same estimates on the rotated file
with the region size auto-detected. Those labels matter: neither number is an exact byte
counter.

```bash
awk '
/Heap Region Size:/ {
    s = $0; sub(/.*Heap Region Size: /, "", s); sub(/[^0-9].*/, "", s); region_mb = s + 0
}
/gc,heap/ && /Eden regions:/ {
    t = $0; sub(/^\[[^]]*\]\[/, "", t); sub(/s\].*/, "", t); uptime = t + 0
    e = $0; sub(/.*Eden regions: /, "", e); sub(/->.*/, "", e); eden_before = e + 0
    if (last_t > 0) { eden_mb += eden_before * region_mb; span = uptime - first_t }
    else first_t = uptime
    last_t = uptime; n++
}
/gc,heap/ && /Old regions:/ {
    o = $0; sub(/.*Old regions: /, "", o); split(o, p, "->")
    delta = p[2] - p[1]
    if (delta > 0) old_growth_mb += delta * region_mb
}
END {
    if (n < 2 || region_mb == 0) { print "need >= 2 young GCs and a Heap Region Size line (or -v region_mb=N)"; exit 1 }
    if (span <= 0 || eden_mb <= 0) { print "non-positive observation span or Eden refill; cannot compute a rate"; exit 1 }
    printf "young GCs=%d  span=%.1fs  region=%dMB\n", n, span, region_mb
    printf "Eden refill ~ %.1f MB/s   old growth ~ %.1f MB/s   (old growth/Eden refill = %.1f%%)\n",
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

| Symptom in the log                                              | Possible causes                                                                             | How to distinguish                                                                                              | What to measure                                                               | Likely remediation                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Frequent short young pauses, each within budget                 | Allocation rate; young sized down by a low pause target                                     | Compare allocation rate with `Eden regions` target `(N)` — a tiny target with a modest rate is the pause target | Allocation rate; GC overhead                                                  | Reduce allocation (allocation-profiling); raise the pause target or heap                                |
| Young pauses growing with unchanged frequency                   | More survivors: in-flight requests, cache warm-up; RSet coarsening                          | `Old regions` delta and `Survivor` after; `gc+phases` `Object Copy` versus `Merge Heap Roots`                   | Promotion rate; survival ratio; downstream latency                            | Fix the upstream latency; g1-internals for the phase                                                    |
| Comparable post-reclamation floor rising across complete cycles | Retention, changed load/concurrency, delayed reclamation, cache growth, humongous occupancy | Compare the same collector phase and traffic regime; correlate class/humongous counts and live-object evidence  | Equivalent-cycle floor over hours                                             | Heap dump (heap-dump-analysis) if retention remains the hypothesis; profile allocation separately       |
| `Pause Full (G1 Compaction Pause)`                              | Marking too late; evacuation failures; humongous fragmentation; explicit collection         | Read preceding cause/failure lines and the initiating actor before assigning mechanism                          | Occupancy at starts, to-space failures, humongous topology, explicit-GC count | g1-concurrent-marking or g1-internals; remove/redirect explicit GC only after establishing its contract |
| `(Evacuation Failure: Allocation)` suffix on young pauses       | No free region for survivors: promotion spike, heap too small, humongous pressure           | `Old regions` delta in the failing pause; `Humongous regions` before it                                         | Promotion rate at the failure; free regions (`GC.heap_info`)                  | `G1ReservePercent`, heap; g1-internals                                                                  |
| `(Evacuation Failure: Pinned)`                                  | Pinned regions prevented evacuation; JNI critical access is one source                      | Correlate pinning/native evidence; do not assume every pin has the same caller                                  | Pin duration/count, free regions and allocation pressure                      | Shorten/avoid critical access where causal; also restore evacuation headroom                            |
| Many `Pause Young (Concurrent Start) (G1 Humongous Allocation)` | Objects above half a region allocated continuously                                          | `gc+humongous=debug` per region; `Concurrent Undo Cycle` frequent                                               | Humongous allocations per second                                              | Allocation site or larger `G1HeapRegionSize` (g1-concurrent-marking)                                    |
| `Metadata GC Threshold` recurring                               | Class loading churn, class loader leak                                                      | `gc,metaspace` line growing; heap `after` flat                                                                  | Loaded class count over time                                                  | jvm-class-loading — raising `-Xmx` does nothing                                                         |
| `gc,cpu` `Real` far above `(User + Sys) / workers`              | GC threads not scheduled: CPU quota, noisy neighbour                                        | `Using N workers of M` versus the container's CPU limit                                                         | cgroup `nr_throttled`                                                         | container-awareness, linux-for-jvm                                                                      |
| `gc,cpu` `Sys` a large share of `Real`                          | Page faults on first touch, THP compaction, swap                                            | Happens on fresh regions after start or expansion                                                               | Major faults during the pause                                                 | `-XX:+AlwaysPreTouch`, THP policy (linux-for-jvm)                                                       |
| Logged pause small, client latency large                        | Time-to-safepoint or something outside the JVM                                              | `-Xlog:safepoint` `Reaching safepoint` versus `At safepoint`                                                    | Safepoint log at the same timestamp                                           | safepoints, pause-attribution                                                                           |
| Log starts at uptime well above zero                            | Rotation, not a restart                                                                     | `gc.log.0`…`gc.log.4` exist; the `gc,init` block is in the oldest                                               | —                                                                             | Read the oldest file for `gc,init`; nothing to fix                                                      |
