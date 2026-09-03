---
name: cpu-cache-and-numa
description: >
  Hardware-aware Java: the cache line as the hardware's indivisible unit, false sharing and
  how it differs from lock contention, object layout measured with JOL, LongAdder versus
  AtomicLong, data locality in arrays and collections, and NUMA topology. Use when
  throughput gets **worse** as threads are added, when scaling efficiency collapses, when
  fields are being added to a class shared between threads, when volatile counters sit next
  to each other, when @Contended or padding is proposed, when -XX:+UseNUMA is being set, or
  when someone says a volatile write "flushes the cache". Does not cover happens-before
  correctness (java-memory-model), pool and queue sizing (littles-law-and-queueing), or
  kernel and cgroup behaviour (linux-for-jvm). Proving and fixing false sharing is
  false-sharing-and-contended, and topology and pinning is numa-and-cpu-affinity.
---

# CPU Cache and NUMA

## Purpose

Explain hardware-locality failures that blocking-oriented evidence can miss. False sharing
can degrade throughput without monitor contention or a dedicated JFR event, but cache misses,
coherence traffic, CPU saturation and scaling curves still leave evidence. Treat it as a
hypothesis to falsify, not the default explanation for poor scaling.

## Workflow

1. **Measure the scaling curve**: throughput, p99, CPU, allocation and synchronization from
   one thread through the production concurrency range. Efficiency is descriptive; there is
   no universal 0.5 entry threshold.
2. **Check the signature.** Throughput that worsens as writers are added is consistent with
   coherence, but also with locks, queueing, GC, bandwidth saturation, scheduler overhead or
   a downstream limit. Use competing hypotheses.
3. **Rule out lock contention and true sharing first** — see the distinction table in
   `references/false-sharing.md`. Locks appear in JFR; false sharing appears nowhere.
4. **Prove the layout with JOL**, never with mental arithmetic.
5. **Measure coherence on supported hardware.** Prefer `perf c2c`, HITM/cache-to-cache or
   vendor PMU events when available; LLC misses alone do not prove false sharing. Normalize
   against the application's own baseline and retain event support/scaling warnings.
6. **Validate twice.** Use JMH to isolate the proposed mechanism, then an application/load
   test at the same topology and concurrency to prove the production effect.

## Rules

- A cache line is 64 bytes on x86-64 but **128 on Apple Silicon and POWER**. Verify rather
  than assume; the value determines all padding arithmetic.
- A write must obtain coherent ownership of the line and invalidates other cached shared
  copies when present. Repeated ownership transfer between writers to independent fields is
  false sharing; a write to a line already held exclusively need not broadcast the same work.
- **The JMM does not specify cache flushes, MESI or store-buffer draining.** A volatile write
  has release/order and visibility semantics; a volatile read has acquire semantics. HotSpot
  maps those guarantees differently by architecture. Hardware coherence can serve a valid
  cached copy, but do not present one x86 implementation sequence as the Java contract.
- Do not compute offsets in your head — run JOL on the target JDK, VM mode and class
  hierarchy. HotSpot field packing, headers, inheritance gaps, compressed pointers and
  alignment are implementation details; even familiar 12-byte-header examples are not a
  layout contract.
- Compact Object Headers gives an 8-byte header: product in JDK 25 behind
  `-XX:+UseCompactObjectHeaders` (JEP 519), **off by default through JDK 26 and on by
  default from JDK 27** (JEP 534). It shifts every offset — and by packing more fields per
  line it can **worsen** false sharing while improving footprint.
- `-XX:+CompactFields` does not exist on the baseline (obsolete in 15, expired in 16), and
  `-XX:-UseEmptySlotsInSupers` was removed in 23. The JDK 15+ layout is the only one.
- The GC moves objects and the default alignment is 8 bytes, not 64. Any optimisation based
  on an absolute address is undone by the first compaction; only padding **inside** the
  object is stable. A moving collector may change the absolute address, and internal padding
  still needs enough separation for possible line alignment/straddling.
- HotSpot's default contended padding width is commonly 128 bytes, intended to isolate beyond
  one typical line and reduce adjacent-line effects; verify the flag/build rather than
  treating the rationale or width as a specification. In application code it needs `--add-exports` **and**
  `-XX:-RestrictContended`; without the second it is silently ignored.
- Prefer `LongAdder` for highly contended statistics only when a non-atomic `sum()` snapshot
  is acceptable. `AtomicLong` provides linearizable updates/reads and can win at low
  contention; padding protects independent fields. These solve different contracts and must
  not be ordered as universal alternatives.
- Move metrics out of hot state objects rather than padding them. It resolves the conflict
  **and** improves cache density of the hot state.
- In Java, `Particle[]` is **not** contiguous — the array holds references, and the objects
  are scattered. The array-of-objects problem here is indirection, not wasted bandwidth, and
  carrying over `sizeof(struct)` reasoning from C leads to the wrong conclusion. Prefer
  primitive arrays where possible.
- Local and remote DRAM latency/bandwidth depend on CPU generation, topology, frequency,
  access pattern and contention. Measure with a topology-aware benchmark and hardware
  counters; published nanoseconds are orientation, not a production model.
- `-XX:+UseNUMA` governs supported Parallel GC and G1 allocation policies (G1 since JDK 14,
  Linux). ZGC has separate, evolving NUMA-aware allocation/relocation behavior not controlled
  by this flag. CPU confinement changes visible topology; verify the target JDK's logs/source
  and measured page placement rather than assuming one collector's semantics for another.

## References

- [False sharing](references/false-sharing.md) — the distinction from lock contention, the
  detection procedure, JOL usage and the correction options. Read when scaling efficiency is
  poor or when adding fields to a shared class.
- [NUMA](references/numa.md) — verifying topology, reading `numastat`, and choosing between
  distributing and pinning. Read only after confirming more than one NUMA node exists.
