---
name: false-sharing-and-contended
description: >
  Proving and mitigating cache-line false sharing between logically independent hot writes.
  Covers ownership and address/layout hypotheses, coherence/HITM evidence limits, JMH topology,
  arrays and object placement, `@Contended` module/restriction mechanics, grouping and padding,
  JOL/address validation, manual padding fragility, striping, compact headers, memory cost and
  cross-socket/NUMA validation. Use after excluding logical contention; cache fundamentals,
  lock contention and general object sizing have separate owners.
---

# False sharing and `@Contended`

## Purpose

Establish that independent writers repeatedly invalidate the same coherence granule/cache line,
then choose ownership/layout changes whose throughput/latency benefit exceeds memory and maintenance
cost. Cache misses or poor scaling alone do not prove false sharing.

## Ownership boundary

- This skill owns false-sharing hypothesis, layout/placement, `@Contended`, padding and validation.
- `cpu-cache-and-numa` owns cache/coherence/NUMA fundamentals.
- `lock-inflation` and `lock-free-patterns` own logical lock/CAS contention.
- `object-layout-and-footprint` owns general object sizing/header trade-offs.

## Proof contract

```text
independent logical variables/slots and writer ownership:
write/read frequency and production thread/key topology:
actual address offsets/alignment and cache-line size(s):
JDK/layout/header/GC/allocation stability assumptions:
coherence/PMU evidence with support/multiplex/scope:
controlled ownership/layout perturbation:
memory/GC/locality cost and next bottleneck:
```

## Distinguish contention types

| Type                     | Shared meaning                                 | Typical evidence                            | Candidate direction             |
| ------------------------ | ---------------------------------------------- | ------------------------------------------- | ------------------------------- |
| lock contention          | one guarded invariant                          | monitor/park/owner wait                     | reduce/partition guarded work   |
| true data/CAS contention | same logical variable                          | retries/RMW/coherence                       | shard/batch/owner/semantics     |
| false sharing            | different variables on same line               | layout + writers + coherence + perturbation | separate/align ownership/layout |
| capacity/cache locality  | working set misses without writer invalidation | miss/working-set/topology                   | compact/block/localize/prefetch |

Padding true contention does not make the logical hotspot independent.

## Evidence ladder

1. Localize the scaling/tail/CPU regression and rule out load, locks, CAS hotspot, GC/JIT and I/O.
2. Map writers to independent fields/array slots and their actual runtime layout/address relationship.
3. Collect supported coherence/cache events (for example HITM/snoop variants on some CPUs/tools),
   validating event semantics, multiplexing, skid, process/CPU scope and topology.
4. Apply a controlled separation/ownership perturbation without changing useful semantics/work.
5. Confirm the same production metric improves while memory, GC and locality remain acceptable.

Generic `cache-misses`/LLC misses are not specific and false sharing may manifest as coherence traffic
without the naive counter pattern. A cache-miss flame graph compared with CPU samples is not a
standalone proof.

## Layout and placement

JOL reports class/instance field layout under its current VM model; it does not by itself prove the
absolute address/alignment of two separately allocated objects over time. Arrays provide predictable
element stride but array base alignment and hardware line size still matter. Derive padding/stride:

```text
stride elements >= ceil(cache-line bytes / element bytes)
```

Then ensure each active slot begins in a separate relevant line, accounting for base offset and
adjacent-line/prefetch behavior where measured. “Stride 8 for long” assumes a 64-byte line and
suitable alignment; it is not universal.

GC can move objects and allocation adjacency is not a stable API. Prefer layout within one object/
array or ownership partition that can be verified, and test the collector/JDK used.

## `@Contended`

`jdk.internal.vm.annotation.Contended` is internal JDK API. Application source normally needs an
appropriate compile-time module export, and HotSpot commonly restricts user-class padding unless
`-XX:-RestrictContended` is enabled. Runtime exports are needed only when application runtime code
must access the internal type; the VM can recognize annotation metadata without a blanket claim that
every run needs `--add-exports`.

Verify on the exact JDK:

- annotation is present in compiled class and applied in runtime layout;
- effective `RestrictContended`/padding settings and support;
- field/class contention group semantics;
- actual gaps/offsets and object/array placement;
- memory footprint across number of instances and GC consequence.

