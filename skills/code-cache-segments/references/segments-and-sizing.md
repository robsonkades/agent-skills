# Segments, sizing and rebalancing

Every number here was read off Temurin 25.0.3 (`-XX:+PrintFlagsFinal`, `-Xlog:codecache`)
or off `codeCache.cpp` / `compilerDefinitions.cpp` at the `jdk-25-ga` tag. Confirm against
the runtime you are reasoning about before it becomes a production decision.

## The three CodeHeaps

| Segment                 | What it stores                                                                                                            | Share of the total, tiered compilation on |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `non-nmethods`          | The template interpreter, runtime stubs, i2c/c2i adapters, method-handle intrinsics, and the compilers' own `BufferBlob`s | 5 MB + one buffer per compiler thread     |
| `profiled nmethods`     | C1 **with** profiling: tiers 2 and 3                                                                                      | 50% of what remains                       |
| `non-profiled nmethods` | C1 **without** profiling (tier 1), C2 (tier 4), and native wrappers (`CompLevel_none`)                                    | 50% of what remains                       |

Every nmethod is a `CodeBlob`; not every `CodeBlob` is an nmethod. Each heap is a separate
contiguous native region with its own free-block allocator and its own ceiling, so one can be
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
| `NonProfiledCodeHeapSize` | `122,028,032` (`121,962,496` with `=240m`) | Same, plus whatever the other two lose to `align_down`                                                                                                                                  |
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

- A `profiled` heap pinned at 100% while `non-profiled` keeps climbing is the signature of the
  spill: tier-3 code — short-lived by design, replaced by tier 4 within seconds — is now
  interleaved with C2 code in the heap JEP 197 created to keep it out of. That reintroduces
  exactly the fragmentation segmentation was meant to prevent, and it is invisible to a
  dashboard that sums the heaps.
- A full `non-nmethods` heap spills adapters and compiler buffers into `non-profiled`. That
  heap is then competing with C2 for space, and if it too is full the failure surfaces in an
  application thread as `OutOfMemoryError: Out of space in CodeCache for adapters`
  (`Method::make_adapters`, `method.cpp`).
- "Compiler has been disabled" therefore means **two** heaps were full for that request type,
  not one. Reading `Compiler.codecache` after the warning shows both at `free=0Kb`–`4Kb`.
- `-XX:+PrintCodeCacheExtension` prints `Extension of CodeHeap '…' failed. Trying to allocate
in CodeHeap '…'.` on every spill — a lab-only flag, but the direct proof.

## Sizing arithmetic: what the JVM does with a partial configuration

`initialize_heaps` distinguishes flags set **on the command line** (`FLAG_IS_CMDLINE`) from
defaults, and the outcome depends on which combination was given. Verified on 25.0.3:

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

| Sustained observation via `jcmd`                             | Action                                                                                                                                                                                              |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiled` pinned at ~100%, `non-profiled` < 40% and rising  | High call-site churn or constant warm-up (frequent deploys, aggressive autoscaling, class generation at runtime). Consider `ProfiledCodeHeapSize` larger than `NonProfiledCodeHeapSize`             |
| `non-profiled` pinned at ~100%, `profiled` < 40% and rising  | Stable long-lived workload dominated by mature C2, or many trivial methods going straight to tier 1. Consider a larger `NonProfiledCodeHeapSize`; cross-check `deoptimization` churn first          |
| Both below 60% even at peak, no `CodeCache GC` causes        | The default split is fine. Do not touch it                                                                                                                                                          |
| Both above 85% at once, or `CodeCache GC Threshold` frequent | Not an imbalance — insufficient total. Raise `ReservedCodeCacheSize` and keep the 50/50. Under Serial/Parallel this also removes Full GCs (`unloading-and-gc.md`)                                   |
| `non-nmethods` above 80%                                     | Raise `NonNMethodCodeHeapSize` explicitly. It does not scale with the total; only with compiler threads. Check `CICompilerCount` and whether a `MethodHandle`-heavy framework mints many intrinsics |

The default action is to leave the three segment flags alone and move only
`ReservedCodeCacheSize`. Because the two large heaps split the remainder evenly, doubling the
total doubles both ceilings — which is why that fix works when the pressured segment is one of
them, and wastes half its effect when the asymmetry runs the other way. Manual rebalancing is
a second-line tool for persistent asymmetry; doing it before measuring is cargo cult tuning.

A larger `ReservedCodeCacheSize` costs address space, not RAM: committed memory follows `used`
in 64 KB steps (NMT `Code` category showed `reserved=248330KB, committed=8650KB` for an idle
default JVM). What it does cost is unloading latency — the GC triggers in
`unloading-and-gc.md` are percentages of the total, so a bigger cache lets more dead code
accumulate between cycles. Restarting the JVM is the only way to change it.

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

The `jdk.CodeCacheConfiguration` JFR event (once per chunk) records the sizes the JVM actually
settled on — `profiledSize = 0` is the fingerprint of an unsegmented or C1-only cache.

## Flushing, unloading and the nmethod lifecycle

Everything that used to be the sweeper is in [`unloading-and-gc.md`](unloading-and-gc.md):
there is no `NMethodSweeper`, no `zombie` state and no periodic thread on JDK 20+. A
`not_entrant` nmethod is reclaimed by the next GC that finds no frame inside it, and the code
cache asks for that GC itself when allocation crosses a threshold. The flags named `Sweep*`
survive with new meanings, listed there.
