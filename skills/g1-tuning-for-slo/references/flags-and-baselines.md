# G1 flag reference and workload baselines

## Confirm before you configure

Never take a default from a document — including this one. The experimental flags only
print when unlocked, so unlock for the listing as well:

```bash
java -XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:+PrintFlagsFinal -version | grep -E \
  "MaxGCPauseMillis|GCPauseIntervalMillis|G1NewSizePercent|G1MaxNewSizePercent|InitiatingHeapOccupancyPercent|G1IHOP|G1UseAdaptiveIHOP|G1AdaptiveIHOPNumInitialSamples|G1MixedGCCountTarget|G1OldCSetRegionThresholdPercent|G1MixedGCLiveThresholdPercent|G1HeapWastePercent|G1ReservePercent|MaxTenuringThreshold|G1HeapRegionSize|GCTimeRatio|G1PeriodicGCInterval|AlwaysPreTouch"

# The region size actually chosen for your -Xmx (0 on the command line means computed):
java -XX:+UseG1GC -Xmx4g -XX:+PrintFlagsFinal -version | grep G1HeapRegionSize

# What a running process actually has, including ergonomic choices:
jcmd <pid> VM.flags -all
```

Use the known authorized process identity and actual heap/collector flags. These shell examples
assume `grep`; use the platform's equivalent filter where needed. `VM.flags -all` includes
defaults as well as ergonomic/command-line values. Inspect the kind labels rather than a fixed
whitespace column. `{experimental}` requires
`-XX:+UnlockExperimentalVMOptions` **earlier on the command line** than the flag, or the
JVM refuses to start:

```
Error: VM option 'G1NewSizePercent' is experimental and must be enabled via -XX:+UnlockExperimentalVMOptions.
Error: The unlock option must precede 'G1NewSizePercent'.
```

(executed on Temurin 25.0.3). `{manageable}` flags can be changed at run time with
`jcmd <pid> VM.set_flag`.

## The flags, their defaults and what each one costs

Defaults read from `PrintFlagsFinal` on Temurin 25.0.3.

