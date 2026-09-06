# Deriving G1 values from an SLO

## The simplified pause model

Useful for a starting point, not a description of how G1 decides:

```
Pause_Young ≈ T_root_scan + T_merge_remset + T_scan_heap_roots + T_object_copy + T_other

T_root_scan     ≈ measured root work (varies with threads, stacks, roots and workers)
T_merge_remset  ≈ proportional to the RSet size of the regions in the collection set
T_scan_heap_roots ≈ measured incoming-reference card scanning after merging
T_object_copy   ≈ live_bytes_in_young / copy_bandwidth
T_other         ≈ measured residual (bookkeeping, reference processing, synchronization)

copy_bandwidth  = copied/live-byte estimate divided by Object Copy time, calibrated on
                  this hardware, object graph, worker count and NUMA placement
```

The model may hold root/residual cost fixed only inside a narrow calibrated regime; roots,
remembered sets, reference processing, worker imbalance and page state all move. G1 itself
keeps a truncated history of real measurements per cost component
and predicts the next value from its moving average and standard deviation, recalibrating
every collection (`G1Predictions`, `G1ConfidencePercent` default 50). That is why a derived
young size is usually an optimistic upper bound: the real policy runs slightly smaller to
keep a confidence margin.

Copy bandwidth is measured, not assumed. `Object Copy` from
`-Xlog:gc+phases=debug` is the time signal; distinguish worker Sum from wall/critical-worker
duration before computing bandwidth, or parallelism gets counted twice. Survivor/old region counts provide a coarse
capacity estimate, not exact copied bytes because regions are partially occupied and old
growth can mix promotion with region lifecycle. Calibrate against JFR/heap evidence when
the estimate controls a flag, and report its distribution rather than one average.
`g1-internals` covers the phase breakdown.

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

Two consequences of that arithmetic, both decisions rather than observations:

- The model puts `T_object_copy` at `live_bytes_in_young / C`, so the young size the
  pause allows is really `survival_ratio × young ≤ (T_slo − T_fixed) × C`. The 75 MB above
  assumes everything in young is live at the pause — a worst case. With a measured
  survival ratio of 10 percent makes a ten-times-larger young generation arithmetically
  possible **if other phase costs remain fixed**. They rarely do across that range. Derive
  from tail survival/cost regimes and retain burst margin; a 100%-survival bound is a
  stress scenario, not automatically the production ceiling.
- **13.8 percent must be compared with the service's declared pause/CPU budget.** It is not
  a universal failure threshold. If the combined latency, capacity and CPU budgets cannot
  hold at that allocation rate, reduce allocation, add capacity, relax a constraint or
  reconsider the collector; a flag cannot remove the conservation law.

`G1NewSizePercent` and `G1MaxNewSizePercent` are percentages of the **committed** heap, not
of `-Xmx` (`G1YoungGenSizer` recalculates from the current region count). With `-Xms`
below `-Xmx` the young generation starts small and grows only as the heap expands — see
[the policy log](policy-log-and-troubleshooting.md) for the measured effect.

This interval approximation uses fresh Eden allocation during mutator time. Survivor occupancy
reduces available Eden; humongous allocation bypasses it. A rate measured per wall second cannot
be substituted without accounting for pauses. Compare observed pause-start intervals and total
pause share instead of extrapolating a universal overhead change from this simplified formula.

## Region size — required before any calculation in regions

```
region_size = -Xmx / 2048, clamped to [1 MB, 32 MB], then rounded UP to a power of two

  -Xmx4g  (4096 MB)  → 4096 / 2048  = 2 MB
  -Xmx5g  (5120 MB)  → 5120 / 2048  = 2.5 MB → 4 MB   (up, not nearest)
  -Xmx6g  (6144 MB)  → 3 MB   → 4 MB
  -Xmx8g  (8192 MB)  → 8192 / 2048  = 4 MB
  -Xmx12g (12288 MB) → 6 MB   → 8 MB
  -Xmx16g (16384 MB) → 16384 / 2048 = 8 MB
  -Xmx64g and above  → 32 MB (the ergonomic ceiling)
```

All executed on Temurin 25.0.3 with `-Xmx<n> -XX:+PrintFlagsFinal -version`; `-Xms` does
not enter the computation (`-Xms512m -Xmx16g` still gives 8 MB). The source is
`G1HeapRegion::setup_heap_region_size` in `g1HeapRegion.cpp`, which rounds up "since this
is beneficial in most cases". Total regions is then `-Xmx / region_size`, and it is
**not** always 2048: `-Xmx5g` has 1280 regions of 4 MB.

Use binary GB. `-Xmx8g` is 8192 MiB; using 8000 MB in one step and 8192 MB in another
produces a derivation whose numbers do not reconcile.

## IHOP

Reclamation needs enough headroom through marking and subsequent mixed collections. IHOP
is compared against **old-generation occupancy** — the bytes in old and humongous regions —
against a capacity-derived byte threshold. Do not confuse trigger occupancy in `gc+ergo+ihop`
with total heap usage printed by the separate `gc+ihop` statistics.

