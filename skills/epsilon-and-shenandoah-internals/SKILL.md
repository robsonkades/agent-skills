---
name: epsilon-and-shenandoah-internals
description: >
  Epsilon as a measurement instrument (isolating allocation cost, failing fast against an
  allocation budget, sizing from time-to-OOM) and Shenandoah internals (the load reference
  barrier, the concurrent phase sequence, generational mode and its card-table remembered
  set, the heuristics and their thresholds, pacing, and the degenerated-versus-full
  fallbacks). Use when a hot path is claimed to be allocation-free, when benchmark numbers
  are polluted by collection, when an Epsilon catch block never runs, when "Degenerated GC"
  appears in a Shenandoah log, when Shenandoah latency rises with no pause in the log, when a
  Shenandoah comparison does not state its ShenandoahGCMode, when the LRB is called a read
  barrier or charged 8 bytes per object, or when an Epsilon example omits
  -XX:+UnlockExperimentalVMOptions. Does not cover choosing between or operating the
  concurrent collectors (zgc-and-shenandoah), finding which code allocates
  (allocation-profiling), or establishing whether GC is the bottleneck (jvm-gc-tuning).
---

# Epsilon and Shenandoah Internals

## Purpose

Use Epsilon to turn an argument about allocation into a measurement, and reason about
Shenandoah from its actual mechanism — a conditional load barrier whose slow path copies
objects in the application thread, a concurrent cycle with a finite time budget, a pacer that
stalls allocating threads before anything appears as a pause, and a generational mode that is
product but not default. Both are misused in the same way: Epsilon as a "GC-free performance
mode", Shenandoah as a collector whose only knob is heap size.

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
3. **Pair Epsilon with allocation evidence and, when useful, a heap dump on OOM.** Because
   Epsilon never reclaims, the dump contains all still represented allocations—not just objects
   a real collector would retain—and lacks allocation stacks. Use it for class/graph clues, then
   attribute sites with JFR/async-profiler. Reserve disk/native headroom for dump creation. For an
   allocation-free claim, read the post-warm-up slope rather than the mere OOM.
4. **For Shenandoah, confirm the build and the effective mode before measuring anything.**
   `java -XX:+UseShenandoahGC -version` (Oracle JDK builds have no Shenandoah), then
   `-Xlog:gc+init` for `Mode:` and `Heuristics:`, or `jcmd <pid> VM.flags -all | grep -E
"ShenandoahGCMode|ShenandoahGCHeuristics"`. Product is not default.
5. **Check the time constraint and the capacity constraint separately.** Time:
   `C_max = (InitFreeThreshold − MinFreeThreshold)% × Xmx / allocation rate` during learning,
   then the adaptive rate trigger. Capacity: `Max Evacuation` and `available` in the
   `gc+ergo` lines. A heap can satisfy one and violate the other.
6. **Look for pacing before looking for pauses.** `-Xlog:gc+stats` → `Allocation pacing
accrued` per thread. Latency that rises with no pause in the log is usually there.
7. **Classify a fallback before reacting to it.** The degeneration point (`Mark`,
   `Evacuation`, `Update Refs`, `Roots`, `Outside of Cycle`) and `Good/Bad progress` name
   the cause; degenerated and full GC have different fixes.
   See `references/shenandoah-log-and-troubleshooting.md`.
8. **Isolate barrier cost from concurrent work** with a CPU profile: the slow path is the
   `ShenandoahRuntime::load_reference_barrier_*` frames in application threads; the fast
   path has no frame and is measured as a diff against a barrier-free run.

## Rules

- `-XX:+UnlockExperimentalVMOptions` is **always** required for Epsilon on JDK 25, and must
  precede `-XX:+UseEpsilonGC`. Epsilon was never promoted to product — unlike ZGC and
  Shenandoah (both product in JDK 15, JEP 377 and JEP 379). Any document claiming the flag
  stopped being necessary describes an event that never happened.
- **Epsilon exits the process on OOM.** It sets `ExitOnOutOfMemoryError=true` by default:
  the JVM prints `Terminating due to java.lang.OutOfMemoryError` and exits with status 3; no
  `catch`, `finally` or shutdown hook runs (verified on 25.0.3). Pass
  `-XX:-ExitOnOutOfMemoryError` when something in-process must observe the error. The heap
  dump is written before the exit.
- Never run Epsilon in a long-lived service unless the hot path is verified — not assumed —
  allocation-free, or the process is recycled before `T_oom`. Otherwise it is an OOM on a
  timer.
- The Shenandoah barrier is the **Load Reference Barrier**: a load barrier, on reference
  loads. Since JDK 13 (JDK-8221766) it is **conditional** — a thread-local `gc_state` test,
  then a collection-set test, then a slow path that resolves or **copies the object in the
  application thread** and heals the slot. Writes carry the SATB pre-write barrier during
  marking and, in generational mode, a card mark. Calling it a read barrier finds the wrong
  symbol; calling it unconditional overstates its idle cost and misses where its real cost
  lands (mutator evacuation during `Concurrent evacuation`).
- Shenandoah has **no per-object forwarding word** since JDK 13 (JDK-8224584): forwarding
  lives in the mark word. Verified on 25.0.3: `java.lang.Object` is 16 bytes under
  Shenandoah and G1 alike, 8 with `-XX:+UseCompactObjectHeaders`. A footprint model charging
  Shenandoah 8 bytes per object is a JDK 12 model. Compressed oops work; ZGC's do not.