Padding width is a spacing policy, not “bytes charged per field” exactly; headers, alignment, groups,
field layout and multiple annotations determine total size. Do not justify a default width with one
microarchitecture's prefetch story as a universal guarantee.

Because this is internal API/flag surface, prefer JDK-supplied striped abstractions or an explicit
layout type when feasible, and include upgrade tests.

## Mitigation framework

| Mechanism                          | Prefer when                                               | Cost/risk                                |
| ---------------------------------- | --------------------------------------------------------- | ---------------------------------------- |
| ownership/confinement then combine | exact combination point exists                            | delayed aggregation/semantics            |
| striping                           | commutative/associative approximate or partitioned update | memory, read aggregation, skew           |
| padded field/class                 | stable hot independent fields                             | footprint, internal API/layout drift     |
| array stride/struct-of-arrays      | indexed owners and stable layout                          | wasted space, alignment/index complexity |
| batch updates                      | delayed visibility acceptable                             | burst/tail/failure semantics             |
| compact layout instead             | read/locality dominates, not writer sharing               | can worsen writer density                |

`LongAdder` scales hot cumulative updates using striped cells, but its sum is not an atomic snapshot.
It is not a drop-in replacement for IDs, exact bounds or balances.

Compact object headers can change density/offsets and therefore both footprint/locality and sharing
risk. Feature status/defaults vary across JDKs. Inspect exact JEP/build/layout and re-run evidence;
do not predict false sharing from header size alone.

## Benchmark design

Use JMH with an explicit shared-state topology and deterministic mapping from worker role to field/
slot. Sweep:

- one writer through expected concurrency/overload;
- core, SMT sibling, socket and NUMA placement;
- reads/writes and production work between updates;
- padded/unpadded/owner-local/striped alternatives;
- exact JDK, collector, header and container CPU configuration.

Preserve raw forks and report useful operations, CPU/op, tail, PMU coverage/events, memory footprint,
allocation/GC and placement. A fixed three-fork rule or expected “magical magnitude” is not validity.

## Failure modes

- annotation ignored/restricted or layout differs after JDK upgrade;
- padding separates fields inside an object but adjacent objects/array slots still share;
- manual dummy fields reordered/grouped or optimized around by layout rules;
- stride miscomputed for line/base alignment;
- striping removes false sharing but hot-key/cell collisions create true contention;
- footprint increase causes cache/GC regression larger than coherence benefit;
- benchmark thread-to-field mapping differs from production;
- PMU event unavailable/multiplexed/virtualized and interpreted as zero contention.

## Anti-patterns

| Anti-pattern                            | Failure                                     | Better approach                               | Narrow exception |
| --------------------------------------- | ------------------------------------------- | --------------------------------------------- | ---------------- |
| LLC misses prove false sharing          | many mechanisms cause misses                | layout + ownership + coherence + perturbation |
| `@Contended` costs exactly 128 B/field  | grouping/alignment/layout vary              | measure actual layout/footprint               |
| Always stride eight longs               | assumes 64-B line/alignment                 | derive and verify target layout               |
| JOL alone proves two objects share      | relative field layout != absolute adjacency | address/topology or controlled array layout   |
| Padding before excluding CAS contention | true shared line remains                    | change semantics/ownership/striping           |
| Production thread count alone           | placement/socket/SMT matters                | validate actual topology distribution         |

## Definition of done

- [ ] Variables are logically independent and writers/topology are mapped.
- [ ] Actual layout/address and cache-line assumptions are validated on target.
- [ ] PMU evidence limitations and a controlled separation test are recorded.
- [ ] Annotation/flag/module/group/padding behavior is verified, not assumed.
- [ ] Throughput/tail gain survives realistic placement/load and correctness tests.
- [ ] Footprint, locality, allocation/GC, upgrade and next-bottleneck costs are acceptable.

## References

- [`@Contended` mechanics and layout](references/contended-mechanics.md)
- [Proving and fixing false sharing](references/proving-and-fixing.md)
- [JEP 142: Reduce cache contention on specified fields](https://openjdk.org/jeps/142)
- [OpenJDK `Contended`](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/jdk/internal/vm/annotation/Contended.java)
- [OpenJDK Striped64](https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/util/concurrent/atomic/Striped64.java)