```
marking_time      = measured time relevant to the headroom model
                    — the JDK 25 IHOP predictor uses concurrent-start-to-first-mixed
                      timing, not just the `Concurrent Mark Cycle <ms>` wrapper

margin = old_gen_allocation_rate × marking_time
  80 MB/s × 10 s = 800 MB of old growth DURING marking

IHOP_theoretical_max = 1 − (margin + safety_headroom) / heap_size_mb
```

This approximates the terms used by the adaptive controller (`G1AdaptiveIHOPControl` in
`g1IHOPControl.cpp`): threshold = internal target − predicted old-generation allocation rate × predicted
marking time − unrestrained young size. At full heap size, the internal target is heap minus
`G1ReservePercent + G1HeapWastePercent` (85 percent of a 1 GB heap logs as
`internal target occupancy: 912680550B`, executed on 25.0.3). At smaller committed capacity,
use the two-capacity minimum described in the policy reference. So the safety headroom has a
policy-derived constraint on this JDK, not a timeless floor: reserve, waste, young size,
predictor state and implementation can change. A static approximation neither reproduces
the adaptive controller nor bounds it universally. Prefer adaptive control unless policy
logs show a repeatable failure mode that a manually owned threshold and burst margin solve.

The theoretical maximum is a **ceiling**, never the production value: using it removes all
margin against an unsampled promotion spike. The headroom also pays for the mixed
collections that follow marking, which need free regions to evacuate into.

Two cases where IHOP alone is unlikely to solve the problem, and the derivation must say so:

- Old occupancy remains near or above the effective threshold after reclamation and cycles
  restart rapidly. Distinguish an oversized live set, ineffective candidates, promotion
  pressure and humongous occupancy; moving IHOP cannot create reclaimable garbage.
- A `G1 Humongous Allocation` cause identifies the allocation path, not independence from
  IHOP. Inspect the requested bytes and occupancy threshold in `gc+ergo+ihop` before
  choosing timing, allocation-shape or contiguous-space remedies.

## Mixed GC cost

```
Mixed_GC_pause ≈ young_and_base_cost + sum(predicted_old_group_costs)

old_regions_in_CSet: at least  min = ceil(candidates / G1MixedGCCountTarget)
                     at most   max = ceil(G1OldCSetRegionThresholdPercent% × total_regions)
                     and the pause predictor fills between them while time remains —
                     but max is really MAX(min, max): the minimum wins when they disagree
copy_time_per_region ≈ live_bytes_in_region / effective_copy_bandwidth
                      plus attributable root scanning and other work
```

The bounds are `G1Policy::calc_min_old_cset_length` and `calc_max_old_cset_length`, applied
in `G1CollectionSet::select_candidates_from_marking` (`g1CollectionSet.cpp`). Executed on
25.0.3 with `-Xlog:gc+ergo+cset=debug`: `G1MixedGCCountTarget=8` on 1024 regions logs
`Min 1 regions, max 103 regions`; `G1MixedGCCountTarget=1` with
`G1OldCSetRegionThresholdPercent=1` (a cap of 11) logs `Min 18 regions, max 18 regions`
and `predicted initial time: 8.59ms ... time remaining: 0.00ms` against a 5 ms goal. The
count target is therefore the flag that can _force_ a mixed pause past `MaxGCPauseMillis`;
the percent cap only ever shortens one.

Three further facts that change the arithmetic:

- `candidates` is not "old regions produced": a region with more than
  `G1MixedGCLiveThresholdPercent` (85) live bytes is never a candidate, so a workload
  whose old regions are mostly live can have few candidates and little reclaim. This does not
  guarantee short pauses: young work, incoming roots and other phases remain (`g1-internals`).
- Efficiency ordering does not make a uniform-cost estimate a safe upper bound. Prediction
  error, skewed liveness, incoming roots and worker imbalance can make it optimistic.
- On JDK 25 old regions enter the collection set in **groups** that share one remembered
  set (JDK-8343782; the log reads `available 18 regions (1 groups)`), so the number added
  is a whole number of groups and can exceed the minimum by up to one group.

## Worked case — mixed GC violating the SLO while young GC is healthy

Illustrative arithmetic, not an executed benchmark or measured improvement.
SLO: p99 ≤ 100 ms. Assume two percent of peak-hour requests violate it, in specific windows.
Correlating violation timestamps with the GC log shows every violation coinciding with
`Pause Young (Mixed)` and none with `Pause Young (Normal)`. This routes phase analysis;
it does not distinguish collection-set cost from underlying heap/live-set pressure by itself.

```
Hypothetical inputs: alloc 800 MiB/s peak, old growth 120 MiB/s peak
          Young GC p99 = 45 ms (within MaxGCPauseMillis=50)
          Mixed GC p99 = 180 ms (violating the 100 ms SLO)
          Mixed GC interval = 8 s
          Heap 8 GB (8192 MB), region_size 4 MB, total_regions 2048

Observed selected old regions (assumed fixture): 180, not inferred from the 10% cap
Calibrated young/base contribution: 36 ms
Effective incremental old cost = (180 - 36) / 180 = 0.8 ms per region

Target 80 ms (margin under the 100 ms SLO):
  max_regions = floor((80 - 36) / 0.8) = 55
  integer percent candidate = 2; ceil(2% × 2048) = 41 regions
  predicted pause = 36 + 41 × 0.8 = 68.8 ms, before group/prediction effects

Candidate count from the policy log (assumed fixture): 450 regions.
Promotion × time is not a candidate-count bound: pre-existing old regions can qualify.

The count target must not force a minimum above the cap:
  min per mixed GC = ceil(450 / G1MixedGCCountTarget) ≤ 41 -> target ≥ 11
  Target 12 gives min 38, cap 41. Check actual group selection and reclamation progress;
  satisfying this arithmetic does not guarantee the pause goal.
```

