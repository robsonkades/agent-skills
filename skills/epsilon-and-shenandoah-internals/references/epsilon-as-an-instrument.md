# Epsilon as an instrument

Facts marked "verified" were executed on Temurin 25.0.3 (Windows); the rest is read from the
JDK 25 sources named in brackets or from the JEP cited.

## What it is

A pure bump-pointer allocator. Normal TLABs; when a TLAB is exhausted a new one is carved out
of contiguous heap; when the heap is exhausted, `OutOfMemoryError` — with no attempt to
collect. It is a measurement device, not a collector and not an optimisation.

```bash
-XX:+UnlockExperimentalVMOptions -XX:+UseEpsilonGC
```

The unlock flag is mandatory on JDK 25 and will remain so while Epsilon stays experimental.
Delivered by JEP 318 in JDK 11, its status has not changed since. ZGC (JEP 377) and Shenandoah
(JEP 379) were promoted to product in JDK 15; Epsilon never was, and no JEP proposed it.
Verified: without the unlock the launcher exits with `VM option 'UseEpsilonGC' is
experimental and must be enabled via -XX:+UnlockExperimentalVMOptions`, and the unlock must
precede the flag on the command line.

## Three behaviours that change the experiment

**The process exits on OOM; a `catch` never runs.** `EpsilonArguments::initialize`
[`epsilonArguments.cpp`] sets `ExitOnOutOfMemoryError=true` unless the flag was given
explicitly — `PrintFlagsFinal` under Epsilon shows it `{product} {default}` but `true`.
Verified: a `try { … } catch (OutOfMemoryError e)` around the allocating loop never reaches
the handler; the VM prints `Terminating due to java.lang.OutOfMemoryError: Java heap space`
and exits with status 3; `finally` blocks and shutdown hooks do not run either (verified). A
harness that expects to observe the error in-process, or a test that asserts on it, needs
`-XX:-ExitOnOutOfMemoryError`; with that the handler runs and the process continues
(verified). `-XX:+HeapDumpOnOutOfMemoryError` still writes the dump before the exit
(verified: 69 MB `.hprof` for `-Xmx64m`).

**Committing is lazy unless `-Xms` equals `-Xmx`.** Epsilon commits in steps of
`EpsilonMinHeapExpand` (128 MB, experimental) and prints `Consider setting -Xms equal to
-Xmx to avoid resizing hiccups` at start-up when they differ, plus `Consider enabling
-XX:+AlwaysPreTouch to avoid memory commit hiccups` only when `AlwaysPreTouch` remains
at its default false value. Explicitly enabling or disabling it suppresses that hint
(verified on 25.0.3); an absent hint does not prove pre-touch is enabled. For a latency
benchmark these controls can exclude resizing/first-touch work from the timed region, but
pre-touch adds startup work and resident memory. Keep that cost in a cold-start experiment.

**TLABs are elastic.** `EpsilonElasticTLAB` (true), `EpsilonMaxTLABSize` (4 MB),
`EpsilonTLABElasticity` (1.10) and `EpsilonTLABDecayTime` (1000 ms) — all experimental —
grow a thread's TLAB while it allocates steadily and shrink it after a pause. The
`gc+init` line `TLAB Size Max: 4M` confirms the ceiling. This only matters when reading the
`used` figure at fine granularity: heap "used" advances by whole TLABs, not by objects.

## The arithmetic

```
T_oom ≈ (usable heap − heap consumed at measurement start) / A
```

`A` is total process heap consumption per second, including TLAB waste and background work.
Use a measured baseline after warm-up for a steady-state window; it includes all warm-up
allocation, not just live objects. Account for alignment, TLAB tails, allocation size and
native/container headroom. Varying rates require cumulative allocation, not a constant-rate
prediction. Native exhaustion or an oversized allocation can fail before this estimate.

Used in both directions:

**Sizing for a known window.** `Xmx = T_target × A + initial footprint`. A serverless function
with a 5 s execution budget and a measured 400 MB/s allocation rate needs roughly
`5 × 400 MB + footprint ≈ 2.05 GB` just to avoid an OOM before it finishes.

