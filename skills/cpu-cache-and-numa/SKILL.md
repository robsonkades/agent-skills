---
name: cpu-cache-and-numa
description: >
  Hardware-aware Java: cache-line coherence and locality, false sharing and
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
   `references/false-sharing.md`. JFR can expose qualifying blocking events; it has no dedicated
   false-sharing event, and missing lock events do not rule out spinning or below-threshold waits.
4. **Measure relative field layout with JOL**; offsets do not prove absolute cache-line placement.
5. **Measure coherence on supported hardware.** Prefer `perf c2c`, HITM/cache-to-cache or
   vendor PMU events when available; LLC misses alone do not prove false sharing. Normalize
   against the application's own baseline and retain event support/scaling warnings.
6. **Validate twice.** Use JMH to isolate the proposed mechanism, then an application/load
   test at the same topology and concurrency to prove the production effect.

Record target JDK/vendor, collector, header/alignment flags, JOL version, CPU/cache topology,
allowed CPUs/memory nodes and workload ownership before changing layout or placement. Examples
are partial sketches, not a runnable benchmark or a declared cross-JDK layout contract. Return
the evidence, competing explanation, proposed controlled change and validation result. If PMUs,
layout tools or target hardware are unavailable, state the gap and keep the diagnosis provisional.

## Rules

- Cache-line sizes depend on processor and cache level; 64 bytes is common on x86-64, but
  architecture names alone are not sufficient evidence. Inspect target topology/vendor data
  before padding arithmetic. Coherence granularity is not a Java atomicity guarantee.
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
  default from JDK 27** (JEP 534). It can change offsets — and by packing more fields per
  line it can **worsen** false sharing while improving footprint.
- Do not resurrect obsolete layout flags such as `CompactFields` or `UseEmptySlotsInSupers`.
  Inspect options supported by the target build; header modes and packing still evolve.
- Moving collectors can change object addresses, and common 8-byte object alignment does not
  imply cache-line alignment. Relative field separation survives relocation in the same VM layout;
  it still needs enough distance for possible line alignment/straddling. Separate objects can
  remain adjacent, so moving a field to a new object is not a physical-isolation guarantee.
- HotSpot's default contended padding width is commonly 128 bytes, intended to isolate beyond
  one typical line and reduce adjacent-line effects; verify the flag/build rather than
  treating the rationale or width as a specification. In application code it needs `--add-exports` **and**
  `-XX:-RestrictContended`; without the second it is silently ignored.
- Prefer `LongAdder` for highly contended statistics only when a non-atomic `sum()` snapshot
  is acceptable. `AtomicLong` provides linearizable updates/reads and can win at low
  contention; padding protects independent fields. These solve different contracts and must
  not be ordered as universal alternatives.
- Consider moving metrics out of hot state objects or partitioning ownership; measure remaining
  sharing, extra indirection and footprint. Separate allocation alone does not prove isolation.
- `Particle[]` stores a contiguous sequence of references in conventional HotSpot layouts;
  referenced objects need not be adjacent. Indirection, headers and fetching unused fields can
  increase footprint and memory traffic. Primitive arrays can help when their semantics fit.
- Local and remote DRAM latency/bandwidth depend on CPU generation, topology, frequency,
  access pattern and contention. Measure with a topology-aware benchmark and hardware
  counters; published nanoseconds are orientation, not a production model.
- `-XX:+UseNUMA` governs supported Parallel GC and G1 policies (G1 since JDK 14, Linux).
  ZGC also uses this flag: JDK 25 enables it ergonomically by default, subject to platform/topology
  support. Collector allocation/relocation behavior differs. Verify effective flags, startup
  logs and page placement; CPU/memory confinement can disable NUMA support.

## References

- [False sharing](references/false-sharing.md) — the distinction from lock contention, the
  detection procedure, JOL usage and the correction options. Read when scaling efficiency is
  poor or when adding fields to a shared class.
- [NUMA](references/numa.md) — verifying topology, reading `numastat`, and choosing between
  distributing and pinning. Read only after confirming more than one NUMA node exists.
- [OpenJDK JOL](https://github.com/openjdk/jol) — supported VM layouts and measurement caveats.
- [JEP 519](https://openjdk.org/jeps/519) and [JEP 534](https://openjdk.org/jeps/534) — compact-header release/default boundaries.