| Flag                                  | Default (JDK 25)                                     | Controls                                                                                                                                                                                   | Trade-off                                                                                                                                                                                                                                     |
| ------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-XX:+UseG1GC`                        | server-class ergonomic default since JDK 9 (JEP 248) | Selects G1                                                                                                                                                                                 | Explicit selection makes intent independent of ergonomics. JDK 27 GA makes G1 the default in all environments (JEP 523). Verify the deployed vendor/build — `jvm-gc-tuning`                                                                   |
| `-XX:MaxGCPauseMillis`                | 200, product                                         | Pause goal used by the policy to size young and to bound the collection set                                                                                                                | Lower means smaller young, more frequent GCs, overhead percentage tends to rise; higher means rarer but potentially larger pauses                                                                                                             |
| `-XX:GCPauseIntervalMillis`           | `MaxGCPauseMillis + 1`, product                      | With the pause goal, influences the MMU window used by policy                                                                                                                              | Usually leave ergonomic unless policy logs and an explicit utilization objective justify coupling two controls; validate accepted combinations on the target JVM                                                                              |
| `-XX:G1NewSizePercent`                | 5, **experimental**                                  | Young generation floor, percent of the **committed** heap                                                                                                                                  | A low floor lets G1 shrink aggressively under promotion spikes (more young GCs); a high floor removes that flexibility                                                                                                                        |
| `-XX:G1MaxNewSizePercent`             | 60, **experimental**                                 | Young generation ceiling, percent of the **committed** heap                                                                                                                                | A low ceiling protects the pause budget and the old generation; a high ceiling favours throughput at the cost of peak pauses                                                                                                                  |
| `-Xmn` / `NewSize` / `MaxNewSize`     | unset                                                | Constrains/pins young sizing                                                                                                                                                               | Usually avoid under G1 because it removes pause-driven adaptation. Use only for a measured, deliberately fixed regime with the loss of adaptability documented (`g1-internals`)                                                               |
| `-XX:InitiatingHeapOccupancyPercent`  | 45, product                                          | Old-generation occupancy (old + humongous regions) as a percent of current heap capacity that starts marking; the static value, and initial threshold used until adaptive IHOP has samples | Lower starts marking earlier — more concurrent CPU, less full-GC risk; higher costs less CPU and risks old filling first                                                                                                                      |
| `-XX:+G1UseAdaptiveIHOP`              | true, product                                        | Predicts the trigger from old-generation allocation rate and marking time, with reserve/waste/young constraints                                                                            | Adaptive learns from completed cycles and may lag a new regime; disabling makes the operator own calibration and burst margin                                                                                                                 |
| `-XX:G1AdaptiveIHOPNumInitialSamples` | 3, **experimental**                                  | Minimum eligible samples in both marking-time and allocation-rate histories before adaptive prediction                                                                                     | Inspect `prediction active`; completed cycles do not prove both histories are ready                                                                                                                                                           |
| `-XX:G1ReservePercent`                | 10, product                                          | False ceiling that reduces promotion/evacuation failure risk and contributes to adaptive-IHOP headroom                                                                                     | Higher adds burst/to-space margin but reduces capacity available to the live set; it reduces rather than eliminates failure risk                                                                                                              |
| `-XX:G1MixedGCCountTarget`            | 8, product                                           | Target number of mixed collections; in JDK 25 policy it also determines a minimum candidate share per collection                                                                           | Low tends to concentrate cleanup; high tends to spread it. Candidate availability, pause prediction and waste threshold mean the target is not a guaranteed count                                                                             |
| `-XX:G1OldCSetRegionThresholdPercent` | 10, **experimental**                                 | Nominal marking-candidate limit, `ceil(percent × committed regions)`                                                                                                                       | Minimum share and whole groups can exceed it; retained candidates are separate. Compare actual selection, elapsed work and headroom rather than treating it as a pause bound                                                                  |
| `-XX:G1MixedGCLiveThresholdPercent`   | 85, **experimental**                                 | Marking-candidate live bytes must be below the region-size-scaled threshold                                                                                                                | Raising it admits denser candidates; lowering it can defer reclamation. Eligibility is not a guarantee that the candidate will be selected                                                                                                    |
| `-XX:G1HeapWastePercent`              | 5, product                                           | Reclaimable-space waste allowance; in 25.0.3 it participates in candidate pruning before grouping                                                                                          | More allowance can prune low-benefit candidates and reduce later work; less can retain more work. Inspect actual pruning and headroom; the resulting collection count is not guaranteed                                                       |
| `-XX:MaxTenuringThreshold`            | 15, product (4 age bits in the object header)        | Upper bound for age-based tenuring, not every object's promotion age                                                                                                                       | Lowering the maximum can promote earlier; raising it permits more time in young but does not require objects to stay there. Measure copying and old-generation pressure                                                                       |
| `-XX:G1HeapRegionSize`                | 0 = ergonomic, product                               | Effective region size is a power of two, manual ceiling 512 MiB since JDK 18; accepted requests can round upward (3 MiB → 4 MiB on 25.0.3)                                                 | Larger regions make fewer objects humongous and reduce region-count bookkeeping; they coarsen young sizing and waste more per partially filled region. Calculate from the effective value                                                     |
| `-XX:GCTimeRatio`                     | 12, product (G1 sets it; 7.69 % GC time)             | Throughput goal used in heap-resizing ergonomics                                                                                                                                           | Most visible with a variable heap; do not infer that a fixed heap makes all policy consequences irrelevant                                                                                                                                    |
| `-Xms` / `-Xmx`                       | ergonomic                                            | Initial/minimum and maximum heap                                                                                                                                                           | Equal removes heap growth but reserves/commits a stable address-space budget; unequal can save footprint and changes warm-up/young ergonomics. Neither choice guarantees a "storm"                                                            |
| `-XX:+AlwaysPreTouch`                 | false, product                                       | Touches heap pages at start-up                                                                                                                                                             | Moves page population and often residency cost to startup, increasing startup time and RSS sooner; it reduces but cannot guarantee elimination of later page faults                                                                           |
| `-XX:G1PeriodicGCInterval`            | 0 (off), manageable                                  | Periodic check after enough time since GC, subject to concurrent-cycle and configured system-load checks (JEP 346)                                                                         | Not an application-idleness test. `G1PeriodicGCInvokesConcurrent` selects concurrent (default true) versus Full GC; load-check support and heap minimum constrain behavior. Measure footprint and pause cost; memory return is not guaranteed |

Two related flags are covered where the mechanism lives: `G1ConcRefinementThreads` and
the remembered-set flags in `g1-internals`, `ConcGCThreads` and `MarkStackSize` in
`g1-concurrent-marking`. `SoftMaxHeapSize` prints for G1 (`{manageable} {ergonomic}`,
executed on 25.0.3) but G1 did not act on it up to JDK 25 — it drives ZGC and Shenandoah
(not verified here beyond the flag listing).

[JDK 27 GA release notes](https://www.oracle.com/java/technologies/javase/27all-relnotes.html),
published 2026-09-15, document the name **`G1IHOP`** and the deprecated compatibility alias
`InitiatingHeapOccupancyPercent`; the
[27+35 source](https://github.com/openjdk/jdk/blob/jdk-27%2B35/src/hotspot/share/runtime/arguments.cpp)
records that mapping. On 25.0.3 `-XX:G1IHOP=35` is `Unrecognized VM option` (executed).
Keep the JDK 25 spelling in the configurations below; verify startup and effective values
on each target vendor/build rather than transplanting a renamed flag. The JDK 27 statements
here are documentation/source checks, not execution results on that runtime.

## The logging trap that applies to every configuration below

`-Xlog:gc` alone selects the exact `gc` tag at info level: it provides summary lines such as
`Pause Young ... 120M->65M(512M) 8.234ms`, but none of the
`Eden regions:`, `Survivor regions:` or `Old regions:` lines that any quantitative analysis
needs (both forms executed on 25.0.3). The symptom is not an error — it is the analysis
script running normally and reporting a promotion rate of zero, because the data was
never written. `gc*` at info level includes these region lines; an explicit `gc+heap=info`
selection also suffices for them. Debug-level policy evidence requires the selectors in
[the policy log](policy-log-and-troubleshooting.md) or a suitably scoped higher-level wildcard.

## Workload 1 — synchronous APIs with a tight SLO (p99 ≤ 50 ms)

The three command lines below illustrate syntax and trade-offs, not derived production baselines.
An SLO or workload label alone cannot justify these values. In particular, 40% young does not
guarantee a 30 ms pause, and 50 ms request p99 minus 30 ms GC goal is not a valid percentile
budget. Static IHOP values affect startup, not later bursts after adaptive prediction activates.
Treat the table rationales as hypotheses requiring measured survival, phase cost and headroom.
Keep defaults until evidence justifies individual changes; do not apply the bundles together.

```bash
java -XX:+UseG1GC \
     -XX:+UnlockExperimentalVMOptions \
     -Xms4g -Xmx4g \
     -XX:MaxGCPauseMillis=30 \
     -XX:G1NewSizePercent=10 \
     -XX:G1MaxNewSizePercent=40 \
     -XX:InitiatingHeapOccupancyPercent=40 \
     -XX:G1MixedGCCountTarget=16 \
     -XX:G1OldCSetRegionThresholdPercent=5 \
     -Xlog:gc*:file=gc.log:time,uptime:filecount=5,filesize=20m \
  -jar api-service.jar
