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

Run a concurrent collector with its real cost budgeted. Sub-millisecond pause is not zero
cost — it is cost moved out of the pause and into two places that no pause histogram shows:
CPU burned by concurrent GC threads while the application runs, and a barrier on every
reference access that is present even when no cycle is in flight.

The failure this prevents is the migration that meets its p99 target and is then reverted,
because the CPU and heap headroom the concurrent phases need were never budgeted, or because
the pod had no spare cores to pay for them in the first place.

## Workflow

1. **Separate the three cost axes before reading any number.** STW pause, concurrent work
   (CPU while the application runs), and per-access barrier overhead. Conflating them is the
   most common source of a wrong conclusion about these collectors.
2. **Check the CPU quota of the target environment, not the dev box.** On 1-2 cores the
   concurrent phases compete directly with application threads, and G1 can beat both on
   throughput because it concentrates its cost in a pause that ends.
3. **Declare the mode explicitly.** ZGC has exactly one mode since JDK 24 and needs only
   `-XX:+UseZGC`. Shenandoah still defaults to single-generation; generational is opt-in via
   `-XX:ShenandoahGCMode=generational`. Confirm what is actually active with
   `jcmd <pid> VM.flags`.
4. **Strip the dead flags left over from G1.** `-XX:MaxGCPauseMillis`,
   `-XX:G1HeapRegionSize` and their neighbours are largely ignored by both collectors; a
   retained G1 tuning set is dead configuration, not a carried-over optimisation.
5. **Capture logs per generation and per phase** with `-Xlog:gc*,gc+phases=debug`, and read
   pauses separately from concurrent phase durations. See
   `references/reading-concurrent-gc-logs.md`.
6. **Treat `Allocation Stall` as the tail-latency root cause it is.** It means allocation
   rate exceeded concurrent collection capacity. The fix is more heap or less allocation —
   no flag makes either collector immune.
7. **Budget CPU and heap headroom before the migration, not after.** Expect measurable extra
   CPU from the concurrent phases and extra heap headroom for collector working pages.

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
- Call Shenandoah's barrier the **Load Reference Barrier (LRB)**, not a read or write
  barrier. It always dereferences the Brooks forwarding pointer; ZGC's load barrier is a
  conditional fast-path check that usually passes without a branch. That difference is why
  Shenandoah's per-access cost tracks reference-load volume more closely.
- Shenandoah costs 8 bytes of forwarding pointer **per object**, always, GC cycle or not. On
  a heap of tens of millions of small objects that is a double-digit percentage of heap;
  measure it with JOL before dismissing it in a footprint investigation.
- ZGC generational adds a **store barrier** on top of the load barrier, to maintain
  per-page remembered sets for old→young references. That is real extra per-access cost
  traded for young-allocation throughput.
- Do not size a ZGC container from RSS reported by `ps`/`top` under the old assumption of
  inflated numbers. Multi-mapping was removed with the non-generational mode in JDK 24, and
  the RSS inflation artefact went with it.
- Beyond heap size and `-XX:ConcGCThreads`, resist tuning ZGC. It self-calibrates from the
  observed allocation rate; further flags are rarely necessary or recommended.
- Benchmark these collectors open-loop (wrk2 or equivalent) and report p50/p99/p99.9/max.
  Isolate barrier overhead with JMH rather than inferring it from published numbers.

## References

- [Flags, modes and version corrections](references/flags-and-modes.md) — the live flag set
  for each collector, the JEP timeline, the obsolete and removed options, and how to verify
  the mode that is actually running. Read before changing a collector flag or auditing a
  configuration carried over from an older JDK.
- [Reading concurrent GC logs](references/reading-concurrent-gc-logs.md) — capture commands,
  the ZGC and Shenandoah log shapes, the allocation-stall signature, and where barrier cost
  shows up in a profile. Read when diagnosing latency or throughput on a running concurrent
  collector.
