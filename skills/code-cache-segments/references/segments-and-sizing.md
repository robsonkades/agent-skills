# Segments, sizing and rebalancing

## The three CodeHeaps

| Segment                 | What it stores                                                                          | Share of the total, tiered compilation on |
| ----------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------- |
| `non-nmethods`          | Runtime stubs, interpreter dispatch tables, call adapters — code that is not an nmethod | Fixed, not proportional                   |
| `profiled nmethods`     | C1 **with** profiling: tiers 2 and 3                                                    | 50% of what remains                       |
| `non-profiled nmethods` | C1 **without** profiling (tier 1) **and** C2 (tier 4)                                   | 50% of what remains                       |

Every nmethod is a `CodeBlob`; not every `CodeBlob` is an nmethod. Each heap is a separate
contiguous native region with its own free-block allocator and its own ceiling, so one can be
exhausted while another is half empty.

Measured defaults on Temurin 25.0.3, useful as an arithmetic sanity check rather than as a
value to quote: `NonNMethodCodeHeapSize = 7,667,712`, `ProfiledCodeHeapSize =
NonProfiledCodeHeapSize = 122,028,032` each, summing exactly to `ReservedCodeCacheSize =
251,723,776`.

## Tier to CodeHeap

| Tier in `PrintCompilation` | Compiler           | Destination CodeHeap    |
| -------------------------- | ------------------ | ----------------------- |
| 1                          | C1, no profiling   | `non-profiled nmethods` |
| 2, 3                       | C1, with profiling | `profiled nmethods`     |
| 4                          | C2                 | `non-profiled nmethods` |

This turns the compilation log into a prediction. A workload dominated by tiers 2 and 3 —
warm-up, or high call-site churn — pressures `profiled` first. A stabilised workload with most
hot methods at tier 4 pressures `non-profiled`. A workload full of trivial methods inflates
`non-profiled` earlier than the intuition "profiled always comes first" suggests.

## The sum must fit

The four flags are not independent. At startup the JVM validates that the three heap sizes fit
inside the reserved total; if they do not, the process refuses to start, before any application
bytecode runs.

```bash
# WRONG: 100m + 200m of named heaps, but ReservedCodeCacheSize was left at its
# default (~240 MB). The sum exceeds the total. The JVM refuses to start.
java -XX:ProfiledCodeHeapSize=100m \
     -XX:NonProfiledCodeHeapSize=200m \
     -jar app.jar
```

```bash
# Correct: an explicit, consistent sum.
# Mostly-C2 workload, stable service, rare warm-up.
# 8m + 80m + 200m = 288m exactly.
java -XX:+SegmentedCodeCache \
     -XX:ReservedCodeCacheSize=288m \
     -XX:NonNMethodCodeHeapSize=8m \
     -XX:ProfiledCodeHeapSize=80m \
     -XX:NonProfiledCodeHeapSize=200m \
     -jar app.jar
```

A noisy failure mode, but one that has caused deploy incidents when the configuration was
first exercised directly in production.

## Raise the total, or change the split?

Measure under representative load, across at least one full warm-up window, before deciding.

| Sustained observation via `jcmd`                    | Action                                                                                                                                                     |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiled` persistently > 85%, `non-profiled` < 40% | High call-site churn or constant warm-up (frequent deploys, aggressive autoscaling). Consider `ProfiledCodeHeapSize` larger than `NonProfiledCodeHeapSize` |
| `non-profiled` persistently > 85%, `profiled` < 40% | Stable long-lived workload dominated by mature C2, or many trivial methods going straight to tier 1. Consider a larger `NonProfiledCodeHeapSize`           |
| Both below 60% even at peak                         | The default split is fine. Do not touch it                                                                                                                 |
| Both above 85% at once                              | Not an imbalance — insufficient total. Raise `ReservedCodeCacheSize` and keep the 50/50                                                                    |

The default action is to leave the three segment flags alone and move only
`ReservedCodeCacheSize`. Because the two large heaps split the remainder evenly, doubling the
total doubles both ceilings — which is why that fix works when the pressured segment is one of
them, and wastes half its effect when the asymmetry runs the other way. Manual rebalancing is
a second-line tool for persistent asymmetry; doing it before measuring is cargo cult tuning.

## Ergonomic de-segmentation

Below a certain `ReservedCodeCacheSize`, `SegmentedCodeCache` switches itself off — confirmed
at 8 MB. The total capacity may still be adequate for the load, but the three named heaps
disappear from every tool and the per-segment visibility goes with them. Reducing the reserved
size in a memory-constrained container is a legitimate decision; making it without declaring
`-XX:+SegmentedCodeCache` explicitly changes observable behaviour by accident.

## Flushing and the sweeper

`NMethodSweeper` runs periodically to promote `not_entrant` nmethods to `zombie` when safe, to
return `zombie` blocks to the free list, and — with `-XX:+UseCodeCacheFlushing`, the default,
as the cache approaches capacity — to proactively mark **cold** code `not_entrant` before the
space is actually needed. That third behaviour produces the thrashing pattern where usage
oscillates without settling, because the same code judged cold becomes hot again and is
recompiled.

Keep flushing on in production. Turn it off only in a controlled diagnostic environment where
the goal is to force `Code Cache is full. Compiler has been disabled.` deterministically.

## The nmethod lifecycle, and where the memory goes

```
interpreted
   → in_use (C1)              counters cross the tier 1-3 thresholds
   → in_use (C2)              still hot, recompiled at tier 4
   → not_entrant              deoptimisation: uncommon trap
   → in_use again             recompiled with an updated profile
   → zombie                   sweeper confirms no thread's PC is inside the old code
   → freed                    block returned to the CodeHeap free list
```

A `not_entrant` nmethod is not removed immediately: new calls no longer enter it, but threads
already inside run to their natural return. Only after the sweeper scans every thread stack
and confirms no program counter points into the block does it become `zombie`, and only a
`zombie` can be returned to the free list. Each such round trip leaves a gap whose size rarely
matches the next allocation — which is the bridge from frequent deoptimisation to
fragmentation.
