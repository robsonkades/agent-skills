# critical(), overhead components and choosing an interop approach

## The three independent cost components

1. **Safepoint cost.** A plain downcall (JNI, or FFM without `critical`) transitions the thread
   to `_thread_in_native` before entering C. In that state the JVM treats the thread as
   self-safepoint-safe — it is not touching the Java heap, so a safepoint can proceed without
   waiting for it. That state transition has a small, fixed, non-zero cost.
2. **Marshaling cost.** Converting Java representations (objects, `String`, arrays) to C ones
   and back. Zero for primitives passed by value; non-trivial for arrays and strings.
3. **Verification and safety cost.** In JNI, signature and pending-exception checking on every
   return; in FFM, checking that the `Arena` behind a `MemorySegment` is still alive — part of
   which `critical` skips, moving that responsibility to the caller.

`Linker.Option.critical(boolean allowHeapAccess)` attacks **component 1 only**. It makes the
linker emit a stub that does not transition the thread out of the "Java" state, which removes
the transition cost and, with `allowHeapAccess=true`, permits passing a heap-backed
`MemorySegment.ofArray(...)` directly with no prior copy off-heap — the exact equivalent of
JNI's `GetPrimitiveArrayCritical`.

The price is structural, not optional. Because the thread never leaves the Java state, the JVM
cannot rely on it to reach a safepoint on its own while the native code runs. A safepoint
requested in that window — a GC cycle, a statistics collection, a thread dump — waits for the
critical call to return. A 20 ns `critical()` call does not move the needle. One that blocks
for 200 ms on I/O can delay the whole JVM for 200 ms.

## Overhead components per call type

Orders of magnitude, illustrative — measure your own environment.

| Component                        | JNI                                       | FFM plain downcall                | FFM `critical(false)`             | FFM `critical(true)`                 |
| -------------------------------- | ----------------------------------------- | --------------------------------- | --------------------------------- | ------------------------------------ |
| Thread state transition          | Yes, full cost (`JNIEnv*` plus JNI frame) | Yes (`_thread_in_native`)         | **No**                            | **No**                               |
| Safepoint during the call        | Impossible while the call runs            | Possible at any time              | **Impossible for the whole call** | **Impossible for the whole call**    |
| Heap array access without copy   | Yes, via `GetPrimitiveArrayCritical`      | No — the segment must be off-heap | No                                | **Yes**, via `MemorySegment.ofArray` |
| Typical overhead, empty function | ~50-100 ns                                | ~20-50 ns                         | ~5-15 ns                          | ~5-15 ns plus heap access cost       |
| Safe for a long or blocking call | Yes                                       | Yes                               | **No**                            | **No**                               |

## Thread state, safepoint and pinning

| Call type                                 | Thread state during native execution | Effect on a global safepoint                      | Effect on VT pinning                                                                            |
| ----------------------------------------- | ------------------------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| JNI                                       | `_thread_in_native`                  | Does not block — thread is self-safepoint-safe    | Pins if the call blocks                                                                         |
| FFM plain downcall                        | `_thread_in_native`                  | Does not block — same as JNI                      | Pins if the call blocks                                                                         |
| FFM `critical(false)` or `critical(true)` | Stays in the Java state              | **Blocks** — the JVM waits for the call to return | Pins if the call blocks, **and** additionally delays any pending safepoint across the whole JVM |

The plain downcall is not "worse than critical" on pinning; they pin identically when they
block. The risk asymmetry runs the other way: a blocked plain downcall delays only the calling
virtual thread, while a blocked `critical()` call can delay the entire JVM because no other
thread can complete a safepoint cycle until it returns.

The exact `Linker.Option.critical` contract — including the guarantee that the thread does not
leave the safepoint-unsafe state during the call — lives in the `java.lang.foreign.Linker.Option`
javadoc for the build in use. Check it there before relying on it in production.

## When `critical()` is eligible, by measurable criterion

| Criterion                            | Eligible for `critical()`                                     | Not eligible — plain downcall, or isolate on a dedicated pool                     |
| ------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Expected call duration               | Sub-microsecond, **measured** with JMH, not estimated         | Any call whose duration was not measured, or measured above roughly 1 microsecond |
| Blocking behaviour                   | Provably non-blocking — no I/O, no lock, no native allocation | Involves I/O, a lock, allocation, or calls back into Java (upcall)                |
| Need for copy-free heap array access | Yes, so `critical(true)`                                      | Data is already off-heap, so `critical(false)` or no `critical` at all            |
| Call frequency                       | High — exactly where safepoint overhead shows up in aggregate | Low — the gain does not justify the risk                                          |
| Impact of a delayed safepoint        | Acceptable even in the measured worst case                    | GC pause or other-thread latency SLOs cannot absorb the extra delay               |

The decision is never "this call looks fast". It is "I measured this call with JMH under
production-like load and it is comfortably below the threshold at which a safepoint delay
becomes visible to the rest of the system".

## Choosing an interop approach

| Approach                     | Transition overhead            | Pins under VT if it blocks                          | Type safety                | Effort                                | When to use                                                                             |
| ---------------------------- | ------------------------------ | --------------------------------------------------- | -------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| Hand-written JNI             | Highest                        | Yes, identical to the rest                          | Low, unchecked C           | High, C plus Java plus a native build | Stable legacy code; full control over the C wrapper                                     |
| Panama FFM, plain downcall   | Medium-low                     | Yes, identical to JNI                               | High, checked at link time | Medium, pure Java                     | Default for new bindings on JDK 22+                                                     |
| Panama FFM plus `critical()` | Lowest                         | Yes, identical — `critical` does not change pinning | High                       | Medium, requires prior measurement    | Short, non-blocking, high-frequency calls needing heap access or minimal safepoint cost |
| `jextract` plus Panama       | Same as the generated downcall | Yes, identical                                      | High                       | Low, generated from the header        | C libraries with complex headers (structs, many functions)                              |
| JNA                          | Moderate, reflection-based     | Yes                                                 | High                       | Low                                   | Prototyping, non-performance-critical paths                                             |

## Batching, and what it does not fix

```java
// Bad: N transitions for tiny per-element work
for (int i = 0; i < 1000; i++) {
    nativeLib.processElement(data[i]);   // 1000 x transition overhead
}

// Good: one transition, the work loop inside the native code
nativeLib.processBatch(data, 0, 1000);   // 1 x transition overhead
```

Transition overhead is fixed per call, not per byte, so batching amortises it. It does not
remove pinning risk: a `processBatch` that takes 50 ms still pins a virtual thread for 50 ms —
it just does so once instead of a thousand smaller times. Batching is a throughput technique,
not a concurrency one; keep the two concerns separate.

## Measuring, not estimating

| Goal                                                            | Command                                                                                                                                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compare JNI, plain FFM and FFM `critical` for an empty function | `java --enable-native-access=ALL-UNNAMED -jar benchmarks.jar EmptyCallBench -f 3 -wi 5 -i 10`                                                                          |
| Measure allocation and GC per copy variant                      | `java --enable-native-access=ALL-UNNAMED -jar benchmarks.jar MemcpyCriticalBench -prof gc -f 1 -wi 5 -i 5`                                                             |
| Isolate the pure safepoint cost                                 | Compare `-Xlog:safepoint+stats=debug` with and without `critical()` on the same benchmark. `-XX:+PrintSafepointStatistics` is removed — the JVM refuses to start on it |
