# Remembered sets in depth

## The problem the RSet exists to solve

Collecting one old region in isolation raises a question a fixed generational split never
had: is an object in region R referenced from outside R, without scanning the whole heap?
Without an auxiliary structure, collecting N regions would cost O(whole heap) per region —
the opposite of what an incremental design promises.

Each region therefore keeps a remembered set: a record of where, in the rest of the heap,
references pointing **into** it live.

```
Object X in region A, at offset 1024, has a field pointing at object Y in region B

RSet of B ⊇ {(region A, card covering offset 1024)}

Collecting B, G1:
  1. scans only the cards listed in B's RSet — not the heap
  2. finds, in each card, the references pointing into B
  3. treats those references as additional collection roots
```

The cost of collecting a region becomes proportional to the number of references pointing at
it, not to the size of the heap. Think of it as a library's reverse index: rather than
searching every shelf for citations of one book, each book keeps a slip of who cited it. The
price is keeping the slip current on every new citation — which is what the write barrier
does.

## The write path

```java
obj.field = newValue;
// plus the instruction the JIT inserts:
card_table[address(obj) >> 9] = DIRTY;   // >> 9 divides by 512
```

The barrier does not touch the RSet. It marks the 512-byte card dirty and enqueues it on a
per-thread dirty card queue. Concurrent refinement threads
(`-XX:G1ConcRefinementThreads`) drain those queues in parallel with the application and turn
dirty cards into RSet entries in the target regions — which is why young GC does not pay for
that conversion synchronously.

The literature puts the per-reference-store cost at a few machine instructions. The aggregate
overhead depends entirely on how much of your hot path writes references: a single-digit
fraction in most services, considerably more in workloads dominated by mutable graphs
(caches, in-memory index structures). Confirm it with a JMH `-prof gc` run on your own
workload rather than quoting a percentage.

## The hot card cache

Some cards are rewritten repeatedly in short windows — a counter field, a ring-buffer head.
Refining such a card now, only for it to be dirtied again a millisecond later, spends
concurrent work for no net benefit. Cards identified as hot have their refinement **deferred**
to the next young GC, so they are scanned once, in the stop-the-world pause, in whatever
state they are then in.

There is no stable public flag for inspecting this directly. The practical observation is to
compare `Merge Heap Roots` / `Merge RS` cost against the workload's reference write rate: if
merge cost is disproportionately low for a high write rate, hot cards are being filtered
effectively.

The default refinement thread count is derived from `ParallelGCThreads`. Confirm the value in
your own runtime before tuning it:

```bash
java -XX:+PrintFlagsFinal -version | grep -i ConcRefinementThreads
```

## The three representations

Each region keeps, per source region pointing at it, one of three representations, chosen
dynamically by reference density:

| Representation   | Used when                                                 | Structure                                       | Trade-off                                                                                      |
| ---------------- | --------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Sparse**       | Few cross references from one specific source region      | Compact table of (region, cards) pairs          | Minimal memory; degrades once entries per source exceed a fixed capacity                       |
| **Fine-grained** | One source region exceeds the sparse capacity             | Bitmap, one bit per card of that source         | O(1) scan per card; memory proportional to the whole source region's card count                |
| **Coarse**       | The number of distinct source regions exceeds a threshold | One bit per source region — no card granularity | Bounded memory under high fan-in, but scanning requires sweeping each **entire** source region |

```
Sparse: {(regionA, cards:[12,340])}                  ← few entries, precise
Fine:   regionA → bitmap of 8192 bits (4 MB region)  ← one source, dense
Coarse: bit(regionA)=1, bit(regionB)=1, ...          ← many sources, precision lost
```

Promotion to the coarse representation is silent and has a concrete effect on pause time:
collecting a region whose RSet is coarse for several sources forces G1 to scan each of those
source regions in full. That is exactly the cause that shows up as high `Merge RS` with no
explanation in allocation or promotion rate. Densely connected object graphs — caches with
many cross references, shared index structures — are the workload shape that pushes RSets
coarse.

The exact transition thresholds are internal and their flag names are not guaranteed stable
across releases. Check `-XX:+PrintFlagsFinal` on your build before putting any of them in a
runbook. What is stable is the principle: under high fan-in the cost moves from memory to
scan time.

## Sizing the overhead, with the arithmetic shown

An 8 GB heap with 4 MB regions has 2048 regions. Assuming — for this calculation only — 200
RSet entries per region at roughly 8 bytes each, typical of a compact fine-grained
representation:

```
2048 regions × 200 entries × 8 bytes ≈ 3,276,800 bytes ≈ 3.2 MB
```

Small against 8 GB — but the assumption is **low fan-in**. In dense graphs the entry count
per region grows and the representation is promoted, at which point neither the memory figure
nor the scan cost follows this arithmetic any more. Never present the result without the
assumption that produced it.

```bash
-Xlog:gc+remset=debug   # "Remembered Set sizes:" reports size by region type
```
