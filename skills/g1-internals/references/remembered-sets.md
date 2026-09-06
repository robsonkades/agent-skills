# Remembered sets in depth

## The problem the RSet exists to solve

Collecting one old region in isolation raises a question a fixed generational split never
had: is an object in region R referenced from outside R, without scanning the whole heap?
Without remembered information, finding incoming heap references could require a whole-heap scan
for the collection set. It need not be a separate whole-heap scan for each selected region.

Each region that G1 may collect therefore keeps a remembered set: a record of where, in the
rest of the heap, references pointing **into** it live.

```
Object X in region A, at offset 1024, has a field pointing at object Y in region B

RSet of B ⊇ {(region A, card covering offset 1024)}

Collecting B, G1:
  1. combines remembered cards with pending dirty-card and other root work
  2. finds, in each card, the references pointing into B
  3. treats those references as additional collection roots
```

Scanning cost follows the covered cards, objects and roots, not simply the exact number of incoming
references. Stale entries and coarsening can scan more than the live edges require. Write barriers
and refinement maintain conservative information rather than an exact per-reference index.

## Not every region has one

OpenJDK 25 starts young and humongous regions tracked; humongous tracking supports eager reclaim.
New ordinary old regions start untracked, and marking policy selects old regions for rebuilding.
Tracking changes with collection/rebuild state, and candidate groups can share card sets. Untracked
does not mean no region metadata or universally zero RSet-related memory.

After marking, rebuilt candidate sets can change mixed-pause merging cost. Correlate candidate
composition, tracking state and measured memory; a step in cost alone proves neither a leak nor
this particular mechanism. See `g1RemSetTrackingPolicy.cpp` in the sources below.

## The write path on JDK 25

Conceptual scalar post-barrier pseudocode, not executable Java or a replacement for generated
code; JIT elision, bulk stores and architecture-specific paths differ:

```text
obj.field = newValue;
// plus what the JIT inserts after the store (post-write barrier):
//   1. same region?            (addr(field) XOR addr(newValue)) >> log2(region) == 0 -> done
//   2. newValue == null?                                                          -> done
//   3. source field card is young?                                             -> done
//   4. StoreLoad fence, then re-read dirty state; if already dirty              -> done
//   5. mark the source field card dirty, enqueue the card on the thread's
//      dirty-card queue (G1UpdateBufferSize entries per buffer)
```

Card indexing uses the field address and the configured card shift plus table base. The default is
a 512-byte card (`GCCardSizeInBytes`, product flag; 128 and 1024 are
accepted on JDK 25 and show up as `CardTable entry size: N` under `-Xlog:gc+init`).

The barrier does not touch the RSet. Refinement threads drain the queues concurrently and
turn dirty cards into RSet entries in the target regions; whatever is still queued when a
pause starts is processed inside the pause, under `Merge Heap Roots` as `Log Buffers` /
`Dirty Cards` in `-Xlog:gc+phases=debug`. Rising pending work can indicate refinement lag;
also compare pause spacing, write bursts and initial-card-mark batching before attributing it.

Barrier cost depends on executed store paths, filters, JIT transformations, fences, queue processing
and architecture. The fence precedes the dirty-state check on this path, so an already dirty card
does not necessarily avoid it. JMH `-prof gc` measures allocation/GC, not barrier CPU; use controlled
CPU/throughput evidence and inspect the generated path before claiming a percentage.

**JEP 522 (JDK 26)** replaces this post-barrier fence/queue path. The mutator marks the card; a
second card table is swapped in by the refinement threads, which sweep the swapped-out table
(`G1BarrierSet::swap_global_card_table`, and the `SwapGlobalCT` / `SwapJavaThreadsCT` /
`Sweep Refinement table` states in `g1ConcurrentRefine.hpp` on the `jdk-26-ga` tag). The JEP
describes a throughput/memory trade-off; do not turn reported workload-specific results into an
application forecast. A barrier-cost measurement taken on JDK 25 does not carry to 26.

## Refinement control (JDK 20+)

The refinement thread pool is sized from `ParallelGCThreads` (`G1ConcRefinementThreads`,
ergonomic — equal to `ParallelGCThreads` on the runtime measured here). How many are
_active_ is decided against a pause-time budget: refinement aims to leave at most as many
pending dirty cards as the next pause can merge within `G1RSetUpdatingPauseTimePercent`
(default 10) of `MaxGCPauseMillis`. A control thread recomputes the wanted count
periodically; `-Xlog:gc+ergo+refine=debug` prints the target and the actual
(`GC refinement: goal: N + N / Nms, actual: N / Nms`).

