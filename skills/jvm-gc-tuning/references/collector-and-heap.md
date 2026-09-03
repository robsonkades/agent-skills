# Collector selection and heap sizing

Read this only after GC has been confirmed as the bottleneck — pause time or pause
frequency showing up directly in the latency profile.

## Collector selection

The decision depends primarily on the pause the SLO can absorb and on the CPU the
collector may take from the application; heap size and throughput break the ties.

| Collector  | Pause model                                                                                                                 | Prefer when                                                                              | Becomes problematic when                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| G1         | STW young/mixed pauses, concurrent marking, adaptive pause target                                                           | Balanced starting point where measured tails and CPU fit the SLO; broad heap/CPU range   | Root/RSet/copy-heavy pauses exceed budget, evacuation headroom fails, or concurrent work competes for scarce CPU       |
| ZGC        | Concurrent generational marking/relocation; normal pauses dominated by roots/coordination rather than whole-heap relocation | Very tight tail-latency objective with CPU and heap headroom to outrun allocation        | Scarce CPU/headroom, allocation stalls, or barrier/concurrent cost violates throughput; no sub-ms result is guaranteed |
| Shenandoah | Concurrent evacuation; traditional/generational mode is build/configuration-specific (generational product since JEP 521)   | Similar low-pause objective on a build that ships it, with mode named and benchmarked    | Scarce CPU/headroom, degeneration/full fallback, pinning, or comparisons that omit mode/vendor                         |
| Parallel   | Stop-the-world young/full work using multiple workers; adaptive sizing                                                      | Throughput-oriented batch/offline work when measured pauses are acceptable               | Live-set/heap pauses violate the actual deadline or monopolizing cores harms colocated work                            |
| Serial     | Stop-the-world collection with one GC worker                                                                                | Small/short-lived or single-CPU workloads where simplicity/footprint wins in measurement | One worker cannot meet pause/throughput needs; accidental ergonomic selection conflicts with the SLO                   |

**CPU is the dimension most often missed.** GC thread counts come from the processor count
the JVM sees, measured on 25.0.3 with `-XX:ActiveProcessorCount`: G1 uses
`ParallelGCThreads = N` up to 8 and `8 + 5/8 × (N − 8)` above (4 CPUs → 4, 16 → 13), with
`ConcGCThreads` about a quarter of that (16 → 3); ZGC uses roughly `N × 5/8` parallel and
`N/8` concurrent (8 CPUs → 5 and 2, 2 CPUs → 2 and 1). A concurrent collector on a
2-CPU pod therefore runs its cycle on the same core the application needs, which is why
"we moved to ZGC and throughput fell" is a CPU-count finding, not a collector defect.

**Ergonomics are release/build inputs:** a JVM that sees one CPU selected Serial on the
verified 25.0.3 build
`-XX:ActiveProcessorCount=1` → `UseSerialGC = true {ergonomic}`). The JDK 9-era rule also
demotes small-memory hosts; that half was not reproducible here without a cgroup, so
verify on the target with startup logs/`jcmd <pid> VM.flags`. JDK 27 EA documentation says
G1 is the default, but JEP 523 is still Candidate as of 2026-09-03. Test the exact target
build and explicitly select the intended collector rather than encoding an EA/JEP status
as a fleet guarantee.

Two decisions this table does **not** make for you:

- **Whether to change collector at all.** Compare change risk and causal fit: an allocation
  redesign may be larger than a collector experiment, while a copied experimental flag can
  be riskier than both.
- **Whether the pause requirement is real.** Low pauses are bought with barriers,
  concurrent CPU and headroom. For batch work, Parallel is a throughput candidate; a
  representative useful-work/hour measurement decides.

With a stop-the-world compacting collector, full-GC work generally grows with live data and
heap/metadata traversal. Whether that disqualifies Parallel/Serial depends on the actual
deadline, event probability and recovery model—not heap size alone.

## Heap sizing

```
-Xms<initial> -Xmx<maximum>   # choose from measured startup/residency/SLO requirements
```

A variable heap changes ergonomics and can incur growth/page costs; a fixed heap commits
capacity earlier and can increase density/RSS pressure. Benchmark startup, steady state,
idle uncommit and peak for the chosen collector/container policy.

