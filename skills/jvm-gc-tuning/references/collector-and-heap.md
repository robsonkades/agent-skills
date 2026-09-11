# Collector selection and heap sizing

Read this when GC pause, frequency or concurrent cost has been implicated, or when sizing
a new service. For a new workload, treat the choice as an experiment until representative
measurements exist.

## Collector selection

Start with the declared objective: request latency, batch completion, useful throughput
or footprint. Compare pause tolerance, CPU cost and heap headroom against that objective
and its resource guardrails; no one dimension has universal priority.

| Collector  | Pause model                                                                                                               | Prefer when                                                                              | Becomes problematic when                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| G1         | STW young/mixed pauses, concurrent marking, adaptive pause target                                                         | Balanced starting point where measured tails and CPU fit the SLO; broad heap/CPU range   | Root/RSet/copy-heavy pauses exceed budget, evacuation headroom fails, or concurrent work competes for scarce CPU       |
| ZGC        | Concurrent generational marking/relocation and thread-stack processing; short coordination pauses                         | Very tight tail-latency objective with CPU and heap headroom to outrun allocation        | Scarce CPU/headroom, allocation stalls, or barrier/concurrent cost violates throughput; no sub-ms result is guaranteed |
| Shenandoah | Concurrent evacuation; traditional/generational mode is build/configuration-specific (generational product since JEP 521) | Similar low-pause objective on a build that ships it, with mode named and benchmarked    | Scarce CPU/headroom, degeneration/full fallback, pinning, or comparisons that omit mode/vendor                         |
| Parallel   | Stop-the-world young/full work using multiple workers; adaptive sizing                                                    | Throughput-oriented batch/offline work when measured pauses are acceptable               | Live-set/heap pauses violate the actual deadline or monopolizing cores harms colocated work                            |
| Serial     | Stop-the-world collection with one GC worker                                                                              | Small/short-lived or single-CPU workloads where simplicity/footprint wins in measurement | One worker cannot meet pause/throughput needs; accidental ergonomic selection conflicts with the SLO                   |

**CPU and heap both affect worker ergonomics.** The processor count the JVM sees influences
configured counts: measured on 25.0.3 with `-XX:ActiveProcessorCount`, G1 uses
`ParallelGCThreads = N` up to 8 and `8 + floor(5/8 × (N − 8))` above (4 CPUs → 4, 16 → 13), with
`ConcGCThreads` about a quarter of that (16 → 3). Historical ZGC observations were
8 CPUs → 5 parallel and 2 concurrent, 2 CPUs → 2 and 1. A bounded Windows Temurin
25.0.3+9 check with `-Xms16m -Xmx512m` reproduced those configured counts; with
`-Xms16m -Xmx64m`, both 2 and 8 CPUs instead gave 1 parallel and 1 concurrent worker.
The JDK 25 implementation caps workers using heap size to bound relocation overhead.
These are startup configurations, not a portable formula or proof that all workers run
simultaneously. A concurrent collector and the application share the pod's CPU budget.
A throughput drop after switching suggests investigating
CPU contention/barriers, allocation stalls and workload differences; CPU count alone
does not establish the cause.

**Ergonomics are release/build inputs:** a JVM that sees one CPU selected Serial on the
verified 25.0.3 build
`-XX:ActiveProcessorCount=1` → `UseSerialGC = true {ergonomic}`). The JDK 9-era rule also
demotes small-memory hosts; that half was not reproducible here without a cgroup, so
verify on the target with startup logs/`jcmd <pid> VM.flags`. JDK 27 EA documentation says
G1 is the default; JEP 523 is now Closed/Delivered for JDK 27 (checked 2026-09-05,
updated 2026-08-19). Integration in a release does not establish deployment or GA
availability. Test the exact target build and explicitly select the intended collector
when fleet policy must be independent of ergonomics.

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
limit when resident/charged. NMT tracks HotSpot-managed native memory, not all native
library allocations or the complete cgroup charge; reconcile it with process RSS and
cgroup measurements, including page cache and other charged consumers. `jvm-memory-regions`
covers the budget and the `MaxRAMPercentage` arithmetic. On the JDK 25 HotSpot baseline,
`MaxRAMPercentage` defaults to 25, but minimum-heap rules, visible memory,
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
3. Size the heap for retained state plus the room the collector needs to make progress.
   For generational collectors, account for old pressure and young space together;
   this budget is not a reason to fix G1's young generation size and constrain its policy.
   Under G1, adaptive IHOP derives an effective trigger from predicted old allocation,
   marking time, young size and reserve/waste constraints; the configured 45% is not a
   universal live-set ratio. Size from measured live set, allocation during the cycle,
   evacuation/reserve margin and workload bursts, then validate policy logs. Rules such as
   “3–4× live set” are only coarse experimental brackets, not recommendations.
4. Under a concurrent collector, `allocation rate × cycle time` is a first planning
   estimate of allocation pressure, not an exact extra-space requirement: reclamation
   overlaps allocation, and bursts, relocation reserves and fragmentation matter.
   Validate the peak net occupancy/free-space trajectory; insufficient usable space can
   stall mutators. The sizing and `Allocation Stall` signal are zgc-and-shenandoah.
