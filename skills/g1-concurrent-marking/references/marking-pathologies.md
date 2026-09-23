# Marking pathologies

## Symptom, hypothesis, instrument

| Symptom in the log                                           | Hypothesis                                                                                                   | Instrument that confirms it                                                                                                                            |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Recurring `Concurrent Mark Restart for Mark Stack Overflow`  | Current mark-stack capacity exhausted; graph work, growth/restart policy, maximum or native allocation limit | `-Xlog:gc=debug,gc+marking=debug`; effective stack capacities; live-set/graph and concurrent CPU evidence                                              |
| `Pause Full` shortly after incomplete marking cycles         | Insufficient end-to-end reclamation headroom; late trigger is one candidate                                  | Effective IHOP, old-allocation rate, marking + mixed-phase duration, evacuation/fallback chronology                                                    |
| `Concurrent Mark From Roots` growing longer cycle over cycle | More graph/SATB work, restarts or reduced effective scan capacity                                            | Comparable live-set/graph and mutation evidence, restart logs, marking CPU and container CPU availability; duration alone cannot select a thread count |
| Frequent humongous allocation, no associated `Pause Full`    | Reclamation may keep up, or free capacity may temporarily hide accumulation                                  | `-Xlog:gc+humongous=debug`; compare allocated, reclaimed and retained regions over time                                                                |
| Frequent humongous allocation **with** `Pause Full`          | Retention, ineligibility, allocation bursts or contiguous-region shortage                                    | Full-GC cause, candidate fields, free-region and retained-region trends before choosing region size or redesign                                        |

## The SATB invariant, and why the old value

SATB preserves snapshot reachability by recording overwritten references that the marker might
otherwise miss. It need not enforce the strong tricolour rule of forbidding every black-to-white
edge. The deletion barrier records the **old** value, not the newly installed reference:

```
Before:      obj.field = A            (potentially needed to preserve snapshot reachability)
Application: obj.field = B            (pre-write barrier fires)
SATB:        enqueue A — not B
```

An old field value is not necessarily snapshot-live: it may reference an object allocated later.
Root processing, tracing, allocation liveness and SATB processing together preserve live objects;
do not infer an object's allocation time from when this particular reference was assigned.

The asymmetry is the point: SATB lets dead objects look live (floating garbage, eligible for
later reclamation) and never lets a live object look dead (a dangling pointer — heap corruption). Any
change that trades in the other direction is not an optimisation.

## The full barrier condition

Simplified ordinary-field pre-barrier path, based on JDK 25 x86 HotSpot (not executable code):

```
obj.field = newValue
  |
  +-- thread-local SATB active?      no  -> skip SATB enqueue
  |                                  yes v
  +-- old_value != null?
           no  -> plain store; nothing to preserve
           yes -> enqueue old_value into the thread's local SATB buffer, then store
```

The holder's address is not tested against TAMS in this path. Queue filtering tests the recorded
referent against its TAMS and marking state. Inactive SATB still has a check unless optimized
away, and G1's separate post-write barrier may remain. Compiler elimination, initialization,
bulk stores and architecture change the emitted code. Measure eligible store rate, active time,
buffer processing and CPU; do not claim zero cost outside marking.

## TAMS

Each region records Top At Mark Start: how far it was occupied when the current cycle began.

```
At cycle start:
[ already allocated ][ TAMS ][ free space ]

During the cycle:
[ already allocated ][ TAMS ][ allocated DURING the cycle ][ free ]
  must be reached by            address >= TAMS -> implicitly live,
  marking to count live         skipped by normal bitmap marking
```

This is what lets G1 keep promoting into old **during** a cycle without each promotion forcing
re-marking. Implicit liveness does not mean that no collector path scans the object's fields:
JDK 25 root-region scanning walks recorded ranges from TAMS to their recorded end, including
survivor and old regions, to discover outgoing references. Evacuation-failure recovery also
uses raw bitmap marking for retained objects rather than the normal TAMS-filtered marking path.
TAMS is an allocation boundary, not a replacement version tag for two concurrent bitmap
generations. JDK 20's single-bitmap change also coordinates rebuild/scrubbing and bitmap reuse;
do not attribute its correctness to TAMS alone.

## Mark stack overflow

```
Concurrent mark threads discover live objects and push objects whose fields remain to be
scanned onto the global/local mark-stack work structures.

"Concurrent Mark Restart for Mark Stack Overflow (iteration #N)"   [tag gc,marking]
  the available mark-stack work storage overflows before tracing completes.
  G1 marks the overflow condition, completes a synchronization/restart protocol and repeats
  marking work so no reachable object is lost. SATB queues remain a distinct source of roots.
```

On JDK 25.0.3, concurrent marking and final marking prefer restart followed by capacity expansion;
reference processing permits immediate expansion. The restart line therefore does not prove
that the configured maximum was reached. Inspect expansion and native allocation failures as
well as the effective limit. Those messages use `gc=debug`/warning, not just `gc+marking=debug`.

