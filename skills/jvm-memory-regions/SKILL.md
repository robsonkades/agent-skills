---
name: jvm-memory-regions
description: >
  The major memory-accounting domains of a JVM process — heap, Metaspace/class space, code
  cache, thread stacks, direct/native/JVM-internal memory and mapped/file-backed pages — and
  how to budget them against a container limit.
  Use when a pod is OOMKilled with no Java exception, when an OutOfMemoryError names
  something other than "Java heap space", when -Xmx is set equal to the container limit,
  when RSS exceeds the heap by more than expected, when a heap above 32 GB is proposed, or
  when sizing a JVM for Kubernetes. Does not cover collector choice and heap tuning
  (jvm-gc-tuning), classloader leaks (jvm-class-loading), or kernel-side memory behaviour
  such as page faults, swap and the OOM killer (linux-for-jvm). Metaspace internals are
  metaspace-internals, memory outside the heap is off-heap-memory, and heap contents are
  heap-dump-analysis.
---

# JVM Memory Regions

## Purpose

Budget a JVM process against a hard memory limit. A common failure is `-Xmx` set to the
container limit, with non-heap
regions pushing RSS past the cgroup, and the **kernel** killing the process — no
`OutOfMemoryError`, no shutdown hook, no heap dump, because the JVM never knew it was
dying.

Only the Java heap object graph is reclaimed directly as ordinary GC-managed objects, but
class unloading, code-cache sweeping, native cleaners/arenas and OS reclaim couple the
other domains to different lifecycles. Not every domain has a hard flag or a distinct
`OutOfMemoryError`; that is why accounting starts from evidence rather than six fixed boxes.

## Workflow

1. **Read the full OOM message first.** It names the region, and the region decides the
   investigation. `Metaspace`, `Direct buffer memory` and `unable to create native
thread` are three unrelated problems, and none of them is fixed by raising `-Xmx`.
2. **Measure JVM-tracked non-heap with NMT under your own load**, and model untracked domains:
   `-XX:NativeMemoryTracking=summary` at start, then
   `jcmd <pid> VM.native_memory summary`; `baseline` followed later by `summary.diff`
   attributes tracked growth to a category. Periodic JFR NMT/RSS events can provide a
   related time series when present/enabled, but do not assume identical semantics. NMT cannot be
   enabled on a running process.
3. **Budget every region and peak overlap**: candidate heap max = limit − measured/modelled
   non-heap/cgroup peaks − uncertainty/recovery headroom. Then express it as `-Xmx` or
   `MaxRAMPercentage` against the memory value the JVM actually detected;
   the arithmetic and the RSS-versus-NMT gap table are in
   `references/container-budget.md`.
4. **Distinguish virtual reserved, NMT committed, resident and cgroup-charged.** `ps` exposes
   both VSZ and RSS; neither is identical to NMT totals or `memory.current`. Half of all wrong memory diagnoses come
   from comparing the wrong number with the wrong limit.
5. **Judge normalized trends, not instants** — compare equivalent reclamation points,
   native/RSS/cgroup peaks and the workload regime that produced them.

## Rules

- Choose fixed versus variable initial heap from startup, RSS/density, idle-uncommit and SLO
  measurements. `-Xms = -Xmx` removes heap growth but is not a universal production rule.
- Set `MaxMetaspaceSize` only as a deliberate fail-fast/capacity boundary. Too low causes
  avoidable OOM during legitimate class loading; absent/unbounded shifts the boundary to
  process/cgroup capacity. Alert on class-loader/class-space trends either way.
- `unable to create native thread` can mean PID/rlimit exhaustion, native allocation
  failure, cgroup pressure or virtual-address constraints. Changing `-Xmx` helps only when
  measured heap commitment/residency is consuming the relevant resource; it can also hide
  the real PID/thread-lifecycle defect.
- The compressed-oop cutoff for applicable HotSpot collectors is often near 32 GiB but
  depends on alignment, heap base/reservation and build. Confirm effective flags/layout;
  ZGC's colored-pointer scheme is not a compressed-oops workaround.
- `-Xss × platform-thread count` is a virtual reservation bound, not automatically resident
  bytes. Reduce stacks only after testing Java/native call depth and guard-page behavior;
  stack overflow is a correctness failure, not merely a tuning regression.
- Code-cache pressure can stop compilation and trigger flushing/sweeping/restart behavior
  that varies by tier/segment and release. `jdk.CodeCacheFull` is strong evidence of an
  event, not proof of permanent interpretation or a universal 80% threshold. Correlate
  compiler logs, segment occupancy, sweeper activity and throughput (`code-cache-segments`).
- Measure object layout with JOL rather than estimating headers. Compact object headers
  (JEP 519, product in 25) are **off by default through JDK 26 and on by default from
  JDK 27** (JEP 534); disable with `-XX:-UseCompactObjectHeaders`. **Do not budget 8 bytes
  per object**: alignment makes savings class/layout-dependent, and some common small
  objects can retain the same aligned size while their surrounding graph/arrays change.
  For the rule that predicts which classes do save, the measured
  per-class table and the per-object arithmetic, see `object-layout-and-footprint`.
- Unmounted virtual-thread continuation chunks live in the heap, while mounted execution
  uses carrier/native stack state. Millions of tasks can therefore shift context/stack
  retention into GC-visible objects; measure mounted/unmounted state and in-flight
  concurrency before adjusting heap or `-Xss`.
- `MaxDirectMemorySize` is a separate ceiling. On the verified HotSpot implementation its
  absent value resolves to `Runtime.maxMemory()`, so choosing a large `-Xmx` can implicitly
  authorize a similarly large direct-buffer budget; it does not reserve that memory or make
  the combined process fit.

## Evidence and rollout safety

- Capture NMT, process maps, cgroup files and JFR at aligned timestamps with JDK vendor/
  update, PID, container ID and load. “Committed,” RSS/PSS and `memory.current` must never
  be joined from different windows as if simultaneous.
- Process maps, hs_err, heap/core dumps and command lines can expose paths, credentials and
  payloads. Restrict collection/transfer, redact only on a preserved copy, record hashes and
  expire artifacts under incident policy.
- For any limit/heap/stack/metaspace change, canary with abort thresholds for OOM kills,
  Java OOMs, startup time, RSS/cgroup high-water mark, faults, GC tails, throughput and
  stack overflow. Retain the previous configuration for rollback.

## References

- [Container budget](references/container-budget.md) — the per-region budget with the
  worked `MaxRAMPercentage` arithmetic, reading `VM.native_memory summary` and `diff`,
  the RSS-versus-NMT gap table, and the Kubernetes checklist. Read when sizing a JVM for
  a memory limit or when RSS does not match the heap.
- [OOM triage by region](references/oom-triage.md) — which message means which region,
  the `jcmd` command that confirms each, what does _not_ fix it, and the
  `ExitOnOutOfMemoryError` / `CrashOnOutOfMemoryError` decision. Read when an
  `OutOfMemoryError` or an OOMKill has already happened, or when configuring what the JVM
  does on the next one.

Authoritative sources: [Oracle Native Memory Tracking guide](https://docs.oracle.com/en/java/javase/25/vm/native-memory-tracking.html),
[Oracle container support guide](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html#java-options-for-linux),
[JEP 519](https://openjdk.org/jeps/519), [JEP 534](https://openjdk.org/jeps/534), and
[Linux cgroup v2 memory controller](https://docs.kernel.org/admin-guide/cgroup-v2.html#memory).
