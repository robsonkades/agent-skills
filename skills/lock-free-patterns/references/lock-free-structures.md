# Lock-free structures and proof obligations

## Operation proof table

For every method complete:

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
failed CAS allocation and retention bounded
```

GC prevents reclamation of a node still strongly reachable by a thread, but explicit reuse of that
same node can still create ABA. Off-heap nodes require a separate reclamation scheme such as epochs/
hazards with its own Java/native memory-order proof.

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
- [OpenJDK concurrent source](https://github.com/openjdk/jdk/tree/master/src/java.base/share/classes/java/util/concurrent)
- [Michael and Scott queue paper](https://www.cs.rochester.edu/research/synchronization/pseudocode/queues.html)
