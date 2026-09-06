# Symptoms and collector behaviour

Read when correlating allocation with GC/stalls or reconciling conflicting measurements.
The arithmetic below is a model with explicit assumptions, not a measured service result.

## Rate, frequency and cost

For roughly steady allocation into an Eden of fixed effective capacity:

```text
young-GC interval ≈ effective Eden bytes consumed / young-allocation bytes per second
pause-time fraction ≈ total stop-the-world pause time / elapsed observation time
```

Do not equate pause-time fraction with GC CPU share: parallel workers and concurrent
collection consume CPU differently. State which metric “GC overhead” means.

Less young allocation often means fewer young collections. It does not guarantee unchanged
pause duration: survivor ages, promotion, adaptive Eden sizing, collection-set composition,
remembered-set scanning and available CPU can all change. A site's 30% share of sampled
bytes is not a prediction of 30% less GC CPU or p99 latency.

An Eden-region count times region size is a rough capacity/consumption estimate, not exact
object bytes. Exclude survivor regions; record partial-region and TLAB-waste uncertainty.
G1 humongous allocations and Serial pretenured allocations bypass Eden. Do not use a
whole-heap before/after-GC delta as bytes allocated; collection changes it too.

If pauses lengthen at a stable allocation rate, inspect GC phases, survivor/promotion
data, collection-set size and CPU scheduling before inferring a leak. Increasing old
occupancy can include direct-old allocation; it is not by itself promotion. Collector
phase analysis belongs to `gc-log-analysis`; retained-object/root analysis belongs to
`heap-dump-analysis` or `java-reference-types-and-leaks`.

## G1 humongous allocation

Obtain the actual region size, object header mode and alignment. In OpenJDK 25 GA,
`G1CollectedHeap::is_humongous` compares the **aligned total object size** strictly
greater than half a region. Exactly half is not humongous in that implementation.
A byte-array payload of half a region usually crosses the threshold after headers and
alignment. Never compare only payload bytes, or infer region size from heap size when
actual flags are available.

There is a source discrepancy: the [JDK 25 tuning guide](https://docs.oracle.com/en/java/javase/25/gctuning/garbage-first-g1-garbage-collector1.html)
says greater than or equal, but the [tagged implementation](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/g1/g1CollectedHeap.hpp)
uses strict greater-than. Use the implementation for an exact boundary decision and
verify a vendor/build difference before generalizing.

Humongous objects consume contiguous old regions, including unusable tail space in the
last region. Allocation can trigger a concurrent-start young pause when occupancy warrants
it; an outside-TLAB allocation alone does not prove humongous size. Unreachable humongous
objects may be eagerly reclaimed at a young pause when eligible, or reclaimed through
marking/full collection. Unchanged counts at one pause do not prove strong reachability,
a cache, or a leak.

| Observation                                                           | Candidate explanation                              | Discriminating evidence / adjustment                                                         |
| --------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Humongous regions fall to zero repeatedly with high buffer allocation | Short-lived large buffers                          | Correlate buffer stacks, sizes and traffic; test chunked streaming or bounded reuse          |
| Humongous regions stay high                                           | Live buffers or delayed/ineligible reclamation     | Follow a completed marking cycle and inspect ownership/root evidence if needed               |
| Sizes lie just above half a region                                    | Representation crosses G1's boundary               | Compare trimming/chunking with a region-size experiment; include aligned size and tail waste |
| Outside-TLAB events dominate                                          | Large objects or ordinary TLAB slow-path decisions | Verify actual object sizes against region size before invoking humongous remedies            |

Region-size changes alter placement and collection granularity, not bytes requested by
the application. Validate pause/stall behavior and occupancy as well as allocation. Detailed
G1 sizing and policy belong to `g1-internals`.

## ZGC allocation stalls

`jdk.ZAllocationStall`, when present in the target schema, identifies a thread waiting for
allocation and can carry the requested size/type and stack. It names a **blocked allocation**,
not necessarily the workload that consumed the heap or CPU headroom. Correlate stall
durations with the affected request window, concurrent-cycle progress, heap headroom,
process CPU limits and aggregate allocation stacks.

Avoidable allocation, insufficient heap, delayed reclamation and insufficient collector
CPU are competing hypotheses. Reduce a measured avoidable site if supported; otherwise
hand the evidence to `zgc-and-shenandoah` for heap/collector diagnosis. Do not prescribe
spike-tolerance flags from a stall count alone.
Check the [JDK 25 event schema](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/jfr/metadata/metadata.xml)
before requesting event fields.

## TLAB refill versus latency

The fast path allocates within a thread-local buffer. Refilling does not intrinsically
require a global pause, but slow allocation can encounter GC, synchronization or memory
commit/page-fault costs. A refill count is neither its duration nor a root cause.
For a p99 spike, align request timestamps with GC/stall/safepoint data and distinguish
time at a safepoint from time reaching it. If that does not account for the spike, gather
CPU/elapsed-time or OS evidence; do not declare it harmless because refill is thread-local.
Timeline diagnosis belongs to `pause-attribution`.

## Why measurements disagree

| Measurement                      | Population / blind spot                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| JFR allocation samples           | Weighted site attribution; boundary tails and sparse samples affect totals and ranking          |
| async-profiler alloc             | Different sampling engine/window/filter may rank differently; preserve byte weighting           |
| Legacy HotSpot allocation events | Refill-triggering objects plus outside-TLAB objects; not a census of in-TLAB objects            |
| Thread counter deltas            | No stacks; periodic capture can miss short-lived threads; platform/carrier is not task identity |
| Live allocation samples          | Sampled objects not yet collected at session end; recent garbage can still be present           |
| Histogram / heap dump            | Current population; collection policy matters, and `-all` can include unreachable objects       |
| Eden consumption                 | Young-allocation approximation; excludes direct-old traffic                                     |

Compare identical windows, versions, populations and load before calling a discrepancy a
tool error. A histogram plus an allocation profile showing the same class does not prove
the same instances survived or promoted. Seek generation/lifetime/root evidence as needed.
A flat post-GC heap with high allocation supports churn; a growing retained set redirects
the investigation toward retention.

Unreferenced filler objects in heap inspection may be HotSpot's heap-parsability padding.
Do not infer a leak solely from `FillerElement[]` / `FillerObject` class names; establish
the build and reference paths before deciding whether a heap object needs action.
