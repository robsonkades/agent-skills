# Upcalls, arenas across threads, and what native code does to the collector

Everything marked verified was compiled and executed on Temurin 25.0.3.

## Arenas at the interop boundary

off-heap-memory owns the four arena kinds and their lifetimes; what belongs here is how each
interacts with a call into native code.

| Situation                                                                             | What happens                                                                                                                                                                    | What to do                                                                                       |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Segment from `Arena.ofConfined()` created on thread A, used by a downcall on thread B | `WrongThreadException: Attempted access outside owning thread` before the call runs (verified) — the dedicated-pool mitigation hits this on its first request                   | Allocate on the pool thread, inside the task, or use `Arena.ofShared()` for the handoff          |
| Shared arena closed while another thread still uses its segment                       | `close()` coordinates with every thread that may be accessing (a handshake, not a free operation); a later access fails with `IllegalStateException: Already closed` (verified) | Close once per batch or per connection, never per call                                           |
| Upcall stub's arena closed while native code still holds the function pointer         | The next native call through that pointer is undefined behaviour — a crash, not an exception (`Linker` javadoc)                                                                 | Bind the stub to the arena that owns the native object registering it; close them together       |
| `Arena.ofAuto()` segment passed to native code that stores the address                | The collector may free it while native code still uses it                                                                                                                       | Never hand an automatic-arena address to code that keeps it                                      |
| Heap segment (`MemorySegment.ofArray`) passed to a plain downcall                     | Rejected — heap segments need `Linker.Option.critical(true)` (verified: the same call succeeds with it)                                                                         | Copy into an arena, or `critical(true)` under the constraints in critical-and-decision-matrix.md |

## Upcalls

An upcall stub is a native function pointer created by
`Linker.upcallStub(handle, descriptor, arena)`. Three contracts matter more than the cost:

- **An exception escaping the target terminates the JVM.** The `Linker` javadoc: if the
  handle throws, "the JVM will terminate abruptly". Every upcall target catches `Throwable`,
  translates it into a return code or a stored error, and never lets it propagate.
- **No upcall from a `critical` downcall.** The thread never left the Java state, so there is
  nothing to transition back to; the contract forbids it and the result is undefined.
- **A thread native code created can call an upcall.** It is attached to the JVM for the
  duration — the expensive part of a callback from a native thread pool — and it is a platform
  thread, so virtual-thread pinning does not enter into it.

The cost order is upcall > plain downcall > `critical` downcall, for the same reasons in
reverse: an upcall performs the transition twice and re-validates the stub. Measure it with the
same JMH shape as the downcall comparison before designing an API around a callback per
element; a batch that returns its results in a segment is usually cheaper than N upcalls.

## Two options that decide correctness, not speed

```java
// errno is per thread and clobbered by anything the JVM does between the call and your
// read: capture it as part of the call. The capture segment becomes the first parameter.
Linker.Option errno = Linker.Option.captureCallState("errno");
StructLayout captureLayout = Linker.Option.captureStateLayout();
VarHandle errnoHandle = captureLayout.varHandle(MemoryLayout.PathElement.groupElement("errno"));
MethodHandle open = linker.downcallHandle(sym,
        FunctionDescriptor.of(ValueLayout.JAVA_INT, ValueLayout.ADDRESS, ValueLayout.JAVA_INT), errno);

// A variadic C function (printf-style) needs the index of its first variadic argument, or
// the calling convention is wrong on platforms that pass varargs differently.
Linker.Option va = Linker.Option.firstVariadicArg(1);
```

Reading `errno` through a separate downcall afterwards reads whatever the JVM did last.

## What a critical region does to the collector

JNI's `GetPrimitiveArrayCritical`/`GetStringCritical` and FFM's `critical(true)` both give
native code a heap object's address without a copy. They keep the collector from moving it by
different mechanisms:

| Mechanism                                                         | Collector behaviour                                                                                                  | Observable as                                                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| FFM `critical(true)`                                              | The thread does not transition; no safepoint can complete until it returns                                           | Rising time-to-safepoint for every thread (`-Xlog:safepoint`); the whole JVM waits                        |
| JNI critical, G1 since JEP 423 (JDK 22)                           | The region holding the array is pinned; collection proceeds around it                                                | Nothing, unless pinned regions accumulate                                                                 |
| JNI critical, ZGC and Shenandoah                                  | Object or region pinning                                                                                             | Nothing in the common case                                                                                |
| JNI critical, G1 before JDK 22 and the older Serial/Parallel path | The GC locker: a needed collection is deferred until every critical region exits; allocating threads stall meanwhile | `GCLocker Initiated GC` as the cause in the GC log (gc-log-analysis), allocation stalls no pause explains |

On 25.0.3 the `GCLocker*` flags are absent from `-XX:+PrintFlagsFinal` and there is no
`jdk.GCLocker` JFR event, consistent with pinning having replaced the locker in the
collectors that ship; on a 17 or 21 fleet the locker signature above is still the one to look
for.

The practical rule is the same under every mechanism: a critical region is measured in
nanoseconds and contains no blocking, no allocation and no JNI call other than the release.

## Testing levers

| Lever                                                                | What it catches                                                                                                                    | Verified on 25.0.3 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `-Xcheck:jni`                                                        | Wrong `JNIEnv` usage, missing exception checks, bad references and local-reference leaks, at a speed cost — test environments only | starts             |
| `--illegal-native-access=deny`                                       | Any module doing JNI or FFM without `--enable-native-access` fails with `IllegalCallerException` instead of warning                | yes                |
| `jdk.VirtualThreadPinned#threshold=1ms`                              | Short, frequent pinning the 20 ms default hides                                                                                    | —                  |
| JMH: JNI, plain downcall, `critical`, with `-prof gc`                | The copy the API does or does not perform                                                                                          | —                  |
| Confined-arena handoff test: allocate on one thread, call on another | `WrongThreadException` in CI rather than on the first production request                                                           | yes                |
