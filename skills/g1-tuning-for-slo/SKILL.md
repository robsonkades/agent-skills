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
  cycle that finished too late, when an IHOP was set to the theoretical ceiling, or when a
  parser reports a promotion rate of zero. Does not cover deciding whether GC is the
  bottleneck at all or which collector to use (jvm-gc-tuning), why the mechanism responds
  the way it does (g1-internals), or configuring and parsing the GC log itself
  (gc-log-analysis).
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
   `-Xlog:gc*` — the asterisk is required. Confirm current defaults and the effective
   region size with `-XX:+PrintFlagsFinal -version` on the target runtime.
3. **Measure the inputs**: allocation rate, promotion rate and survival ratio, at three
   or more load levels. Validate the analysis output before trusting it — mixed GCs
   greater than zero and promotion rate greater than zero, if the load promotes at all.
4. **Derive, showing the arithmetic**: max young size and `G1MaxNewSizePercent` from the
   young SLO; `G1OldCSetRegionThresholdPercent` from the mixed SLO; IHOP from promotion
   rate and observed marking time, with an explicit safety margin below the theoretical
   ceiling.
5. **Write the prediction down before running the validation.** A prediction recorded
   afterwards cannot be wrong, which makes the validation worthless.
6. **Validate under load equivalent to the baseline**, evaluating young and mixed
   collections separately, and recompute GC overhead from the new data rather than
   assuming it moved.
7. **Check for a regression elsewhere** — heap footprint, total CPU, latency on another
   route — before declaring the change good.

## Rules

- `MaxGCPauseMillis` (default 200) is a goal, not a guarantee. It sizes the young
  generation through the G1 policy; it does not bound a mixed collection under pressure.
- Every calculation denominated in "regions" requires the effective region size first:
  `heap / 2048`, rounded to a power of two in [1 MB, 32 MB]. Confirm it with
  `-Xmx<size> -XX:+PrintFlagsFinal -version | grep G1HeapRegionSize`.
- Use **binary** GB throughout a derivation. `-Xmx8g` is 8192 MiB, not 8000 MB. Mixing
  the conventions inside one derivation produces numbers that do not reconcile.
- Set `-Xms` equal to `-Xmx` in production. Unequal values let G1 expand and shrink;
  the commit typically lands at the end of a collection already in progress, extending
  that pause, and adds unpredictable pause variability. The cost is reserving all the
  memory from boot.
- Size the heap against the allocation rate: `heap ≥ alloc_rate × 2 × target_gc_interval`.
  At 500 MB/s with a 1 s target interval that is a 1 GB minimum.
- Target GC overhead below 5 percent in normal operation, computed as
  `pause / (interval + pause)` from measured data. Above roughly 10 percent there is a
  feedback loop: less CPU, longer queue, more live objects, more GC pressure.
- Never set IHOP to the theoretical ceiling. The ceiling assumes the observed promotion
  rate and marking time repeat exactly; the production value sits deliberately below it,
  with headroom for unsampled promotion spikes and for the mixed collections that follow.
- `G1UseAdaptiveIHOP` is `true` by default, but the first cycles — before
  `G1AdaptiveIHOPNumInitialSamples` samples exist — fall back to the static IHOP. That
  static value still matters at startup.
- `G1OldCSetRegionThresholdPercent` (default 10) caps **how many** old regions enter a
  mixed collection, not **which**. G1 orders candidates by efficiency — recoverable
  garbage divided by predicted cost — so the simple uniform-cost model tends to be
  pessimistic, overestimating the real pause.
- A high `G1MixedGCCountTarget` (default 8) is a ceiling on attempts, not a promise.
  `G1HeapWastePercent` (default 5) stops the cycle once remaining garbage is not worth
  collecting, so extra cycles may simply never happen.
- Reducing `MaxGCPauseMillis` sharply multiplies GC frequency far more than it raises
  overhead percentage or lowers throughput — the fixed per-pause term dominates at small
  pause targets, so the two effects are not proportional.
- Do not present the linear cost model as how G1 decides. It is a starting point for
  sizing; the real policy is an adaptive predictor over truncated histories of past
  measurements, recalibrating every collection.
- Every mixed collection is logged as `Pause Young (Mixed)`, never as a bare
  `Pause Mixed`. A parser that reads the type immediately after `Pause ` classifies all
  of them as young, silently.
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
  flag with its JDK 25 default and the trade-off it implies, plus three complete starting
  configurations with a per-flag justification for that workload. Read when choosing a
  value or when reviewing an existing command line.
- [Deriving values from an SLO](references/derivation.md) — the pause, young size,
  interval, overhead, IHOP and mixed-cost formulas, a fully worked case, and the
  measurement and calibration protocol. Read when turning measured rates into flag
  values, or when validating that a change produced the predicted effect.
