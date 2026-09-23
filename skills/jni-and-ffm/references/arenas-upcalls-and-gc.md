# Upcalls, arenas across threads, and what native code does to the collector

Historical observations marked verified below were compiled and executed on Temurin 25.0.3;
they are not universal guarantees or a claim that every path was exercised.

## Arenas at the interop boundary

off-heap-memory owns the four arena kinds and their lifetimes; what belongs here is how each
interacts with a call into native code.

| Situation                                                                             | What happens                                                                                                                                                  | What to do                                                                                                                           |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Segment from `Arena.ofConfined()` created on thread A, used by a downcall on thread B | `WrongThreadException: Attempted access outside owning thread` before the call runs (verified) — the dedicated-pool mitigation hits this on its first request | Allocate on the pool thread, inside the task, or use `Arena.ofShared()` for the handoff                                              |
| Shared arena closed while a downcall/access is active                                 | close/access coordination can fail with `IllegalStateException`; later access is invalid (verified for this build)                                            | establish one owner/protocol; close only after users/calls complete                                                                  |
| Upcall stub's arena closed while native code still holds the function pointer         | The stub is deallocated; invoking the retained raw pointer is unsafe and can crash the JVM, without Java lifetime checks                                      | Stop new callbacks and wait for in-flight callbacks under the native unregister/quiescence contract before closing stub/state arenas |
| Automatic-arena segment passed to native code that retains the address                | native retention does not keep the Java arena/segment reachable; cleanup may race later native use                                                            | keep an explicit strong owner for the full native lifetime, or use a closeable shared arena                                          |
| Heap segment (`MemorySegment.ofArray`) passed to a plain downcall                     | Rejected — heap segments need `Linker.Option.critical(true)` (verified: the same call succeeds with it)                                                       | Copy into an arena, or `critical(true)` under the constraints in critical-and-decision-matrix.md                                     |

## JNI thread and reference ownership

When moving work across threads, do not cache the caller's `JNIEnv*` for a worker. A
Java-created pool thread receives its own environment when it enters JNI. A native-created
thread uses `JavaVM::GetEnv` and attaches if detached; the code owning that attachment must
detach before the thread exits, with no Java frames on its stack.

Local `jobject` references cannot cross threads or survive their native invocation. Retained
Java callback state needs a checked `NewGlobalRef` and a matching `DeleteGlobalRef` after
native users have finished; a global reference preserves reachability, not thread safety.
Bound local-reference growth in loops or long-lived attached threads with deletion or local
frames. Test handoff and shutdown under `-Xcheck:jni`; a clean run covers only exercised paths.

## Upcalls

An upcall stub is a native function pointer created by
`Linker.upcallStub(handle, descriptor, arena)`. Three contracts matter more than the cost:

- **An exception escaping the target terminates the JVM.** The `Linker` javadoc: if the
  handle throws, "the JVM will terminate abruptly". Every upcall target catches `Throwable`,
  or uses an equivalent method-handle wrapper. The handler must also avoid throwing and
  honor the native signature/error contract: return a supported error value or store an error
  for its owner to observe. A callback without an error return needs an agreed separate
  failure channel.
- **No upcall from a `critical` downcall.** The API requires critical functions not to call
  back into Java. Violation can cause adverse effects including JVM crashes; do not rely on
  implementation-specific thread-state reasoning.
- **Native-created threads require lifecycle/ABI care.** Linker-supported upcalls arrange a
  Java execution context, but callback thread identity, attachment cost, thread-local state,
  reentrancy and library shutdown must be tested. They are not virtual-thread continuations.

Keep callback state, returned pointer storage and library code alive for the actual native
use. Unregistering may prevent future callbacks without waiting for active ones; establish
what completion guarantees the library supplies. If it cannot establish quiescence, retain
the required lifetime or choose an explicit isolation/recovery design before freeing it.
Java arena checks do not protect native code that retained a raw pointer after the downcall.

Do not assume a universal cost order between upcall, JNI and FFM variants. A callback per
element is usually a warning sign because transitions and loss of inlining can dominate;
compare callback, batch-result and polling designs under realistic native work.

## Two options that decide correctness, not speed

These are partial JDK 22+ snippets. Supply the linker, symbols and call arguments from the
actual native declarations; authorize the binding module with `--enable-native-access`.

```java
// Hypothetical fixed C signature: int do_work(const char *input, int flags).
// errno can be clobbered between calls; capture it during this call. For this bound,
// scalar-return handle, the capture segment becomes the first invocation parameter.
Linker.Option errno = Linker.Option.captureCallState("errno");
StructLayout captureLayout = Linker.Option.captureStateLayout();
VarHandle errnoHandle = captureLayout.varHandle(MemoryLayout.PathElement.groupElement("errno"));
MethodHandle doWork = linker.downcallHandle(sym,
        FunctionDescriptor.of(ValueLayout.JAVA_INT, ValueLayout.ADDRESS, ValueLayout.JAVA_INT), errno);
```

Reading `errno` through a separate downcall afterwards can observe a clobbered value.
Read captured state only when the native function's documented failure result makes it
meaningful; a successful call need not clear `errno`. Capture state in a live, accessible
segment allocated with `captureLayout`; captured-state names are platform-specific.

