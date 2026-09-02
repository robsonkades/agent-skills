# Remembered sets in depth

## The problem the RSet exists to solve

Collecting one old region in isolation raises a question a fixed generational split never
had: is an object in region R referenced from outside R, without scanning the whole heap?
Without an auxiliary structure, collecting N regions would cost O(whole heap) per region —
the opposite of what an incremental design promises.

Each region that G1 may collect therefore keeps a remembered set: a record of where, in the
rest of the heap, references pointing **into** it live.

```
Object X in region A, at offset 1024, has a field pointing at object Y in region B

RSet of B ⊇ {(region A, card covering offset 1024)}

Collecting B, G1:
  1. scans only the cards listed in B's RSet — not the heap
  2. finds, in each card, the references pointing into B
  3. treats those references as additional collection roots
```

The cost of collecting a region becomes proportional to the number of references pointing at
it, not to the size of the heap. The price is keeping the record current on every new
cross-region reference — which is what the write barrier and the refinement threads do.

## Not every region has one

G1 maintains remembered sets only for regions it may put in a collection set: every young
region, and the old regions that marking selected as candidates. The rest of the old
generation carries no RSet at all. After `Pause Remark`, the `Concurrent Rebuild Remembered
Sets and Scrub Regions` phase builds RSets for the candidates only; `-Xlog:gc+ergo=debug`
logs it as `Update Region Liveness and Select For Rebuild`. Two consequences:

- Old-generation growth is free in RSet memory until a region becomes a candidate.
- `Merge Heap Roots` can step up right after a marking cycle, because the collection set now
  includes old regions whose RSets did not exist before the rebuild. That is the mechanism,
  not a leak.

## The write path on JDK 25

```java
obj.field = newValue;
// plus what the JIT inserts after the store (post-write barrier):
//   1. same region?            (addr(obj) XOR addr(newValue)) >> log2(region) == 0 -> done
//   2. newValue == null?                                                          -> done
//   3. card already dirty?     card_table[addr(obj) >> 9] == DIRTY                -> done
//   4. mark the card dirty, StoreLoad fence, enqueue the card on the thread's
//      dirty-card queue (G1UpdateBufferSize entries per buffer)
```

`>> 9` is the default 512-byte card (`GCCardSizeInBytes`, product flag; 128 and 1024 are
accepted on JDK 25 and show up as `CardTable entry size: N` under `-Xlog:gc+init`).

The barrier does not touch the RSet. Refinement threads drain the queues concurrently and
turn dirty cards into RSet entries in the target regions; whatever is still queued when a
pause starts is processed inside the pause, under `Merge Heap Roots` as `Log Buffers` /
`Dirty Cards` in `-Xlog:gc+phases=debug`. A rising `Dirty Cards` count per pause means
refinement is falling behind the mutator's write rate.

The aggregate barrier overhead depends entirely on how much of the hot path writes
references: filters 1–3 make most stores cheap, and step 4 — the fence plus the enqueue — is
what a reference-heavy workload pays. Confirm the number with a JMH `-prof gc` run on your
own code rather than quoting a percentage.

**JEP 522 (JDK 26)** removes step 4's fence and queue. The mutator only marks the card; a
second card table is swapped in by the refinement threads, which sweep the swapped-out table
(`G1BarrierSet::swap_global_card_table`, and the `SwapGlobalCT` / `SwapJavaThreadsCT` /
`Sweep Refinement table` states in `g1ConcurrentRefine.hpp` on the `jdk-26-ga` tag). The JEP
reports 5–15% throughput on reference-heavy workloads for about 2 MB of extra memory per GB
of heap, with no new flag. A barrier-cost measurement taken on JDK 25 does not carry to 26.

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
predates JDK 20 and will not start a modern JVM.

## The G1CardSet containers (JDK 18+)

The remembered set is a `G1CardSet`: per target region, a hash table keyed by source region
whose entries hold one of five container types, chosen by density and coarsened in a fixed
order (`g1CardSet.hpp`, `jdk-25-ga`):

| Container      | Holds                                                                                    | Coarsens to    | Flag                                                           |
| -------------- | ---------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------- |
| `Inline`       | A handful of card indexes packed into the pointer itself — no allocation                 | `ArrayOfCards` | —                                                              |
| `ArrayOfCards` | A contiguous array of card indexes                                                       | `Howl`         | `G1RemSetArrayOfCardsEntries` (ergonomic; 32 here)             |
| `Howl`         | An array of `G1RemSetHowlNumBuckets` buckets, each Inline → ArrayOfCards → BitMap → Full | `Full`         | `G1RemSetHowlNumBuckets`, `G1RemSetHowlMaxNumBuckets` (8 here) |
| `BitMap`       | One bit per card, inside a Howl bucket                                                   | bucket `Full`  | `G1RemSetCoarsenHowlBitmapToHowlFullPercent` (90)              |
| `Full`         | "Every card of this source region" — no card granularity                                 | —              | `G1RemSetCoarsenHowlToFullPercent` (90)                        |

All of those flags are experimental. What matters operationally is the last row: a `Full`
entry forces the merge phase to scan the **entire** source region rather than its dirty
cards, which is where high `Merge Heap Roots` with no explanation in allocation or promotion
rate comes from. The old sparse / fine-grained / coarse vocabulary describes the pre-JDK-18
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
Full` above zero, is the evidence for "RSet coarsening is the cost". Densely connected object
graphs — caches with many cross references, shared index structures — are the workload shape
that produces it; raising `G1HeapRegionSize` lowers the region count and the fan-in per
region, and reducing cross-region references in the design attacks the cause.

## Measuring RSet memory

```bash
-Xlog:gc+remset=debug    # Visited cards / Total dirty / Coarsening per pause
-Xlog:gc+remset=trace -XX:+UnlockDiagnosticVMOptions -XX:G1SummarizeRSetStatsPeriod=<n>
```

The periodic summary (`Current rem set statistics`) reports `Total per region rem sets
sizes`, the split by region type, the `Free Pool` and per-container segment counts (`Node`,
`Array`, `Howl`, `Bitmap`), and the collection-set candidate group with the largest card
set. Because only candidates carry an RSet, the figure moves with each marking cycle; compare
snapshots taken at the same point of the cycle.

The arithmetic is only as good as its assumption: an 8 GB heap with 2048 regions and a few
hundred `ArrayOfCards` entries per candidate is single-digit megabytes; one `Full` entry per
source region across a dense graph is a different regime in both memory and scan time. Never
present a total without the container mix that produced it.
