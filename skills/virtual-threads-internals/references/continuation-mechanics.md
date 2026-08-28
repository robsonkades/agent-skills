# Continuation mechanics

## The freeze algorithm

When a virtual thread performs an interceptable blocking operation — NIO I/O,
`Thread.sleep`, a `java.util.concurrent.locks` acquisition, and since JEP 491
`synchronized` and `Object.wait` — this runs:

```
1. The blocking operation internally calls Continuation.yield(scope)
2. The JVM walks the carrier's native stack, from the top down to the frame
   where the Continuation was mounted
3. For each Java frame:
   a. interpreted, or compiled in a "freezable" form -> its locals and return
      address are copied into a StackChunk on the heap
   b. compiled but NOT in a state safe to freeze (mid-way through an aggressive
      C2 optimisation) -> the JVM forces a DEOPTIMISATION of that frame before
      copying it; it runs interpreted from then on
   c. NATIVE frame (JNI, FFM downcall) -> the copy STOPS. The JVM has no
      portable representation of a C frame to store on the heap.
      This is the pinning point.
4. If step 3 completed without hitting a native frame: the copied frames form
   the StackChunk, the carrier is released IMMEDIATELY and takes the next ready
   virtual thread from the scheduler's deque
5. If step 3 stopped at a native frame: the carrier stays occupied until the
   native call returns — the virtual thread is PINNED
```

Step 3b is a real cost that exists only because of virtual threads: C2 code optimised to
run on an ordinary platform thread is not always in a state safe to slice mid-way. It is
one reason mount/unmount cost grows with stack depth and with how hot the stack is at the
moment of suspension.

## The second stopping point: `<clinit>`

Class loading and initialisation are protected by a `ClassLoader`/`Class`-specific lock
that was **not** migrated to the virtual-thread-aware monitor model of JEP 491. A virtual
thread blocking inside a class's `<clinit>` pins, even when the blocking operation itself
would be perfectly unmountable anywhere else.

```java
class SlowInit {
    static {
        // Illustrative — do not do this. The point is the shape of the problem:
        // any block here happens INSIDE class initialisation, and the first
        // virtual thread to reference SlowInit does not unmount until <clinit>
        // finishes, even using a normally interceptable operation.
        try { Thread.sleep(50); } catch (InterruptedException ignored) { }
    }
}
```

## The scheduler is a dedicated ForkJoinPool

| Aspect        | Application pool / `commonPool()`                 | Virtual-thread scheduler                                                                                                                     |
| ------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Instance      | Shared common pool, or created by the application | The JVM's own internal instance, **never** the same reference as `commonPool()`                                                              |
| `asyncMode`   | Typically `false` (LIFO), for classic fork/join   | **`true`** (FIFO) — there is no fork/join relation between continuations, and FIFO reduces the chance an old virtual thread is never resumed |
| Compensation  | Requires explicit `ForkJoinPool.ManagedBlocker`   | Triggered **automatically** by the runtime when a virtual thread pins, reusing the same internal mechanism `ManagedBlocker` exposes publicly |
| Configuration | Public constructor                                | System properties `jdk.virtualThreadScheduler.*`                                                                                             |

The automatic compensation is not a new mechanism invented for Loom — it is the
`ManagedBlocker` compensation protocol, applied internally whenever a virtual thread is
about to pin. That is why the behaviour under residual pinning is "create more platform
threads up to `maxPoolSize`" rather than simply stalling.

The class is `jdk.internal.vm.Continuation`, not `java.lang.Continuation`. It is internal,
not public API, and application code must not use it.

## StackChunk and the collectors

A `StackChunk` is an ordinary Java object as far as allocation goes — it lives in a heap
region and is collectable — but it holds internal _derived pointers_ (pointers computed
from another reference, common in JIT-compiled code) that most GCs never have to handle in
normal objects. Each collector therefore gained a `StackChunk`-specific scan path.

| Collector                                                    | What changes for `StackChunk`                                                                                                                                                           | Practical consequence                                                                                                                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **G1**                                                       | Scanned as a region with its own oop-location bitmap; participates in concurrent SATB marking like any referenced object, but with a dedicated closure for the frames' derived pointers | Many virtual threads blocked for a long time increase the volume of large, reference-dense objects marking must traverse — more suspended threads means more marking work, not merely more occupied heap |
| **ZGC** (generational, default since JDK 23, JEP 474)        | An ordinary allocation subject to concurrent relocation; accessing frames inside a chunk being relocated goes through the same coloured-pointer load barrier as any other reference     | The barrier cost already exists for every access in ZGC — `StackChunk` adds no new barrier, only volume monitored during the concurrent phase                                                            |
| **Shenandoah** (generational, product since JDK 25, JEP 521) | Same concept as ZGC: forwarding pointers and read/write barriers cover the chunk like any relocatable object                                                                            | Same consequence: volume, not a new mechanism                                                                                                                                                            |

None of the three has a "virtual thread mode" you switch on with a flag. The real lever is
indirect: reduce the number of virtual threads suspended at once (a `Semaphore` in front of
the blocking stage) and the live `StackChunk` volume drops with it. Comparing `-Xlog:gc*`
before and after a migration is the only honest way to know whether the GC profile moved.

## Framework defaults

| Framework        | Default behaviour               | How to enable                         |
| ---------------- | ------------------------------- | ------------------------------------- |
| Spring Boot 3.2+ | **Disabled** — platform threads | `spring.threads.virtual.enabled=true` |
| Quarkus          | **Disabled**, per endpoint      | `@RunOnVirtualThread` on the method   |
| Helidon Nima     | **Enabled by default**          | no opt-in needed                      |

Assuming the wrong default means measuring "virtual threads" in production while the whole
application still runs on a platform pool, with nothing in the logs to say so.

## `synchronized` versus `java.util.concurrent.locks` on this baseline

| Need                                            | `synchronized`                                   | `ReentrantLock` / `j.u.c.locks`     |
| ----------------------------------------------- | ------------------------------------------------ | ----------------------------------- |
| Simple critical section, no special requirement | Enough and simpler — no forgotten `unlock()`     | Overkill                            |
| `tryLock()` with timeout                        | Not supported                                    | `tryLock(long, TimeUnit)`           |
| Interruptible acquisition                       | Not supported                                    | `lockInterruptibly()`               |
| Fairness (arrival order)                        | Not supported                                    | `new ReentrantLock(true)`           |
| Multiple wait conditions on one lock            | One monitor, one wait set                        | `newCondition()`, as many as needed |
| Introspection (locked? by whom? queue length?)  | Not exposed by the public API                    | `isLocked()`, `getQueueLength()`    |
| Pinning under virtual threads (JDK 24+)         | **Does not pin** — the monitor belongs to the VT | Also does not pin — never did       |

Before JEP 491 the last row decided the whole choice. On this baseline it is irrelevant to
the decision — decide on the other six. Code that already uses `synchronized` and needs
none of `Condition`, `tryLock` or fairness has no reason to migrate; swapping for its own
sake is review cost and bug risk with no benefit.
