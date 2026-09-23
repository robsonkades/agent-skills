# Segments, sizing and rebalancing

Measured sizes below are from Windows x64 Temurin 25.0.3+9 (`-XX:+PrintFlagsFinal`,
`-Xlog:codecache`); the default sizing example uses `CICompilerCount=12`. Startup arithmetic
is checked against `jdk-25.0.3+9`, whose alignment logic differs from `jdk-25-ga`. Architecture,
page size and compiler count matter; confirm against the target runtime before a sizing change.

## The JDK 17-25 CodeHeaps

| Segment                 | What it stores                                                                                                            | Share of the total, tiered compilation on |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `non-nmethods`          | The template interpreter, runtime stubs, i2c/c2i adapters, method-handle intrinsics, and the compilers' own `BufferBlob`s | 5 MB + one buffer per compiler thread     |
| `profiled nmethods`     | C1 **with** profiling: tiers 2 and 3                                                                                      | 50% of what remains                       |
| `non-profiled nmethods` | C1 **without** profiling (tier 1), C2 (tier 4), and native wrappers (`CompLevel_none`)                                    | 50% of what remains                       |

Every nmethod is a `CodeBlob`; not every `CodeBlob` is an nmethod. In the JDK 25 baseline,
each heap is a separate contiguous native region with its own free-block allocator and its own ceiling, so one can be
exhausted while another is half empty. `initialize_heaps` lays them out in the order
`profiled`, `non-nmethods`, `non-profiled` in one reservation, which is why `bounds` in
`Compiler.codecache` are adjacent.

The `non-nmethods` heap is the one people forget is shared with the compilers: C1 and C2
allocate their working `CodeBuffer` there for every compilation in flight. That is why its
default is not a constant.

## Where the defaults come from

