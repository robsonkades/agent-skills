# Lock scope, callbacks and deadlock

## Invariant ledger

For each lock:

```text
identity and visibility:
guarded fields/invariant:
operations/condition predicates:
maximum expected hold/wait and fairness:
nested acquisitions and global order:
callbacks/I/O/logging/allocations inside:
interrupt/timeout/error rollback:
metrics/profile evidence:
```

Critical sections must be large enough to preserve the transition and small enough to avoid
unrelated work. “Minimize every lock” can split check from act or expose half-applied state.

## Callback choices

### Callback outside lock

Prefer when notification can observe a committed snapshot and failure does not roll back mutation:

```java
Event event;
synchronized (lock) {
    event = mutateAndCreateEvent();
}
notifyListeners(event);
```

Specify whether another mutation may overtake callback delivery. If order matters, serialize events
through an owned dispatcher/outbox rather than holding the state lock across arbitrary code.

### Callback inside lock

Use only when contract requires atomic callback participation and the callback set is controlled,
bounded and reviewed. Analyze reentrancy, lock ordering, blocking, exception rollback and latency.
External/user callbacks generally make those assumptions untenable.

`CopyOnWriteArrayList` gives snapshot-like traversal and is useful when mutations are rare; each
mutation copies the array and listener bodies can still block/throw. It does not solve callback
semantics automatically.

## Wait-for graph

Include more than monitors:

```text
thread -> monitor/Lock/condition
thread -> Future/task whose executor is saturated
thread -> queue permit/item/space
thread -> connection/buffer semaphore
class -> class-initialization owner
callback -> caller lock/resource
```

Thread-starvation and resource deadlocks may not be reported by JVM monitor-cycle detection.

## Multiple locks

Prefer no nested acquisition. If unavoidable:

- assign a stable total order independent of mutable/runtime timing;
- handle equal keys/same object explicitly;
- do not call code that violates the order;
- include class-init and external locks in review;
- test reverse traffic and failure while holding the first resource.

Identity-hash ordering needs a tie lock/collision strategy; business IDs require uniqueness/stability
and same-object handling.

## Mechanism selection caveats

- `ConcurrentHashMap.compute*` offers atomic map operations but mapping callbacks must follow its API
  restrictions and can serialize/contention-amplify hot keys.
- `LongAdder` scales updates but `sum` is not an atomic snapshot.
- `CopyOnWriteArrayList` suits rare writes/small lists; write amplification and retained old arrays
  can matter.
- `ReadWriteLock`/`StampedLock` require measured read duration/concurrency; optimistic reads need
  validation and retry, and `StampedLock` is non-reentrant.
- fair locks/semaphores may reduce starvation at throughput/latency-distribution cost; fairness is
  not a scheduler/SLO guarantee.
- lock-free structures trade blocking for retry/coherence/reclamation complexity; route to their
  owning skill.

## Troubleshooting

```text
BLOCKED threads and long monitor events
  -> owner/hold path, callback/I/O, hot key, convoy; correlate repeated evidence
WAITING/PARKED with no monitor cycle
  -> future/pool/queue/permit/condition predicate and producer health
CPU high, throughput flat
  -> spin/CAS retry/coherence or lock churn; CPU profile + progress counters
timeouts but no deadlock
  -> long hold/queue, unfairness, downstream call under lock, cancellation not reaching owner
```

## Authoritative references

- [`java.util.concurrent.locks`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/package-summary.html)
- [`ConcurrentHashMap`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html)
- [`StampedLock`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/StampedLock.html)
