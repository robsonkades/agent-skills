# G1 flag reference and workload baselines

## Confirm before you configure

Never take a default from a document — including this one:

```bash
java -XX:+PrintFlagsFinal -version | grep -E \
  "MaxGCPauseMillis|G1NewSizePercent|G1MaxNewSizePercent|InitiatingHeapOccupancyPercent|G1MixedGCCountTarget|G1OldCSetRegionThresholdPercent|G1HeapWastePercent|MaxTenuringThreshold|G1UseAdaptiveIHOP|G1HeapRegionSize"

# The region size actually chosen for your -Xmx (0 means computed automatically):
java -Xmx4g -XX:+PrintFlagsFinal -version | grep G1HeapRegionSize
```

## The flags, their defaults and what each one costs

| Flag                                  | Default (JDK 25)                   | Controls                                                        | Trade-off                                                                                                                                                                                                  |
| ------------------------------------- | ---------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-XX:+UseG1GC`                        | default collector since JDK 9      | Selects G1                                                      | Redundant on this baseline; documents intent explicitly                                                                                                                                                    |
| `-XX:MaxGCPauseMillis`                | 200                                | Pause goal used by the policy to size young                     | Lower means smaller young, more frequent GCs, overhead percentage tends to rise; higher means rarer but potentially larger pauses                                                                          |
| `-XX:G1NewSizePercent`                | 5                                  | Young generation floor, percent of heap                         | A low floor lets G1 shrink aggressively under promotion spikes (more young GCs); a high floor removes that flexibility                                                                                     |
| `-XX:G1MaxNewSizePercent`             | 60                                 | Young generation ceiling                                        | A low ceiling protects the pause budget and the old generation; a high ceiling favours throughput at the cost of peak pauses                                                                               |
| `-XX:InitiatingHeapOccupancyPercent`  | 45                                 | Whole-heap occupancy that starts concurrent marking             | Lower starts marking earlier — more concurrent CPU, less full-GC risk; higher costs less CPU and risks old filling first                                                                                   |
| `-XX:G1MixedGCCountTarget`            | 8                                  | Mixed GCs to spread old cleanup over after a marking cycle      | Low concentrates cleanup into fewer, longer pauses; high spreads it but leaves garbage in the heap longer                                                                                                  |
| `-XX:G1OldCSetRegionThresholdPercent` | 10                                 | Ceiling on percent of heap in old regions per mixed GC          | Low bounds each mixed pause and needs more cycles; high cleans faster and risks exceeding the pause budget                                                                                                 |
| `-XX:G1HeapWastePercent`              | 5                                  | Percent of heap in garbage below which G1 stops the mixed cycle | Low forces collecting sparse regions (more pauses for less gain); high stops early, leaving memory unreclaimed until the next marking                                                                      |
| `-XX:MaxTenuringThreshold`            | 15 (hardware ceiling: 4 mark bits) | Young GCs survived in Survivor before promotion                 | Low promotes early — less repeated copying, more promotion pressure; high keeps medium-lived objects in young — more copying, less premature promotion                                                     |
| `-XX:+G1UseAdaptiveIHOP`              | true                               | Dynamic IHOP from marking history                               | Adaptive reacts without intervention, but cycles before `G1AdaptiveIHOPNumInitialSamples` fall back to the static IHOP; disabling gives full control and demands manual recalibration on every load change |
| `-Xms` / `-Xmx`                       | —                                  | Initial and maximum heap                                        | Equal removes dynamic resizing (less pause variability) but reserves all memory from boot; unequal saves memory at low load at the cost of unpredictable commit and decommit pauses                        |

`-XX:InitiatingHeapOccupancyPercent` is **deprecated from JDK 27** and aliased to
**`-XX:G1IHOP`**; it becomes obsolete in JDK 28 and expires in 29. The tuning reasoning
below is unaffected — only the spelling is. Use `G1IHOP` on JDK 27+, and expect a
deprecation warning, not a failure, if the old name is inherited from an existing
command line.

## The logging trap that applies to every configuration below

The tag must be `-Xlog:gc*`, with the asterisk. Without it, unified logging emits only the
summary line per pause (`Pause Young ... 120M->65M(512M) 8.234ms`) and none of the
`Eden regions:`, `Survivor regions:` or `Old regions:` lines that any quantitative analysis
needs. The symptom is not an error — it is the analysis script running normally and
reporting a promotion rate of zero, because the data was never written.

## Workload 1 — synchronous APIs with a tight SLO (p99 ≤ 50 ms)

```bash
java -XX:+UseG1GC \
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

| Flag                                | Why this value for **this** workload                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `MaxGCPauseMillis=30`               | A p99 ≤ 50 ms SLO needs room for processing and network; 30 ms leaves about 20 ms of slack                |
| `G1MaxNewSizePercent=40`            | Below the default 60, so young cannot grow past what a 30 ms budget allows even under an allocation burst |
| `InitiatingHeapOccupancyPercent=40` | Slightly below the default: marking starts earlier, trading background CPU for less full-GC risk          |
| `G1MixedGCCountTarget=16`           | Above the default: spreads old cleanup across more, smaller pauses, consistent with a tight SLO           |
| `G1OldCSetRegionThresholdPercent=5` | Half the default: each mixed GC visits fewer regions, at the cost of more cycles for the same cleanup     |

## Workload 2 — batch processing, throughput first (pauses above 200 ms acceptable)

```bash
java -XX:+UseG1GC \
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
| `InitiatingHeapOccupancyPercent=60` | Delays concurrent marking, cutting background CPU — acceptable because no latency SLO guards the larger full-GC risk |
| `G1MixedGCCountTarget=4`            | Concentrates old cleanup into fewer, longer cycles, consistent with tolerating larger pauses                         |

## Workload 3 — mixed service (API plus cache plus background jobs)

```bash
java -XX:+UseG1GC \
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
| `G1HeapWastePercent=10`             | Above the default: tolerates stopping the mixed cycle earlier rather than spending pauses on sparse regions, which matters when background jobs compete with marking for CPU |

Treat all three as starting points for measurement. Two services with the same SLO need
different values when allocation rate, promotion rate or average object size differ.