Candidate settings to validate; no post-change result is available for this illustration:

```bash
-XX:+UnlockExperimentalVMOptions
-XX:G1OldCSetRegionThresholdPercent=2
-XX:G1MixedGCCountTarget=12
-XX:InitiatingHeapOccupancyPercent=35
```

An illustrative IHOP of 35 can be checked against the assumed inputs: 8192 MiB minus
15 percent headroom (1229 MiB), `120 MiB/s × 15 s` (1800 MiB), and the assumed total
young allowance (300 regions, 1200 MiB)
leaves 3963 MiB, about 48 percent of the heap in this simplified scenario. 35 leaves about 1096 MiB, enough
for a promotion spike of about 1.6× the measured peak across one marking cycle.

With adaptive IHOP enabled, 35 sets the initial threshold, not the steady-state threshold.
Validate startup separately; do not combine an unneeded IHOP change with the mixed-cost experiment.

A `G1MixedGCCountTarget` derived well above the default may never be realised:
`G1HeapWastePercent` stops the phase once the remaining candidates are not dense enough in
garbage to be worth collecting, and the log says which condition ended it (`do not continue
mixed GCs (...)` under `gc+ergo=debug`).

## Sanity rules for whatever parses the log

- Every mixed collection is logged as `Pause Young (Mixed)`, never a bare `Pause Mixed`.
  A parser reading the type straight after `Pause ` labels all of them young, silently.
- `Pause Young (Prepare Mixed)` is a young-only collection, the last before the mixed
  phase. A parser matching `Mixed)` counts it as mixed; match `Pause Young \(Mixed\)`.
- `Old regions: 50->55` has no third parenthesised value, unlike `Eden regions: 150->0(150)`.
  A regex requiring `(\d+)->(\d+)\((\d+)\)` matches nothing and yields old growth zero.
- The `Old regions` delta is a region-capacity proxy for net old growth during that event,
  not exact promoted bytes. Mixed reclamation and partial regions distort it; humongous
  occupancy has its own line.
- `sorted(data)[int(len(data)*0.99)]` chooses a quantile convention and is off by one from
  nearest rank (`sorted[ceil(0.99 × n)-1]`). Name the estimator and sample count; for fewer
  than 100 observations nearest-rank p99 is the maximum and highly uncertain.
- Assert on presence, event counts, observation span and plausible non-zero estimates; do
  not force a positive value when the workload legitimately has none.

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

Include overload only when the environment can do so safely and the acceptance model
requires it. The important requirement is to cover expected peak, burst and recovery
regimes—including admission control—and not extrapolate a predictor beyond sampled load.

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

A request whose latency far exceeds an overlapping pause needs causal analysis: the excess
may be ordinary processing/external I/O, or queue amplification caused by the pause. Compare
affected and matched-unaffected requests, queue depth and recovery time. A client stall not
covered by a logged GC pause can be TTSP, OS scheduling or another layer; use
`pause-attribution` rather than selecting one by exclusion.

## Checklist

Before tuning:

- [ ] SLO stated with metric, threshold and evaluation window
- [ ] Baseline covers enough complete cycles and each relevant operating regime; duration and sample sufficiency justified
- [ ] Current defaults confirmed with `-XX:+UnlockExperimentalVMOptions -XX:+PrintFlagsFinal
-version` on the target runtime, and the unlock present on any command line that
      sets an experimental flag
- [ ] JDK and profiler versions confirmed — commands change between majors

While measuring:

- [ ] Allocation, old-generation pressure and survival/copy-cost estimates measured across relevant load regimes, with uncertainty named
- [ ] Analysis output validated against its sanity assertions
- [ ] Percentiles computed with the rank method

When deriving:

- [ ] The failing event named — young, mixed, marking, evacuation failure, overhead — and
      the lever taken from the symptom table, not from habit
- [ ] Every changed flag has a traceable source measurement, not another service's file
- [ ] Each flag's trade-off documented before it is applied
- [ ] Region size confirmed before any calculation denominated in regions
- [ ] IHOP set with an explicit safety margin, never at the theoretical ceiling
- [ ] `ceil(candidates / G1MixedGCCountTarget)` checked against the percent cap

When validating:

- [ ] The prediction written down **before** the validation run
- [ ] Tested under load equivalent to the baseline, not idle
- [ ] Young and mixed evaluated separately — improving one is not evidence about the other
- [ ] GC overhead recomputed from the new data, not assumed
- [ ] No regression in heap footprint, total CPU or another route's latency
