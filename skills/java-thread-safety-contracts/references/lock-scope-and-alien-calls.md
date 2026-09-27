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

Specify whether another mutation may overtake callback delivery. If commit order matters, an owned
dispatcher/outbox must preserve enqueue order with the mutation (or use sequence numbers and an
explicit reorder protocol); a serial executor alone cannot fix inverted submissions after unlock.
Define capacity/rejection and publication failures without blocking arbitrarily under the state lock.

### Callback inside lock

Use only when contract requires atomic callback participation and the callback set is controlled,
bounded and reviewed. Analyze reentrancy, lock ordering, blocking, exception rollback and latency.
External/user callbacks generally make those assumptions untenable.

`CopyOnWriteArrayList` gives snapshot traversal and is useful when mutations are rare; content-changing
mutations copy the array, and listener bodies can still block/throw. It does not solve callback
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
  algorithm/progress owner, lock-free-patterns, when that design is actually required.

## Waiting and cancellation contracts

Entering `synchronized` has neither a timed nor an interruptible acquisition mode. When the
contract requires abandoning a contended acquisition, consider `ReentrantLock.lockInterruptibly()`
or timed `tryLock`; inspect the concrete implementation if using another `Lock`. On interruption
or timeout, do not execute the protected operation as if acquisition succeeded. Release an acquired
explicit lock in `finally`; never unlock after an unsuccessful acquisition.

Condition waiting is different: check the guarded predicate in a loop, because a signal or spurious
wakeup does not establish that the predicate now holds. Coordinate predicate changes and wakeups
under the same protocol, including waking affected waiters on close when that lifecycle is supported.
`Object.wait` releases only its monitor; a lock's `Condition.await` releases its associated lock,
not unrelated outer locks. Reacquisition precedes continuation, including an interrupted wait's
exception, so timeout/interruption alone does not guarantee prompt return while another thread
holds that lock. Account for acquisition, predicate waiting and reacquisition in the caller's
deadline/progress contract.

For cancellation spanning tasks or resources, pass the wait chain, ownership, required termination
behavior and residual side effects to `cancellation-and-interruption`; request a supported stop/cleanup
protocol. If unavailable, keep any termination guarantee conditional and identify the unresolved wait.

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

- [JLS 25 monitor acquisition and wait sets](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html) — monitor ownership, wait loops and reacquisition.
- [Lock acquisition contracts](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/Lock.html) and [Condition waits](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/Condition.html) — supported modes, implementation caveats and predicate waiting.
- [`java.util.concurrent.locks`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/package-summary.html)
- [`ConcurrentHashMap`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html)
- [`StampedLock`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/locks/StampedLock.html)
