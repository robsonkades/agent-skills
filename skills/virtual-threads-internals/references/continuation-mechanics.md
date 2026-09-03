# Continuation and scheduler mechanics

## Contract, documented implementation, source detail

Keep three layers separate:

1. Java thread/JMM/API semantics remain the application contract.
2. JEP 444 and official guides document HotSpot/JDK scheduling choices such as M:N carriers, a
   distinct FIFO-mode work-stealing scheduler and heap stack chunks.
3. `jdk.internal.vm.Continuation`, `StackChunk` layout, freeze result codes, frame/barrier algorithms
   and pool internals are unsupported implementation details.

Source-level investigation must pin repository commit, vendor patch and architecture. Never ask an
application to import `jdk.internal.vm.Continuation` or open internals merely to implement business
concurrency.

## Mount/unmount lifecycle

```text
ready virtual thread
  -> scheduler assigns a carrier (mount)
  -> Java code runs as that virtual Thread
  -> integrated blocking operation suspends/unmounts
  -> continuation state remains in heap stack chunk(s)
  -> completion/unpark makes thread ready
  -> scheduler may mount it on a different carrier
```

Not every call blocks or unmounts exactly once. A future may already be complete; I/O may complete
immediately; one high-level call can suspend repeatedly. Application correctness cannot depend on a
mount count or carrier identity.

Virtual-thread code is not cooperative in the application sense: user code is not expected to call
`yield` to make blocking APIs scalable. However, the scheduler does not currently time-slice a long
CPU-bound virtual thread, so workload design still matters.

## Stack chunks and GC

JEP 444 states virtual-thread stacks are heap stack-chunk objects that grow/shrink. They are not
platform-stack GC roots; collectors must understand their references. Treat detailed collector scan,
bitmap, derived-pointer and relocation behavior as implementation-specific.

Measure:

- live virtual threads by state/lifetime;
- retained size and dominator paths from virtual threads/stack chunks/request context;
- depth and large local arrays/objects held across blocking points;
- ThreadLocal values and inherited context;
- collector concurrent/pause phase time and allocation/old-region pressure.

An async implementation also retains request state in heap continuations/futures. Compare end-to-end
retained state and allocation rather than asserting virtual threads are inherently heavier or lighter.

## Scheduler and carrier identity

The documented JDK scheduler is distinct from `ForkJoinPool.commonPool()` and uses FIFO work-stealing
mode. Common-pool properties do not configure it. Virtual-thread scheduler properties and, on Java
24+, its MXBean are the supported operational interfaces; exact worker names/queue objects are not.

Because a virtual thread can remount elsewhere:

- native code must not assume repeated calls use one OS thread unless an API provides affinity;
- carrier ThreadLocals are inaccessible as virtual-thread context;
- an exception stack belongs to the virtual thread and excludes carrier scheduling frames;
- OS profiler attribution needs virtual-thread-aware support or careful interpretation.

## Capture versus pin

JEP 444 distinguishes blocking operations that cannot unmount but for which the scheduler may expand
from pinning, where a virtual thread cannot unmount because of protected execution. On Java 21,
monitor ownership and native/foreign execution pin. JEP 491 removes the monitor case in Java 24;
native/foreign remains.

Many file-system operations can capture an OS/carrier thread because the OS lacks non-blocking support;
the JDK may compensate by adding scheduler platform threads. A native pin is not promised the same
compensation. The evidence difference is operationally important:

```text
pool size > target + file-operation stacks/events -> candidate capture/compensation
pin events + native/foreign frames               -> candidate pinning
queued VTs + CPU saturation                      -> candidate CPU starvation
```

## Version ledger

| Release | Relevant status                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------- |
| Java 21 | virtual threads final; monitor and native/foreign pinning described by JEP 444                                    |
| Java 24 | JEP 491 removes monitor/`Object.wait` pinning; scheduler MXBean available since 24                                |
| Java 25 | same residual native/foreign pinning model in official guide; scoped values final; structured concurrency preview |

Vendor backports and runtime flags can vary. Store this ledger with the deployed runtime facts, not as
a timeless assumption.

## References

- [JEP 444 scheduling and memory model](https://openjdk.org/jeps/444)
- [JEP 491](https://openjdk.org/jeps/491)
- [Java 25 virtual-thread scheduling](https://docs.oracle.com/en/java/javase/25/core/virtual-threads.html)
- [OpenJDK continuation header (implementation reference)](https://github.com/openjdk/jdk/blob/master/src/hotspot/share/runtime/continuation.hpp)