- Generational Shenandoah is **product in JDK 25 (JEP 521)**, experimental in JDK 24 (JEP
  404), and **not the default**: `-XX:+UseShenandoahGC` alone runs `satb` (verified). JEP
  draft `8379682` proposes making it the default and deprecating `satb`, but as of 2026-09-03 it
  is unnumbered, Draft and has no target release. State the effective mode from the runtime;
  never infer it from a future proposal.
- Generational mode adds a **post-write barrier** feeding a card-table remembered set
  (512-byte cards), on top of the LRB. The LRB cannot serve that purpose: the old-to-young
  relation can only be captured when the reference is written.
- `ShenandoahInitFreeThreshold` (70), `ShenandoahMinFreeThreshold` (10),
  `ShenandoahLearningSteps` (5) and every other threshold are **experimental flags**: without
  `-XX:+UnlockExperimentalVMOptions` before them the JVM refuses to start (verified).
  `InitFreeThreshold` governs the learning phase only — at start-up and again after every
  degenerated or full GC; `MinFreeThreshold` is the floor in every phase.
- During learning/relearning, raising `InitFreeThreshold` starts earlier and grows the simple
  headroom term `IFT − MFT`; it can also spend more concurrent CPU and is not the adaptive
  steady-state control. Change it only when logs show learning-phase/spike degeneration, then
  validate pacing, CPU, cycle interval and fallback rate. Lowering it reduces that headroom.
- **The pacer is on by default** (`ShenandoahPacing=true`) and stalls allocating threads up
  to `ShenandoahPacingMaxDelay` (10 ms) per episode before the collector degenerates. It
  shows up nowhere in `-Xlog:gc`; only `-Xlog:gc+stats` reports it. Verified: 51% of a
  thread's time paced with zero degenerated cycles in the log.
- `ShenandoahGCMode=passive` and `ShenandoahGCHeuristics=aggressive` are **diagnostic** and
  need `-XX:+UnlockDiagnosticVMOptions` (verified). `passive` disables every barrier and
  every heuristic: the log holds only `Pause Degenerated GC (Outside of Cycle)` and
  `Pause Full`, each on an allocation failure. It does evacuate and compact. Never a
  production setting.
- `Degenerated GC` is not `Full GC`. `(Mark)`, `(Evacuation)`, `(Update Refs)` resume the
  running cycle in STW from that phase; `(Outside of Cycle)` runs a whole cycle STW; `Bad
progress` upgrades to full GC (immediately in `satb`, after two in generational), as do
  three back-to-back degenerations (`ShenandoahFullGCThreshold`). Recurring degenerated GC
  means the time budget is short; recurring full GC means fragmentation or capacity, which no
  threshold fixes.
- `System.gc()` under Shenandoah starts a **concurrent** cycle: the collector sets
  `ExplicitGCInvokesConcurrent=true` (verified). A library that "forces a full GC" does not.
- Enlarging the heap raises `C_max` linearly but does not reduce marking work per cycle:
  single-generation Shenandoah marks every live object, young or old, every cycle. For high
  young-allocation workloads, the generational mode attacks the cause; more heap only buys
  time.
- Treat every barrier symbol name as a starting point to confirm against the build in use.
  `ShenandoahBarrierSet::need_load_reference_barrier` is a compile-time predicate and never
  appears on a mutator stack; the runtime frames are `ShenandoahRuntime::*`.

## Production and security constraints

- Epsilon is an experiment with a calculated memory and time envelope. Run it in an isolated
  canary/job with container and native-memory headroom; an automatic OOM dump can prolong failure,
  consume disk and contain secrets.
- GC/JFR logs and dumps are production data. Restrict attach/read access, encrypt storage,
  minimize retention and sanitize thread/object fields before sharing.
- A collector comparison must pin JDK update/vendor/build, collector mode, heap/container limits,
  load and warm-up, and report application CPU/throughput/tail latency plus pacing/fallbacks.

## References

- [Epsilon as an instrument](references/epsilon-as-an-instrument.md) — the time-to-OOM
  arithmetic in both directions, the exit-on-OOM default and lazy commit, the four legitimate
  uses with the heap size each implies, the two-phase allocation-free test, the verified log
  format, and the OOM-plus-heap-dump procedure. Read before running Epsilon, and when sizing
  a heap for a benchmark or a short-lived process.
- [Shenandoah internals](references/shenandoah-internals.md) — the LRB as it is on JDK 25
  with the frames that are and are not the barrier, the cost shape against ZGC, the phase
  sequence, generational mode and its remembered set, the trigger order of the adaptive
  heuristic, the budget formula worked through, the pacer, every mode and heuristic with its
  unlock requirement, the flag table with kinds, and the fallback matrix. Read when choosing
  a mode, a heuristic or a threshold, or when reasoning about barrier overhead.
- [Log and troubleshooting](references/shenandoah-log-and-troubleshooting.md) — the JDK 25
  log lines for start-up, triggers, a single-generation cycle, a generational cycle, the
  fallbacks and the pacing report; the jcmd and JFR surfaces; the symptom table; and the
  source file index. Read when a Shenandoah log shows a fallback, when latency rose without a
  pause, or before writing a parser or an incident write-up.
