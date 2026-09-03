# Marking pathologies

## Symptom, hypothesis, instrument

| Symptom in the log                                           | Hypothesis                                                                                                                    | Instrument that confirms it                                                                                           |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Recurring `Concurrent Mark Restart for Mark Stack Overflow`  | Discovered-object frontier exceeds the expandable mark stack; broad/live graph, insufficient marking progress or native limit | `-Xlog:gc+marking=debug`; effective `MarkStackSizeMax`; live-set/graph and concurrent CPU evidence                    |
| `Pause Full` shortly after incomplete marking cycles         | Insufficient end-to-end reclamation headroom; late trigger is one candidate                                                   | Effective IHOP, old-allocation rate, marking + mixed-phase duration, evacuation/fallback chronology                   |
| `Concurrent Mark From Roots` growing longer cycle over cycle | Old generation growing faster than concurrent scan capacity                                                                   | `ConcGCThreads` too low for the heap, or CPU contended with the application — check container CPU limits and affinity |
| Frequent `Humongous allocation`, no associated `Pause Full`  | Eager reclaim is working; the objects die before accumulating a remembered set                                                | `-Xlog:gc+humongous`: count humongous regions allocated against regions freed per young GC                            |
| Frequent `Humongous allocation` **with** `Pause Full`        | Humongous objects surviving long enough to become ineligible for eager reclaim                                                | Larger `G1HeapRegionSize`, or redesign the allocation so the payload falls below the threshold                        |

## The SATB invariant, and why the old value

The tricolour invariant a concurrent collector must preserve: no **black** object (visited,
fields already scanned) may point directly at a **white** one (never visited), or the white
object is lost while still live.

The application breaks it by writing `black.field = white` after black was already scanned.
SATB does not re-scan black and does not enqueue the new value. It enqueues the **old** value
that was in the field before the overwrite:

```
Before:      black.field = A          (A was reachable at snapshot time, by definition)
Application: black.field = B          (pre-write barrier fires)
SATB:        enqueue A — not B
```

The liveness relation SATB guarantees is "live in the initial snapshot". A was already
reachable when the cycle started. B is a new reference created after the snapshot; whatever
code produced it already holds the object reachable through a root or another live object, so
proving B's liveness is not this barrier's job.

The asymmetry is the point: SATB lets dead objects look live (floating garbage, reclaimed next
cycle) and never lets a live object look dead (a dangling pointer — heap corruption). Any
change that trades in the other direction is not an optimisation.

## The full barrier condition

Three checks, not one, on every reference store while marking is active:

```
obj.field = newValue
  |
  +-- marking in progress?           no  -> plain store, zero overhead outside a cycle
  |                                  yes v
  +-- is obj's address below its region's TAMS?
  |        no (obj allocated during the cycle) -> plain store; obj is implicitly live
  |        yes v
  +-- old_value != null?
           no  -> plain store; nothing to preserve
           yes -> enqueue old_value into the thread's local SATB buffer, then store
```

Each check on its own is cheap — a global flag read, a pointer comparison, a null check — but
they run on **every** reference store while marking is active, not only on the ones that
matter to the result. That is why SATB barrier cost scales with how long marking is active,
not with how much garbage is produced.

## TAMS

Each region records Top At Mark Start: how far it was occupied when the current cycle began.

```
At cycle start:
[ already allocated ][ TAMS ][ free space ]

During the cycle:
[ already allocated ][ TAMS ][ allocated DURING the cycle ][ free ]
  must be reached by            address >= TAMS -> implicitly live,
  marking to count live         never visited by the marker
```

This is what lets G1 keep promoting into old **during** a cycle without each promotion forcing
re-marking. It is also why a single mark bitmap suffices since JDK 20: the "is this result from
the previous cycle or the current one" question that the old prev/next bitmap pair answered
physically is answered logically by TAMS, region by region.

The pre-JDK-20 pair existed to give mixed GC a stable data source — the immutable "prev" —
while a new cycle wrote into "next". TAMS provides that stability without a second buffer.

## Mark stack overflow

