# Reducing allocation and validating the fix

Read once evidence names a site, or when reviewing a proposed pool, TLAB flag or unmeasured
“allocation-free” rewrite. A regression against comparable work or a breached service
budget is the trigger; there is no universal GC CPU threshold that justifies optimization.

## From site to intervention

Prefer removing repeated or discarded work before adding a lifecycle-managed cache or
pool. If the bytes are inherent to the contract, consider streaming/batching only where
semantics permit; otherwise pass measured rate, lifetime and headroom to collector sizing.
Do not force a code change solely because a site tops the profile.

| Measured shape                             | Candidate change                                | Condition to check                                                                            |
| ------------------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Repeated `report += ...` in a loop         | Appropriately sized `StringBuilder`             | Same output; avoid retaining oversized builders                                               |
| `Formatter` / `MessageFormat` per item     | Format once or simpler construction             | Preserve locale, precision, escaping and formatting semantics                                 |
| Charset encode/decode round trips          | Keep one representation or stream into a buffer | Same encoding and malformed-input handling; encoder ownership is explicit                     |
| Finite computed names rebuilt per item     | Precompute the bounded set                      | Cardinality and configuration lifetime are known                                              |
| `ArrayList.grow` / `HashMap.resize` arrays | Pre-size from expected result cardinality       | Map capacity must account for load factor; oversizing increases retention                     |
| `groupingBy` / numeric collectors          | Primitive sums/counts or a primitive pipeline   | Preserve grouping, empty-input and numerical behavior; accumulation order can change rounding |
| Boxing, capturing lambdas, iterators       | Primitive/noncapturing or indexed alternative   | Confirm real heap allocation on a warmed hot site; indexed traversal must suit the collection |
| Varargs array at a call site               | Fixed-arity API or level-appropriate log guard  | Inspect the resolved overload and eager argument evaluation                                   |
| Megabyte buffers per request               | Chunked streaming or bounded reuse              | Protocol, ownership, lifetime and backpressure permit it                                      |