| Flag                      | 25.0.3 default                             | Source of the value                                                                                                                                                                     |
| ------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ReservedCodeCacheSize`   | 240 MB (`251,723,776` after alignment)     | 48 MB `pd` default × 5 under tiered compilation, capped at `CODE_CACHE_DEFAULT_LIMIT` (`compilerDefinitions.cpp`). `-XX:-TieredCompilation` or `TieredStopAtLevel=1` leaves it at 48 MB |
| `SegmentedCodeCache`      | `true` (ergonomic)                         | Enabled only when `ReservedCodeCacheSize >= 240*M` and tiered compilation is on. `239m` → `false`; `240m` → `true`                                                                      |
| `NonNMethodCodeHeapSize`  | `7,667,712` with `CICompilerCount=12`      | 5 MB + `c1_count × Compiler::code_buffer_size() + c2_count × C2Compiler::initial_code_buffer_size()`. With `CICompilerCount=2` it is `5,832,704`                                        |
| `ProfiledCodeHeapSize`    | `122,028,032`                              | `(cache_size - non_nmethod) / 2`                                                                                                                                                        |
| `NonProfiledCodeHeapSize` | `122,028,032` (`121,962,496` with `=240m`) | Equal initial remainder share; alignment and the explicit total cap can reduce unset nmethod heaps                                                                                      |
| `InitialCodeCacheSize`    | `2,555,904`                                | Floor for `ReservedCodeCacheSize`: `Invalid ReservedCodeCacheSize: 1024K. Must be at least InitialCodeCacheSize=2496K.`                                                                 |
| `CodeCacheExpansionSize`  | 64 KB                                      | The step in which each heap commits memory as `used` grows                                                                                                                              |
| Upper bound               | 2048 MB                                    | `Invalid ReservedCodeCacheSize=3000M. Must be at most 2048M.` — compiled code reaches other code with 32-bit relative branches                                                          |

Two consequences worth stating. `CICompilerCount` is ergonomic from the CPU count, so a
container with a 1–2 CPU quota gets a `non-nmethods` heap roughly 2 MB smaller than the same
image on a 16-core host — `container-awareness` covers where the count comes from. And the
`-XX:ReservedCodeCacheSize=128m` that appears in so many container baselines is below 240 MB:
it does not merely shrink the cache, it removes the segments.

## Tier to CodeHeap

| Tier in `PrintCompilation` | Compiler           | Destination CodeHeap    |
| -------------------------- | ------------------ | ----------------------- |
| 1                          | C1, no profiling   | `non-profiled nmethods` |
| 2, 3                       | C1, with profiling | `profiled nmethods`     |
| 4                          | C2                 | `non-profiled nmethods` |
| native wrapper             | —                  | `non-profiled nmethods` |

The mapping is `CodeCache::get_code_blob_type(int comp_level)` in `codeCache.hpp`. It turns
the compilation log into a prediction. A workload dominated by tiers 2 and 3 — warm-up, or
high call-site churn — pressures `profiled` first. A stabilised workload with most hot methods
at tier 4 pressures `non-profiled`. A workload full of trivial methods inflates `non-profiled`
earlier than the intuition "profiled always comes first" suggests.

## The allocation fallback

A full heap does not refuse the allocation. `CodeCache::allocate` (`codeCache.cpp`) first
tries to expand the heap by `CodeCacheExpansionSize`; when that fails and the cache is
segmented it retries in another heap:

```
NonNMethod  → MethodNonProfiled → MethodProfiled
MethodProfiled → MethodNonProfiled
```

Only when the fallback heap is full as well does it call
`CompileBroker::handle_full_code_cache` with the **original** type, which is what the warning
and the JFR `jdk.CodeCacheFull` event name. The design consequences:

- A `profiled` heap pinned at 100% while `non-profiled` keeps climbing is consistent with
  spill, but normal tier-1/C2 growth can produce the same aggregate pattern. Confirm allocation
  fallback before attributing the growth to it. Profiled code often has a shorter lifetime;
  mixing it with longer-lived code can increase fragmentation risk, not guarantee a failure.
- A full `non-nmethods` heap can spill adapters and compiler buffers into `non-profiled`,
  then `profiled` when available. These allocations compete with compiled methods for space;
  if the entire applicable fallback path fails, an adapter allocation failure surfaces in an
  application thread as `OutOfMemoryError: Out of space in CodeCache for adapters`
  (`Method::make_adapters`, `method.cpp`).
- A full warning means the requested allocation could not be satisfied after the applicable
  fallback/expansion path. Free space need not be near zero: fragmented blocks or inability
  to commit additional memory can also prevent allocation. Correlate requested size,
  largest usable block, heap commitment and JVM/OS errors before calling it total exhaustion.
- On a **debug build**, `-XX:+PrintCodeCacheExtension` prints `Extension of CodeHeap '…'
failed. Trying to allocate in CodeHeap '…'.` when trying another heap. It is a `develop`
  flag: a product JVM rejects it, including with diagnostic unlocks. The message proves
  a fallback attempt, not that the destination allocation succeeded. On a product JVM,
  correlate per-heap composition and tier history; retain spill as a hypothesis if those
  observations cannot distinguish it from normal growth.

## Sizing arithmetic: what the JVM does with a partial configuration

`initialize_heaps` distinguishes flags set **on the command line** (`FLAG_IS_CMDLINE`) from
defaults, and the outcome depends on which combination was given. Verified on 25.0.3:

On 25.0.3+9, enabled heap sizes are rounded **up** to the required alignment. An implicit
reserved total can grow to their aligned sum. With an explicit total, HotSpot first tries
to shrink unset nmethod heaps in alignment-sized steps, respecting their minima; it does
not shrink the non-nmethod heap in this adjustment. Remaining mismatch is rejected.
Thus raw flag values summing exactly is insufficient when they are not suitably aligned.
The JDK 25 GA `align_down` explanation does not describe this update's algorithm.

| Given on the command line                                                  | Outcome                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nothing                                                                    | 240 MB, split as above                                                                                                                                                                                                  |
| `ProfiledCodeHeapSize=150m` only                                           | `non-profiled` becomes the remainder: `86,769,664`. Total unchanged                                                                                                                                                     |
| `ProfiledCodeHeapSize=100m NonProfiledCodeHeapSize=200m`, no reserved size | **Starts.** `non-nmethods` drops to its minimum (`2,818,048`), and `ReservedCodeCacheSize` is raised to the sum: `317,390,848`. `-Xlog:codecache=info` says `ReservedCodeCache size … changed to total segments size …` |
| The same two plus `ReservedCodeCacheSize=240m`                             | Refused: `Invalid code heap sizes: NonNMethodCodeHeapSize (2752K) + ProfiledCodeHeapSize (102400K) + NonProfiledCodeHeapSize (204800K) = 309952K is greater than ReservedCodeCacheSize (245760K).`                      |
| Three heaps summing to **less** than an explicit `ReservedCodeCacheSize`   | Refused with the same message ending `is less than ReservedCodeCacheSize` (`codeCache.cpp`)                                                                                                                             |
| `NonNMethodCodeHeapSize=1m`                                                | Refused: `Not enough space in non-nmethod code heap to run VM: 1024K < 2704K` — the minimum is `CodeCacheMinimumUseSpace` plus the compiler buffers, so it too moves with `CICompilerCount`                             |
| `-XX:+SegmentedCodeCache -XX:ReservedCodeCacheSize=20m`                    | Starts segmented: `7,667,712` / `6,684,672` / `6,619,136`. Segmentation below 240 MB is allowed, just never chosen ergonomically                                                                                        |

So the rule "the sum must fit or the JVM will not start" holds **only when `ReservedCodeCacheSize`
is explicit**. The safe form is to state all four and make them sum exactly; the trap is a
platform baseline that already sets `ReservedCodeCacheSize`, plus a team adding one heap flag
on top — the JVM then takes the remainder for the other heap, which may be far smaller than
anyone intended.

```bash
# Explicit, consistent, and readable in a review.
# Mostly-C2 workload, stable service, rare warm-up: 8m + 80m + 200m = 288m exactly.
java -XX:+SegmentedCodeCache \
     -XX:ReservedCodeCacheSize=288m \
     -XX:NonNMethodCodeHeapSize=8m \
     -XX:ProfiledCodeHeapSize=80m \
     -XX:NonProfiledCodeHeapSize=200m \
     -jar app.jar
