# Barriers and the remembered set

## The pointer, as it is on JDK 25

Legacy multi-mapping history is separate from JEP 490's removal of non-generational ZGC. Do
not infer current RSS/PSS or cgroup charge from that history. What is stable in the inspected
JDK 25 source is that generation identity belongs to `ZPage` metadata rather than being
derived as a simple pointer color.

```
[BASELINE — generational ZGC, JDK 25]
64-bit pointer:
  +-----------------------+------------------+
  | encoded address       | state metadata   |
  | high-order bits       | low-order bits   |
  +-----------------------+------------------+
```

Generation is metadata on the `ZPage`; barrier slow paths also consult the generation of
a slot or referent, not only once per page. Pointer metadata records collector state, not
a simple object-generation bit. Barrier elision/expansion depends on the compiler.

The exact bit layout, and the names of the `ZPointer*` masks in `zpointer.hpp` /
`zaddress.hpp` / `zGlobals.hpp`, evolve between releases — the pointer representation was
redesigned during the generational work. Check the source of the build in use before quoting
them in an incident report.

## Load barrier fast path

The check is a bitmask over the **pointer value itself**. No access to the pointed-to object
happens before the pointer has been validated:

```
// field_address: address of the FIELD holding the reference (e.g. an array slot)

encoded = read_reference_bits(field_address)
if reference_requires_relocation_processing(encoded, current_phase):
    address = process_reference_and_optionally_heal_slot(field_address, encoded)
else:
    address = decode_address(encoded)
// Only now dereference object memory. Helpers are conceptual, not C++ APIs.
```

This is conceptual pseudocode, not the emitted instruction sequence. Fast-path cost depends
on architecture, compiler expansion/elision, cache state and collector phase; “a fraction of
a nanosecond” is not portable evidence. The dependency ordering is the useful invariant:
validate/decode the reference before dereferencing relocated object memory.

Any pseudocode of the shape `if (obj.color != expected)`, or anything else implying a field
read on the target before the pointer is validated, inverts the dependency order and describes
a mechanism that could not work.

## Store barrier

Non-generational ZGC leaned almost entirely on the load barrier. The generational mode needs a
barrier on **writes** as well, for SATB marking and remembered-set maintenance:

```
previous = read_reference_bits(slot)
if store_barrier_work_required(previous, current_phase):
    preserve_previous_referent_for_marking_if_needed(previous)
    remember_slot_if_in_old_generation(slot)
store(slot, encode_store_good(new_reference))
// Simplified ordering; generated fast paths, buffering and healing differ.
```

The normal fast path examines metadata of the reference already in the slot before overwrite.
SATB work preserves the previous referent, including when the new value is null. Remembering
filters on the slot being old, not the new referent being young; GC examines current slot
contents later. Buffered slow paths and metadata checks avoid repeating all work on every
store. Do not charge every write for a page lookup and bitmap operation. Atomic bitmap
updates prevent losing concurrent sets in shared words.

## The remembered set is a bitmap, not a card table

`ZBitMap`, in `zRememberedSet.hpp`: **one bit per potential object-field address** inside the
page. There is no card — no fixed-size memory slice — in the real structure. G1's one byte per
512-byte card is a different granularity of tracked datum, not merely a different processing
schedule. The exact bit-to-address mapping and the size of `_bitmap[2]` should be checked
against `zRememberedSet.hpp` / `zGranuleMap.hpp` on the build in use before citing.

### Double buffering

Two bitmaps, `_bitmap[2]`, with roles flipped at young mark-start synchronization:

```
Young mark start: prior current becomes previous for this collection
During:       mutator store barriers set bits in A, without a lock
              GC scans previous B while current A is built
// A/B denote roles after the flip, not permanent identities.
```

Current/previous roles let mutators and GC operate on different logical sets during relevant
phases. The precise flip/clearing synchronization is implementation-specific; inspect the
target `ZRememberedSet`/`ZPage` source before claiming that no concurrent access is possible.

Double buffering separates mutation and scanning roles; it does not eliminate synchronization
or establish that all collector operations are lock-free. Do not label the flip an end-of-cycle
thread-local handshake or assume an immutable snapshot throughout relocation.

## Attributing barrier overhead in a profile

```bash
# Bash: use an authorized target and retain this unique directory for review.
profile_dir=$(mktemp -d "${TMPDIR:-/tmp}/zgc-profile.XXXXXXXX") || exit 1
asprof -e cpu -d 30 -f "$profile_dir/cpu.html" "$pid"
```

Frames to separate (symbol names vary by build — confirm against the build in use rather than
quoting from memory in an incident report):

- Runtime load/store slow paths: confirm `ZBarrier`/`ZBarrierSetRuntime` symbols in the target.
- Remembered-set work: distinguish collector scanning from mutator slow-path updates.

`ZBarrierSetAssembler` generates instructions; samples in those C++ methods describe code
generation, not execution of the generated mutator barrier.

Method:

1. For an overhead claim, use representative existing profiles or a scoped capture with the
   actual profiler/backend needed. JFR and async-profiler can complement each other when their
   evidence is needed; neither a source explanation nor adequate single-source evidence requires
   both. Align windows, output paths and measurement populations when combining them.
2. Named slow-path frames are attributable; inlined fast-path instructions may be charged to
   application frames, so absence is not zero overhead and a load/store-frame ratio is not a
   complete cost metric.
3. Compare equivalent workloads/builds and inspect generated assembly/perf counters only when
   the decision warrants it. Correlate slow paths with GC phase and old-to-young write topology;
   promotion rate alone does not determine all stores.
4. Separate measurements from estimates; retain baseline, denominator and uncertainty.
   An estimate is not a measurement or a transferable workload constant.

## Sizing and stall decisions

For a sizing or stall question, do not use fixed multiples of live set. Use relevant existing or
new time-series evidence for live/used/free
and hard/soft-max heap, allocation-rate distribution, large-page/object requests, relocation
progress, young/old cycles, concurrent-worker CPU and cgroup throttling. Model whether free
pages cover allocation until the collector returns capacity under both normal and burst
regimes, including uncertainty and redeploy/live-set growth.

SoftMaxHeapSize is a collection target, not an allocation hard limit: ZGC may grow beyond it
up to Xmx. Soft headroom differs from remaining hard capacity and available cgroup memory.
Budget heap residency plus native/JVM/thread/direct-buffer and other charged memory; neither
Xmx nor virtual-address reservation equals RSS or memory.current.

For the stall or capacity claim under review, distinguish the relevant evidence:

| Evidence                                                                        | Likely decision axis                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| hard capacity constrained with stable live set; soft target assessed separately | capacity or collection policy within process/cgroup budget                |
| concurrent threads starved/throttled                                            | CPU quota, `ConcGCThreads`, colocated load                                |
| short allocation spike outruns otherwise healthy cycles                         | admission/backpressure, burst capacity, scoped spike-tolerance experiment |
| live set/old occupancy trends upward                                            | retention/cache policy before heap expansion                              |
| large page/object allocation fails amid apparent free bytes                     | page availability/fragmentation and allocation shape                      |

No remediation is “free”: earlier/more collection spends CPU; more heap spends memory and can
alter uncommit behavior; lower allocation or admission changes code/service behavior. Validate
the selected axis against stall count/duration, achieved load, CPU and cgroup headroom.

Sources: [JEP 439](https://openjdk.org/jeps/439),
[JDK 25 store ordering](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/z/zBarrierSet.inline.hpp),
[barrier work](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/z/zBarrier.inline.hpp),
[remembered-set roles](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/z/zRememberedSet.cpp).
