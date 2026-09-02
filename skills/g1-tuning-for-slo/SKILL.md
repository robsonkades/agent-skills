---
name: g1-tuning-for-slo
description: >
  Deriving G1 flag values from a latency SLO and proving they helped: what
  `MaxGCPauseMillis` actually controls, the young size bounds, IHOP and adaptive IHOP with
  an explicit safety margin, region size as the basis of every region-denominated
  calculation, `G1OldCSetRegionThresholdPercent` and `G1MixedGCCountTarget`, and the
  measure-derive-predict-validate loop. Use when GC flags were copied from another service,
  when `-Xms` differs from `-Xmx` in production, when mixed GC violates the SLO while young
  GC is healthy, when GC overhead exceeds 5 to 10 percent, when a full GC follows a marking
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
2. **Collect a baseline for at least 30 minutes under representative load** with
   `-Xlog:gc*` — the asterisk is required — plus the policy tags in
   [the policy log](references/policy-log-and-troubleshooting.md) if the question is
   _why_ G1 chose a size. Confirm current defaults and the effective region size with
   `-XX:+PrintFlagsFinal -version` on the target runtime.
3. **Measure the inputs**: allocation rate, promotion rate and survival ratio, at three
   or more load levels. Validate the analysis output before trusting it — mixed GCs
   greater than zero and promotion rate greater than zero, if the load promotes at all.
4. **Name the failing event before choosing a lever.** Young pauses over budget, mixed
   pauses over budget, a full GC after marking, an evacuation failure and a GC-overhead
   problem each have a different first flag; the
   [symptom table](references/policy-log-and-troubleshooting.md) maps them.
5. **Derive, showing the arithmetic**: max young size and `G1MaxNewSizePercent` from the
   young SLO; `G1OldCSetRegionThresholdPercent` and `G1MixedGCCountTarget` together from
   the mixed SLO; IHOP from promotion rate and observed marking time, with an explicit
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
- Set `-Xms` equal to `-Xmx` in production. G1 sizes the young generation as a
  percentage of the **committed** heap, not of `-Xmx`, so a small `-Xms` starts with a
  tiny young generation and a GC storm (`-Xms64m -Xmx2g`: 23 Eden regions and 508 young
  GCs in 8 s against 481 regions and 154 GCs with `-Xms2g`, executed on 25.0.3), and
  every expansion is decided at the end of a pause. The cost is reserving all the memory
  from boot; `jvm-gc-tuning` covers the container side and `-XX:+AlwaysPreTouch`.
- Size the young generation from the allocation rate — `young ≥ alloc_rate × target
interval` — and the heap from the live set plus that young generation plus
  `G1ReservePercent` (default 10) plus the old growth that accrues during marking. The
  live-set measurement itself is `jvm-gc-tuning`.
- Target GC overhead below 5 percent in normal operation, computed as
  `pause / (interval + pause)` from measured data. Above roughly 10 percent there is a
  feedback loop: less CPU, longer queue, more live objects, more GC pressure. If the
  derivation itself lands above 10 percent, the SLO is unreachable by G1 flags at that
  allocation rate — the lever is allocation (`allocation-profiling`), not a flag.
- IHOP compares **old-generation occupancy** (old plus humongous regions) against a
  percentage of the current heap capacity — not whole-heap occupancy. A live set that
  already exceeds the threshold keeps marking running back to back and never reaches a
  mixed phase; no IHOP value fixes that, only heap size or live set.
- Never set IHOP to the theoretical ceiling. The ceiling assumes the observed promotion
  rate and marking time repeat exactly; the production value sits deliberately below it.
  G1's own adaptive controller keeps `G1ReservePercent + G1HeapWastePercent` of the heap
  (15 percent by default) plus the last young size as headroom — a static value with
  less margin than that is tighter than the JVM would ever choose for itself.
- `G1UseAdaptiveIHOP` is `true` by default, but the first cycles — before
  `G1AdaptiveIHOPNumInitialSamples` (default 3) samples exist — use the static IHOP. That
  static value still matters at startup and after every restart.
- `G1OldCSetRegionThresholdPercent` (default 10) caps **how many** old regions enter a
  mixed collection — `ceil(percent × total regions)` — not **which**. G1 orders candidates
  by efficiency — recoverable garbage divided by predicted cost — so the simple
  uniform-cost model tends to be pessimistic, overestimating the real pause.
- `G1MixedGCCountTarget` (default 8) is a **divisor, not a ceiling**: each mixed
  collection takes at least `ceil(candidates / target)` old regions regardless of the
  pause budget, and that minimum overrides the percent cap when the two disagree
  (`G1MixedGCCountTarget=1` with a 1 percent cap of 11 regions logged
  `Min 18 regions, max 18 regions` and a predicted 8.59 ms against a 5 ms target,
  executed on 25.0.3). Lowering it makes each mixed pause longer; raising it is the
  lever for a mixed pause that overshoots. `G1HeapWastePercent` (default 5) may still end
  the phase before the target number of collections happens.
- Reducing `MaxGCPauseMillis` sharply multiplies GC frequency far more than it raises
  overhead percentage or lowers throughput — the fixed per-pause term dominates at small
  pause targets, so the two effects are not proportional.
- Do not present the linear cost model as how G1 decides. It is a starting point for
  sizing; the real policy is an adaptive predictor over truncated histories of past
  measurements, recalibrating every collection.
- Every mixed collection is logged as `Pause Young (Mixed)`, never as a bare
  `Pause Mixed`, and `Pause Young (Prepare Mixed)` is the young-only collection that
  precedes the first one. A parser that reads the type immediately after `Pause `
  classifies all of them as young; one that matches `Mixed)` counts the preparation
  pause as mixed. Match `Pause Young \(Mixed\)` exactly.
- `Old regions: 50->55` has **no** third parenthesised number, unlike Eden and Survivor.
  A regex demanding `(\d+)->(\d+)\((\d+)\)` matches nothing and yields a promotion rate of
  zero with no error.
- `sorted(data)[int(len(data)*0.99)]` is not a p99 — for n below 100 it always returns
  the maximum. Use the rank method, `ceil(p/100 × n)`, and assert on the output.
- Correlate SLO violations with the GC event **type**, not merely with the presence of
  GC. Violations that align with `Pause Young (Mixed)` and not with
  `Pause Young (Normal)` point at collection-set sizing, not at heap size.

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
