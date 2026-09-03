# Upcalls, arenas across threads, and what native code does to the collector

Everything marked verified was compiled and executed on Temurin 25.0.3.

## Arenas at the interop boundary

off-heap-memory owns the four arena kinds and their lifetimes; what belongs here is how each
interacts with a call into native code.

| Situation                                                                             | What happens                                                                                                                                                  | What to do                                                                                       |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Segment from `Arena.ofConfined()` created on thread A, used by a downcall on thread B | `WrongThreadException: Attempted access outside owning thread` before the call runs (verified) — the dedicated-pool mitigation hits this on its first request | Allocate on the pool thread, inside the task, or use `Arena.ofShared()` for the handoff          |
| Shared arena closed while a downcall/access is active                                 | close/access coordination can fail with `IllegalStateException`; later access is invalid (verified for this build)                                            | establish one owner/protocol; close only after users/calls complete                              |
| Upcall stub's arena closed while native code still holds the function pointer         | The next native call through that pointer is undefined behaviour — a crash, not an exception (`Linker` javadoc)                                               | Bind the stub to the arena that owns the native object registering it; close them together       |
| Automatic-arena segment passed to native code that retains the address                | native retention does not keep the Java arena/segment reachable; cleanup may race later native use                                                            | keep an explicit strong owner for the full native lifetime, or use a closeable shared arena      |
| Heap segment (`MemorySegment.ofArray`) passed to a plain downcall                     | Rejected — heap segments need `Linker.Option.critical(true)` (verified: the same call succeeds with it)                                                       | Copy into an arena, or `critical(true)` under the constraints in critical-and-decision-matrix.md |

## Upcalls

An upcall stub is a native function pointer created by
`Linker.upcallStub(handle, descriptor, arena)`. Three contracts matter more than the cost:

- **An exception escaping the target terminates the JVM.** The `Linker` javadoc: if the
  handle throws, "the JVM will terminate abruptly". Every upcall target catches `Throwable`,
  translates it into a return code or a stored error, and never lets it propagate.
- **No upcall from a `critical` downcall.** The API requires critical functions not to call
  back into Java. Violation can cause adverse effects including JVM crashes; do not rely on
  implementation-specific thread-state reasoning.
- **Native-created threads require lifecycle/ABI care.** Linker-supported upcalls arrange a
  Java execution context, but callback thread identity, attachment cost, thread-local state,
  reentrancy and library shutdown must be tested. They are not virtual-thread continuations.

Do not assume a universal cost order between upcall, JNI and FFM variants. A callback per
element is usually a warning sign because transitions and loss of inlining can dominate;
compare callback, batch-result and polling designs under realistic native work.

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

JNI critical access and FFM `critical(true)` both expose a temporary address associated with
heap data, but neither public contract promises the same mechanism. JNI may pin or return a
copy; FFM marks the function critical and permits heap segment addresses. The following are
HotSpot/version observations to investigate, not portable API guarantees:

| Mechanism                                                         | Collector behaviour                                                                                                  | Observable as                                                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| FFM `critical(true)` on a HotSpot build that elides transition    | a long call may delay safepoint progress                                                                             | safepoint synchronization time and application tails                                                      |
| JNI critical, G1 since JEP 423 (JDK 22)                           | The region holding the array is pinned; collection proceeds around it                                                | Nothing, unless pinned regions accumulate                                                                 |
| JNI critical, ZGC and Shenandoah implementations                  | collector-specific pin/copy handling                                                                                 | pinned-memory/GC behavior requires collector-specific evidence                                            |
| JNI critical, G1 before JDK 22 and the older Serial/Parallel path | The GC locker: a needed collection is deferred until every critical region exits; allocating threads stall meanwhile | `GCLocker Initiated GC` as the cause in the GC log (gc-log-analysis), allocation stalls no pause explains |

On the tested 25.0.3 build, `GCLocker*` flags and a `jdk.GCLocker` event were absent. That is
not proof of every collector path; use GC/safepoint logs, allocation stalls and the exact
collector sources. Older fleets may still expose `GCLocker Initiated GC` signatures.

Keep JNI critical regions minimal and obey the JNI spec's restrictions; release on every
path. Use FFM `critical` only for functions meeting its “extremely short, no upcall” contract.
No fixed nanosecond threshold is portable.

## Testing levers

| Lever                                                                 | What it catches                                                                                                                    | Verified on 25.0.3 |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `-Xcheck:jni`                                                         | Wrong `JNIEnv` usage, missing exception checks, bad references and local-reference leaks, at a speed cost — test environments only | starts             |
| `--illegal-native-access=deny`                                        | Any module doing JNI or FFM without `--enable-native-access` fails with `IllegalCallerException` instead of warning                | yes                |
| Explicit `jdk.VirtualThreadPinned` threshold in the chosen JFC/stream | Java blocking attempts below a broader configured threshold                                                                        | —                  |
| JMH: JNI, plain downcall, `critical`, with `-prof gc`                 | The copy the API does or does not perform                                                                                          | —                  |
| Confined-arena handoff test: allocate on one thread, call on another  | `WrongThreadException` in CI rather than on the first production request                                                           | yes                |

## Primary references

- [Java 25 `Arena`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/foreign/Arena.html)
- [Java 25 `Linker`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/foreign/Linker.html)
- [Java 25 `Linker.Option`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/foreign/Linker.Option.html)
- [JNI specification: critical array/string access](https://docs.oracle.com/en/java/javase/25/docs/specs/jni/functions.html#getprimitivearraycritical-releaseprimitivearraycritical)
- [JEP 423: Region Pinning for G1](https://openjdk.org/jeps/423)