```
Concurrent mark threads discover live objects and push objects whose fields remain to be
scanned onto the global/local mark-stack work structures.

"Concurrent Mark Restart for Mark Stack Overflow (iteration #N)"   [tag gc,marking]
  the mark stack reaches its maximum expansion and overflows before tracing completes.
  G1 marks the overflow condition, completes a synchronization/restart protocol and repeats
  marking work so no reachable object is lost. SATB queues remain a distinct source of roots.
```

Mutation/SATB pressure can extend marking and indirectly worsen headroom, but it is not the log
line's identity. Diagnose mark-stack overflow from stack expansion/limit and object-graph work;
diagnose SATB contribution from remark/SATB processing, eligible store rate and cycle CPU. Never
change the SATB buffer flags solely because the message contains “Mark Stack”.

## Evacuation failure and why it takes the snapshot with it

```
1. A young or mixed GC tries to evacuate a surviving object to a destination region
2. There is not enough free space to complete the copy
3. G1 falls back to in-place promotion: the object is not copied, stays where it is,
   and is treated as promoted at its existing address
4. References to it must stay valid — G1 preserves the object's original mark word
   (lock/hash/GC bits) in an auxiliary structure before overwriting it with temporary
   evacuation metadata, and restores it afterwards
5. If a marking cycle was in progress, the bitmap and the affected region's TAMS may need
   correcting: the premise that "below TAMS means existed since cycle start, at a stable
   address" was violated by an evacuation that partially failed midway
```

Evacuation failure can require marking metadata reconciliation and is a strong capacity signal,
but it does not establish a universal `evacuation failure → mark-stack overflow → full GC`
sequence. Reconstruct the actual GC-id chronology. Treat step 5 as a conceptual risk; the exact
reconciliation/restart mechanism changes between releases.

## Humongous: the strict threshold

`size > G1HeapRegionSize / 2`. Strictly greater, not greater-or-equal.

| `G1HeapRegionSize` | Half   | 512 KB object                        | 520 KB object | 1 MB object                          |
| ------------------ | ------ | ------------------------------------ | ------------- | ------------------------------------ |
| 1 MB               | 512 KB | Not humongous (equals the threshold) | Humongous     | Humongous                            |
| 2 MB               | 1 MB   | Not humongous                        | Not humongous | Not humongous (equals the threshold) |
| 4 MB               | 2 MB   | Not humongous                        | Not humongous | Not humongous                        |

The trap is sizing a payload _at_ the threshold. With a 2 MB region, a serialiser whose worst
case grazes 1 MB puts part of the traffic over the line and part under it under identical
nominal load, producing behaviour that changes without the workload changing. Size for clear
margin below the threshold instead.

## Eager reclaim, and what it cannot prove

```
During a young or mixed GC, G1 checks the candidate humongous region's remembered set.
If no other region points at it, G1 can conclude within that same STW pause that the
object is dead and free the region immediately — without waiting for a complete
marking cycle.
```

It is cheap enough to fit in an ordinary pause because the remembered set already exists and
is already maintained incrementally by the concurrent refinement threads, cycle or no cycle.
Asking "is this region's RSet empty?" costs O(RSet entries), not a root-to-leaf graph walk.

That is also its limit: an empty RSet proves only that no **other region** points at the
object, not that it is unreachable from roots by a path that does not cross a region boundary
— a local variable in a thread stack, for example. Hence eager reclaim runs during an STW
pause, when roots are being scanned anyway, and not as a standalone asynchronous operation.

The problematic pattern is therefore not humongous allocation as such; it is the humongous
object that survives long enough to accumulate cross-region references. Those are not eligible
for the fast path and genuinely wait for a complete cycle.

## Remembered set pressure reaches marking, not just mixed GC

A highly connected object graph with heavy cross-region fan-in drives the RSet into its coarse
representation. Coarse entries force any phase that traverses the RSet to scan whole source
regions rather than specific cards — which inflates `Concurrent Mark From Roots` exactly as it
inflates the mixed GC's heap-root merge, because both walk the same structure. A marking cycle
running several times longer than the predictor expects, in a service with a dense object
graph, is the shape to look for. Raising `G1HeapRegionSize` reduces the region count and the
fan-in per region; reducing cross-region references in the application design attacks the
cause.