```

| Flag                                | Why this value for **this** workload                                                                                               |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `UnlockExperimentalVMOptions`       | Required before `G1NewSizePercent`, `G1MaxNewSizePercent` and `G1OldCSetRegionThresholdPercent`; without it the JVM does not start |
| `MaxGCPauseMillis=30`               | Illustrative pause goal; validate request latency because percentile budgets are not additive                                      |
| `G1MaxNewSizePercent=40`            | Illustrative lower ceiling; validate survival and phase costs rather than assuming a pause bound                                   |
| `InitiatingHeapOccupancyPercent=40` | Lowers the initial threshold; calibrated adaptive prediction still governs later bursts                                            |
| `G1MixedGCCountTarget=16`           | Reduces minimum candidate share subject to rounding/groups; does not guarantee a pause bound                                       |
| `G1OldCSetRegionThresholdPercent=5` | Lower nominal limit; minimum/group effects may dominate. Validate selected work and reclamation progress                           |

## Workload 2 — batch processing, throughput first (pauses above 200 ms acceptable)

Without a latency SLO, Parallel is a relevant throughput-oriented comparison in
`jvm-gc-tuning`; it avoids G1's concurrent marking/SATB but still tracks cross-generation
references. Keep an adequate existing G1 setup, including when the platform mandates it or
the job also serves an endpoint with a pause budget; a workload label does not choose a winner.

```bash
java -XX:+UseG1GC \
     -XX:+UnlockExperimentalVMOptions \
     -Xms8g -Xmx8g \
     -XX:MaxGCPauseMillis=500 \
     -XX:G1NewSizePercent=20 \
     -XX:G1MaxNewSizePercent=70 \
     -XX:InitiatingHeapOccupancyPercent=60 \
     -XX:G1MixedGCCountTarget=4 \
     -Xlog:gc*:file=gc.log:time,uptime:filecount=5,filesize=20m \
  -jar batch-processor.jar