The green/yellow/red zone model and its flags (`G1ConcRefinementGreenZone`,
`G1ConcRefinementYellowZone`, `G1ConcRefinementRedZone`, `G1ConcRefinementThresholdStep`,
`G1ConcRefinementServiceIntervalMillis`, `G1UseAdaptiveConcRefinement`) are gone: each is
`Unrecognized VM option` on JDK 25 and stops the JVM. So is the hot card cache
(`G1ConcRSHotCardLimit`, `G1ConcRSLogCacheSize`). A tuning post that mentions any of them
describes legacy mechanisms; check the actual options and target release before copying it.

## The G1CardSet containers (JDK 18+)

The card information uses `G1CardSet`; on JDK 25 a candidate group can share a card set across
target regions. Entries keyed by source-region ranges use density-dependent containers, coarsened in a fixed
order (`g1CardSet.hpp`, `jdk-25-ga`):

| Container      | Holds                                                                                    | Coarsens to    | Flag                                                           |
| -------------- | ---------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------- |
| `Inline`       | A handful of card indexes packed into the pointer itself — no allocation                 | `ArrayOfCards` | —                                                              |
| `ArrayOfCards` | A contiguous array of card indexes                                                       | `Howl`         | `G1RemSetArrayOfCardsEntries` (ergonomic; 32 here)             |
| `Howl`         | An array of `G1RemSetHowlNumBuckets` buckets, each Inline → ArrayOfCards → BitMap → Full | `Full`         | `G1RemSetHowlNumBuckets`, `G1RemSetHowlMaxNumBuckets` (8 here) |
| `BitMap`       | One bit per card, inside a Howl bucket                                                   | bucket `Full`  | `G1RemSetCoarsenHowlBitmapToHowlFullPercent` (90)              |
| `Full`         | "Every card of this source region" — no card granularity                                 | —              | `G1RemSetCoarsenHowlToFullPercent` (90)                        |

All of those flags are experimental. What matters operationally is the last row: a `Full`
entry covers every card in its source range. Merging prepares that card coverage; heap-reference
scanning occurs later under `Scan Heap Roots`, with collection-set and other filters. Coarsening
can increase scanning without proving that merge time alone is the bottleneck.
The old sparse / fine-grained / coarse vocabulary describes the pre-JDK-18
structure; its flag names do not exist on JDK 25.

Two logs show the transitions directly:

```
# -Xlog:gc+remset=debug — per pause, recent and cumulative coarsenings
Coarsening (all): Inline->AoC 1064 (0) AoC->Howl 576 (0) Howl->Full 0 (0) Inline->AoC 621 (0) AoC->BitMap 549 (0) BitMap->Full 0 (0)

# -Xlog:gc+phases=debug — what Merge Heap Roots actually merged
Merged Inline: ...  Merged ArrayOfCards: ...  Merged Howl: ...  Merged Full: ...
Merged Howl Inline: ...  Merged Howl ArrayOfCards: ...  Merged Howl BitMap: ...  Merged Howl Full: ...
Merged Cards: ...   Dirty Cards: ...   Skipped Cards: ...
```

A non-zero `Howl->Full` or `BitMap->Full` counter that keeps rising, together with `Merged
Full` and phase-time evidence, supports “RSet coarsening contributes to the cost”. Densely
connected graphs—caches with many cross references and shared indexes—can produce it. Larger
regions reduce region count but make a coarse/full source-region scan cover more bytes and reduce
collection granularity; measure the container mix and scan time. Reducing unnecessary cross-region
fan-in attacks the cause without assuming a region-size win.

## Measuring RSet memory

```bash
-Xlog:gc+remset=debug    # Visited cards / Total dirty / Coarsening per pause
-Xlog:gc+remset=trace -XX:+UnlockDiagnosticVMOptions -XX:G1SummarizeRSetStatsPeriod=<n>
```

The periodic summary (`Current rem set statistics`) reports `Total per region rem sets
sizes`, the split by region type, the `Free Pool` and per-container segment counts (`Node`,
`Array`, `Howl`, `Bitmap`), and the collection-set candidate group with the largest card
set. Tracking and candidate-group membership change across the cycle; compare
snapshots taken at the same point of the cycle.

Do not estimate totals from region count alone. Report tracked regions/groups, container mix,
allocator/free-pool accounting and snapshot scope; a compact Full marker can reduce metadata while
increasing covered scan work. Memory and scanning costs are distinct.

## Sources

- [OpenJDK 25 tracking policy](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/g1/g1RemSetTrackingPolicy.cpp)
- [OpenJDK 25 post-barrier ordering](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/g1/g1BarrierSet.cpp)
- [OpenJDK 25 merge and scan phases](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/g1/g1RemSet.cpp)
- [OpenJDK 26 dual-table refinement states](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/gc/g1/g1ConcurrentRefine.hpp)
