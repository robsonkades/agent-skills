---
name: cpu-cache-and-numa
description: >
  Hardware-aware Java: the cache line as the hardware's indivisible unit, false sharing and
  how it differs from lock contention, object layout measured with JOL, LongAdder versus
  AtomicLong, data locality in arrays and collections, and NUMA topology. Use when
  throughput gets **worse** as threads are added, when scaling efficiency is below 0.5, when
  fields are being added to a class shared between threads, when volatile counters sit next
  to each other, when @Contended or padding is proposed, when -XX:+UseNUMA is being set, or
  when someone says a volatile write "flushes the cache". Does not cover happens-before
  correctness (java-memory-model), pool and queue sizing (littles-law-and-queueing), or
  kernel and cgroup behaviour (linux-for-jvm). Proving and fixing false sharing is
  false-sharing-and-contended, and topology and pinning is numa-and-cpu-affinity.
---

# CPU Cache and NUMA

## Purpose

Explain the performance failures that no blocking-oriented tool can see. False sharing
degrades throughput by orders of magnitude and produces **no event** in JFR, no context
switches, no lock contention — a system ruined by cache coherency looks perfectly healthy
in every tool that measures waiting.

## Workflow

1. **Measure scaling efficiency**: `(throughput_N / throughput_1) / N`. Below 0.5 is the
   entry criterion for this investigation.
2. **Check the signature.** Does throughput get _worse_ as threads are added? Capacity
   limits never do that; coherency does.
3. **Rule out lock contention and true sharing first** — see the distinction table in
   `references/false-sharing.md`. Locks appear in JFR; false sharing appears nowhere.
4. **Prove the layout with JOL**, never with mental arithmetic.
5. **Locate the stack** with `asprof -e LLC-load-misses`, and normalise misses per
   instruction (MPKI) against the application's **own baseline**, not a published threshold.
6. **Validate the fix with JMH at the same thread count.** A layout fix that is not
   validated under the same concurrency has not been validated.

## Rules

- A cache line is 64 bytes on x86-64 but **128 on Apple Silicon and POWER**. Verify rather
  than assume; the value determines all padding arithmetic.
- Any write invalidates the whole line on every other core. MESI does not know which bytes
  each core uses, and false sharing is born from that ignorance.
- **A volatile write does not flush any cache.** It drains the local store buffer and
  forbids reordering; propagation happens by MESI invalidation. And a volatile read does not
  "go to main memory" — it is served from L1 if the line is valid; what is forbidden is
  keeping the value in a register. The distinction matters because the fixes differ: against
  coherency cost, separate the data; against barrier cost, reduce the number of ordered
  accesses.
- Do not compute offsets in your head — run JOL. `long` and `double` align to 8 bytes, so
  with a 12-byte header the first `long` sits at offset **16**, and the 12–15 gap is filled
  by a 4-byte field if one exists.
- Compact Object Headers gives an 8-byte header: product in JDK 25 behind
  `-XX:+UseCompactObjectHeaders` (JEP 519), **off by default through JDK 26 and on by
  default from JDK 27** (JEP 534). It shifts every offset — and by packing more fields per
  line it can **worsen** false sharing while improving footprint.
- `-XX:+CompactFields` does not exist on the baseline (obsolete in 15, expired in 16), and
  `-XX:-UseEmptySlotsInSupers` was removed in 23. The JDK 15+ layout is the only one.
- The GC moves objects and the default alignment is 8 bytes, not 64. Any optimisation based
  on an absolute address is undone by the first compaction; only padding **inside** the
  object is stable.
- `@Contended` pads to 128 bytes because of the adjacent-line prefetcher, not because x86
  has a 128-byte L1. In application code it needs `--add-exports` **and**
  `-XX:-RestrictContended`; without the second it is silently ignored.
- Prefer `LongAdder` to padding: its `Cell`s are already padded and it uses no internal API.
  With few threads `AtomicLong` wins; with many, the order reverses.
- Move metrics out of hot state objects rather than padding them. It resolves the conflict
  **and** improves cache density of the hot state.
- In Java, `Particle[]` is **not** contiguous — the array holds references, and the objects
  are scattered. The array-of-objects problem here is indirection, not wasted bandwidth, and
  carrying over `sizeof(struct)` reasoning from C leads to the wrong conclusion. Prefer
  primitive arrays where possible.
- Local DRAM costs ~80–100 ns, remote ~150–300 ns — a factor of 2–3×. The ~10 ns sometimes
  quoted is cache latency, not memory latency.
- `-XX:+UseNUMA` is implemented by Parallel GC and G1 (JEP 345, JDK 14, Linux) and improves
  **allocation** locality only. ZGC is NUMA-aware by default with no flag — and disables
  that logic by itself when the process is confined to a CPU subset, which is exactly any
  container with a `cpuset`.

## References

- [False sharing](references/false-sharing.md) — the distinction from lock contention, the
  detection procedure, JOL usage and the correction options. Read when scaling efficiency is
  poor or when adding fields to a shared class.
- [NUMA](references/numa.md) — verifying topology, reading `numastat`, and choosing between
  distributing and pinning. Read only after confirming more than one NUMA node exists.