```

Verified to start with exactly those values (`8,388,608` / `83,886,080` / `209,715,200`,
`ReservedCodeCacheSize = 301,989,888`).

## Raise the total, or change the split?

Measure under representative load, across at least one full warm-up window, before deciding.
Because of the fallback, "one heap high" reads as "one heap pinned at 100% and the other
climbing faster than its own tier mix explains".

| Sustained observation via `jcmd`                                                                   | Action                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiled` pinned at ~100%, `non-profiled` < 40% and rising                                        | High call-site churn or constant warm-up (frequent deploys, aggressive autoscaling, class generation at runtime). Consider `ProfiledCodeHeapSize` larger than `NonProfiledCodeHeapSize`                     |
| `non-profiled` pinned at ~100%, `profiled` < 40% and rising                                        | Stable long-lived workload dominated by mature C2, or many trivial methods going straight to tier 1. Consider a larger `NonProfiledCodeHeapSize`; cross-check `deoptimization` churn first                  |
| Both have stable headroom across the full warm-up/restart envelope, no material code-cache GC cost | Keep the default split; numeric alert thresholds belong to the workload, not this skill                                                                                                                     |
| Both approach their ceilings, or code-cache-triggered collections consume material SLO budget      | Increase total only after confirming compilation/class-generation demand is expected; preserve the measured split initially                                                                                 |
| `non-nmethods` grows toward exhaustion                                                             | Inspect blob composition and compiler concurrency; raise it only when expected peak plus margin cannot fit. Its ergonomic value includes compiler buffers but workload-generated stubs/adapters also matter |

When total nmethod capacity is the demonstrated constraint, first consider leaving the
segment flags alone and changing `ReservedCodeCacheSize`. The two large heaps share the
remainder after `non-nmethods`, so an increase benefits both; it does not target one heap
or proportionally enlarge `non-nmethods`. Manual rebalancing is a second-line tool for
persistent asymmetry. Keep the current sizes when the evidence does not support a change.

Increasing `ReservedCodeCacheSize` immediately increases reserved virtual address space, not
necessarily committed or resident memory. Heaps commit as they expand, so a larger ceiling can
permit more committed code over time; NMT `Code`, code-cache usage and RSS answer different
questions. The GC triggers in `unloading-and-gc.md` are ratios of total capacity, so a larger
cache can also change unloading cadence and retained cold code. The flag is startup-only.

## Ergonomic de-segmentation

`SegmentedCodeCache` is `false` by default and is set to `true` by ergonomics only when
tiered compilation is on and `ReservedCodeCacheSize >= 240 MB` (`compilerDefinitions.cpp`,
with a comment that segmentation defeats huge pages on small caches). Three ways to lose it:

- Any explicit `ReservedCodeCacheSize` under 240 MB. The total capacity may still be adequate
  for the load, but the three named heaps disappear from every tool and the per-segment
  visibility goes with them. Reducing the reserved size in a memory-constrained container is a
  legitimate decision; making it without declaring `-XX:+SegmentedCodeCache` explicitly changes
  observable behaviour by accident.
- `-XX:-TieredCompilation` or `-XX:TieredStopAtLevel=1`: the default drops to 48 MB, so
  segmentation is off; with `-XX:+SegmentedCodeCache` forced, `heap_available` still refuses to
  create `profiled nmethods` (no C1 profiling exists) and folds its size into `non-profiled`,
  so only two heaps appear. That is correct, not a misconfiguration.
- `-Xint`: `SegmentedCodeCache has no meaningful effect with -Xint` and it is reset.

The `jdk.CodeCacheConfiguration` JFR event records the sizes the JVM actually
settled on — `profiledSize = 0` is not unique to one mode: inspect segmentation and profiling
flags, including C1-only level 1 or C2-only execution, and confirm the actual heap lines.

This description is deliberately version-scoped. Do not infer that every later HotSpot must
have exactly these three named heaps: inspect the target release's flags, source and diagnostic
output before applying JDK 25 arithmetic.

## Flushing, unloading and the nmethod lifecycle

Everything that used to be the sweeper is in [`unloading-and-gc.md`](unloading-and-gc.md):
there is no `NMethodSweeper`, no `zombie` state and no periodic thread on JDK 20+. A
`not_entrant` nmethod is reclaimed by the next GC that finds no frame inside it, and the code
cache asks for that GC itself when allocation crosses a threshold. The flags named `Sweep*`
survive with new meanings, listed there.

## Authoritative sources

- [JEP 197: Segmented Code Cache](https://openjdk.org/jeps/197)
- [JDK 25.0.3+9 HotSpot `codeCache.cpp`: alignment and fallback](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/code/codeCache.cpp)
- [JDK 17.0.15+6 HotSpot `codeCache.cpp`: existing fallback](https://github.com/openjdk/jdk17u/blob/jdk-17.0.15%2B6/src/hotspot/share/code/codeCache.cpp)
- [JDK 25.0.3+9 `globals.hpp`: debug-only extension logging](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/runtime/globals.hpp)
- [JDK 25 HotSpot `compilerDefinitions.cpp`](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/compiler/compilerDefinitions.cpp)
- [JDK 25 `java` launcher documentation](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html)