[`List.of(a, b)`](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/List.html#of(E,E)>)
already has a fixed-arity overload; it is not evidence of a varargs array.
Logging APIs may also have fixed-arity overloads. An `isDebugEnabled()` guard is appropriate
for debug work, not an info log. Even with a fixed-arity overload, expressions such as
`expensiveToString()` run before the call unless guarded or a suitable lazy API is used.
Confirm the library/version and actual allocating stack before changing either.

Static source constructs do not tell whether C2 eliminated their allocations. Measure
under representative compilation and call-site types. Do not rewrite all streams or claim
elimination from a missing sample; detailed mechanism belongs to
`jit-inlining-and-escape-analysis`.

## Pooling is a tradeoff to demonstrate

Default against pooling small, cheap, short-lived objects: reuse adds ownership, cleanup
and retention complexity and can defeat allocation elimination. This is a default, not a
claim that every pool uses atomics or must be slower. A thread-confined free list differs
from a shared concurrent pool.

For expensive resources or repeatedly allocated large buffers, compare bounded reuse
with ordinary allocation and streaming. Before implementing reuse, specify:

- Maximum retained bytes and how oversized/idle entries are discarded.
- Exclusive ownership, return on exceptions/cancellation, and behavior at exhaustion.
- State reset and clearing of references or sensitive contents before another borrower.
- Measured construction/reset cost, hit/miss rate, contention and concurrency.

There is no universal 200-byte, 1-KB or 90%-hit-rate boundary. A miss adds bookkeeping,
and reset/queueing can outweigh saved allocation even at a high hit rate. A long-lived
mutable pool can retain young objects and add collector-specific barrier/card-scanning
work; not every store creates a distinct remembered-set entry.

Validate total bytes/op **and** retained heap, CPU, throughput and tail latency at expected
and burst concurrency. If reuse is implemented, tests must cover state isolation,
exception/cancellation return paths, capacity limits and oversized objects. Reject reuse
when ownership cannot be made correct or a repeatable benefit is absent.

## Flags and representation changes

| Candidate                                          | When it may help                                       | What to validate                                                                                |
| -------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `UseCompactObjectHeaders` on a supporting JVM      | Small-object-heavy layout                              | Actual aligned sizes and total bytes/op; benefit depends on baseline headers/alignment          |
| `UseStringDeduplication` on a supporting collector | Retained duplicate string backing arrays               | Retained heap and deduplication cost; the strings/arrays were allocated first                   |
| `PretenureSizeThreshold` with Serial DefNew        | Large outside-TLAB objects needing different placement | Placement and GC consequences; this does not reduce allocation or provide G1 pretenuring        |
| `G1HeapRegionSize`                                 | Measured sizes just crossing the humongous threshold   | Aligned sizes, region occupancy, tail waste and pause/stall impact; bytes requested do not fall |

Use actual runtime flags and supported combinations. Compact headers are an optional
experiment, not a mandatory step before code work; header reduction does not make every
object smaller after alignment. Layout analysis belongs to `object-layout-and-footprint`.
Do not use `String.intern()` as an unbounded domain cache: canonicalization needs measured
duplication, cardinality and ownership. String deduplication is a retention mechanism;
its availability and benefit must be checked for the target collector.

For Serial, the relevant decision is
[DefNewGeneration::should_allocate](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/serial/defNewGeneration.hpp);
TLAB allocations bypass its object-size pretenuring test. An accepted JVM option is not
proof that the chosen collector uses it.

## TLAB controls: mechanics before experiments

OpenJDK 25 source defaults below are starting points, not measured values on the target.
Inspect effective flags and use the logging interpretation in `allocation-tools.md`.

| Flag                       | Source default             | Meaning                                                                                 |
| -------------------------- | -------------------------- | --------------------------------------------------------------------------------------- |
| `UseTLAB` / `ResizeTLAB`   | true / true                | Enable buffers / adapt size                                                             |
| `TLABSize` / `MinTLABSize` | 0 (ergonomic) / 2048 bytes | Initial target / lower bound                                                            |
| `TLABWasteTargetPercent`   | 1                          | Sizing target based on estimated unused Eden space at GC, not a hard bound on all waste |
| `TLABRefillWasteFraction`  | 64                         | Divisor: initial refill-waste limit = desired size / fraction                           |
| `TLABWasteIncrement`       | 4 heap words               | Increase allowed waste after a slow allocation                                          |
| `TLABAllocationWeight`     | 35                         | Allocation-history weighting for adaptive sizing                                        |
| `ZeroTLAB`                 | false                      | Eager zeroing; not an application allocation-reduction lever                            |

Source: [TLAB flags](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/shared/tlab_globals.hpp).

The refill-waste decision governs whether to retire remaining buffer space or allocate
outside the current TLAB. It does not define the collector's maximum TLAB size. For G1,
that maximum is capped at its humongous threshold. Do not propose a general
`MaxTLABSize` option or treat `TLABRefillWasteFraction` as an object-size cutoff.

Adaptive target refills use approximately `100 / (2 * TLABWasteTargetPercent)`:
raising the waste target reduces target refills and can increase desired buffer size,
but actual sizes remain bounded and workload-dependent. It may trade fewer refills for
more waste; it is not a prescribed fix for large objects. Investigate flags only after
measured refill/slow-path cost is material and simpler code changes do not answer it.
Compare slow-path time, refills, actual waste, bytes/op and the service outcome. A lower
refill count alone cannot validate a change.
See [TLAB sizing](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/shared/threadLocalAllocBuffer.cpp).

## Completion check

A successful allocation reduction requires matched before/after total bytes/op and
site-level evidence, with no semantic regression. If the original goal was latency or
GC cost, report that outcome independently: lower bytes may be real while the service
benefit remains unproven. For isolated-method experiments, use `jmh-microbenchmarks`;
for changes in heap/collector policy, retain the relevant GC timeline and occupancy data.
