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
  | state metadata        | address          |
  | (marked, remapped)    |                  |
  +-----------------------+------------------+
```

Generation is metadata on the `ZPage`. The reasoning is cost placement: pointer bits are
tested on **every reference read**, in a path executed billions of times a second, and they
compete with usable address bits. Generation is only consulted when a page-level decision is
taken — which page to process in which cycle — an operation already paid per page. Putting
generation in the page metadata leaves the hottest path in the system untouched.

The exact bit layout, and the names of the `ZPointer*` masks in `zpointer.hpp` /
`zaddress.hpp` / `zGlobals.hpp`, evolve between releases — the pointer representation was
redesigned during the generational work. Check the source of the build in use before quoting
them in an incident report.

## Load barrier fast path

The check is a bitmask over the **pointer value itself**. No access to the pointed-to object
happens before the pointer has been validated:

```
// field_address: address of the FIELD holding the reference (e.g. an array slot)

uintptr_t raw_ptr = *field_address;             // read the pointer value —
                                                // the OBJECT has not been touched

if ((raw_ptr & ZPointerLoadGoodMask) == 0) {    // test bits of the integer value;
                                                // no memory of the object is read
    raw_ptr = zgc_load_barrier_slow_path(field_address, raw_ptr);   // rare
}

Object* obj = (Object*) (raw_ptr & ZPointerAddressMask);   // only now is the address used
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
barrier on **writes** as well, to keep the old-to-young remembered set current:

```
void conceptual_store_barrier(Object* obj_holder, size_t offset, Object* value) {
    if (needs_load_barrier(value)) {
        value = zgc_load_barrier_slow_path(&value, (uintptr_t) value);
    }

    obj_holder[offset] = value;

    if (page_generation(obj_holder) == OLD &&
        value != nullptr && page_generation(value) == YOUNG) {
        size_t bit_index = remembered_set_bit_index_for(obj_holder, offset);
        active_bitmap().atomic_test_and_set(bit_index);
    }
}
```

Instruction-order cost on the write path:

1. Test the source page's generation — a page-metadata read, not a pointer test.
2. Old source, young target: compute the bit index for the field address and test that bit.
3. Bit already set: nothing further (early out).
4. Bit not set: one atomic single-bit set. Atomic because neighbouring bits in the same word
   can be touched concurrently by other mutator threads — a plain read-modify-write would lose
   concurrent sets.

Actual generational ZGC barriers perform additional healing/marking/remembering work depending
on pointer state and phase; the sketch only illustrates why old-to-young slots enter the
remembered set. Measure generated code and workload write topology rather than reducing every
non-cross-generation store to one predicted branch.

## The remembered set is a bitmap, not a card table

`ZBitMap`, in `zRememberedSet.hpp`: **one bit per potential object-field address** inside the
page. There is no card — no fixed-size memory slice — in the real structure. G1's one byte per
512-byte card is a different granularity of tracked datum, not merely a different processing
schedule. The exact bit-to-address mapping and the size of `_bitmap[2]` should be checked
against `zRememberedSet.hpp` / `zGranuleMap.hpp` on the build in use before citing.

### Double buffering instead of a lock

Two bitmaps, `_bitmap[2]`, swapping roles each cycle via `flip()`:

```
Cycle start:  A = active (mutators set bits here), B = previous (GC drains this)
During:       mutator store barriers set bits in A, without a lock
              marking threads consume the frozen snapshot in B
Cycle end:    a synchronisation handshake swaps the roles
```

Current/previous roles let mutators and GC operate on different logical sets during relevant
phases. The precise flip/clearing synchronization is implementation-specific; inspect the
target `ZRememberedSet`/`ZPage` source before claiming that no concurrent access is possible.

A lock would serialise precisely what ZGC exists not to serialise: every old-to-young reference
write in the application would contend against the GC threads for the whole duration of a
marking cycle — tens of milliseconds. That reintroduces application blocking through the back
door, even though it never shows up as a formal STW pause. Double buffering does not eliminate
synchronization cost; role changes occur at collector cycle synchronization points. Do not
label that mechanism a thread-local handshake without an event/source trace from the target.

## Attributing barrier overhead in a profile

```bash
asprof -e cpu -d 30 -f cpu.html <pid>
```

Frames to separate (symbol names vary by build — confirm against the build in use rather than
quoting from memory in an incident report):

- Load barrier: frames under `ZBarrierSetAssembler` / `ZBarrierSet::load_barrier*`
- Store barrier and remembered-set update: frames under
  `ZBarrierSetAssembler::store_barrier*` and remembered-set symbols

Method:

1. Run under representative load with `-XX:StartFlightRecording=filename=zgc.jfr,settings=profile`
   and async-profiler in `cpu` mode over an equivalent window.
2. Named slow-path frames are attributable; inlined fast-path instructions may be charged to
   application frames, so absence is not zero overhead and a load/store-frame ratio is not a
   complete cost metric.
3. Compare equivalent workloads/builds and inspect generated assembly/perf counters only when
   the decision warrants it. Correlate slow paths with GC phase and old-to-young write topology;
   promotion rate alone does not determine all stores.
4. Report every overhead percentage as an expected order of magnitude measured in this
   environment, never as a constant transferable between workloads.

## Sizing and stall decisions

Do not size ZGC with fixed multiples of live set. Establish a time series of live/used/free
and hard/soft-max heap, allocation-rate distribution, large-page/object requests, relocation
progress, young/old cycles, concurrent-worker CPU and cgroup throttling. Model whether free
pages cover allocation until the collector returns capacity under both normal and burst
regimes, including uncertainty and redeploy/live-set growth.

For each stall, distinguish:

| Evidence                                                    | Likely decision axis                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| hard/soft heap headroom exhausted while live set is stable  | justified capacity or soft-max policy                                     |
| concurrent threads starved/throttled                        | CPU quota, `ConcGCThreads`, colocated load                                |
| short allocation spike outruns otherwise healthy cycles     | admission/backpressure, burst capacity, scoped spike-tolerance experiment |
| live set/old occupancy trends upward                        | retention/cache policy before heap expansion                              |
| large page/object allocation fails amid apparent free bytes | page availability/fragmentation and allocation shape                      |

No remediation is “free”: earlier/more collection spends CPU; more heap spends memory and can
alter uncommit behavior; lower allocation or admission changes code/service behavior. Validate
the selected axis against stall count/duration, achieved load, CPU and cgroup headroom.
