# Shenandoah internals

## The Load Reference Barrier

Inserted by the JIT on every read of an object reference, and on both operands of a reference
write:

```c
Object* shenandoah_lrb(Object* obj) {
    if (obj == NULL) return NULL;
    Object* fwd = obj->forwarding_pointer;
    // not relocated: forwarding_pointer == obj (self-pointer)
    // relocated:     forwarding_pointer points at the new location
    return fwd;
}

void shenandoah_store(Object* obj, int offset, Object* value) {
    obj   = shenandoah_lrb(obj);     // resolve the target object
    value = shenandoah_lrb(value);   // resolve the value being written
    obj[offset] = value;             // never persist a pointer to a stale location
}
```

There is no fast/slow split. The dereference happens on every access, cycle or no cycle. Recent
builds elide part of it where the compiler has locally proved the pointer cannot have moved
within the method, but the barrier remains structurally present on every heap reference read.

Self-healing is a real optimisation with build-specific variants: after resolving a moved
object, the LRB may update the memory slot it read from so the next read of the same slot does
not follow the forwarding pointer again. It reduces the amortised cost of repeated reads after
a relocation; it does not remove the barrier. Confirm which barriers and which phases apply it
on the build in use.

## Cost shape, against ZGC

| Mechanism          | Fast path                                                                                  | Slow path                                                         | Memory overhead                                                            |
| ------------------ | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| LRB (Shenandoah)   | Always runs: one unconditional load of the forwarding pointer                              | No distinction — the load happens whether or not the object moved | +8 bytes per object (forwarding word), fixed, with or without an active GC |
| Load barrier (ZGC) | Inline check: `AND` plus compare against the good-colour mask, usually predicted correctly | Only when the colour is stale — resolved via the forwarding table | 0 extra bytes per object; the cost is in pointer bits                      |

Neither is free; the **shape** differs. Shenandoah pays a fixed, uniform cost on every
reference read and write regardless of relocation activity. ZGC pays a conditional cost,
cheaper in the common case and more expensive when the slow path fires often. That is the
structural reason benchmarks tend to show lower barrier overhead for ZGC in workloads with
little active relocation — a pattern to verify on your workload, not a measurement.

## Isolating barrier cost

```bash
./profiler.sh -e cpu -d 30 -o flamegraph -f cpu.html <pid>

# frames to look for (async-profiler 3.x+; symbols vary by build):
#   ShenandoahBarrierSet::need_load_reference_barrier
#   ShenandoahBarrierSet::use_native_load_reference_barrier
```

Significant time inside barrier frames **outside** any `Concurrent` phase visible in the GC log
is evidence that the overhead is per-access cost, not concurrent work. Symbol names change
between Shenandoah releases and async-profiler versions, and aggressive inlining can hide the
frame entirely — confirm against the production build before basing an incident conclusion on
one.

## The phase sequence

The same in both modes; what differs is which regions each cycle considers.

```
1. Init Mark                    STW, a few ms — enables the LRB, marks roots
2. Concurrent Marking           concurrent — SATB marking; the LRB keeps marking correct
                                under concurrent mutation
3. Final Mark                   STW, a few ms — drains remaining SATB buffers,
                                selects the collection set
4. Concurrent Cleanup           concurrent — frees wholly garbage regions, no relocation
5. Concurrent Evacuation        concurrent — copies the collection set into new regions;
                                the LRB redirects concurrent access via forwarding pointers
6. Init Update References       STW, sub-ms — handshake starting the reference update
7. Concurrent Update References concurrent — updates every heap reference to new addresses
8. Final Update References      STW, a few ms — finishes updating roots
9. Concurrent Cleanup           concurrent — frees the evacuated source regions
```

In generational mode a **young** cycle runs this sequence restricted to young regions, using
the remembered set to handle old-to-young references without scanning old; an **old** cycle,
much less frequent, handles the inverse. In `passive` mode every phase above collapses into
STW — the same operations, world stopped.

Illustrative log shape for the default mode; confirm the format on your build before writing a
parser, and note that the `Trigger` line shows `InitFreeThreshold` at work during learning
(70% of 8192M is about 5734M free):

```
[gc] Trigger: Learning 1 of 5. Free (5734M) is below initial threshold (5734M)
[gc] GC(1) Concurrent reset 3.456ms
[gc] GC(1) Pause Init Mark 0.234ms
[gc] GC(1) Concurrent marking 234.567ms
[gc] GC(1) Pause Final Mark 3.789ms
[gc] GC(1) Concurrent evacuation 45.678ms
[gc] GC(1) Pause Init Update Refs 0.123ms
[gc] GC(1) Concurrent update references 89.012ms
[gc] GC(1) Pause Final Update Refs 1.234ms
```

Because the STW phases are short by design, applying safepoint-level pause instrumentation to
Shenandoah usually shows the synchronisation term dominating rather than the operation term.

## Generational mode

