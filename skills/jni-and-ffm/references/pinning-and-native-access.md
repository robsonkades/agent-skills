# Detecting native pinning, and the native access policy

## Why the native frame is where freeze stops

The virtual thread `freeze()` algorithm walks the carrier's native stack copying Java frames
into a `StackChunk`, and stops at the first frame it cannot serialise:

```
If the frame is NATIVE (JNI, or an FFM downcall, plain or critical) -- the copy STOPS.
The JVM has no portable representation of C code or of the Linker's stub to store on the
heap. This is the pinning point, and it does not distinguish where the native frame
came from.
```

A downcall is a `Linker`-generated machine-code stub followed by the actual C code. Neither is
a Java frame the JVM manages. That is why there is no branch in either API that avoids this —
it is not an API decision, it is a limitation of freeze in the presence of a native frame.

## Detecting carrier capture

`-Djdk.tracePinnedThreads` was removed in JDK 24. `jdk.VirtualThreadPinned` remains useful,
but it reports an attempted Java blocking operation while the virtual thread is pinned. A C
function that blocks internally can capture its carrier without executing a Java park point
that produces this event. Use complementary evidence.

```bash
# Record with the event enabled; inspect the chosen JFC threshold before interpreting absence:
java -XX:StartFlightRecording=filename=jni-ffi.jfr,settings=profile \
     --enable-native-access=ALL-UNNAMED MyApp

jfr print --events jdk.VirtualThreadPinned jni-ffi.jfr

# Or generate a custom configuration, then start the JVM with settings=vt-pinning.jfc:
jfr configure --output vt-pinning.jfc jdk.VirtualThreadPinned#threshold=1ms
```

For live instrumentation in production or the lab:

```java
try (RecordingStream rs = new RecordingStream()) {
    rs.enable("jdk.VirtualThreadPinned").withThreshold(Duration.ofMillis(1));
    rs.onEvent("jdk.VirtualThreadPinned", event ->
        System.out.println(event.getThread() + " pinned for "
            + event.getDuration().toMillis() + " ms at:\n" + event.getStackTrace()));
    rs.startAsync();
    // ... workload ...
}
```

An event stack can expose a native method, FFM/linker frame, monitor or other pinning context,
but frame names and truncation vary. Correlate it with call-duration metrics, thread dumps and
wall/native profiles. Absence of events does not rule out blocking inside native code.

## Wall-clock profiling

```bash
asprof -e wall -t -d 30 -f wall.html <pid>
```

Wall-clock mode can reveal time accumulated in native/linker frames that CPU-only sampling
misses. Verify profiler version/options from its own documentation and symbolize native
libraries; unknown frames or missing symbols are not evidence of Java overhead.

## Structural mitigations

No synchronous JNI/FFM variant makes a blocking native frame unmountable. If measured
occupancy or failure risk warrants a change, a bounded dedicated platform-thread pool is
one mitigation; others are a genuinely asynchronous native API,
process isolation, shorter bounded batches or a Java implementation. Size the pool with
measured latency/concurrency, native resource capacity and explicit queue/load-shedding—not
Little's Law alone:

```java
// Partial application example; N and queueCapacity are positive configured bounds.
// The service owns this pool across requests and shuts it down during its lifecycle.
ThreadPoolExecutor nativeCallPool = new ThreadPoolExecutor(
        N, N, 0L, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(queueCapacity),
        Executors.defaultThreadFactory(), new ThreadPoolExecutor.AbortPolicy());

// In the virtual request thread; propagate rejection as overload at the request boundary.
Future<byte[]> pending = nativeCallPool.submit(() -> nativeLib.compress(payload));
byte[] result = pending.get(remainingNanos, TimeUnit.NANOSECONDS);
```

The native frame then remains on a platform worker while the virtual caller waits in Java and
can normally unmount. Bound the executor queue, propagate deadlines to the native protocol
where supported, and define late completion because cancelling the `Future` does not
reliably cancel C code. Handle rejection, timeout, interruption and execution failure in
the application's error contract. Keep payloads immutable/owned and native arenas alive
until the worker actually finishes, including after the caller abandons the result. Do not
use `CallerRunsPolicy`: saturation would execute native work on the submitting virtual
thread. `newFixedThreadPool` has an unbounded queue. Shutdown must have a bounded wait and
an explicit policy for native calls that outlive it; interruption cannot force them to stop.

## JEP 472: the native access policy

