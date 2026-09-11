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

Use JDK 25 HotSpot as the examples' baseline, then inspect the deployed vendor/build, OS/architecture,
container settings and effective flags. Collector inclusion is a build choice; a product JEP does
not guarantee every distribution supplies that collector. Establish actual binary support before
planning a workload experiment, reusing sufficient existing evidence. Do not upgrade the runtime
merely to match this guide.

Follow the steps relevant to the requested claim. A flag/API explanation, supplied-log review or
adequate existing configuration can close without a new capture, migration or benchmark. Missing
measurements limit the claims that require them; preserve independent conclusions and already
authorized mitigation through a validated recovery path.

1. **Separate the three cost axes before reading any number.** STW pause, concurrent work
   (CPU while the application runs), and per-access barrier overhead. Conflating them can
   lead to wrong conclusions about these collectors.
2. **Check effective CPU quota, throttling and topology in the target environment.** Small
   quotas increase contention, but no core-count threshold selects a collector. Compare
   throughput and tail latency under the actual quota and overload policy.
3. **Declare the mode explicitly.** ZGC has exactly one mode since JDK 24 and needs only
   `-XX:+UseZGC`. On the JDK 25 baseline Shenandoah defaults to single-generation; generational is opt-in via
   `-XX:ShenandoahGCMode=generational`. Confirm what is actually active with startup
   `gc+init` logs and `jcmd <pid> VM.flags -all`; plain `VM.flags` can omit defaults.
4. **Audit every carried flag.** G1-specific flags may remain accepted yet be inert under
   another collector, while global flags can still apply. Prove effective relevance from
   matching source/flag metadata and startup evidence. Validate removal against its actual risk;
   a proven inert-option cleanup need not run a workload benchmark or claim a performance benefit.
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

- Activate ZGC with `-XX:+UseZGC` alone on JDK 24+. `-XX:+ZGenerational` is obsolete since JDK 24 —
  accepted with a warning and no effect on the tested JDK 25 build, because the only mode is already
  generational. Prescribing it looks like configuration and changes nothing.
- ZGC is generational **by definition** on JDK 24+. JEP 474 made it the default in JDK 23;
  JEP 490 deleted the non-generational code in JDK 24. There is no mode to turn off.
- Shenandoah generational is _product_ in JDK 25 (JEP 521, experimental in JDK 24 under JEP 404) but is **not** the default. `-XX:+UseShenandoahGC` on its own still selects
  single-generation. "Product" is not "default".
- Require the effective Shenandoah mode for a comparison. On JDK 25, omission can compare
  single-generation Shenandoah with generational ZGC. That can answer a defaults comparison,
  but does not isolate collector implementation from generation policy; state the question.
- Shenandoah's load-reference barrier resolves forwarded references; its fast/slow paths and
  barrier set depend on mode and GC state. ZGC uses colored pointers and load/store barriers.
  Avoid universal branch/cycle claims: inspect generated code/profiles on the target build.
- On the JDK 25 baseline, Shenandoah forwarding uses the object's mark word; do not charge
  every object a historical extra forwarding word. Quantify effective heap/live-set and native
  costs from collector accounting and the target object mix; JOL's shallow instance size is
  not the whole collector memory budget.
- Generational ZGC uses **store barriers** for per-page remembered sets and marking work while
  reducing load-barrier responsibilities. Fast paths, conditional remembered-set work and buffered slow
  paths change the cost shape; there is no fixed added tax to multiply by every access. Attribute
  actual cost on the target build/workload before claiming a regression or benefit.
- Do not size a ZGC container from one `ps`/`top` RSS sample or from folklore about legacy
  heap multi-mapping. Multi-mapping history is not the same change as JEP 490's JDK 24 removal
  of non-generational ZGC. Reconcile target-build RSS/PSS, cgroup `memory.current`, heap
  committed/used and native domains over time.
- Prefer ergonomics first for ZGC, then tune only a measured constraint. Heap/soft max,
  `ConcGCThreads`, CPU quota and allocation spikes interact; a copied knob can trade mutator
  CPU for fewer stalls or merely hide a capacity defect.
- Use an arrival model that represents production and correct coordinated omission when
  relevant. For a measured performance claim, report the relevant throughput, offered/achieved
  load, CPU throttling, allocation rate and pause/stall distributions with exposure, counts and
  estimator limits. Select tail statistics needed for the decision; missing or insufficient
  samples are not zero latency. A JMH comparison can expose workload cost
  but cannot isolate “barrier overhead” merely by changing collectors.

## Production acceptance

- For an adoption or material tuning claim, cover the affected steady-state, burst, live-set,
  large-allocation, redeploy and CPU-throttle risks using sufficient existing or new evidence.
  Set acceptable pause/stall/pacing and fallback behavior from the SLO; Shenandoah
  pacing can be normal allocation control, not automatically a failed migration. Distinguish
  pacing delay from degeneration/full fallback and inspect any consequential regression.
- For an isolated collector comparison, hold material factors such as build/quota comparable;
  for a deliberately changed capacity scenario, declare those factors and limit the conclusion
  accordingly. Include relevant warm-up and uncertainty/repetition rather than overgeneralizing
  a single run.
- Set rollback on SLO, achieved throughput, CPU throttling and memory headroom. Preserve GC,
  safepoint and OS/cgroup evidence for every failed run.

Return the supported answer or change/no-change decision, relevant build/mode/flags, evidence
and limits. A measured diagnosis distinguishes pauses, concurrent wall time and CPU; a proposed
change includes its relevant validation and recovery criteria. When material evidence is missing,
name the smallest discriminating check without inventing measurements or withholding independent
source/log conclusions.

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
[Oracle JDK 25 ZGC guide](https://docs.oracle.com/en/java/javase/25/gctuning/z-garbage-collector1.html).