| Milestone                              | JEP     | Status                                          | JDK |
| -------------------------------------- | ------- | ----------------------------------------------- | --- |
| Generational Shenandoah (experimental) | JEP 404 | Experimental — requires the experimental unlock | 24  |
| Generational Shenandoah                | JEP 521 | **Product** — no unlock needed                  | 25  |

```bash
# generational, product on JDK 25 — explicit opt-in
java -XX:+UseShenandoahGC -XX:ShenandoahGCMode=generational -jar app.jar

# without that flag: single-generation, even though the generational
# mode is available in the same build
java -XX:+UseShenandoahGC -jar app.jar

jcmd <pid> VM.flags -all | grep -i ShenandoahGCMode
```

Product describes maturity and official support; default describes what runs when nothing is
specified. They are independent axes.

The heap is partitioned by region into young and old. Old-to-young references are tracked
through a **card-table remembered set**: a post-write barrier dirties the corresponding card
whenever a write creates a reference from an old object to a young one, and a young cycle scans
only the dirty cards rather than the whole old generation. The card granularity varies between
builds; the mechanism generalises, the bit layout does not.

The LRB cannot serve this purpose. It resolves a forwarding pointer on a read and says nothing
about generations. The old-to-young relation can only be captured when the reference is
**written** — waiting for the next read would be too late, and for a reference written and
never read again it would never happen at all.

| Aspect                                 | Default (single-gen)                                    | Generational (opt-in, JEP 521)                            |
| -------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- |
| Treats young and old alike             | Yes                                                     | No — separate, more frequent young cycles                 |
| Barriers                               | LRB only                                                | LRB plus post-write barrier for the remembered set        |
| Extra memory                           | +8 bytes per object                                     | +8 bytes per object plus the remembered set               |
| Throughput under high young allocation | Degrades — marks and evacuates every object every cycle | Improves — young cycles ignore old except for dirty cards |
| Maturity on JDK 25                     | Production-ready, longer tested                         | Product since JEP 521, less battle-tested at scale        |

Among the three generational region-based collectors, Shenandoah's remembered set is
structurally the closest to G1's: a classic card table with fixed granularity, scanned during
young cycles. ZGC's is per page with explicit double buffering between the stable set being
consumed by marking and concurrent mutations arriving in the same cycle. Shenandoah's is the
newest of the three and deliberately reuses a validated mechanism rather than inventing one.

## The cycle-time budget

The adaptive heuristic starts a cycle when free heap falls below a threshold. During the
learning phase — the first `ShenandoahLearningSteps` cycles, default 5 — that threshold is
`ShenandoahInitFreeThreshold`, whose real default is **70**. After learning, the trigger is
estimated from observed allocation rate and cycle duration with a safety margin, but the
physical constraint below still holds with a dynamically recomputed threshold.

```
H   = Xmx
IFT = ShenandoahInitFreeThreshold (%, default 70 — governs the learning phase)
MFT = ShenandoahMinFreeThreshold  (%, default 10 — safety floor in every phase)
A   = sustained allocation rate (bytes/s)
C   = real duration of the full concurrent cycle

A cycle starts when free = IFT% × H. To avoid a degenerated GC, allocation during the
cycle must not consume free space below MFT% × H:

    A × C <= (IFT − MFT)% × H

    C_max = (IFT − MFT) × H / (100 × A)
```

Worked: `H = 8192 MB`, defaults `IFT = 70`, `MFT = 10`, so the budget is `60% × 8192 MB =
4915 MB`. At `A = 500 MB/s`, `C_max ≈ 9.8 s` — comfortable if the measured concurrent cycle
runs 1–3 s. At a peak of `A = 3 GB/s`, `C_max ≈ 1.6 s`, and a cycle still taking 2–3 s **will**
degenerate. Cycle duration depends on live set and heap size, not on the allocation rate, so it
does not shrink to meet the shrinking budget.

This is a **time** constraint, distinct from the **capacity** constraint `Xmx >= live set ×
~2.5` which guarantees physical room to evacuate. A heap can satisfy one and violate the other.

Note what the formula implies: enlarging `H` raises `C_max` linearly but does not reduce the
marking work per cycle, because single-generation Shenandoah marks every live object, young or
old, every cycle. For high young allocation, more heap buys time; generational mode reduces `C`
for young cycles, which is the cause.

A legacy `-XX:ShenandoahInitFreeThreshold=35` halves the budget against the default:
`(35 − 10)% = 25%` of the heap against `60%`. For a spiky workload that is backwards — spikes
are when more budget is needed. Raise it instead.

## Heuristics