FFM restricted methods already required native-access authorization; JEP 472 brought JNI
loading/use under the same direction in JDK 24. Under the JDK 24/25 warn policy, unauthorized
restricted access produces module-attributed warnings: the caller for library loading and
FFM restricted calls, but the declaring module for JNI native-method binding. For example:

```
WARNING: A restricted method in java.lang.foreign.Linker has been called
WARNING: java.lang.foreign.Linker::downcallHandle has been called by com.example.PanamaLab in an unnamed module
WARNING: Use --enable-native-access=ALL-UNNAMED to avoid a warning for callers in this module
WARNING: Restricted methods will be blocked in a future release unless native access is enabled
```

| Action                                         | Restricted/native-access relevance                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------- |
| native library load and JNI binding            | loader call's module versus native method's declaring module, respectively |
| `Linker.nativeLinker().downcallHandle(...)`    | restricted FFM operation                                                   |
| `Linker.nativeLinker().upcallStub(...)`        | restricted FFM operation                                                   |
| `SymbolLookup.libraryLookup(...)`              | restricted library lookup                                                  |
| Existing segment read/write                    | memory access itself is not a new native link/load authorization           |
| generated binding invoking a restricted method | authorization belongs to the calling module; generation is no exemption    |

```bash
java --enable-native-access=ALL-UNNAMED -jar app.jar
# For a resolved named bridge module, authorize its actual module name instead.
```

Set it per module (or `ALL-UNNAMED` for classpath code), and test the exact release with
`--illegal-native-access=deny`. The JEP announces an eventual deny-by-default direction; do
not suppress warnings without auditing which module and operation need native authority.

## jextract

`jextract` is a standalone OpenJDK project rather than a standard JDK tool; vendor bundles may
differ. It parses a C header with libclang and emits header constants
as static fields, `StructLayout`/`UnionLayout` with per-field `VarHandle`s at the correct
target-platform offset and alignment, and one `MethodHandle` per function with its
`FunctionDescriptor` already built.

```bash
jextract \
    --target-package com.example.sqlite \
    --output src/main/java \
    /usr/include/sqlite3.h
```

It generates bindings, not memory-ownership semantics or an exemption from native-access policy.

## Operational checklists

### Before production

- [ ] Calls that can block have a justified execution strategy, including retaining bounded
      virtual-thread calls when carrier capacity and failure impact are acceptable, an existing
      platform worker, a dedicated pool, native async API or process isolation
- [ ] Every `Linker.Option.critical()` use satisfies the documented extremely-short/no-upcall
      contract, has bounded non-blocking behavior, service-level evidence and rollback
- [ ] `--enable-native-access` is configured explicitly for the modules or jars doing native
      interop, rather than left on the warn-only default
- [ ] `jextract`-generated bindings are versioned alongside the source C header, with a
      documented regeneration process — not generated once by hand and forgotten
- [ ] Native call duration, platform-pool queue/active count, carrier saturation and selected
      JFR/wall-profile diagnostics can be collected without unbounded overhead
- [ ] JDK 24+ runbooks no longer depend on `-Djdk.tracePinnedThreads`; JDK 22+ FFM does
      not request preview solely for FFM, while other features retain their required flags

### During an incident

- [ ] JFR event threshold/settings were verified, and absence of events was not used to rule
      out blocking inside C code
- [ ] Event/thread-dump/wall/native profiles were correlated to identify the actual call and
      whether the stall occurs before, inside or after native execution
- [ ] If any call uses `critical()`: the hypothesis that it is blocking and delaying safepoints
      for the **whole** JVM has been ruled out (`-Xlog:safepoint+stats=debug` showing raised
      wait time — not `-XX:+PrintSafepointStatistics`, which is removed and will not start)
- [ ] The log has been checked for `WARNING: ... restricted method ...` lines that appeared
      after a JDK upgrade — a sign the default native access behaviour moved and no flag was
      adjusted
- [ ] Before proposing "swap JNI for Panama" as the fix, it was confirmed whether the call
      blocks; if it does, that swap on its own changes nothing

## Primary references

- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
- [JEP 491: Synchronize Virtual Threads without Pinning](https://openjdk.org/jeps/491)
- [JEP 472: Prepare to Restrict the Use of JNI](https://openjdk.org/jeps/472)
- [Java 25 native-access guide](https://docs.oracle.com/en/java/javase/25/core/restricted-methods.html)
- [OpenJDK jextract project](https://github.com/openjdk/jextract)
- [Java 25 `Executors`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Executors.html)
