---
name: flame-graph-analysis
description: >
  Interpreting flame graphs as weighted sampled call-path aggregates: identifying the
  selection event and denominator, separating inclusive from leaf/self attribution,
  recognizing truncation, inlining, symbol and thread/task artifacts, using bottom-up and
  differential views, quantifying sample uncertainty, and turning a hotspot into a bounded
  causal experiment. Use when a graph looks CPU-heavy, idle-heavy, fragmented, changed after
  a deploy, or tempting to optimize by width alone. Does not collect profiles
  (jfr-and-async-profiler), configure engines/conversion (async-profiler-advanced), or define
  benchmark/latency inference (jmh-microbenchmarks, latency-statistics).
---

# Flame Graph Analysis

## Purpose

A flame graph aggregates weighted stack traces. It answers “where did the selected events
land, under which call paths?” It is not inherently CPU time, elapsed time, chronology,
causality, per-request latency, or an optimization ranking. Those meanings come from the
event source, selection population, weight, filters, and normalization.

The expert workflow first validates the evidence envelope, then reads topology, then forms a
causal hypothesis, and finally tests a change against an independent outcome metric.

## Ownership boundary

- `async-profiler-advanced` owns sampling engines, stack walkers, event combinations, and
  conversion commands.
- `jfr-advanced` owns JFR event settings, stack depth, chunks, and event loss.
- This skill owns interpretation of the resulting weighted call-path aggregate.
- `latency-statistics` and `performance-regression-ci` own repeated-comparison inference.
- `allocation-profiling`, `concurrency-diagnostics`, and JVM skills own domain diagnosis once
  the graph points there.

## Evidence envelope first

Do not interpret width until these are known:

```text
event/source and producer version:
selection mechanism and eligible thread/process/task population:
one observation's weight and unit:
recording interval, load/work completed, warm-up/lifecycle phase:
thread/state/context filters and aggregation:
stack depth, truncation, unknown/unresolved/lost/rate-limited observations:
JDK/profiler/collector/converter versions and symbol source:
total event weight and number of independent recordings:
```

Examples of different denominators:

- CPU-event samples: approximate on-CPU/event consumption of eligible tasks;
- wall samples: elapsed residency of eligible threads, including waiting/idle states;
- allocation: sampled/estimated allocated bytes or events, not time;
- lock: qualifying contended-wait events/weight, not all synchronization;
- off-CPU: selected blocked/sleeping intervals, whose weighting depends on collector;
- PMU: sampled hardware event, not necessarily cycles or elapsed time.

Never compare percentages across different event sources as if they shared a denominator.

## Graph geometry

For conventional root-oriented flame graphs:

- vertical position is call depth;
- a frame's width is **inclusive selected weight** for stacks containing that frame under
  that parent path;
- the portion with no displayed child approximates leaf/self attribution under the captured
  stack semantics;
- sibling widths partition their displayed parent's retained weight, subject to filtering,
  truncation, aggregation, and rendering thresholds;
- horizontal position groups stacks for readability and is not time. Ordering is tool- and
  input-dependent, not a universal alphabetical contract.

An outer frame such as `main`, `Thread.run`, or an executor loop is expected to be wide because
it owns descendants. It can still have meaningful leaf width; never say it is “never” the
bottleneck. Conversely, a wide leaf can be a runtime boundary, unresolved frame, sampling
artifact, blocking primitive, or inlined-code attribution—not automatic blame.

Use **responsibility** and **mechanism**, not blame:

```text
inclusive width -> which path owns selected weight?
leaf/self width -> where did samples stop under this stack representation?
caller context  -> which operation/data/resource reaches the mechanism?
```

## Analysis workflow

1. Validate source, denominator, scope, total weight, loss, truncation, and symbol quality.
2. Split heterogeneous populations: service/process, application versus runtime threads,
   thread/task role, state, operation/workload class, and version where supported.