| Heuristic            | Trigger                                                                                                                                   | Role of the thresholds                                                                                                                       | Use                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `adaptive` (default) | First `ShenandoahLearningSteps` cycles: fire when `free < InitFreeThreshold%`. After that, estimate from observed `A` and `C` with margin | `InitFreeThreshold` governs learning only; `MinFreeThreshold` is respected in every phase — below it GC is forced regardless of the estimate | Production default; converges on the workload's real behaviour                                  |
| `static`             | Fires at a fixed heap occupancy, no learning, no adaptation                                                                               | Does not use the learning phase — identical behaviour from the first cycle                                                                   | Predictable load where `A` is already measured and a deterministic, auditable trigger is wanted |
| `compact`            | Fires earlier, tolerates a smaller residual heap, accepts more cycles                                                                     | More conservative than `adaptive` about free threshold, prioritising footprint over CPU                                                      | Constrained heap where footprint dominates throughput                                           |
| `aggressive`         | GC runs almost continuously, waiting for no threshold                                                                                     | Ignores threshold logic entirely                                                                                                             | Stress-testing the collector and correctness diagnosis only — not production                    |

## Flags, with real defaults

```bash
# basic production — adaptive heuristic, defaults implicit
-XX:+UseShenandoahGC -Xmx8g -Xms8g

# the same defaults made explicit
-XX:+UseShenandoahGC -Xmx8g -Xms8g \
  -XX:ShenandoahGCHeuristics=adaptive \
  -XX:ShenandoahInitFreeThreshold=70 \
  -XX:ShenandoahMinFreeThreshold=10 \
  -XX:ShenandoahLearningSteps=5

# allocation-spiky workload: raise the initial threshold, do not lower it
-XX:ShenandoahInitFreeThreshold=80 -XX:ShenandoahMinFreeThreshold=15

# generational
-XX:+UseShenandoahGC -XX:ShenandoahGCMode=generational -Xmx8g -Xms8g

# diagnosis only: fully STW, no barriers needed
-XX:+UseShenandoahGC -XX:ShenandoahGCMode=passive -Xmx8g -Xms8g
```

The adaptive heuristic self-calibrates after learning. Tuning the thresholds by hand is
justified mainly when the allocation profile changes faster than the heuristic can relearn —
seasonal peaks, traffic regime changes. Tuning without first measuring `A` is guessing.

`passive` removes all concurrency; marking, evacuation and reference updating all run inside
STW pauses, exactly like a G1 without concurrent phases. It **does** evacuate and compact —
objects move and forwarding pointers are updated. The only change is that with no mutator
running concurrently, no barrier is needed, because no application thread can observe an
inconsistent state. That property makes it useful for two things: if a problem disappears under
`passive`, the cause is in the concurrency mechanism (LRB, SATB, remembered set) rather than
the marking or evacuation algorithm; and it measures the live set without the noise of
overlapping concurrent cycles.

## The two fallbacks

```
[gc] Degenerated GC: 512M->256M(1024M) 234.567ms
```

| Fallback       | What happens                                                                                                                                                                                                  | What it means                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Degenerated GC | The concurrent cycle was already under way when the heap came under too much pressure to continue concurrently. Shenandoah **completes the started cycle in STW from where it stopped** — it does not restart | The time constraint was violated: real `C` exceeded `C_max`. Adjustable through heuristic and thresholds, or by reducing allocation rate |
| Full GC        | Rarer and more expensive: even degenerated evacuation could not free enough space, for example because fragmentation prevents partial compaction. Restarts collection from scratch, STW, over the whole heap  | A structural capacity or fragmentation problem. No threshold fixes it                                                                    |

Both are labelled explicitly in the log. Reading a degenerated GC as "just increase the heap"
skips the diagnosis: check the capacity constraint and the time constraint separately, because
they have different fixes.

## Comparing Shenandoah with ZGC

Any comparison that does not state `ShenandoahGCMode` compares Shenandoah at a structural
disadvantage — without the generational hypothesis — against ZGC, which has had it built in as
its only mode since JEP 490. The gap is widest exactly where such benchmarks tend to run: high
young allocation.

| Aspect                                   | ZGC (generational, only mode)          | Shenandoah default (single-gen)  | Shenandoah generational (opt-in)        |
| ---------------------------------------- | -------------------------------------- | -------------------------------- | --------------------------------------- |
| Barrier                                  | Conditional load barrier               | Unconditional LRB                | LRB plus post-write barrier             |
| Memory overhead                          | Pointer bits, no extra word per object | +8 bytes per object              | +8 bytes per object plus remembered set |
| Sensitive to the generational hypothesis | Yes, since JEP 439/474/490             | No — every object treated alike  | Yes — JEP 404/521                       |
| Throughput under high young allocation   | Good — cheap young cycles              | Degrades                         | Improves                                |
| Maturity on JDK 25                       | Production-ready                       | Production-ready, longest tested | Product since JEP 521, newest           |
| Platforms                                | Linux primarily                        | Linux, Windows, macOS            | Linux, Windows, macOS                   |

When a published benchmark concludes Shenandoah loses on throughput under high allocation, the
first question is which mode it ran. If it ran the default — which is what happens when no
extra flag is passed — the result may reflect the missing mode rather than a limit of the
collector. Re-run with `-XX:ShenandoahGCMode=generational` before generalising.
