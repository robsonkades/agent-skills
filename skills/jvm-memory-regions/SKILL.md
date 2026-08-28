---
name: jvm-memory-regions
description: >
  The six memory regions of a JVM process — heap, Metaspace, code cache, thread stacks,
  direct/native memory and JVM-internal — and how to budget them against a container limit.
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

Budget a JVM process against a hard memory limit. The failure this prevents is the most
expensive configuration error in Kubernetes: `-Xmx` set to the container limit, non-heap
regions pushing RSS past the cgroup, and the **kernel** killing the process — no
`OutOfMemoryError`, no shutdown hook, no heap dump, because the JVM never knew it was
dying.

Only the first of the six regions is managed by the garbage collector. Each has its own
flags, its own limit and its own kind of `OutOfMemoryError`.

## Workflow

1. **Read the full OOM message first.** It names the region, and the region decides the
   investigation. `Metaspace`, `Direct buffer memory` and `unable to create native
thread` are three unrelated problems, and none of them is fixed by raising `-Xmx`.
2. **Measure non-heap with NMT under your own load**, never estimate it:
   `-XX:NativeMemoryTracking=summary` at start, then
   `jcmd <pid> VM.native_memory summary`. NMT cannot be enabled on a running process.
3. **Budget every region** and keep the total at or below ~75% of the container limit.
   See `references/container-budget.md`.
4. **Distinguish reserved, committed and used.** The cgroup sees resident, `ps` shows
   reserved (`VSZ`), the dashboard shows used. Half of all wrong memory diagnoses come
   from comparing the wrong number with the wrong limit.
5. **Judge trends, not instants** — does the floor rise after a full collection?

## Rules

- `-Xms` equals `-Xmx` in production. A variable heap changes GC behaviour as it grows,
  so yesterday's measurement does not describe today's process.
- Set `-XX:MaxMetaspaceSize` explicitly. It is a **diagnostic** flag, not a containment
  one: without it a classloader leak kills the container silently; with it you get a
  named `OutOfMemoryError`, a stack trace and a heap dump.
- Never raise `-Xmx` to fix `unable to create native thread` — a larger heap leaves
  _less_ address space for stacks and makes it worse.
- Crossing ~32 GB of heap disables compressed oops and doubles every reference from 4 to
  8 bytes. A pointer-rich 33 GB heap can hold fewer useful objects than a 31 GB one.
  Evaluate `-Xmx31g` with ZGC before going past it.
- `-Xss8m` × 500 threads is 4 GB of address space in stacks alone. Web servers usually
  need 256–512 KB; deep recursion is a refactor, not a flag.
- Code cache exhaustion disables the JIT silently and permanently — no exception, no
  failing health check, new methods interpreted forever until restart. Keep occupancy
  under 80% of `ReservedCodeCacheSize` and treat `jdk.CodeCacheFull` in JFR as conclusive.
- Measure object layout with JOL rather than estimating headers. Compact object headers
  (JEP 519, product in 25) are **off by default through JDK 26 and on by default from
  JDK 27** (JEP 534); disable with `-XX:-UseCompactObjectHeaders`. **Do not budget 8 bytes
  per object**: the saving is not uniform, and it is exactly zero on several of the classes
  that dominate a real heap — `Integer`, `Boolean`, `String` and `ArrayList` all measure
  the same in both modes. Boxed collections and short strings, the two commonest footprint
  problems, gain nothing. For the rule that predicts which classes do save, the measured
  per-class table and the per-object arithmetic, see `object-layout-and-footprint`.
- Virtual threads move stack memory into the heap. It becomes memory the GC must trace
  rather than reserved address space it ignored — re-evaluate the heap, do not simply
  shrink it.

## References

- [Container budget](references/container-budget.md) — the per-region budget, the
  Kubernetes checklist, and reading `VM.native_memory summary` output. Read when sizing a
  JVM for a memory limit or when RSS does not match the heap.
- [OOM triage by region](references/oom-triage.md) — which message means which region,
  the `jcmd` command that confirms each, and what does _not_ fix it. Read when an
  `OutOfMemoryError` or an OOMKill has already happened.