3. Scan broad plateaus and branches; inspect inclusive and leaf/self views.
4. Search/group a mechanism across call paths, then use bottom-up/reversed view for callers.
5. Convert width to an upper-bound opportunity under explicit assumptions.
6. Correlate with throughput, CPU, allocation/GC, latency, queue/I/O, errors, and load.
7. Form alternative hypotheses and choose a discriminating measurement or experiment.
8. Recollect repeated comparable trials and validate the external outcome.

Search is aggregation, not causality. Grouping `ObjectMapper` frames can quantify selected
weight associated with serialization, but caller/data/output requirements determine whether
it is avoidable.

## Statistical discipline

For unweighted approximately independent samples, count uncertainty scales roughly with the
square root of count, but profiler samples are often autocorrelated, weighted, batched,
throttled, filtered, and clustered by recording/host. The slogan “100 samples = 10% error” is
only a rough Poisson/binomial intuition, not a confidence guarantee.

Report absolute selected weight and count alongside percentage. For decisions, repeat
independent recordings/blocks and analyze per-recording effects. Narrow frames can be real but
underpowered; absent frames can mean no selected samples, not zero execution/cost.

The flame graph itself has no uncertainty interval. Use the raw recording and sampling design
to estimate one.

## Opportunity bounds and Amdahl

If fraction `p` of the **relevant end-to-end resource/time** is improved by factor `s`, the
Amdahl upper bound is:

```text
speedup = 1 / ((1 - p) + p / s)
```

Eliminating a genuine non-overlapping 45% CPU fraction would bound CPU-time reduction at 45%
and speedup at about 1.82×. A 45%-wide profile frame is not automatically that fraction:
inclusive parents overlap descendants, samples may use a different denominator, and removing
work can expose contention or shift load. There is no universal “ignore below 5%” threshold;
prioritize expected user/cost benefit, confidence, fix cost/risk, and recurrence.

## Blocking and infrastructure frames

Frames such as `park`, `futex`, `epoll_wait`, socket read, allocator, GC, compiler, copy, and
runtime stubs are evidence about a mechanism. Inspect callers, thread state, event type, and
external resources. Examples:

- wide `park` in a wall profile can be healthy idle capacity or saturated resource waiting;
- socket read can be expected blocking, timeout amplification, or a slow peer;
- `Arrays.copyOf` can indicate growth/copying, but data size and amortization matter;
- GC-worker CPU can reflect allocation rate, live-set/remembered-set work, humongous objects,
  collector phase, or configured concurrency;
- compiler CPU can reflect warm-up, code churn/deoptimization, or normal dynamic compilation.

Do not discard “infrastructure noise,” and do not stop at it. Follow to the owning code/data/
resource using JFR events, thread dumps, allocation/lock profiles, traces, and system metrics.

## Allocation and GC

An allocation graph answers who allocates under its sampling/weight semantics. It does not
directly show retained size, dominators, lifetime, or total GC cost. GC logs/JFR establish GC
phase/pause/concurrent CPU and allocation pressure; an allocation profile then attributes
creation sites. Retention may require object statistics or heap dump.

Allocation behavior can affect both collection frequency and work/duration through live set,
age distribution, regions/cards, reference processing, humongous objects, and collector
policy. “Allocation only changes pause frequency” is false.

## Orientation and views

- **Root-oriented/top-down:** path ownership and branching.
- **Bottom-up/reversed:** aggregates leaf/mechanism across callers, then shows caller context.
- **Icicle versus flame layout:** visual direction; it need not imply reversed aggregation.
- **Timeline/heatmap:** preserves time buckets; use for phases and intermittent bursts.
- **Differential:** signed change in matched stack weight; converter legend and normalization
  determine color/scale.

Terms/options differ by tool. Verify with the converter's documentation and a synthetic stack
fixture rather than assuming `-r` means the same thing everywhere.

## Differential graphs

A differential graph localizes change; it does not establish statistical significance or
causality. Before diffing, require compatible:

- source/event/weight/unit and profiler/converter semantics;
- eligible population, filters, stack depth, symbols, and context;
- workload mix, work completed, concurrency, errors, and lifecycle/warm-up;
- platform/JDK/configuration epoch.

Choose normalization from the question:

- equal exposure/fixed work: compare absolute weights;
- unequal duration but stable rate: normalize by duration;
- workload cost: normalize per successful operation/byte/item;
- composition only: normalize total weights, explicitly losing magnitude.

Blind total normalization can hide that the candidate performed less work or used more total
CPU. A whole graph changing one color can be unequal totals, argument order, or a real broad
shift. Validate sign/palette using synthetic folded stacks and inspect raw totals.

Inlining and tree reshaping can move/merge frames while machine work remains. Aggregate by
stable mechanism carefully and corroborate with outcome measurements and, when necessary,
JIT/assembly evidence.

## Broken-graph diagnostics

| Symptom                             | Possible causes                                                      | Distinguish                                                              |
| ----------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Mostly `park`/`epoll_wait`          | wall population mostly idle; genuine off-CPU bottleneck              | split roles/states; compare request/queue and CPU evidence               |
| Many unrelated roots/shallow stacks | depth truncation, stack failures, filtered roots                     | raw truncation/loss flags; depth and stack-error distribution            |
| `[unknown]`/hex frames              | walker failure, missing symbols/JIT lifecycle, unsupported code      | Java/native/kernel breakdown; build IDs/maps; alternate validated walker |
| Wide interpreter/adapters           | warm-up, deoptimization, compilation exclusion, normal rare code     | compilation/JFR logs over same interval and repeated warmed capture      |
| Runtime workers dominate            | real JVM CPU or heterogeneous population                             | split thread roles and correlate GC/compiler phase metrics               |
| Same build changes shape            | sampling variance, JIT decisions, load mix, symbol/converter changes | repeated trials, raw totals/config epochs, bottom-up stable mechanisms   |
| Frame disappears                    | no sample, inlining, rename/filter/symbol change, actual removal     | sample power, JIT log/assembly, raw stack and external metric            |
| Virtual-thread graph shows carriers | collector cannot reconstruct logical continuation/context            | tool/JDK capability test plus JFR/application task evidence              |

## Anti-patterns

**Anti-pattern: width is CPU.** Width is selected weight. Name the source, eligibility, weight,
and denominator first.

**Anti-pattern: self-width is blame.** A leaf is where captured stacks terminate. Inspect
inlining, native/runtime boundary, truncation, wait semantics, and caller ownership.

**Anti-pattern: normalize every differential.** Total normalization answers composition, not
absolute resource cost. Select duration/work/total normalization from the question.

**Anti-pattern: frame disappeared, therefore fixed.** It may be under-sampled, inlined,
renamed, filtered, unresolved, or shifted to another path. Validate external outcome and JIT/
stack semantics.

## Decision record

```text
Symptom and outcome metric:
Profile source/event/weight/population:
Window/load/work and total selected weight:
Loss/truncation/symbol/context quality:
Observed path/mechanism with absolute and relative weight:
Alternative explanations:
Amdahl/opportunity assumptions:
Next discriminating experiment:
Post-change repeated outcome and profile evidence:
Remaining limitations:
```

## References

- [Reading and comparing graphs](references/reading-and-comparing.md)
- [Sources, orientations, and artifact diagnosis](references/sources-and-orientations.md)
- [Brendan Gregg: Flame Graphs](https://www.brendangregg.com/flamegraphs.html) — original methodology, tools, and variants.
- [FlameGraph source](https://github.com/brendangregg/FlameGraph) — verify ordering, differential, and options against the pinned scripts.
- [async-profiler options](https://github.com/async-profiler/async-profiler/blob/master/docs/ProfilerOptions.md) — use the producer/converter tag that created the artifact.
- [JDK 25 JFR tool](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jfr.html) — use target-JDK documentation for event/view/export behavior.
