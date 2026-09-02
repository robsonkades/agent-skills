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
-XX:+AlwaysPreTouch to avoid memory commit hiccups` in every case (verified). For a latency
benchmark both hints are instructions: page faults on first touch are a measurable term that
has nothing to do with the code under test.

**TLABs are elastic.** `EpsilonElasticTLAB` (true), `EpsilonMaxTLABSize` (4 MB),
`EpsilonTLABElasticity` (1.10) and `EpsilonTLABDecayTime` (1000 ms) — all experimental —
grow a thread's TLAB while it allocates steadily and shrink it after a pause. The
`gc+init` line `TLAB Size Max: 4M` confirms the ceiling. This only matters when reading the
`used` figure at fine granularity: heap "used" advances by whole TLABs, not by objects.

## The arithmetic

```
T_oom = (Xmx − initial footprint) / A
```

`A` is the sustained allocation rate in bytes per second. The initial footprint is heap use at
boot — loaded classes, static structures — before the first byte of business data. Read it
from `jcmd <pid> GC.heap_info` once warm-up is over (below), not from an estimate.

Used in both directions:

**Sizing for a known window.** `Xmx = T_target × A + initial footprint`. A serverless function
with a 5 s execution budget and a measured 400 MB/s allocation rate needs roughly
`5 × 400 MB + footprint ≈ 2.05 GB` just to avoid an OOM before it finishes.

**Detecting hidden allocation.** If the observed `T_oom` is far shorter than the rate you
_expect_ from the hot path predicts, allocation you have not accounted for is happening. That
gap is the finding.

## Four uses, and the heap each implies

| Use                                                                  | Heap                                                    | Why                                                                                                          |
| -------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Precise benchmarking                                                 | Large enough not to OOM during the measurement          | No GC means no GC variance in the numbers; allocation throughput is isolated from collection logic           |
| Very short-lived processes (CLI, sub-second serverless, small batch) | Available memory minus JVM overhead, around 50 MB       | The process dies before it would need to reclaim anything, so any collection is pure cost                    |
| Detecting hidden allocation pressure                                 | Deliberately modest — enough to run, not enough to hide | Excess allocation becomes a fast, observable OOM instead of a symptom a collector masks until it is too late |
| Verifying an allocation-free path                                    | Small, but sized past warm-up — see below               | The path OOMs if it allocates at all. This is a correctness test, not a performance test                     |

Practical sizing tip for the benchmark case: run once under a normal collector, observe the
real peak heap, add ~20% margin, and use that as Epsilon's `Xmx`.

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
is a real object in every earlier tier.

The valid test reads the slope of `used` after warm-up. The boot footprint itself comes from
`jcmd <pid> GC.heap_info` (verified: `Epsilon Heap`, `Allocation space: space 65536K, 2%
used […)`) taken once warm-up is over, and `jcmd <pid> GC.class_histogram` works under
Epsilon and says what that footprint is made of. With `-Xlog:gc` Epsilon prints a
`Heap:` line every `EpsilonPrintHeapSteps`-th of the heap (20 by default, so every 5%;
`-XX:EpsilonPrintHeapSteps=100` gives 1%):

```
[0.026s][gc] Heap: 65536K reserved, 65536K (100.00%) committed, 3450K (5.27%) used
[0.027s][gc] Heap: 65536K reserved, 65536K (100.00%) committed, 7253K (11.07%) used
```

A path that is allocation-free once compiled shows `used` climbing during warm-up and then
flat, with the same few lines repeating only for the elastic-TLAB refills of other threads. A
path that allocates shows a constant slope; the slope is `A`, and it is the per-iteration
cost when divided by the iteration rate. Confirm compilation happened before reading the flat
segment (`-XX:+PrintCompilation`, or JFR `jdk.Compilation`); a flat segment under `-Xint` is
a different claim.

## Instrumentation

```bash
-XX:+UnlockExperimentalVMOptions -XX:+UseEpsilonGC \
-Xlog:gc,gc+init:file=epsilon.log:uptime \
-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/tmp/epsilon-oom.hprof
```

Verified output on 25.0.3: `Using Epsilon`, the `gc+init` block (`Heap Max Capacity`, `TLAB
Size Max`, `TLAB Size Elasticity`, `TLAB Size Decay Time`), the two `Consider …` hints, the
`Heap:` occupancy lines, then at exhaustion:

```
java.lang.OutOfMemoryError: Java heap space
Dumping heap to /tmp/epsilon-oom.hprof ...
Heap dump file created [69784618 bytes in 0.063 secs]
Terminating due to java.lang.OutOfMemoryError: Java heap space
```

There is no `gc+heap` summary at exit beyond the last `Heap:` line; the final `used` is the
one to subtract from the boot footprint when back-computing `A`.

The heap dump is the point of the exercise. Collecting one and not analysing it wastes the
experiment: the OOM only tells you the budget was exceeded; the dump tells you by what. The
analysis itself is `heap-dump-analysis`; Epsilon adds nothing to it except a dump that
contains every object ever allocated in the window, garbage included — the dominator tree
answers "what is retained", the histogram answers "what was produced", and for an
allocation-rate question the histogram is the relevant one.

## The procedure, end to end

1. State the claim to be tested — "this hot path does not allocate", "this benchmark's
   variance is GC", "our allocation rate is X".
2. Compute the heap from `T_oom` for the experiment you are running, and write down the
   predicted time to OOM.
3. Run with `-XX:+HeapDumpOnOutOfMemoryError`, `-Xms` = `-Xmx`, `-XX:+AlwaysPreTouch`, and
   `-XX:-ExitOnOutOfMemoryError` if anything in-process must observe the error.
4. Compare the observed time to OOM against the prediction. A large shortfall is unaccounted
   allocation.
5. Analyse the dump. Identify the dominant object type, and the code that produces it.
6. Fix, then re-run the same Epsilon configuration. Surviving the window that previously
   OOMed is the acceptance criterion, and feeding the new time back through `T_oom` gives the
   corrected allocation rate.

A worked shape of that loop: a hot path asserted to be allocation-free OOMs after ~2 hours
under `-Xmx512m`. The dump is dominated by `String[]` — a `Map<String, Double>` of prices,
whose keys and autoboxed values produce objects on every tick, tens of thousands per second at
peak. Replacing it with a `HashMap<Long, long[]>` holding fixed-point integers, the same
configuration runs 8 hours without an OOM, and `T_oom` run backwards confirms the hot-path
allocation rate is now near zero.

Epsilon fixed nothing there. It made the symptom impossible to ignore, converting a debate
about where a GC pause was into a measurable fact about allocation.

## Boundaries

- Never a long-lived production service, unless the hot path is verified allocation-free or
  the process is recycled before `T_oom`. There is no third option; "GC-free performance" is
  an OOM with a countdown — and, by default, an exit with status 3 that no handler sees.
- Have an answer for what happens at `T_oom` before starting: recycle, alert, or "that is the
  expected result of the experiment".
- Epsilon says how much is allocated, never by whom. Attributing allocation to code is a
  profiling job (`allocation-profiling`).
- Epsilon has no barriers and no concurrent threads, so a benchmark under Epsilon measures
  the mutator alone. Its numbers do not transfer to a collector with a load barrier
  (Shenandoah, ZGC) or a card-marking store barrier (G1, Parallel, generational
  Shenandoah); the difference between the Epsilon run and the production-collector run is
  the collector's per-access cost plus its concurrent CPU, and that difference is the
  measurement, not a nuisance.