**Leave headroom for non-heap.** Metaspace, code cache, thread stacks, direct buffers and
the collector's own structures are all outside `-Xmx` and all count against the cgroup
limit. Measure them with NMT under real load rather than estimating; `jvm-memory-regions`
covers the budget and the `MaxRAMPercentage` arithmetic. On common modern HotSpot server
ergonomics `MaxRAMPercentage` defaults to 25, but minimum-heap rules, visible memory,
vendor/build and explicit options can change effective `-Xmx`. Read `MaxHeapSize`,
container logs and flags on the target rather than multiplying the pod limit blindly.

### Sizing from the live set

The number the heap is sized from is the **live set**: what survives a complete
collection under representative load, not what the dashboard shows between collections.

1. Measure equivalent post-reclamation occupancy across representative regimes. Forced
   `GC.run` is high impact and belongs on a drained/controlled replica; a G1 Remark is a
   marking phase, not a complete reclamation point. Use collector-specific cycle/mixed
   evidence and heap/JFR data. Keep the distribution and peak context; a rising floor is a
   retention hypothesis, not automatically a leak.
2. Measure allocation and old-generation pressure from appropriate evidence. GC region
   deltas are estimates, not exact promoted/allocated byte counters.
3. Size old for the live set plus the room the collector needs to run before it is full.
   Under G1, adaptive IHOP derives an effective trigger from predicted old allocation,
   marking time, young size and reserve/waste constraints; the configured 45% is not a
   universal live-set ratio. Size from measured live set, allocation during the cycle,
   evacuation/reserve margin and workload bursts, then validate policy logs. Rules such as
   “3–4× live set” are only coarse experimental brackets, not recommendations.
4. Under a concurrent collector, the heap must also absorb `allocation rate × cycle time`
   while the cycle runs, or the mutators stall on allocation — the sizing and the
   `Allocation Stall` signal are zgc-and-shenandoah.
5. Fit the result into the container budget (jvm-memory-regions). If it does not fit,
   reduce live state/allocation, increase capacity, change the collector/architecture, or
   accept and quantify a smaller safety margin—never silently erase it.
6. Validate with equivalent workload/regimes and enough events for the declared confidence:
   compare pause distribution by type, STW share, concurrent CPU, allocation stalls/full
   collections, throughput and post-reclamation occupancy.

### The 32 GB boundary

For collectors using ordinary HotSpot compressed oops, the zero-based compressed-oop range
is often near 32 GiB, but the actual cutoff depends on object alignment, heap base/reservation
and build. When `UseCompressedOops` turns off, ordinary heap references typically grow from
4 to 8 bytes and headers/layout can change, so a pointer-rich heap may lose effective
capacity. Confirm with `-Xlog:gc+heap+coops=debug`/flags and measure object layout on the
target. ZGC uses colored-pointer/addressing machinery rather than serving as a
“31 GiB compressed-oops” workaround; compare collectors independently.

## MaxGCPauseMillis

It is a target, not a guarantee, and G1 cannot honour it in the face of humongous
allocations, evacuation failure or a saturated old generation.

Lowering it often makes policy choose less young/CSet work, producing more frequent
collections. Promotion rises only when the changed lifetime/survivor regime causes it.
For throughput, raising the target is a hypothesis whose pause, frequency, CPU and useful
work must be validated.

Derive it from the SLO, knowing it is a target — not from a round number.

## When the flag is not the answer

| Log observation                                  | Actual investigation                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| Frequent young collections, little old growth    | quantify pause share/allocation; may be healthy or fixed-cost overhead  |
| Frequent young collections, heavy old pressure   | lifetime/in-flight/cache/survivor policy; identify allocation/owners    |
| Rising comparable post-reclamation floor         | retention/capacity hypothesis; distinguish workload, cache and defect   |
| Full GCs after evacuation failure                | usable to-space, live set, promotion spike, pinning, humongous topology |
| `Metadata GC Threshold`                          | Metaspace, not heap — see `jvm-class-loading`                           |
| Logged pause much smaller than client-felt pause | correlate TTSP, queue amplification, host and other request work        |

The last two rows are the ones most often "fixed" with a heap flag that cannot possibly
help.

## Validating a change

- [ ] Equivalent workload, JDK/container limits, warm-up and operating regimes before/after
- [ ] Sample counts, percentile estimator and uncertainty reported by GC event type
- [ ] Compare frequency, tails/max, STW share, concurrent CPU, allocation stalls/full GC,
      throughput and footprint—not one metric
- [ ] Isolate one mechanism per iteration when feasible; document interactions otherwise
- [ ] Predeclare expected signal, abort/rollback thresholds and capacity guardrails
- [ ] Revert a change that misses its prediction or causes a material regression
- [ ] Record result, mechanism, effective flags and vendor/update
