# Deriving G1 values from an SLO

## The simplified pause model

Useful for a starting point, not a description of how G1 decides:

```
Pause_Young ≈ T_root_scan + T_merge_remset + T_object_copy + T_other

T_root_scan     ≈ 0.5–2 ms   (roughly constant; scales with GC threads and stacks)
T_merge_remset  ≈ proportional to the RSet size of the regions in the collection set
T_object_copy   ≈ live_bytes_in_young / copy_bandwidth
T_other         ≈ 0.5–1 ms   (bookkeeping, GC thread synchronisation)

copy_bandwidth  ≈ 1–4 GB/s — order of magnitude only. It depends on CPU, memory
                  bandwidth and NUMA topology. Measure it on your own hardware.
```

The model fixes `T_root_scan` and `T_other` as constants and puts all variability into
`T_object_copy`. G1 itself keeps a truncated history of real measurements per cost component
and predicts the next value from its moving average and standard deviation, recalibrating
every collection. That is why a derived young size is usually an optimistic upper bound: the
real policy runs slightly smaller to keep a confidence margin.

## Young generation size and GC interval

Given a pause SLO `T_slo` ms, fixed overhead `T_fixed` ms, copy bandwidth `C` MB/s and
allocation rate `A` MB/s:

```
max_young_size_mb = (T_slo − T_fixed) / 1000 × C

  T_slo = 30 ms, T_fixed = 5 ms, C = 3000 MB/s
  max_young_size_mb = (30 − 5) / 1000 × 3000 = 75 MB

In regions (region_size = 4 MB):
  max_young_regions = 75 / 4 ≈ 18
  G1MaxNewSizePercent = max_young_regions / total_regions × 100

gc_interval_s = max_young_size_mb / A = 75 / 400 = 0.1875 s = 187.5 ms

GC overhead (%) = pause / (interval + pause) × 100
                = 30 / (187.5 + 30) × 100 ≈ 13.8 %
```

Doubling copy bandwidth does not halve overhead: the interval doubles too, but `T_fixed` does
not move, so the relative gain shrinks as `T_fixed` occupies more of `T_slo`. The same
asymmetry explains why cutting `MaxGCPauseMillis` from 200 to 20 raises GC frequency by
roughly 11× while overhead percentage rises only a couple of points.

## Region size — required before any calculation in regions

```
region_size = heap_size / 2048, rounded to the nearest power of two within [1 MB, 32 MB]

  heap = 4 GB (4096 MB)   → 4096 / 2048  = 2 MB
  heap = 8 GB (8192 MB)   → 8192 / 2048  = 4 MB
  heap = 16 GB (16384 MB) → 16384 / 2048 = 8 MB
```

Use binary GB. `-Xmx8g` is 8192 MiB; using 8000 MB in one step and 8192 MB in another
produces a derivation whose numbers do not reconcile.

## IHOP

Marking must finish before the old generation fills, or G1 is forced into a full GC.

```
marking_time      ≈ live_data_in_old / marking_bandwidth
marking_bandwidth ≈ 1 GB/s — order of magnitude; measure it

margin = promo_rate × marking_time
  80 MB/s × 10 s = 800 MB of old growth DURING marking

IHOP_theoretical_max = 1 − (margin + safety_headroom) / heap_size_mb
```

The safety headroom covers promotion variance the average does not capture — spikes, not just
the expected value — and the cost of the mixed collections that follow. The theoretical
maximum is a **ceiling**, never the production value: using it removes all margin against an
unsampled promotion spike.

## Mixed GC cost

```
Mixed_GC_pause ≈ regions_in_CSet × copy_time_per_region

regions_in_CSet ≤ G1OldCSetRegionThresholdPercent% × total_regions
copy_time_per_region ≈ region_size_mb / copy_bandwidth_mb_s
```

This assumes uniform cost per old region, which is false — G1 picks the regions densest in
garbage first, so the model is typically pessimistic and the measured pause comes in under
the prediction. That makes it safe as a conservative starting point and unsafe as an
explanation of collector behaviour.

## Worked case — mixed GC violating the SLO while young GC is healthy

SLO: p99 ≤ 100 ms. Two percent of peak-hour requests violate it, in specific windows.
Correlating violation timestamps with the GC log shows every violation coinciding with
`Pause Young (Mixed)` and none with `Pause Young (Normal)` — which is what separates
"collection set too large" from "heap too small". Raising the heap had only moved the window.

