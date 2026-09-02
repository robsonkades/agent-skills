# G1 flag reference and workload baselines

## Confirm before you configure

Never take a default from a document — including this one. The experimental flags only
print when unlocked, so unlock for the listing as well:

```bash
java -XX:+UnlockExperimentalVMOptions -XX:+PrintFlagsFinal -version | grep -E \
  "MaxGCPauseMillis|GCPauseIntervalMillis|G1NewSizePercent|G1MaxNewSizePercent|InitiatingHeapOccupancyPercent|G1UseAdaptiveIHOP|G1AdaptiveIHOPNumInitialSamples|G1MixedGCCountTarget|G1OldCSetRegionThresholdPercent|G1MixedGCLiveThresholdPercent|G1HeapWastePercent|G1ReservePercent|MaxTenuringThreshold|G1HeapRegionSize|GCTimeRatio|G1PeriodicGCInterval|AlwaysPreTouch"

# The region size actually chosen for your -Xmx (0 on the command line means computed):
java -Xmx4g -XX:+PrintFlagsFinal -version | grep G1HeapRegionSize

# What a running process actually has, including ergonomic choices:
jcmd <pid> VM.flags
```

The fourth column of `PrintFlagsFinal` is the flag's kind. `{experimental}` requires
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

| Flag                                  | Default (JDK 25)                              | Controls                                                                                                                                                                           | Trade-off                                                                                                                                                                             |
| ------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-XX:+UseG1GC`                        | ergonomic default since JDK 9 (JEP 248)       | Selects G1                                                                                                                                                                         | Redundant on ≥ 2 CPUs; on a 1-CPU host the JVM picks Serial through JDK 26 (JEP 523 makes G1 unconditional in 27), so naming it there is not redundant — `jvm-gc-tuning`              |
| `-XX:MaxGCPauseMillis`                | 200, product                                  | Pause goal used by the policy to size young and to bound the collection set                                                                                                        | Lower means smaller young, more frequent GCs, overhead percentage tends to rise; higher means rarer but potentially larger pauses                                                     |
| `-XX:GCPauseIntervalMillis`           | `MaxGCPauseMillis + 1`, product               | With the pause goal, the MMU (minimum mutator utilisation) the policy schedules pauses to                                                                                          | Leave it alone; the default degenerates to "no more than one pause goal per interval", which is the intent                                                                            |
| `-XX:G1NewSizePercent`                | 5, **experimental**                           | Young generation floor, percent of the **committed** heap                                                                                                                          | A low floor lets G1 shrink aggressively under promotion spikes (more young GCs); a high floor removes that flexibility                                                                |
| `-XX:G1MaxNewSizePercent`             | 60, **experimental**                          | Young generation ceiling, percent of the **committed** heap                                                                                                                        | A low ceiling protects the pause budget and the old generation; a high ceiling favours throughput at the cost of peak pauses                                                          |
| `-Xmn` / `NewSize` / `MaxNewSize`     | unset                                         | Pins the young size                                                                                                                                                                | Never under G1 — it disables the pause-driven sizing that the pause goal depends on (`g1-internals`)                                                                                  |
| `-XX:InitiatingHeapOccupancyPercent`  | 45, product                                   | Old-generation occupancy (old + humongous regions) as a percent of current heap capacity that starts marking; the static value, and the floor used until adaptive IHOP has samples | Lower starts marking earlier — more concurrent CPU, less full-GC risk; higher costs less CPU and risks old filling first                                                              |
| `-XX:+G1UseAdaptiveIHOP`              | true, product                                 | Predicts the trigger from promotion rate and marking time, keeping `G1ReservePercent + G1HeapWastePercent` of the heap plus the last young size as headroom                        | Adaptive reacts without intervention but is one regime behind under bursty load; disabling gives full control and demands manual recalibration on every load change                   |
| `-XX:G1AdaptiveIHOPNumInitialSamples` | 3, **experimental**                           | Cycles that run on the static IHOP before the predictor takes over                                                                                                                 | Leave it; the lever is the static IHOP those first cycles use                                                                                                                         |
| `-XX:G1ReservePercent`                | 10, product                                   | Heap kept free so evacuation always has to-space; also the adaptive IHOP's headroom                                                                                                | Higher absorbs promotion spikes without evacuation failure but is heap the live set cannot use; lower gives the live set room and makes `Evacuation Failure` more likely              |
| `-XX:G1MixedGCCountTarget`            | 8, product                                    | Divisor: each mixed GC takes at least `ceil(candidates / target)` old regions                                                                                                      | Low concentrates cleanup into fewer, longer pauses and can force a pause past the goal; high spreads it but leaves garbage in the heap longer                                         |
| `-XX:G1OldCSetRegionThresholdPercent` | 10, **experimental**                          | Ceiling on old regions per mixed GC, `ceil(percent × total regions)`                                                                                                               | Low bounds each mixed pause and needs more cycles; high cleans faster and risks exceeding the pause budget. The count-target minimum overrides it when they disagree                  |
| `-XX:G1MixedGCLiveThresholdPercent`   | 85, **experimental**                          | Old region with more live data than this is never a candidate                                                                                                                      | Raising it collects denser regions (more copying per byte reclaimed); lowering it leaves more fragmented old regions to full GC only                                                  |
| `-XX:G1HeapWastePercent`              | 5, product                                    | Percent of heap in reclaimable candidates below which G1 stops the mixed phase                                                                                                     | Low forces collecting sparse regions (more pauses for less gain); high stops early, leaving memory unreclaimed until the next marking                                                 |
| `-XX:MaxTenuringThreshold`            | 15, product (4 age bits in the object header) | Young GCs survived in Survivor before promotion                                                                                                                                    | Low promotes early — less repeated copying, more promotion pressure; high keeps medium-lived objects in young — more copying, less premature promotion                                |
| `-XX:G1HeapRegionSize`                | 0 = ergonomic, product                        | Region size; manual values are powers of two up to 512 MB (JDK-8275056, JDK 18)                                                                                                    | Larger regions make fewer objects humongous and reduce region-count bookkeeping; they coarsen young sizing and waste more per partially filled region                                 |
| `-XX:GCTimeRatio`                     | 12, product (G1 sets it; 7.69 % GC time)      | Pause-time ratio above which G1 expands a variable heap at the end of a pause                                                                                                      | Only matters when `-Xms` < `-Xmx`; with them equal it never fires                                                                                                                     |
| `-Xms` / `-Xmx`                       | ergonomic                                     | Initial and maximum heap                                                                                                                                                           | Equal removes resizing and gives young its full range from boot; unequal saves memory at low load at the cost of a startup GC storm and expansion decided at the end of pauses        |
| `-XX:+AlwaysPreTouch`                 | false, product                                | Touches every heap page at start-up                                                                                                                                                | Slower start, but the container limit sees the whole heap resident immediately and the first peak does not page-fault inside a pause; `jvm-gc-tuning` covers the container arithmetic |
| `-XX:G1PeriodicGCInterval`            | 0 (off), manageable                           | Triggers a concurrent cycle when the JVM has been idle that long (JEP 346)                                                                                                         | Returns memory from an idle heap; a non-zero value on a busy service adds cycles that the SLO pays for                                                                                |

Two related flags are covered where the mechanism lives: `G1ConcRefinementThreads` and
the remembered-set flags in `g1-internals`, `ConcGCThreads` and `MarkStackSize` in
`g1-concurrent-marking`. `SoftMaxHeapSize` prints for G1 (`{manageable} {ergonomic}`,
executed on 25.0.3) but G1 did not act on it up to JDK 25 — it drives ZGC and Shenandoah
(not verified here beyond the flag listing).

The JDK 27 early-access release notes rename `-XX:InitiatingHeapOccupancyPercent` to
**`-XX:G1IHOP`** and keep the old spelling as a deprecated alias that warns; the removal
schedule is not verified here. On 25.0.3 `-XX:G1IHOP` is `Unrecognized VM option`
(executed), so a command line shared across releases must keep the old spelling until
the fleet is on 27. The tuning reasoning is unaffected — only the spelling is.

## The logging trap that applies to every configuration below

The tag must be `-Xlog:gc*`, with the asterisk. Without it, unified logging emits only the
summary line per pause (`Pause Young ... 120M->65M(512M) 8.234ms`) and none of the
`Eden regions:`, `Survivor regions:` or `Old regions:` lines that any quantitative analysis
needs (both forms executed on 25.0.3). The symptom is not an error — it is the analysis
script running normally and reporting a promotion rate of zero, because the data was
never written. `gc*` still does **not** include the policy's own reasoning; those tags are
listed in [the policy log](policy-log-and-troubleshooting.md).

## Workload 1 — synchronous APIs with a tight SLO (p99 ≤ 50 ms)

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
| `MaxGCPauseMillis=30`               | A p99 ≤ 50 ms SLO needs room for processing and network; 30 ms leaves about 20 ms of slack                                         |
| `G1MaxNewSizePercent=40`            | Below the default 60, so young cannot grow past what a 30 ms budget allows even under an allocation burst                          |
| `InitiatingHeapOccupancyPercent=40` | Slightly below the default: the first cycles after every restart, and any burst the predictor lags, start marking earlier          |
| `G1MixedGCCountTarget=16`           | Above the default: halves the minimum old regions per mixed GC, so the pause predictor rather than the divisor bounds the pause    |
| `G1OldCSetRegionThresholdPercent=5` | Half the default: each mixed GC visits fewer regions, at the cost of more cycles for the same cleanup                              |

## Workload 2 — batch processing, throughput first (pauses above 200 ms acceptable)

With no latency SLO, the collector decision in `jvm-gc-tuning` usually lands on Parallel,
which spends nothing on concurrent marking, the SATB barrier or remembered sets. This
baseline is for the case where G1 is mandated — a shared platform image, or a job that
also serves a health endpoint with a pause budget.

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

| Flag                                | Why this value for **this** workload                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `MaxGCPauseMillis=500`              | No per-request latency SLO; maximise throughput, tolerating larger and rarer pauses                                  |
| `G1MaxNewSizePercent=70`            | A large young generation reduces GC **frequency**, which is what costs throughput in a batch job                     |
| `InitiatingHeapOccupancyPercent=60` | Delays the first cycles' marking, cutting background CPU — acceptable because no latency SLO guards the full-GC risk |
| `G1MixedGCCountTarget=4`            | Doubles the minimum old regions per mixed GC: fewer, longer cycles, consistent with tolerating larger pauses         |

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

| Flag                                | Why this value for **this** workload                                                                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MaxGCPauseMillis=100`              | Between the two profiles above — an API SLO exists but is more forgiving than Workload 1                                                                                     |
| `InitiatingHeapOccupancyPercent=45` | The JDK default: no measurement justifies deviating, so it stays as a neutral starting point                                                                                 |
| `G1HeapWastePercent=10`             | Above the default: tolerates stopping the mixed phase earlier rather than spending pauses on sparse regions, which matters when background jobs compete with marking for CPU |

Note that `-Xmx6g` gives a 4 MB region (6144 / 2048 = 3 MB, rounded up to a power of
two), the same as `-Xmx8g`, while `-Xmx4g` gives 2 MB — a 1.5 MB cache entry is humongous
at 4 GB and an ordinary young allocation at 6 GB. Region size changes with the heap size
in steps, not continuously, and a derivation must be redone when it crosses a step.

Treat all three as starting points for measurement. Two services with the same SLO need
different values when allocation rate, promotion rate or average object size differ.
