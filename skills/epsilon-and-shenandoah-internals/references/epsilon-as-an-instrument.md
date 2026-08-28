# Epsilon as an instrument

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

## The arithmetic

```
T_oom = (Xmx − initial footprint) / A
```

`A` is the sustained allocation rate in bytes per second. The initial footprint is heap use at
boot — loaded classes, static structures — before the first byte of business data.

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
| Verifying an allocation-free path                                    | Deliberately tiny, e.g. `-Xmx64m`                       | The path OOMs immediately if it allocates at all. This is a correctness test, not a performance test         |

Practical sizing tip for the benchmark case: run once under a normal collector, observe the
real peak heap, add ~20% margin, and use that as Epsilon's `Xmx`.

```bash
# CLI or lambda
-XX:+UnlockExperimentalVMOptions -XX:+UseEpsilonGC -Xmx200m -Xms200m

# benchmark
-XX:+UnlockExperimentalVMOptions -XX:+UseEpsilonGC -Xmx4g -Xms4g

# allocation-free path verification
-XX:+UnlockExperimentalVMOptions -XX:+UseEpsilonGC -Xmx64m
```

## Instrumentation

Epsilon produces no collection log — there is nothing to collect — but it does expose TLAB
allocation and the final heap state at OOM:

```bash
-XX:+UnlockExperimentalVMOptions -XX:+UseEpsilonGC \
-Xlog:gc:file=epsilon.log:time,uptime \
-Xlog:gc+heap=debug \
-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/tmp/epsilon-oom.hprof
```

The heap dump is the point of the exercise. Collecting one and not analysing it wastes the
experiment: the OOM only tells you the budget was exceeded; the dump tells you by what.

Illustrative shape of the final line — capture the real format from your build before
publishing it as a reference:

```
[gc,heap] Epsilon Heap: 1024M reserved, 1024M committed, 1024M used
java.lang.OutOfMemoryError: Java heap space
```

## The procedure, end to end

1. State the claim to be tested — "this hot path does not allocate", "this benchmark's
   variance is GC", "our allocation rate is X".
2. Compute the heap from `T_oom` for the experiment you are running, and write down the
   predicted time to OOM.
3. Run with `-XX:+HeapDumpOnOutOfMemoryError`.
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
  an OOM with a countdown.
- Have an answer for what happens at `T_oom` before starting: recycle, alert, or "that is the
  expected result of the experiment".
- Epsilon says how much is allocated, never by whom. Attributing allocation to code is a
  profiling job.