```
Measured: alloc 800 MB/s peak, promo 120 MB/s peak
          Young GC p99 = 45 ms (within MaxGCPauseMillis=50)
          Mixed GC p99 = 180 ms (violating the 100 ms SLO)
          Mixed GC interval = 8 s
          Heap 8 GB (8192 MB), region_size 4 MB, total_regions 2048

180 ms = 10% × 2048 × copy_time  ->  copy_time = 180 / 204.8 ≈ 0.879 ms per region

Target 80 ms (margin under the 100 ms SLO):
  max_regions = 80 / 0.879 ≈ 91
  max_percent = 91 / 2048 ≈ 4.44%  -> round down -> G1OldCSetRegionThresholdPercent=4
  regions at that cap = 4% × 2048 ≈ 81   (conservative, below the 91 computed)

Old regions produced per marking cycle:
  promo_rate × marking_cycle_time / region_size = 120 × 15 / 4 = 450 regions
  G1MixedGCCountTarget = ceil(450 / 81) = 6
```

Derived configuration, and the measured outcome: mixed GC p99 fell to about 78 ms, inside the
planned 80 ms margin.

```bash
-XX:G1OldCSetRegionThresholdPercent=4
-XX:G1MixedGCCountTarget=6
-XX:InitiatingHeapOccupancyPercent=35
```

A `G1MixedGCCountTarget` derived well above the default may never be realised:
`G1HeapWastePercent` stops the cycle once the remaining regions are not dense enough in
garbage to be worth collecting.

## Sanity rules for whatever parses the log

- Every mixed collection is logged as `Pause Young (Mixed)`, never a bare `Pause Mixed`.
  A parser reading the type straight after `Pause ` labels all of them young, silently.
- `Old regions: 50->55` has no third parenthesised value, unlike `Eden regions: 150->0(150)`.
  A regex requiring `(\d+)->(\d+)\((\d+)\)` matches nothing and yields promotion rate zero.
- `sorted(data)[int(len(data)*0.99)]` is not a p99 — for n below 100 it returns the maximum.
  Use rank: `ceil(p/100 × n)`.
- Assert on the output before using it: mixed GCs above zero, promotion rate above zero, if
  the load promotes at all.

## Calibrating across load levels

```bash
for load_percent in 10 50 90 120; do
  echo "=== Load: $load_percent% ==="
  k6 run --vus $(($TARGET_VUS * $load_percent / 100)) --duration 15m k6_script.js &
  K6_PID=$!
  sleep 300                              # warm-up; ideally gate on a compilation metric
  APP_PID=$(pgrep -f api-service.jar)    # explicit PID: several JVMs may share the host
  jstat -gc "$APP_PID" 5000 120          # 10 minutes of GC metrics
  wait $K6_PID
done
```

## Separating GC pause from total application overhead

Observed client p99 contains normal processing, GC pause, safepoint overhead from other
causes and OS scheduling. Attributing the whole tail to GC without correlating timestamps is
the most common error in this investigation.

```python
def correlate_gc_latency(request_log, gc_log):
    """Requests that overlapped a GC pause."""
    gc_events = parse_gc_events(gc_log)   # (start_ts, end_ts, pause_ms)
    affected = []
    for req in parse_request_log(request_log):
        for gc_start, gc_end, gc_pause in gc_events:
            if gc_start <= req.end_ts and gc_end >= req.start_ts:
                affected.append((req, gc_pause))
                break
    return affected
```

A request flagged as GC-affected whose latency still far exceeds the associated pause says GC
is not the dominant cause — the excess is processing, external I/O or thread-pool queueing.

## Checklist

Before tuning:

- [ ] SLO stated with metric, threshold and evaluation window
- [ ] Baseline collected under representative load for at least 30 minutes with `-Xlog:gc*`
- [ ] Current defaults confirmed with `-XX:+PrintFlagsFinal -version` on the target runtime
- [ ] JDK and profiler versions confirmed — commands change between majors

While measuring:

- [ ] `alloc_rate`, `promo_rate` and `survival_ratio` measured at low, medium and high load
- [ ] Analysis output validated against its sanity assertions
- [ ] Percentiles computed with the rank method

When deriving:

- [ ] Every changed flag has a traceable source measurement, not another service's file
- [ ] Each flag's trade-off documented before it is applied
- [ ] Region size confirmed before any calculation denominated in regions
- [ ] IHOP set with an explicit safety margin, never at the theoretical ceiling

When validating:

- [ ] The prediction written down **before** the validation run
- [ ] Tested under load equivalent to the baseline, not idle
- [ ] Young and mixed evaluated separately — improving one is not evidence about the other
- [ ] GC overhead recomputed from the new data, not assumed
- [ ] No regression in heap footprint, total CPU or another route's latency
