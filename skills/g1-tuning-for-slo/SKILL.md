---
name: g1-tuning-for-slo
description: >
  Deriving G1 flag values from a latency SLO and proving they helped: what
  `MaxGCPauseMillis` actually controls, the young size bounds, IHOP and adaptive IHOP with
  an explicit safety margin, region size as the basis of every region-denominated
  calculation, `G1OldCSetRegionThresholdPercent` and `G1MixedGCCountTarget`, and the
  measure-derive-predict-validate loop. Use when GC flags were copied from another service,
  when `-Xms` differs from `-Xmx` in production, when mixed GC violates the SLO while young
  GC is healthy, when GC overhead exceeds its explicit service budget, when a full GC follows a marking
  cycle that finished too late, when an IHOP was set to the theoretical ceiling, when a G1
  flag makes the JVM refuse to start, or when a parser reports a promotion rate of zero.
  Does not cover deciding whether GC is the bottleneck at all or which collector to use
  (jvm-gc-tuning), why the mechanism responds the way it does (g1-internals), or
  configuring and parsing the GC log itself (gc-log-analysis).
---

# G1 Tuning For SLO

## Purpose

Turn a stated latency SLO into specific G1 flag values, with a traceable measurement
behind each one, and then prove the change helped. Every flag in this space moves the
system inside a fixed triangle of pause, throughput and footprint — none of them removes
the trade-off, so a change without a recorded trade-off is a change nobody can defend.

The failure this prevents is tuning by transplant. Two services with the same SLO need
different G1 configurations when their allocation rate, promotion rate or average object
size differ. A configuration that "worked" elsewhere is at best a starting point for
measurement, and at worst hides the actual cause behind a symptom that moved.

## Workflow

1. **State the SLO as a metric, a threshold and an evaluation window.** "Low p99" is not
   an SLO and cannot be derived from.
2. **Collect enough complete cycles across representative regimes** with
   `-Xlog:gc*` — the asterisk is required — plus the policy tags in
   [the policy log](references/policy-log-and-troubleshooting.md) if the question is
   _why_ G1 chose a size. Confirm current defaults and the effective region size with
   `-XX:+PrintFlagsFinal -version` on the target runtime. Thirty minutes may be adequate for a
   steady high-rate service and useless for a diurnal/bursty one; justify sample/cycle count and
   include startup, peak, recovery or soak windows relevant to the SLO.
3. **Measure the inputs**: allocation rate, old-generation allocation/promotion pressure,
   object survival and live-set behavior across the load regimes that matter. Region-count
   deltas are estimates, not exact byte ledgers; validate them against policy logs or JFR.
4. **Name the failing event before choosing a lever.** Young pauses over budget, mixed
   pauses over budget, a full GC after marking, an evacuation failure and a GC-overhead
   problem each have a different first flag; the
   [symptom table](references/policy-log-and-troubleshooting.md) maps them.
5. **Derive, showing the arithmetic**: max young size and `G1MaxNewSizePercent` from the
   young SLO; `G1OldCSetRegionThresholdPercent` and `G1MixedGCCountTarget` together from
   the mixed SLO; IHOP from old-generation allocation rate and observed marking time, with an explicit
   safety margin below the theoretical ceiling.
6. **Write the prediction down before running the validation.** A prediction recorded
   afterwards cannot be wrong, which makes the validation worthless.
7. **Validate under load equivalent to the baseline**, evaluating young and mixed
   collections separately, and recompute GC overhead from the new data rather than
   assuming it moved.
8. **Check for a regression elsewhere** — heap footprint, total CPU, latency on another
   route — before declaring the change good.

## Rules

- `MaxGCPauseMillis` (default 200) is a goal, not a guarantee. It sizes the young
  generation through the G1 policy; it does not bound a mixed collection under pressure,
  and `G1MixedGCCountTarget` can force a mixed collection past it (below).