For C varargs, `firstVariadicArg` identifies the first variadic position; it does not promote
values. Use it even when no arguments replace the ellipsis (the index then equals the
descriptor's argument count). Specialize the descriptor for each argument sequence and apply
C default argument promotions: `float` becomes `double`, and narrow integer types undergo integer promotion.
Use the target ABI's promoted layouts and matching Java carriers with `invokeExact`.

```java
// Partial printf("%f", ...) example on an ABI with 32-bit C int.
// printfSymbol is the native symbol; format is a live native string "%f".
// sampleFloat is a float. Passing JAVA_FLOAT in this variadic position is rejected.
MethodHandle printf = linker.downcallHandle(printfSymbol,
        FunctionDescriptor.of(ValueLayout.JAVA_INT, ValueLayout.ADDRESS, ValueLayout.JAVA_DOUBLE),
        Linker.Option.firstVariadicArg(1));
int written = (int) printf.invokeExact(format, (double) sampleFloat);
```

Keep the format and argument sequence consistent. A fixed C parameter of type `float` keeps
its float layout; only arguments corresponding to the ellipsis receive these promotions.

## What a critical region does to the collector

JNI critical access and FFM `critical(true)` both expose a temporary address associated with
heap data, but neither public contract promises the same mechanism. JNI may pin or return a
copy; FFM marks the function critical and permits heap segment addresses. The following are
HotSpot/version observations to investigate, not portable API guarantees:

| Mechanism                                                         | Collector behaviour                                                                                                  | Observable as                                                                                                 |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| FFM `critical(true)` on a HotSpot build that elides transition    | a long call may delay safepoint progress                                                                             | safepoint synchronization time and application tails                                                          |
| JNI critical, G1 since JEP 423 (JDK 22)                           | The region holding the array is pinned; collection proceeds around it                                                | target-build pin/evacuation evidence; pinned young regions can be promoted and retained pins can add pressure |
| JNI critical, ZGC and Shenandoah implementations                  | collector-specific pin/copy handling                                                                                 | pinned-memory/GC behavior requires collector-specific evidence                                                |
| JNI critical, G1 before JDK 22 and the older Serial/Parallel path | The GC locker: a needed collection is deferred until every critical region exits; allocating threads stall meanwhile | `GCLocker Initiated GC` as the cause in the GC log (gc-log-analysis), allocation stalls no pause explains     |

In JDK 25, Serial/Parallel GC changed under JDK-8192647: a pending collection waits for JNI
critical regions to finish and blocks new entries before collecting. The old retry-based
premature-OOME path and `GCLockerRetryAllocationCount` were removed. Long critical regions can
still delay progress; absence of the old flag or cause is not proof that JNI cannot stall GC.
Confirm the exact vendor/update before applying an older GC-locker workaround.

On the tested 25.0.3 build, `GCLocker*` flags and a `jdk.GCLocker` event were absent. That is
not proof of every collector path; use GC/safepoint logs, allocation stalls and the exact
collector sources. Older fleets may still expose `GCLocker Initiated GC` signatures.

Keep JNI critical regions minimal: no arbitrary JNI calls or blocking work inside the
region (nested critical acquire/release is permitted). Release every successful acquisition
on every path, including when no copy was made. For array-elements access, `JNI_COMMIT` is
not final cleanup of a copied buffer: release again with `0` or `JNI_ABORT`. `JNI_ABORT`
discards a copy's changes; it cannot undo writes through a direct pointer. Use FFM `critical`
only for its extremely-short/no-upcall contract; no fixed nanosecond threshold is portable.

## Testing levers

| Lever                                                                 | What it catches                                                                                                                    | Verified on 25.0.3 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `-Xcheck:jni`                                                         | Wrong `JNIEnv` usage, missing exception checks, bad references and local-reference leaks, at a speed cost — test environments only | starts             |
| `--illegal-native-access=deny`                                        | Unauthorized restricted native operations fail with `IllegalCallerException`; ordinary segment access is not a new authorization   | yes                |
| Explicit `jdk.VirtualThreadPinned` threshold in the chosen JFC/stream | Java blocking attempts below a broader configured threshold                                                                        | —                  |
| JMH: JNI, plain downcall, `critical`, with `-prof gc`                 | Java allocation differences; native copying requires separate byte/copy instrumentation or implementation evidence                 | —                  |
| Confined-arena handoff test: allocate on one thread, call on another  | `WrongThreadException` in CI rather than on the first production request                                                           | yes                |

## Primary references

- [Java 25 `Arena`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/foreign/Arena.html)
- [Java 25 `Linker`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/foreign/Linker.html)
- [Java 25 `Linker.Option`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/foreign/Linker.Option.html)
- [JNI specification: critical array/string access](https://docs.oracle.com/en/java/javase/25/docs/specs/jni/functions.html#getprimitivearraycritical-releaseprimitivearraycritical)
- [JNI design: local/global references and interface pointers](https://docs.oracle.com/en/java/javase/25/docs/specs/jni/design.html)
- [JNI invocation: attaching and detaching native threads](https://docs.oracle.com/en/java/javase/25/docs/specs/jni/invocation.html)
- [JDK 25 release notes: JDK-8192647](https://www.oracle.com/java/technologies/javase/25-relnote-issues.html#JDK-8192647)
- [JEP 423: Region Pinning for G1](https://openjdk.org/jeps/423)