5. Fit the result into the container budget (jvm-memory-regions). If it does not fit,
   reduce live state/allocation, increase capacity, change the collector/architecture, or
   accept and quantify a smaller safety margin—never silently erase it.
6. Validate the selected policy against the objective and applicable guardrails using
   equivalent workload/regimes. For a new service, include peak load and bursts before
   presenting the initial sizing estimate as validated capacity.

### The 32 GB boundary

For collectors using ordinary HotSpot compressed oops, the zero-based compressed-oop range
is often near 32 GiB, but the actual cutoff depends on object alignment, heap base/reservation
and build. When `UseCompressedOops` turns off, ordinary heap references typically grow from
4 to 8 bytes and headers/layout can change, so a pointer-rich heap may lose effective
capacity. Confirm with `-Xlog:gc+heap+coops=debug`/flags and measure object layout on the
target. ZGC uses colored-pointer/addressing machinery rather than serving as a
“31 GiB compressed-oops” workaround; compare collectors independently.

## MaxGCPauseMillis

For G1, this is a policy target, not a per-pause bound. Humongous allocation pressure,
evacuation failure or a saturated old generation can cause pauses beyond the target;
their presence alone does not prove that every pause must miss it.

Lowering it often makes policy choose less young/CSet work, producing more frequent
collections. Promotion rises only when the changed lifetime/survivor regime causes it.
For throughput, raising the target is a hypothesis whose pause, frequency, CPU and useful
work must be validated.

For a latency-sensitive service, derive a GC pause budget within the end-to-end SLO;
do not equate the target with the entire request deadline. Detailed G1 flag derivation
belongs to `g1-tuning-for-slo`.

## Investigate before selecting flags

| Log observation                                  | Actual investigation                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| Frequent young collections, little old growth    | quantify pause share/allocation; may be healthy or fixed-cost overhead  |
| Frequent young collections, heavy old pressure   | lifetime/in-flight/cache/survivor policy; identify allocation/owners    |
| Rising comparable post-reclamation floor         | retention/capacity hypothesis; distinguish workload, cache and defect   |
| Full GCs after evacuation failure                | usable to-space, live set, promotion spike, pinning, humongous topology |
| `Metadata GC Threshold`                          | Metadata high-water mark and class unloading — see `jvm-class-loading`  |
| Logged pause much smaller than client-felt pause | correlate TTSP, queue amplification, host and other request work        |

`Metadata GC Threshold` identifies a metadata trigger, not proof of Java heap exhaustion.
Changing `-Xmx` does not repair class-loader retention, but changing heap commitment can
alter the memory available for native consumers. Likewise, a client/logged-pause gap may
include queue amplification or host pressure that heap policy affects indirectly. Establish
that mechanism before proposing a heap change, account for its capacity cost, and distinguish
symptom mitigation from fixing the initiating cause.

## Validating a change

- [ ] Equivalent workload, JDK/container limits, warm-up and operating regimes before/after
- [ ] Measure the declared objective and relevant guardrails: pause frequency/tails and
      STW share for latency; GC CPU and useful work for throughput; residency and live-set
      headroom for footprint. Check stalls/fallback collections when the collector can
      produce them; use client latency or batch deadlines according to the workload.
- [ ] For distribution claims, report event types, sample counts, estimator and uncertainty;
      a startup flag check establishes configuration acceptance, not performance
- [ ] Isolate one mechanism per iteration when feasible; document interactions otherwise
- [ ] Predeclare expected signal, abort/rollback thresholds and capacity guardrails
- [ ] Revert a change that misses its prediction or causes a material regression
- [ ] Record result, mechanism, effective flags and vendor/update

## Primary references

- [Java 25 G1 tuning](https://docs.oracle.com/en/java/javase/25/gctuning/garbage-first-garbage-collector-tuning.html)
  — causal alternatives for Full GC, heap headroom, adaptive young sizing and objective trade-offs.
- [Java 25 metadata considerations](https://docs.oracle.com/en/java/javase/25/gctuning/other-considerations.html)
  — metadata allocation outside the heap and the class-unloading high-water trigger.
- [JEP 376: ZGC concurrent thread-stack processing](https://openjdk.org/jeps/376)
  — thread-stack work moved out of GC safepoints in JDK 16.
- [OpenJDK 25 ZGC worker heuristics](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/z/zHeuristics.cpp)
  — CPU-derived configured counts capped by heap size; active worker use is a separate question.
- [JEP 523: G1 default in all environments](https://openjdk.org/jeps/523)
- [JEP 535: Shenandoah generational mode by default](https://openjdk.org/jeps/535)
- [JEP 474: generational ZGC by default](https://openjdk.org/jeps/474)
- [JEP 490: removal of non-generational ZGC](https://openjdk.org/jeps/490)
- [JEP 521: generational Shenandoah](https://openjdk.org/jeps/521)
- [Java 25 Native Memory Tracking](https://docs.oracle.com/en/java/javase/25/vm/native-memory-tracking.html)
