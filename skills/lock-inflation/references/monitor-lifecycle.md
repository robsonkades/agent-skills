# Monitor lifecycle on the current baseline

## Three states, not four

HotSpot represents an object's lock state at exactly three points: unlocked, fast-locked,
and inflated (an `ObjectMonitor`). There is no longer a fourth, biased state — biased
locking was disabled by default in JDK 15 (JEP 374) and the code removed entirely in
JDK 18 (JDK-8256425, no dedicated JEP for the removal).

| Mark word tag | State       | Ownership recorded in           |
| ------------- | ----------- | ------------------------------- |
| `01`          | unlocked    | nowhere                         |
| `00`          | fast-locked | the owning thread's `LockStack` |
| `10`          | inflated    | `ObjectMonitor._owner`          |

## The `LockStack`

Under `LM_LIGHTWEIGHT` each `JavaThread` carries a fixed-size array (typically up to 8
entries) embedded in the thread structure, holding the oops of the objects that thread has
fast-locked. It is not on the heap and it is not reachable from the object.

The consequence drives everything else: finding out who holds a fast-lock is no longer
"follow a pointer from the object". It is "ask the candidate thread whether the object is
in its list" — a question only safe when the owning thread asks it about itself. Another
thread cannot inspect a foreign `LockStack` without a handshake or safepoint.

## Fast path

```
1. mark = obj.mark_word()
2. tag 01 and LockStack not full:
     CAS(mark 01 -> 00); on success push(lock_stack, obj)
     on failure another thread changed the mark word -> treat as contention
3. tag 00 held by ANOTHER thread -> real contention -> inflate
4. obj already on top of this thread's LockStack -> reentrancy:
     bump the local recursion count, no CAS
5. tag 10 -> go straight through the ObjectMonitor
```

Unlock pops the `LockStack` and CASes the tag back `00 -> 01`. If that CAS fails, the
object was inflated while this thread owned it, and unlock continues through the monitor.

No lock record is allocated on the stack, no displaced header is saved and restored, and
the CAS only flips two tag bits — the hash code and age bits in the mark word are untouched
for the whole life of the fast-lock.

## Inflation and `ANONYMOUS_OWNER`

Thread B tries to fast-lock an object already fast-locked by thread A:

1. B spins briefly and adaptively first, so contention that resolves in a few cycles never
   pays for a monitor.
2. If the spin does not resolve it, B inflates:
   - allocates an `ObjectMonitor` from the JVM free list;
   - initialises `_owner` to the marker `ANONYMOUS_OWNER`, **not** to thread A — B has no
     way to name A, because there is no owner pointer in the mark word and A's ownership
     lives only inside A's private `LockStack`;
   - CASes the lock tag from `00` to `10`. Whether the mark word is _overwritten_ with an
     `ObjectMonitor*` depends on `UseObjectMonitorTable`: with it off (the default through
     JDK 26) the header is displaced and swapped out; with it on — forced by
     `UseCompactObjectHeaders`, and the JDK 27 default — the header stays in place and the
     monitor is reached through a side table;
   - enters the monitor's entry list and parks.
3. When A goes to release what it believes is a plain fast-lock, its CAS fails; A follows
   the new mark word to the monitor and CASes `_owner` from `ANONYMOUS_OWNER` to itself,
   formally claiming through the monitor the ownership it already held, then releases
   normally and wakes a waiter.
4. B (or the next waiter) wakes, acquires the monitor with a real owner, and proceeds.

The indirection exists so that inflating never requires reading another thread's internal
state. Only the owner of a fast-lock ever tries to release it, so self-attestation is safe
by construction and avoids a cross-thread handshake that would cost more than the problem.

## `ObjectMonitor`

```
ObjectMonitor {
    void* volatile _object;      // the object this monitor belongs to
    void* volatile _owner;       // owning thread, ANONYMOUS_OWNER, or null
    intx  volatile _recursions;  // reentrancy count

    ObjectWaiter* volatile _EntryList;   // processed, ready to retry entry
    ObjectWaiter* volatile _cxq;         // recent arrivals (contention queue)
    ObjectWaiter* volatile _WaitSet;     // blocked in wait()

    intx _count;    // active use
    intx _waiters;  // threads in wait()
};
```

`_cxq` takes threads that just failed an entry attempt; `_EntryList` holds threads already
processed and ready for another attempt when the monitor is released. Which thread wakes is
**not** guaranteed FIFO — a known source of fairness problems when service order matters.

The monitor's shape is identical regardless of which `LockingMode` produced it; only the
arrival path and how initial ownership is established differ.

Deflation returns idle monitors to the free list on a periodic asynchronous pass. It is not
instantaneous and is not a mitigation you can schedule.

## `ReentrantLock` by contrast

`ReentrantLock` is pure Java over `AbstractQueuedSynchronizer` — no mark word, no monitor.
Its uncontended path is a CAS on a `state` field, comparable in cost to a fast-lock. Its
contended path parks through `LockSupport`, reaching the same OS primitive (`futex` on
Linux) as the monitor, but through an entirely different intrusive linked-list queue, with
optional explicit fairness that the intrinsic monitor does not offer.

## Version table

| Change                                       | Version | Reference     |
| -------------------------------------------- | ------- | ------------- |
| Biased locking disabled by default           | JDK 15  | JEP 374       |
| Biased locking code removed                  | JDK 18  | JDK-8256425   |
| `LM_LEGACY` last the default                 | JDK 22  | —             |
| `LM_LIGHTWEIGHT` becomes the default         | JDK 23  | —             |
| `LM_LEGACY` and `LM_MONITOR` deprecated      | JDK 24  | JDK-8334299   |
| `synchronized` stops pinning virtual threads | JDK 24  | JEP 491       |
| `-XX:LockingMode` removed entirely           | JDK 27  | `globals.hpp` |

`LM_MONITOR` (`LockingMode=0`) forces inflation always and is a debugging aid only.

## What JEP 491 did and did not change

The Loom-era `ObjectMonitor` rewrite is what made JEP 491 possible. Before JDK 24, a virtual
thread blocking on `synchronized` entry — or calling `Object.wait()` — pinned its carrier,
because the monitor could not unmount the continuation before blocking. From JDK 24 the
monitor recognises a virtual thread and unmounts it before parking, freeing the carrier. The
queues above are unchanged; they simply know how to enqueue and wake virtual threads.

Residual pinning survives for `synchronized` inside native frames (JNI, FFM downcalls) —
watch the `jdk.VirtualThreadPinned` event. **From JDK 26 (JDK-8369238), a virtual thread
waiting for another thread to run a class initialiser no longer pins: it unmounts in most
cases.**
