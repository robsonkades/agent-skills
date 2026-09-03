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

No synchronous JNI/FFM variant makes a blocking native frame unmountable. A bounded dedicated
platform-thread pool is one mitigation; others are a genuinely asynchronous native API,
process isolation, shorter bounded batches or a Java implementation. Size the pool with
measured latency/concurrency, native resource capacity and explicit queue/load-shedding—not
Little's Law alone:

```java
// Dedicated platform pool, sized by the native call's real latency and the
// concurrency needed -- not by the virtual thread scheduler's default.
ExecutorService nativeCallPool = Executors.newFixedThreadPool(N);

// The virtual thread dispatches and awaits the Future: it unmounts normally,
// because the real blocking happens on a dedicated platform thread.
CompletableFuture.supplyAsync(() -> nativeLib.compress(payload), nativeCallPool)
                 .thenAccept(result -> /* ... */);
```

The native frame then remains on a platform worker while the virtual caller waits in Java and
can normally unmount. Bound the executor queue, propagate deadlines to the native protocol
where supported, and define late completion because cancelling the `Future` does not
reliably cancel C code.

## JEP 472: the native access policy

FFM restricted methods already required native-access authorization; JEP 472 brought JNI
loading/use under the same direction in JDK 24. Under the JDK 24/25 warn policy, unauthorized
restricted access produces a warning associated with the caller module:

```
WARNING: A restricted method in java.lang.foreign.Linker has been called
WARNING: java.lang.foreign.Linker::downcallHandle has been called by com.example.PanamaLab in an unnamed module
WARNING: Use --enable-native-access=ALL-UNNAMED to avoid a warning for callers in this module
WARNING: Restricted methods will be blocked in a future release unless native access is enabled
```

| Action                                         | Restricted/native-access relevance                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| native library load and JNI use                | governed by JEP 472 policy in current releases                          |
| `Linker.nativeLinker().downcallHandle(...)`    | restricted FFM operation                                                |
| `Linker.nativeLinker().upcallStub(...)`        | restricted FFM operation                                                |
| `SymbolLookup.libraryLookup(...)`              | restricted library lookup                                               |
| Existing segment read/write                    | memory access itself is not a new native link/load authorization        |
| generated binding invoking a restricted method | authorization belongs to the calling module; generation is no exemption |

```bash
java --enable-native-access=com.example.nativebridge -jar app.jar
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

It generates bindings, not memory-ownership semantics, and not an exemption from the native

## Operational checklists

### Before production

- [ ] Every native call that can block has explicit carrier strategy: bounded platform pool,
      asynchronous native API, process isolation or justified platform-thread execution
- [ ] Every `Linker.Option.critical()` use satisfies the documented extremely-short/no-upcall
      contract, has bounded non-blocking behavior, service-level evidence and rollback
- [ ] `--enable-native-access` is configured explicitly for the modules or jars doing native
      interop, rather than left on the warn-only default
- [ ] `jextract`-generated bindings are versioned alongside the source C header, with a
      documented regeneration process — not generated once by hand and forgotten
- [ ] Native call duration, platform-pool queue/active count, carrier saturation and selected
      JFR/wall-profile diagnostics can be collected without unbounded overhead
- [ ] No runbook or start script references `-Djdk.tracePinnedThreads` or `--enable-preview`
      for FFM code

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
