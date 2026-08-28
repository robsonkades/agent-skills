---
name: epsilon-and-shenandoah-internals
description: >
  Epsilon as a measurement instrument (isolating allocation cost, failing fast against an
  allocation budget, sizing from time-to-OOM) and Shenandoah internals (the load reference
  barrier, the concurrent phase sequence, generational mode and its card-table remembered
  set, the heuristics and their thresholds, and the degenerated-versus-full fallbacks). Use
  when a hot path is claimed to be allocation-free, when a benchmark's numbers are polluted
  by collection, when "Degenerated GC" appears in a Shenandoah log, when a Shenandoah
  comparison does not state its ShenandoahGCMode, when someone calls the LRB a read barrier
  or searches a flame graph for the wrong symbol, or when an Epsilon example omits
  -XX:+UnlockExperimentalVMOptions. Does not cover choosing between or operating the
  concurrent collectors (zgc-and-shenandoah), finding which code allocates
  (allocation-profiling), or establishing whether GC is the bottleneck at all
  (jvm-gc-tuning).
---

# Epsilon and Shenandoah Internals

## Purpose

Use Epsilon to turn an argument about allocation into a measurement, and reason about
Shenandoah from its actual mechanism — an unconditional barrier on every reference access, a
concurrent cycle with a finite time budget, and a generational mode that is product but not
default. Both are misused in the same way: Epsilon as a "GC-free performance mode", Shenandoah
as a collector whose only knob is heap size.

The failure this prevents is the conclusion drawn from the wrong configuration. A Shenandoah
throughput comparison that never named its mode compared the collector without the
generational hypothesis against ZGC, which has had it built in since JEP 490 — the result may
be an artefact of the omitted flag. And a service left on Epsilon because it "went faster in
the benchmark" is an out-of-memory error with a countdown on it.

## Workflow

1. **Decide what Epsilon is being asked to prove.** Isolating a benchmark from collection,
   verifying an allocation-free path, or making hidden allocation visible are three different
   experiments with three different heap sizes.
2. **Size Epsilon from the arithmetic, not by feel.**
   `T_oom = (Xmx − initial footprint) / allocation rate`, applied in either direction. See
   `references/epsilon-as-an-instrument.md`.
3. **Pair Epsilon with a heap dump on OOM** and actually analyse it — the dump is the answer,
   the OOM is only the alarm.
4. **For Shenandoah, confirm the effective mode before measuring anything.**
   `jcmd <pid> VM.flags -all | grep -i ShenandoahGCMode`. Product is not default.
5. **Check both heap constraints separately.** Capacity: `Xmx >= live set × ~2.5`. Time:
   `C_max = (InitFreeThreshold − MinFreeThreshold)% × Xmx / allocation rate`. A heap can
   satisfy one and violate the other.
6. **Classify a fallback before reacting to it.** Degenerated GC and full GC point at
   different causes and different fixes. See `references/shenandoah-internals.md`.
7. **Isolate barrier cost from concurrent work** with a CPU profile: time in barrier frames
   outside any `Concurrent` phase visible in the GC log is per-access cost, not concurrent
   work.

## Rules

- `-XX:+UnlockExperimentalVMOptions` is **always** required for Epsilon on JDK 25. Epsilon was
  never promoted to product — unlike ZGC and Shenandoah (both product in JDK 15, JEP 377 and
  JEP 379). Any document claiming the flag stopped being necessary at some version describes
  an event that never happened.
- Never run Epsilon in a long-lived service unless the hot path is verified — not assumed —
  allocation-free, or the process is recycled before `T_oom`. Otherwise it is an OOM on a
  timer.
- The Shenandoah barrier is the **Load Reference Barrier**, not a "read barrier". It runs on
  reference reads _and_ on both sides of a reference write. Calling it a read barrier leads to
  searching for the wrong symbol in a flame graph and to understating the measured overhead.
- The LRB is **unconditional**: it always dereferences the forwarding pointer, with or without
  an active GC cycle, and costs a fixed +8 bytes per object. ZGC's load barrier is conditional
  — a mask test that usually predicts correctly — and costs zero extra bytes per object. The
  shape of the cost differs, not just its size.
- Generational Shenandoah is **product in JDK 25 (JEP 521)**, experimental in JDK 24 (JEP 404),
  and **not the default**. `-XX:+UseShenandoahGC` alone still runs single-generation. A test
  "with generational Shenandoah" that did not pass `-XX:ShenandoahGCMode=generational` tested
  the other mode, and every conclusion drawn from it inherits that.
- Generational mode is **not** the default through JDK 27: `-XX:+UseShenandoahGC` alone
  still runs single-generation, so `-XX:ShenandoahGCMode=generational` remains required.
  **JEP 535 (Targeted, JDK 28)** makes it the default there — state which of the two a
  measurement used, because they are different collectors.
- Generational mode adds a **post-write barrier** feeding a card-table remembered set, on top
  of the LRB. The LRB cannot serve that purpose: it resolves forwarding on a read, and the
  old-to-young relation can only be captured when the reference is written.
- `ShenandoahInitFreeThreshold` defaults to **70**, not 35, and governs the trigger only during
  the learning phase (`ShenandoahLearningSteps`, default 5 cycles) of the `adaptive` heuristic.
  `ShenandoahMinFreeThreshold` (default 10) is the safety floor in every phase.
- For an allocation-spiky workload, **raise** `InitFreeThreshold` above the default. `C_max`
  grows with `IFT − MFT`; lowering it shrinks the very budget spikes consume.
- `ShenandoahGCMode=passive` **does** evacuate and compact — it removes all concurrency, not
  the relocation. It is a diagnostic mode for isolating barrier and concurrent-phase bugs, and
  never a production setting.
- `Degenerated GC` is not `Full GC`. Degenerated completes the already-started cycle in STW
  from where it stopped; full GC restarts collection from scratch over the whole heap.
  Recurring degenerated GC means the time budget is short; recurring full GC means
  fragmentation or capacity, which no threshold fixes.
- Enlarging the heap raises `C_max` linearly but does not reduce marking work per cycle:
  single-generation Shenandoah marks every live object, young or old, every cycle. For high
  young-allocation workloads, the generational mode attacks the cause; more heap only buys
  time.
- Treat every barrier symbol name as a starting point to confirm against the build in use.
  Aggressive inlining can hide the frame entirely in an optimised build.

## References

- [Epsilon as an instrument](references/epsilon-as-an-instrument.md) — the time-to-OOM
  arithmetic in both directions, the four legitimate uses with the heap size each implies, and
  the OOM-plus-heap-dump procedure that turns an allocation argument into evidence. Read
  before running Epsilon, and when sizing a heap for a benchmark or a short-lived process.
- [Shenandoah internals](references/shenandoah-internals.md) — the LRB in pseudocode with its
  cost profile, the phase sequence, generational mode and its remembered set, the heuristics
  table, the cycle-time budget formula worked through, and the flag set with real defaults.
  Read when a Shenandoah log shows a fallback, when choosing a heuristic or threshold, or when
  reasoning about barrier overhead.