Mutation/SATB pressure can extend marking and indirectly worsen headroom, but it is not the log
line's identity. Diagnose mark-stack overflow from stack expansion/limit and object-graph work;
diagnose SATB contribution from remark/SATB processing, eligible store rate and cycle CPU. Never
change the SATB buffer flags solely because the message contains “Mark Stack”.

## Evacuation failure: reason before marking consequences

On JDK 25, the pause summary distinguishes `Evacuation Failure: Allocation`,
`Evacuation Failure: Pinned`, or both reasons:

- **Allocation:** destination allocation could not complete. Correlate free regions,
  promotion/retention, evacuation reserve and reclamation timing before blaming late marking.
- **Pinned:** JNI critical access prevents movement of an object. This can happen with free
  capacity available; inspect critical-section lifetime and the affected regions rather than
  treating the suffix as evidence for a larger heap or lower IHOP.
- **Both:** investigate both constraints; fixing one does not establish that the other is gone.

In the pinned JDK 25 implementation, an object that cannot move is forwarded to itself and
retained in place. The collector records the failed region, marks the retained object in the
bitmap for recovery, preserves mark-word information needed for restoration and scans its
references. Cleanup reconciles the affected metadata so references remain valid. This special
bitmap use is distinct from normal concurrent-mark liveness accounting above TAMS.

Neither reason establishes a universal `evacuation failure → mark-stack overflow → full GC`
sequence or proves that the marking snapshot was aborted. Reconstruct the actual GC-id
chronology and use the target release's reconciliation mechanism. `g1-internals` owns the
evacuation mechanics; this skill determines what the observed failure says about marking.

## Humongous: the strict threshold

`size > G1HeapRegionSize / 2`. Strictly greater, not greater-or-equal.

| `G1HeapRegionSize` | Half   | 512 KB object                        | 520 KB object | 1 MB object                          |
| ------------------ | ------ | ------------------------------------ | ------------- | ------------------------------------ |
| 1 MB               | 512 KB | Not humongous (equals the threshold) | Humongous     | Humongous                            |
| 2 MB               | 1 MB   | Not humongous                        | Not humongous | Not humongous (equals the threshold) |
| 4 MB               | 2 MB   | Not humongous                        | Not humongous | Not humongous                        |

The sizes above are aligned total object sizes, including headers, not array payload lengths.
The trap is sizing a payload _at_ the threshold. With a 2 MB region, a serialiser whose worst
case grazes 1 MB puts part of the traffic over the line and part under it under identical
nominal load, producing behaviour that changes without the workload changing. Size for clear
margin below the threshold instead.

## Eager reclaim, and what it cannot prove

```
During a young or mixed GC, select eligible humongous candidates, scan the relevant
roots and incoming references, and retain candidates discovered live. Reclaim only
eligible candidates that remain unreferenced after that processing.
```

An empty remembered set alone does not establish death. JDK 25 candidate selection includes
complete remembered-set information, pinning and primitive-array restrictions; small nonempty
remembered sets can still be eligible. Inspect candidate and reclaimed counts separately.

Even complete incoming heap-reference information does not replace root scanning: a thread's
local variable can retain the object. Pending card information and collection-set scanning also
matter. Eager reclaim therefore participates in the STW collection protocol, not a standalone
test of whether a region's remembered-set count is zero.

Cross-region references alone do not imply permanent ineligibility. A region ineligible during
one pause may become eligible later. Pressure requires evidence of retained regions, allocation
rate or contiguous-space shortage, not simply frequent allocation or one candidate flag.

## Separate marking from remembered-set work

Concurrent marking traces object fields and SATB roots. Remembered-set rebuilding and evacuation
root scanning are separate work. Dense connectivity can increase several costs, but correlation
does not establish that marking traverses coarse RSets. Compare phase durations and CPU stacks;
route confirmed RSet scanning/refinement pressure to `g1-internals`. Region-size changes alter
several competing costs and need workload validation, not a monotonic fan-in assumption.

## Source checks

- [JDK 25.0.3 x86 pre-barrier](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/cpu/x86/gc/g1/g1BarrierSetAssembler_x86.cpp)
- [SATB filtering](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/gc/g1/g1SATBMarkQueueSet.cpp)
- [Object scanning and TAMS](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/gc/g1/g1ConcurrentMark.inline.hpp)
- [Humongous candidate preparation](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/gc/g1/g1YoungCollector.cpp)
- [Root-region scanning, mark-stack allocation and restart](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/gc/g1/g1ConcurrentMark.cpp)
- [Evacuation failure reasons and retained-object processing](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/gc/g1/g1ParScanThreadState.cpp)
- [Root-region registration and evacuation-failure bitmap marking](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/hotspot/share/gc/g1/g1CollectedHeap.cpp)
