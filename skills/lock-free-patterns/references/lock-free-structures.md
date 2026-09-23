# Lock-free structures and proof obligations

## Operation proof table

For custom operations being designed or reviewed, cover each applicable outcome below.
For a library/API question, use its established contract and address only the unresolved
obligation; a semantic explanation does not require filling an unrelated operation table.

| Operation/outcome       | Preconditions | Linearization point | Postcondition | Progress | Retry/help/reclaim |
| ----------------------- | ------------- | ------------------- | ------------- | -------- | ------------------ |
| successful insert       |               |                     |               |          |                    |
| failed/duplicate insert |               |                     |               |          |                    |
| successful remove       |               |                     |               |          |                    |
| empty/miss              |               |                     |               |          |                    |
| close/cancel race       |               |                     |               |          |                    |

Also show representation invariants before/after every successful atomic transition and why a
failed transition leaves no visible side effect.

## Treiber stack checklist

```text
node payload/next fully initialized before head publication
head CAS is linearization point for push/pop success
empty read/CAS race has a defined failure point
popped node is not reset/reinserted while a reader can rely on old next
ABA/tag wrap/reuse horizon addressed
live speculative/linked-node retention and allocation-rate policy stated
if retries allocate fresh candidates, cumulative allocation grows with retries
individual starvation has no finite retry bound
```

GC prevents reclamation of a node still strongly reachable by a thread, but explicit reuse of that
same node can still create ABA. Off-heap nodes require a separate reclamation scheme such as epochs/
hazards with its own Java/native memory-order proof.

If each retry allocates a fresh candidate, making the previous candidate unreachable does
not bound total allocation for that operation. Separate cumulative allocation, allocation
rate and live retained state, including chains held by stalled readers. A retry cap changes
the operation's failure/cancellation outcomes; do not add one silently to claim bounded cost.

## Stamped-reference protocol

`AtomicStampedReference` atomically holds a reference/stamp pair; it does not implement the
version policy. Use `get(int[])` with a thread-confined holder to capture the pair before
deriving a candidate from it. Separate `getReference()` and `getStamp()` calls need not observe
the same state. Every transition whose history must invalidate a pending operation must change
the stamp in the same atomic publication, subject to the wrap/reuse proof.

The caller supplies the new stamp; the API does not increment it automatically. `compareAndSet`
checks both expected reference and expected stamp. `attemptStamp` checks only the expected
reference, and `set` is unconditional: neither substitutes for validating the old pair.

An illustrative interleaving exposes the difference (not a complete stack implementation):

```text
Initially: head=(A,0), A.next=B, B.next=C.
Reader:    getReference() -> A; save A.next -> B; pause before getStamp().
Other:     pop A -> head=(B,1); pop B -> head=(C,2).
Other:     reuse A with A.next=C; push A -> head=(A,3).
Reader:    getStamp() -> 3; compareAndSet(A,B,3,4) succeeds, resurrecting removed B.
```

If the reader instead captured `(A,0)` together before saving `next`, its CAS with expected
stamp 0 rejects this history. That fixes this stale-pair acceptance, not the entire reuse
protocol: prove safe field access, publication and lifetime for speculative readers, and
prevent relevant stamp repetition while those readers remain active. A successful head CAS
cannot repair a use-after-free or an invalid speculative access that already occurred.

Keep an ordinary `AtomicReference` when immutable nodes are never reinserted and the proof
excludes relevant ABA; do not add stamps solely because the algorithm uses CAS. A boolean
mark can represent logical deletion, but a repeating mark is not a general version history.

## Linked queue checklist

Linked nonblocking queues often allow tail to lag head/link state and rely on helping. Prove:

- sentinel/dummy-node invariants;
- enqueue link linearization and tail-help safety;
- dequeue value/head transition and memory clearing;
- no lost node when an actor stalls between link and tail update;
- iterator/size consistency contract (often weak/expensive);
- retention of old heads/iterators and empty transitions;
- progress when a helper or producer is preempted.

Prefer the JDK queue unless the missing property is documented and tests cover the custom proof.

## Striped counters

Striping distributes writers across cells and aggregates later. It changes semantics:

- sum/read is not one atomic point-in-time value under concurrent updates;
- `LongAdder.sum()` is accurate once updates are quiescent and properly observed (for example,
  after joining all writers); ordinary `long` overflow still applies. It is not statistical
  sampling, and exact quiescent reporting does not make it suitable for atomic admission;
- reset/sumThenReset can race with updates according to API contract;
- cells consume memory and can false-share without suitable layout;
- hash/probe collisions and resizing matter;
- excellent for statistics, unsuitable for unique IDs, account balances and exact admission limits.

Compare `AtomicLong`, `LongAdder`, per-owner accumulation and locked batching using real read/write
frequency and required consistency.

## Ring buffers

Define:

```text
capacity and sequence arithmetic/wrap proof
single/multi producer and consumer topology
slot ownership and publication/access modes
full/empty detection and gating sequences
wait strategy and CPU/power/tail behavior
overwrite/drop/block/backpressure policy
consumer failure and stalled gating sequence
batch visibility and shutdown/drain
padding/layout and cache topology
```

Sequence wrap may be practically distant without being mathematically impossible. State the bound
from maximum rate and lifetime, and test near-wrap with reduced-width model values.

A CAS reservation does not by itself make the entire ring lock-free. Pause a producer after
claiming a sequence but before publishing its slot: if consumers or later producers cannot
advance until it resumes, that operation has a blocking dependency. State whether helping,
cancellation/tombstones or another protocol closes the publication gap; otherwise qualify the
progress class rather than inferring it from the absence of mutexes.

## Reclamation choices

| Storage                 | Typical aid                     | Remaining hazard                                       |
| ----------------------- | ------------------------------- | ------------------------------------------------------ |
| ordinary heap, no reuse | GC reachability                 | logical retention and ABA through explicit reinsertion |
| heap node pool          | GC + reuse protocol/tag         | same-reference ABA/reset races                         |
| off-heap/manual         | epoch/hazard/refcount/ownership | use-after-free, stalled participants, close            |
| bounded array slots     | sequence/version protocol       | wrap and overwrite before consumer completes           |

Reclamation progress can be weaker than operation progress. A stalled epoch participant can prevent
memory reclamation indefinitely while operations remain lock-free.

## Authoritative references

- [Java concurrent package](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/package-summary.html)
- [Java atomic package](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/atomic/package-summary.html)
- [AtomicStampedReference pair and update contracts](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/atomic/AtomicStampedReference.html)
- [AtomicMarkableReference mark contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/atomic/AtomicMarkableReference.html)
- [LongAdder sum and reset contracts](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/atomic/LongAdder.html)
- [OpenJDK concurrent source, jdk-25+36](https://github.com/openjdk/jdk/tree/jdk-25%2B36/src/java.base/share/classes/java/util/concurrent) — implementation snapshot, separate from target runtime evidence.
- [Michael and Scott queue paper](https://www.cs.rochester.edu/research/synchronization/pseudocode/queues.html)
