# Rates from the log, and the line shapes they depend on

Everything below was captured on Temurin 25.0.3 with
`-Xlog:gc*:file=gc.log:time,uptime,level,tags:filecount=5,filesize=20m`. The shapes are
G1's; the arithmetic transfers to any collector that logs region or generation sizes.

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
allocation rate  ≈ Σ Eden_before(n) × region_size / (t_last − t_first)
promotion rate   ≈ Σ max(0, Old_after(n) − Old_before(n)) × region_size / (t_last − t_first)
survival ratio   =  Survivor_after(n) / Eden_before(n)                 per pause
GC overhead      =  Σ pause_ms / ((t_last − t_first) × 1000)
```

Caveats that change the number:

- Eden alone undercounts allocation: humongous objects never enter Eden. Add the positive
  deltas of `Humongous regions` between consecutive pauses if they matter to the workload.
- Only positive `Old` deltas are promotion. A mixed collection shrinks `Old`; summing signed
  deltas reports a promotion rate of zero or less.
- `Old` grows by whole regions, so a single pause over-reports; the sum over a window is the
  usable figure.
- The span is between the first and the last pause in the file, not the process lifetime.
  With the default rotation (5 files × 20 MB, applied even when `filecount`/`filesize` are
  omitted) the current file may begin minutes after start — a log that "starts" at uptime
  600 s has rotated, not restarted.

## The recipe

POSIX awk only, as everywhere in this skill. Validated against a 15-second G1 run: it
reported ~4.0 GB/s allocation and ~3.6 GB/s promotion on a workload built to promote almost
everything it kept, and the same figures on the rotated file with the region size
auto-detected.

```bash
awk '
/Heap Region Size:/ {
    s = $0; sub(/.*Heap Region Size: /, "", s); sub(/[^0-9].*/, "", s); region_mb = s + 0
}
/gc,heap/ && /Eden regions:/ {
    t = $0; sub(/^\[[^]]*\]\[/, "", t); sub(/s\].*/, "", t); uptime = t + 0
    e = $0; sub(/.*Eden regions: /, "", e); sub(/->.*/, "", e); eden_before = e + 0
    if (last_t > 0) { alloc_mb += eden_before * region_mb; span = uptime - first_t }
    else first_t = uptime
    last_t = uptime; n++
}
/gc,heap/ && /Old regions:/ {
    o = $0; sub(/.*Old regions: /, "", o); split(o, p, "->")
    delta = p[2] - p[1]
    if (delta > 0) promo_mb += delta * region_mb
}
END {
    if (n < 2 || region_mb == 0) { print "need >= 2 young GCs and a Heap Region Size line (or -v region_mb=N)"; exit 1 }
    printf "young GCs=%d  span=%.1fs  region=%dMB\n", n, span, region_mb
    printf "allocation ~ %.1f MB/s   promotion ~ %.1f MB/s   (promotion/allocation = %.1f%%)\n",
           alloc_mb / span, promo_mb / span, 100 * promo_mb / alloc_mb
}' gc.log            # add -v region_mb=4 when the gc,init block is in a rotated-out file
```

The script exits non-zero and says why when it cannot compute — the failure mode to design
against is a rate of zero printed with confidence.

Cross-checks when the number looks wrong: `jstat -gc <pid> 1000` (`EU` per second, in KB)
for the allocation rate, and JFR `jdk.ThreadAllocationStatistics` for the per-thread split
(allocation-profiling).

## Symptom to cause

| Symptom in the log                                              | Possible causes                                                                   | How to distinguish                                                                                              | What to measure                                              | Likely remediation                                                                |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Frequent short young pauses, each within budget                 | Allocation rate; young sized down by a low pause target                           | Compare allocation rate with `Eden regions` target `(N)` — a tiny target with a modest rate is the pause target | Allocation rate; GC overhead                                 | Reduce allocation (allocation-profiling); raise the pause target or heap          |
| Young pauses growing with unchanged frequency                   | More survivors: in-flight requests, cache warm-up; RSet coarsening                | `Old regions` delta and `Survivor` after; `gc+phases` `Object Copy` versus `Merge Heap Roots`                   | Promotion rate; survival ratio; downstream latency           | Fix the upstream latency; g1-internals for the phase                              |
| `after` floor rising at every `Pause Remark` / `Pause Full`     | Retention: leak, unbounded cache; humongous churn                                 | `Humongous regions` line moving with the floor says churn; flat says retention                                  | `after` trend over hours                                     | Heap dump (memory-profiling-and-diagnostics); allocation site for humongous       |
| `Pause Full (G1 Compaction Pause)`                              | Marking too late; evacuation failures; humongous fragmentation; `System.gc()`     | The lines just before: `Evacuation Failure`, rising occupancy at `Concurrent Start`, `G1 Humongous Allocation`  | Occupancy at each concurrent start; failures per hour        | g1-concurrent-marking (trigger), g1-internals (failure), `-XX:+DisableExplicitGC` |
| `(Evacuation Failure: Allocation)` suffix on young pauses       | No free region for survivors: promotion spike, heap too small, humongous pressure | `Old regions` delta in the failing pause; `Humongous regions` before it                                         | Promotion rate at the failure; free regions (`GC.heap_info`) | `G1ReservePercent`, heap; g1-internals                                            |
| `(Evacuation Failure: Pinned)`                                  | A JNI critical section pinned the region (JEP 423)                                | Only appears with native code holding `Get*Critical`                                                            | Native call durations                                        | Shorten the critical section; not a heap problem                                  |
| Many `Pause Young (Concurrent Start) (G1 Humongous Allocation)` | Objects above half a region allocated continuously                                | `gc+humongous=debug` per region; `Concurrent Undo Cycle` frequent                                               | Humongous allocations per second                             | Allocation site or larger `G1HeapRegionSize` (g1-concurrent-marking)              |
| `Metadata GC Threshold` recurring                               | Class loading churn, class loader leak                                            | `gc,metaspace` line growing; heap `after` flat                                                                  | Loaded class count over time                                 | jvm-class-loading — raising `-Xmx` does nothing                                   |
| `gc,cpu` `Real` far above `(User + Sys) / workers`              | GC threads not scheduled: CPU quota, noisy neighbour                              | `Using N workers of M` versus the container's CPU limit                                                         | cgroup `nr_throttled`                                        | container-awareness, linux-for-jvm                                                |
| `gc,cpu` `Sys` a large share of `Real`                          | Page faults on first touch, THP compaction, swap                                  | Happens on fresh regions after start or expansion                                                               | Major faults during the pause                                | `-XX:+AlwaysPreTouch`, THP policy (linux-for-jvm)                                 |
| Logged pause small, client latency large                        | Time-to-safepoint or something outside the JVM                                    | `-Xlog:safepoint` `Reaching safepoint` versus `At safepoint`                                                    | Safepoint log at the same timestamp                          | safepoints, pause-attribution                                                     |
| Log starts at uptime well above zero                            | Rotation, not a restart                                                           | `gc.log.0`…`gc.log.4` exist; the `gc,init` block is in the oldest                                               | —                                                            | Read the oldest file for `gc,init`; nothing to fix                                |