- `G1NewSizePercent`, `G1MaxNewSizePercent`, `G1OldCSetRegionThresholdPercent` and
  `G1MixedGCLiveThresholdPercent` are **experimental** on JDK 25. Without
  `-XX:+UnlockExperimentalVMOptions` placed _before_ them the JVM refuses to start
  (`VM option 'G1NewSizePercent' is experimental and must be enabled via ...`, executed
  on 25.0.3). A command line copied from a document that omits the unlock is not a
  configuration; it is an outage at the next restart.
- Every calculation denominated in "regions" requires the effective region size first:
  `-Xmx / 2048`, clamped to [1 MB, 32 MB], then rounded **up** to a power of two —
  `-Xmx5g` gives 4 MB, not 2 MB, and `-Xmx12g` gives 8 MB (executed on 25.0.3). `-Xms`
  plays no part. Confirm it with
  `java -Xmx<size> -XX:+PrintFlagsFinal -version | grep G1HeapRegionSize`.
- Use **binary** GB throughout a derivation. `-Xmx8g` is 8192 MiB, not 8000 MB. Mixing
  the conventions inside one derivation produces numbers that do not reconcile.
- Prefer `-Xms = -Xmx` when predictable heap ergonomics and pause-free expansion are worth a
  stable memory commitment. G1 sizes the young generation against currently available/committed
  capacity, so a very small `-Xms` can start with a
  tiny young generation and a GC storm (`-Xms64m -Xmx2g`: 23 Eden regions and 508 young
  GCs in 8 s against 481 regions and 154 GCs with `-Xms2g`, executed on 25.0.3), and
  expansion policy runs around GC pauses. Keep a smaller `-Xms` when elastic footprint/startup
  density is more valuable and measured warm-up/expansion meets the SLO. `-Xms` commits heap
  logically; physical residency depends on page touching—`AlwaysPreTouch` deliberately changes
  that cost. Container budgeting is `jvm-gc-tuning`.
- Size the young generation from the allocation rate — `young ≥ alloc_rate × target
interval` — and the heap from the live set plus that young generation plus
  `G1ReservePercent` (default 10) plus the old growth that accrues during marking. The
  live-set measurement itself is `jvm-gc-tuning`.
- Set an explicit GC CPU/pause-overhead budget from service capacity and SLO rather than a
  universal 5%. Compute STW overhead as `pause / wall interval` (or equivalently for one
  pause-cycle, `pause / (mutator interval + pause)`) and separately account concurrent GC CPU.
  High overhead can form a feedback loop through CPU starvation, queues and live objects, but
  the threshold is workload/headroom dependent. If tuning cannot meet the declared budget,
  reduce allocation/live set, add capacity or reconsider the collector.
- IHOP compares old-generation occupancy (including humongous occupancy) with an effective
  old/heap-capacity-derived threshold. A post-reclamation old live set near/above it can cause
  back-to-back cycles and little useful mixed reclaim, but does not logically prevent a mixed
  phase. Distinguish live-set pressure, old allocation during marking, humongous triggers and
  candidate efficiency; an IHOP adjustment cannot create reclaimable garbage.
- Do not set a static IHOP at a theoretical capacity ceiling. The ceiling assumes observed old-
  allocation rate and marking time repeat exactly. Adaptive IHOP incorporates predicted marking
  duration/allocation and reserve/waste/young constraints whose exact formula and flag names
  evolve. Read effective threshold and target occupancy from `gc+ergo+ihop`; do not claim a
  hand-calculated constant is a bound the JVM will “never” cross.
- `G1UseAdaptiveIHOP` is `true` by default, but the first cycles — before
  `G1AdaptiveIHOPNumInitialSamples` (default 3) samples exist — use the static IHOP. That
  static value still matters at startup and after every restart.
- `G1OldCSetRegionThresholdPercent` (default 10) caps **how many** old regions enter a
  mixed collection — `ceil(percent × total regions)` — not **which**. G1 orders candidates
  by efficiency — recoverable garbage divided by predicted cost — so the simple
  uniform-cost model tends to be pessimistic, overestimating the real pause.
