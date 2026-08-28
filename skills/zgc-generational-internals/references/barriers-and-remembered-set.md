# Barriers and the remembered set

## The pointer, as it is on JDK 25

Multi-mapping is gone — removed with the non-generational mode by JEP 490. One physical page,
one virtual mapping. Two consequences worth stating explicitly:

- The inflated RSS that `ps` and `top` reported for pre-JDK-24 ZGC processes was an artefact
  of the same physical page being mapped once per colour. Container limits sized from that
  observation were reacting to the mapping, not to resident memory.
- Only **mark and remap state** lives in the pointer bits. Generation does not.

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

In the common case — no active GC, or a pointer that already carries the good colour — this
is an `AND` and a compare: a fraction of a nanosecond per reference read. That the check does
not depend on reading the object is exactly what makes it safe when the object has been moved.

Any pseudocode of the shape `if (obj.color != expected)`, or anything else implying a field
read on the target before the pointer is validated, inverts the dependency order and describes
a mechanism that could not work.

## Store barrier

Non-generational ZGC leaned almost entirely on the load barrier. The generational mode needs a
barrier on **writes** as well, to keep the old-to-young remembered set current:

```
void zgc_store_barrier(Object* obj_holder, size_t offset, Object* value) {
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

The common case — same-generation, old-to-old, or young-to-anything — exits at step 1 at the
cost of a well-predicted branch. Cost only grows for the subset of writes that genuinely cross
old-to-young, which is why store-barrier overhead has to be measured against the workload's
promotion pattern rather than inferred from the load-barrier figure.

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

At no instant do a mutator and a GC thread read and write the same bitmap instance. That
invariant is what removes the need for a lock.

A lock would serialise precisely what ZGC exists not to serialise: every old-to-young reference
write in the application would contend against the GC threads for the whole duration of a
marking cycle — tens of milliseconds. That reintroduces application blocking through the back
door, even though it never shows up as a formal STW pause. Double buffering does not eliminate
the cost; it moves it to a point-in-time handshake at the cycle boundary, the same class of
handshake already present at every STW-to-concurrent transition.

## Attributing barrier overhead in a profile

```bash
./profiler.sh -e cpu -d 30 -o flamegraph -f cpu.html <pid>
```

Frames to separate (symbol names vary by build — confirm against the build in use rather than
quoting from memory in an incident report):

- Load barrier: frames under `ZBarrierSetAssembler` / `ZBarrierSet::load_barrier*`
- Store barrier and remembered-set update: frames under
  `ZBarrierSetAssembler::store_barrier*` and remembered-set symbols

Method:

1. Run under representative load with `-XX:StartFlightRecording=filename=zgc.jfr,settings=profile`
   and async-profiler in `cpu` mode over an equivalent window.
2. Split samples into the two frame groups. The **ratio** between them is the datum; the
   absolute value of a single run is not.
3. Correlate store-barrier peaks with the workload's old-to-young write volume — caches holding
   references, queues of promoted objects. If the workload rarely promotes and store-barrier
   cost is still non-trivial, the promotion rate is higher than expected: profile allocation to
   find out why objects survive longer than the model predicts.
4. Report every overhead percentage as an expected order of magnitude measured in this
   environment, never as a constant transferable between workloads.

## Sizing the heap from the allocation profile

| Allocation profile          | `-Xmx` over live set | Why                                                                                                                                                                                                    |
| --------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Steady, no bursts           | ~2.5x                | Headroom for the concurrent collector to finish relocation without exhausting free pages in steady state                                                                                               |
| Documented sustained bursts | ~3.5-4x              | Steady-state headroom does not cover the window where allocation rate far exceeds the mean; bursts consume free pages faster than relocation returns them, even with `ZAllocationSpikeTolerance` tuned |

Both are expected orders of magnitude to be measured. What must not vary is the reasoning:
start from the steady-state factor and move to the burst range **only** when the workload has
documented bursts. Applying the larger factor "to be safe" wastes memory on a steady workload;
applying the smaller one to a bursty workload produces stalls in peak windows.

The diagnostic signature is temporal. Stalls spread evenly across the day are steady-state
undersizing. Stalls concentrated in peak traffic windows are bursty allocation — measure the
peak-to-mean allocation ratio during the peaks themselves before fixing a number. Carrying G1's
1.5-2x rule across a migration is the usual origin of both.

Escalate in increasing cost order:

1. `-XX:ZAllocationSpikeTolerance` — reacts earlier, no infrastructure cost.
2. `-Xmx` — more headroom for the concurrent collector to absorb the peak.
3. Reduce the application's allocation rate — outside the GC flag surface entirely.

`-XX:+ZProactive` is not on this list. It is already `true`, and it targets idleness and low
allocation: the opposite of a sustained peak, where the cycle is already running continuously
and still not keeping up.