**Detecting hidden allocation.** If the observed `T_oom` is far shorter than the rate you
_expect_ from the hot path predicts, allocation you have not accounted for is happening. That
gap is the finding.

## Four uses, and the heap each implies

| Use                                                                  | Heap                                                           | Why                                                                                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Precise benchmarking                                                 | Large enough not to OOM during the measurement                 | Removes reclamation work from this configuration; does not isolate allocation cost from JIT, runtime or layout effects |
| Very short-lived processes (CLI, sub-second serverless, small batch) | Measured cumulative allocation plus startup and safety reserve | Compare end-to-end runtime and resident memory with a collecting baseline                                              |
| Detecting hidden allocation pressure                                 | Deliberately modest — enough to run, not enough to hide        | Excess allocation becomes a fast, observable OOM instead of a symptom a collector masks until it is too late           |
| Investigating an allocation-free claim                               | Sized past warm-up with a defined measurement window           | Bound allocation with counters/profiles; finite survival cannot prove zero allocation                                  |

Size from cumulative bytes allocated during startup, warm-up and measurement, plus measured
waste and reserve. A normal collector's peak occupancy plus 20% is insufficient: it can
reclaim the same capacity repeatedly while Epsilon retains all consumed heap.

```bash
# CLI or lambda
-XX:+UnlockExperimentalVMOptions -XX:+UseEpsilonGC -Xmx200m -Xms200m -XX:+AlwaysPreTouch

# benchmark
-XX:+UnlockExperimentalVMOptions -XX:+UseEpsilonGC -Xmx4g -Xms4g -XX:+AlwaysPreTouch

# allocation-free path verification: keep the OOM catchable and log the slope
-XX:+UnlockExperimentalVMOptions -XX:+UseEpsilonGC -Xmx256m -Xms256m \
  -XX:-ExitOnOutOfMemoryError -Xlog:gc:file=epsilon.log:uptime
```

### Verifying an allocation-free path is a two-phase measurement

A `-Xmx64m` process that OOMs proves nothing about the steady-state path, because the JVM
allocates heavily before C2 has compiled it: class loading, the interpreter and C1 allocate
what C2's escape analysis later removes, and the boxing or iterator that C2 scalar-replaces
may still allocate before the relevant optimization applies. Do not assume identical escape
analysis decisions across tiers or compilation states.

The test reads consumption after warm-up with a stated resolution. The baseline comes from
`jcmd <pid> GC.heap_info` (verified: `Epsilon Heap`, `Allocation space: space 65536K, 2%
used […)`) taken once warm-up is over, and `jcmd <pid> GC.class_histogram` works under
Epsilon and says what that footprint is made of. With `-Xlog:gc` Epsilon prints a
`Heap:` line every `EpsilonPrintHeapSteps`-th of the heap (20 by default, so every 5%;
`-XX:EpsilonPrintHeapSteps=100` gives 1%):

```
[0.026s][gc] Heap: 65536K reserved, 65536K (100.00%) committed, 3450K (5.27%) used
[0.027s][gc] Heap: 65536K reserved, 65536K (100.00%) committed, 7253K (11.07%) used
```

A quiet occupancy log is not a zero-allocation measurement: allocations can fit inside an
existing TLAB or below the logging increment. Measure repeated post-warm-up windows, subtract
or identify background activity, and corroborate with allocation counters/profiles. Report
resolution and bytes per operation; sampling can miss rare allocations. A stable positive
heap-consumption slope estimates total `A`, not automatically the hot path's allocation rate.
Confirm compilation and exercised paths before interpreting a flat segment; a flat segment
under `-Xint` is a different claim.

## Instrumentation

```bash
-XX:+UnlockExperimentalVMOptions -XX:+UseEpsilonGC \
-Xlog:gc,gc+init:file=epsilon.log:uptime \
-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/tmp/epsilon-oom.hprof
```

Verified output on 25.0.3: `Using Epsilon`, the `gc+init` block (`Heap Max Capacity`, `TLAB
Size Max`, `TLAB Size Elasticity`, `TLAB Size Decay Time`), applicable `Consider …` hints, the
`Heap:` occupancy lines, then at exhaustion:

```
java.lang.OutOfMemoryError: Java heap space
Dumping heap to /tmp/epsilon-oom.hprof ...
Heap dump file created [69784618 bytes in 0.063 secs]
Terminating due to java.lang.OutOfMemoryError: Java heap space
```

The last periodic `Heap:` line can precede exhaustion and omit sub-threshold consumption.
Use aligned baseline/end measurements and report resolution when estimating `A`.

Use a dump when class/graph evidence is needed, not as a mandatory artifact for every budget
test. Epsilon can expose unreachable objects still represented in the heap, but a dump is
not an exact allocation-event history and has no allocation-site stacks. Check the dump
tool's filtering and unreachable-object treatment; use profiles/counters for rate and site
attribution (`heap-dump-analysis`, `allocation-profiling`).

## The procedure, end to end

1. State the claim to be tested — "this hot path does not allocate", "this benchmark's
   variance is GC", "our allocation rate is X".
2. Compute the heap and remaining-time estimate for the chosen window. Intentionally exhaust
   it only when an exhaustion experiment answers the question; a sufficient existing
   allocation measurement or finite-budget bound needs no forced OOM.
3. Choose dump/pre-touch/startup controls for the hypothesis and reserve headroom. Set
   `-XX:-ExitOnOutOfMemoryError` only if an isolated harness must observe the error.
4. If exhaustion occurs, compare it with the prediction; investigate unaccounted allocation,
   waste, allocation size and the actual failure cause before attributing a shortfall.
5. Analyse any dump for classes/graphs and use allocation evidence to identify producing code.
6. If a change is warranted, verify correctness and re-run comparable measurement windows.
   Retain adequate code when the budget is met and no defect is demonstrated. Surviving the window that previously
   OOMed demonstrates meeting that finite budget, not zero allocation. Report measured bytes
   per operation or an upper bound; no observed OOM gives a bound, not a new measured `T_oom`.

Illustrative budget: with 400 MiB usable after warm-up, surviving an eight-hour window
without exhaustion bounds average consumption by roughly 14.2 KiB/s. That can still contain
many allocations. A `HashMap<Long, long[]>` can allocate boxed keys, nodes, arrays and resize
tables; changing generic types is not proof of allocation freedom. Changing numeric
representation also requires preserving range, precision and rounding behavior.

This is a budget bound. Use allocation-site evidence to decide whether an implementation
change is warranted and verify its correctness separately.

## Boundaries

- A long-lived process needs a bounded total lifetime allocation budget, including background
  work, or recycling before conservative exhaustion. An allocation-free hot path alone is
  insufficient. "GC-free performance" can be
  an OOM with a countdown — and, by default, an exit with status 3 that no handler sees.
- Have an answer for what happens at `T_oom` before starting: recycle, alert, or "that is the
  expected result of the experiment".
- Epsilon says how much is allocated, never by whom. Attributing allocation to code is a
  profiling job (`allocation-profiling`).
- Epsilon performs no reclamation and has no collector barriers or concurrent GC workers;
  JIT, runtime, background work and non-GC safepoints remain. Its numbers do not transfer to a collector with a load barrier
  (Shenandoah, ZGC) or a card-marking store barrier (G1, Parallel, generational
  Shenandoah). The difference also includes allocation paths, layout/locality, heap occupancy,
  JIT decisions and scheduling effects; it is a whole-configuration comparison, not an isolated
  per-access barrier measurement.

## Primary sources

- [JEP 318](https://openjdk.org/jeps/318) — intended uses and finite heap constraints.
- [Epsilon initialization, JDK 25 update sources](https://github.com/openjdk/jdk25u/blob/master/src/hotspot/share/gc/epsilon/epsilonArguments.cpp) — OOM exit default and non-GC safepoint support; use the target build tag.
- [25.0.3 Epsilon startup logger](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/gc/epsilon/epsilonInitLogger.cpp) — conditions for heap-size and pre-touch hints.