- `G1MixedGCCountTarget` (default 8) is a target for spreading candidate reclamation across
  mixed collections, not a guaranteed count. In the JDK 25 implementation it contributes
  a minimum of `ceil(candidates / target)` old regions; that minimum can override the
  percent cap when the two disagree
  (`G1MixedGCCountTarget=1` with a 1 percent cap of 11 regions logged
  `Min 18 regions, max 18 regions` and a predicted 8.59 ms against a 5 ms target,
  executed on 25.0.3). Lowering it tends to concentrate old-region work; raising it tends
  to spread work and is a candidate for mixed-pause overshoot. Policy prediction,
  candidate groups and `G1HeapWastePercent` can still produce fewer/different collections,
  so confirm the actual `Min`, selected regions and termination reason in logs.
- Reducing `MaxGCPauseMillis` usually selects smaller young/CSet work and therefore more frequent
  pauses; fixed per-pause work can raise total overhead and reduce throughput. Magnitude is
  workload/policy dependent, so predict direction, then measure pause distribution, frequency,
  total STW/concurrent CPU and throughput.
- Do not present the linear cost model as how G1 decides. It is a starting point for
  sizing; the real policy is an adaptive predictor over truncated histories of past
  measurements, recalibrating every collection.
- Every mixed collection is logged as `Pause Young (Mixed)`, never as a bare
  `Pause Mixed`, and `Pause Young (Prepare Mixed)` is the young-only collection that
  precedes the first one. A parser that reads the type immediately after `Pause `
  classifies all of them as young; one that matches `Mixed)` counts the preparation
  pause as mixed. Match `Pause Young \(Mixed\)` exactly.
- `Old regions: 50->55` has **no** third parenthesised number, unlike Eden and Survivor.
  A regex demanding `(\d+)->(\d+)\((\d+)\)` matches nothing and yields an old-growth
  estimate of zero with no error. Even a parsed positive delta is region growth, not an
  exact promoted-byte counter.
- `sorted(data)[int(len(data)*0.99)]` silently chooses one zero-based convention and is off by one
  from the common nearest-rank definition (`sorted[ceil(p × n)-1]`). For fewer than 100 samples,
  nearest-rank p99 is legitimately the maximum and extremely uncertain. Declare the quantile
  estimator, minimum sample count and confidence/error; prefer histogram/library aggregation over
  ad hoc indexing.
- Correlate SLO violations with the GC event **type**, not merely with the presence of
  GC. Alignment isolated to `Pause Young (Mixed)` prioritizes CSet/old-region phase analysis, but
  heap/live-set pressure may be why the set exists; correlation routes the investigation rather
  than proving one flag is causal.

## Change safety and rollback

Change one mechanism per canary when possible and persist the exact JVM command line, JDK
vendor/update, container limits and workload fingerprint. Define abort thresholds for full GC,
evacuation failure, allocation stall, application CPU/throughput and tail latency; keep the prior
configuration deployable. Experimental flags are not portable contracts—verify availability and
defaults during each JDK upgrade. Rotate and protect verbose logs as production telemetry.

## References

- [Flag reference and workload baselines](references/flags-and-baselines.md) — every
  flag with its JDK 25 default, whether it needs unlocking, and the trade-off it implies,
  plus three complete starting configurations with a per-flag justification for that
  workload. Read when choosing a value or when reviewing an existing command line.
- [Deriving values from an SLO](references/derivation.md) — the pause, young size,
  interval, overhead, IHOP and mixed-cost formulas as G1 itself computes them, a fully
  worked case, and the measurement and calibration protocol. Read when turning measured
  rates into flag values, or when validating that a change produced the predicted effect.
- [The policy log and the symptom table](references/policy-log-and-troubleshooting.md) —
  the log lines that show what G1 decided and why, the symptom → cause → measure →
  lever table for young, mixed, marking, evacuation-failure and overhead problems, and
  the version notes that change a derivation. Read when a flag change did not produce
  the predicted effect, or before picking a lever.