```

| Flag                                | Why this value for **this** workload                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `MaxGCPauseMillis=500`              | No per-request latency SLO; maximise throughput, tolerating larger and rarer pauses                                                            |
| `G1MaxNewSizePercent=70`            | A higher ceiling permits larger young collections; survival, phase costs and concurrent work determine the throughput trade-off                |
| `InitiatingHeapOccupancyPercent=60` | May delay startup marking; completion-time, memory and failure budgets still require headroom                                                  |
| `G1MixedGCCountTarget=4`            | Roughly doubles the nominal minimum share before rounding; groups and remaining candidates affect selection. Validate elapsed work and reclaim |

## Workload 3 — mixed service (API plus cache plus background jobs)

```bash
java -XX:+UseG1GC \
     -XX:+UnlockExperimentalVMOptions \
     -Xms6g -Xmx6g \
     -XX:MaxGCPauseMillis=100 \
     -XX:G1NewSizePercent=15 \
     -XX:G1MaxNewSizePercent=50 \
     -XX:InitiatingHeapOccupancyPercent=45 \
     -XX:G1MixedGCCountTarget=10 \
     -XX:G1HeapWastePercent=10 \
     -Xlog:gc*:file=gc.log:time,uptime:filecount=5,filesize=20m \
  -jar mixed-service.jar
```

| Flag                                | Why this value for **this** workload                                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `MaxGCPauseMillis=100`              | Between the two profiles above — an API SLO exists but is more forgiving than Workload 1                                                  |
| `InitiatingHeapOccupancyPercent=45` | The JDK default: no measurement justifies deviating, so it stays as a neutral starting point                                              |
| `G1HeapWastePercent=10`             | More waste allowance can prune low-benefit marking candidates before grouping; measure whether less cleanup work leaves adequate headroom |

Note that `-Xmx6g` gives a 4 MiB region (6144 / 2048 = 3 MiB, rounded up to a power of
two), the same as `-Xmx8g`, while `-Xmx4g` gives 2 MiB. A **single object** whose aligned
total size is 1.5 MiB is humongous with the 2 MiB regions and eligible for ordinary young
allocation with the 4 MiB regions. A cache entry retaining 1.5 MiB across many small objects
does not meet that test just because their sizes sum to 1.5 MiB. Include headers and alignment
when checking individual allocations. Region size changes with heap size in steps, so redo
the derivation when it crosses a step.

Treat all three as starting points for measurement. Two services with the same SLO need
different values when allocation rate, promotion rate or average object size differ.

## Source checks

- [HotSpot 25.0.3 humongous predicate](https://github.com/openjdk/jdk25u/blob/2fce64f0ecc22355298b9ab9c1ba9477a2f1ec86/src/hotspot/share/gc/g1/g1CollectedHeap.hpp):
  `is_humongous` compares an individual allocation's word size with half a region, strictly greater.
- [HotSpot 25.0.3 young sizing](https://github.com/openjdk/jdk25u/blob/2fce64f0ecc22355298b9ab9c1ba9477a2f1ec86/src/hotspot/share/gc/g1/g1YoungGenSizer.cpp)
  and [JDK 25 tuning guidance](https://docs.oracle.com/en/java/javase/25/gctuning/garbage-first-garbage-collector-tuning.html):
  distinguish the binding minimum, maximum and explicit-size paths before changing a bound.
- [Periodic checks](https://github.com/openjdk/jdk25u/blob/2fce64f0ecc22355298b9ab9c1ba9477a2f1ec86/src/hotspot/share/gc/g1/g1PeriodicGCTask.cpp)
  and [collection-kind selection](https://github.com/openjdk/jdk25u/blob/2fce64f0ecc22355298b9ab9c1ba9477a2f1ec86/src/hotspot/share/gc/g1/g1CollectedHeap.cpp):
  elapsed time, load support and the concurrent/full setting are separate conditions.
