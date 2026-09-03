---
name: zgc-and-shenandoah
description: >
  Operating ZGC and Shenandoah in production: concurrent relocation via coloured pointers
  and load barriers, the CPU the concurrent phases actually take, allocation stalls, and
  which flags still exist. Use when a service migrated to a concurrent collector and
  throughput dropped, when a GC log shows "Allocation Stall", when a pod of 1-2 CPUs runs
  ZGC or Shenandoah, when a config still carries -XX:+ZGenerational or G1 flags after the
  migration, when a ZGC-versus-Shenandoah comparison does not declare ShenandoahGCMode, or
  when RSS from ps/top is being used to size a ZGC container. Does not cover deciding
  whether GC is the bottleneck or which collector to pick (jvm-gc-tuning), the introductory
  collector model (gc-fundamentals), or collector source-level internals
  (zgc-generational-internals, epsilon-and-shenandoah-internals).
---

# ZGC and Shenandoah

## Purpose

Run a concurrent collector with its real cost budgeted. Short pauses are not zero cost: work
moves into concurrent phases, barriers and metadata, with collector/application CPU and
memory-bandwidth contention that a pause histogram does not quantify. Barrier shape and when
its slow path runs differ by collector, generation and cycle state.

The failure this prevents is the migration that meets its p99 target and is then reverted,
because the CPU and heap headroom the concurrent phases need were never budgeted, or because
the pod had no spare cores to pay for them in the first place.

## Workflow

1. **Separate the three cost axes before reading any number.** STW pause, concurrent work
   (CPU while the application runs), and per-access barrier overhead. Conflating them is the
   most common source of a wrong conclusion about these collectors.
2. **Check effective CPU quota, throttling and topology in the target environment.** Small
   quotas increase contention, but no core-count threshold selects a collector. Compare
   throughput and tail latency under the actual quota and overload policy.
3. **Declare the mode explicitly.** ZGC has exactly one mode since JDK 24 and needs only
   `-XX:+UseZGC`. Shenandoah still defaults to single-generation; generational is opt-in via
   `-XX:ShenandoahGCMode=generational`. Confirm what is actually active with startup
   `gc+init` logs and `jcmd <pid> VM.flags -all`; plain `VM.flags` can omit defaults.
4. **Audit every carried flag.** G1-specific flags may remain accepted yet be inert under
   another collector, while global flags can still apply. Prove effective relevance from
   startup logs/flag metadata and remove only with a before/after launch and workload check.
5. **Capture logs per cycle/generation (where applicable) and phase** with
   `-Xlog:gc*,gc+phases=debug`, and read
   pauses separately from concurrent phase durations. See
   `references/reading-concurrent-gc-logs.md`.
6. **Treat allocation stalls/failures as capacity evidence, then classify why.** Heap/live-set
   headroom, allocation spikes, concurrent-worker CPU, cycle-start prediction, fragmentation,
   large allocations and collector fallback paths imply different remedies.
7. **Budget CPU, memory bandwidth and heap/native headroom before migration.** Verify cgroup
   charge/RSS, not merely `-Xmx`, and preserve room for allocation while relocation completes.

## Rules

- Activate ZGC with `-XX:+UseZGC` alone. `-XX:+ZGenerational` is obsolete since JDK 24 —
  accepted on the command line, no effect, because the only mode that exists is already
  generational. Prescribing it looks like configuration and changes nothing.
- ZGC is generational **by definition** on JDK 24+. JEP 474 made it the default in JDK 23;
  JEP 490 deleted the non-generational code in JDK 24. There is no mode to turn off.
- Shenandoah generational is _product_ in JDK 25 (JEP 521, experimental in JDK 24 under JEP 404) but is **not** the default. `-XX:+UseShenandoahGC` on its own still selects
  single-generation. "Product" is not "default".
- Reject any ZGC-versus-Shenandoah comparison that does not state `ShenandoahGCMode`. By
  omission it pits Shenandoah's default single-generation mode against ZGC's only mode,
  which is generational — structurally unbalanced on any metric sensitive to the
  generational hypothesis.
- Shenandoah's load-reference barrier resolves forwarded references; its fast/slow paths and
  barrier set depend on mode and GC state. ZGC uses colored pointers and load/store barriers.
  Avoid universal branch/cycle claims: inspect generated code/profiles on the target build.
- Classic Shenandoah layouts reserve forwarding metadata per object in the heap. Quantify the
  effective heap/live-set cost from collector accounting and the target object mix; JOL's
  ordinary shallow instance size need not include collector-private allocation overhead.
- ZGC generational adds a **store barrier** on top of the load barrier, to maintain
  per-page remembered sets for old→young references. That is real extra per-access cost
  traded for young-allocation throughput.
- Do not size a ZGC container from one `ps`/`top` RSS sample or from folklore about legacy
  heap multi-mapping. Multi-mapping history is not the same change as JEP 490's JDK 24 removal
  of non-generational ZGC. Reconcile target-build RSS/PSS, cgroup `memory.current`, heap
  committed/used and native domains over time.
- Prefer ergonomics first for ZGC, then tune only a measured constraint. Heap/soft max,
  `ConcGCThreads`, CPU quota and allocation spikes interact; a copied knob can trade mutator
  CPU for fewer stalls or merely hide a capacity defect.
- Use an arrival model that represents production and correct coordinated omission when
  relevant. Report throughput, offered/achieved load, CPU throttling, allocation rate,
  pause/stall distributions and p50/p99/p99.9/max. A JMH comparison can expose workload cost
  but cannot isolate “barrier overhead” merely by changing collectors.

## Production acceptance

- Exercise steady state, burst, live-set growth, large allocation, redeploy and CPU-throttle
  scenarios; verify no ZGC allocation stalls or Shenandoah pacing/degeneration/full fallback.
- Compare equivalent collector modes and effective flags on the same JDK build/quota; include
  warm-up and confidence/repetition rather than a single run.
- Set rollback on SLO, achieved throughput, CPU throttling and memory headroom. Preserve GC,
  safepoint and OS/cgroup evidence for every failed run.

## References

- [Flags, modes and version corrections](references/flags-and-modes.md) — the live flag set
  for each collector, the JEP timeline, the obsolete and removed options, and how to verify
  the mode that is actually running. Read before changing a collector flag or auditing a
  configuration carried over from an older JDK.
- [Reading concurrent GC logs](references/reading-concurrent-gc-logs.md) — capture commands,
  the ZGC and Shenandoah log shapes, the allocation-stall signature, and where barrier cost
  shows up in a profile. Read when diagnosing latency or throughput on a running concurrent
  collector.

Authoritative sources: [JEP 474](https://openjdk.org/jeps/474),
[JEP 490](https://openjdk.org/jeps/490), [JEP 521](https://openjdk.org/jeps/521), and
[Oracle JDK 25 ZGC guide](https://docs.oracle.com/en/java/javase/25/gctuning/z-garbage-collector.html).
