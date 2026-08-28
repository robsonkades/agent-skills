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

## Detecting it: the JFR event only

`-Djdk.tracePinnedThreads` was removed in JDK 24. The only source of truth is
`jdk.VirtualThreadPinned`.

```bash
# Record with the event enabled; profile.jfc's 20 ms default hides short, frequent pinning:
java -XX:StartFlightRecording=filename=jni-ffi.jfr,settings=profile \
     --enable-native-access=ALL-UNNAMED MyApp

jfr print --events jdk.VirtualThreadPinned jni-ffi.jfr

# Or set the threshold explicitly before recording:
jfr configure jdk.VirtualThreadPinned#threshold=1ms
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

The event's `stackTrace` is what distinguishes a JNI origin from an FFM one in practice: the
top frame is either the `native` method (JNI) or the downcall's `MethodHandle.invokeExact`
(FFM). In both cases there is no `LockSupport.park` or `Object.wait` frame above it, because
no unmount happened. The distinction is diagnostic only — both need the same mitigation.

## Wall-clock profiling

```bash
asprof -e wall -t -d 30 -f wall.html <pid>
```

Wall-clock mode is what reveals this: a virtual thread pinned in native code appears busy even
though it is blocked, which CPU mode would not show. Look for `native` method frames (JNI) or
`MethodHandle.invokeExact` / `Linker` stub frames (FFM) under carrier-marked threads, with no
parking frame above.

`asprof` is the binary in the 3.x/4.x series. If your environment still exposes `profiler.sh`,
it is running a 2.x or older build; upgrade before using any of this.

## The only structural mitigation

No JNI or FFM variant avoids pinning when the call blocks — least of all `critical()`, which
widens the blast radius. Isolate the blocking call on a dedicated platform-thread pool, sized
by Little's Law, and never dispatch it from the virtual-thread executor:

```java
// Dedicated platform pool, sized by the native call's real latency and the
// concurrency needed -- not by the virtual thread scheduler's default.
ExecutorService nativeCallPool = Executors.newFixedThreadPool(N);

// The virtual thread dispatches and awaits the Future: it unmounts normally,
// because the real blocking happens on a dedicated platform thread.
CompletableFuture.supplyAsync(() -> nativeLib.compress(payload), nativeCallPool)
                 .thenAccept(result -> /* ... */);
```

This restores to the virtual thread the property it should have had: blocking on a `Future` is
ordinary Java and unmounts normally, while the problematic native frame stays entirely inside a
pool of threads that were never virtual in the first place.

## JEP 472: the native access policy

Since JDK 24, both JNI (`System.loadLibrary` / `System.load`) and FFM (creating a
`downcallHandle`, an `upcallStub`, or a library lookup) emit a restricted-access warning on
first use per module:

```
WARNING: A restricted method in java.lang.foreign.Linker has been called
WARNING: java.lang.foreign.Linker::downcallHandle has been called by com.example.PanamaLab in an unnamed module
WARNING: Use --enable-native-access=ALL-UNNAMED to avoid a warning for callers in this module
WARNING: Restricted methods will be blocked in a future release unless native access is enabled
```

| Action                                                                   | Warns without `--enable-native-access`?                               |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `System.loadLibrary(...)` / `System.load(...)`                           | Yes                                                                   |
| `Linker.nativeLinker().downcallHandle(...)`                              | Yes                                                                   |
| `Linker.nativeLinker().upcallStub(...)`                                  | Yes                                                                   |
| `SymbolLookup.libraryLookup(...)`                                        | Yes                                                                   |
| Allocating an `Arena` and reading or writing an existing `MemorySegment` | No — the warning fires at link/load time, not on every access         |
| `jextract`-generated code that internally calls `downcallHandle`         | Yes — attributed to the module **using** the binding, not to jextract |

```bash
java --enable-native-access=com.example.nativebridge -jar app.jar
```

Set it per module (or `ALL-UNNAMED` for classpath code). The JEP announces the intent to make
`deny` the default in a future release; on a JDK 25 baseline that release has no publicly
numbered JEP yet. Treat the flag as mandatory production configuration now.

## jextract

Not distributed with the GraalVM or any OpenJDK build. It is a standalone OpenJDK project
(github.com/openjdk/jextract) that parses a C header with libclang and emits header constants
as static fields, `StructLayout`/`UnionLayout` with per-field `VarHandle`s at the correct
target-platform offset and alignment, and one `MethodHandle` per function with its
`FunctionDescriptor` already built.

```bash
jextract \
    --target-package com.example.sqlite \
    --output src/main/java \
    /usr/include/sqlite3.h
```

```java
MemorySegment db = sqlite3_h.sqlite3_open(arena.allocateFrom("mydb.db"));
```

It generates bindings, not memory-ownership semantics, and not an exemption from the native
access policy.

## Operational checklists

### Before production

- [ ] Every native call (JNI or FFM) that can block has been identified and isolated from
      virtual threads on a dedicated platform-thread pool
- [ ] Every use of `Linker.Option.critical()` is justified by a real JMH measurement under
      representative load against the eligibility criteria — sub-microsecond duration and
      proven absence of blocking
- [ ] `--enable-native-access` is configured explicitly for the modules or jars doing native
      interop, rather than left on the warn-only default
- [ ] `jextract`-generated bindings are versioned alongside the source C header, with a
      documented regeneration process — not generated once by hand and forgotten
- [ ] If the service uses virtual threads and makes native calls on a hot path,
      `jdk.VirtualThreadPinned` instrumentation via `RecordingStream` is live in production,
      not only in the lab
- [ ] No runbook or start script references `-Djdk.tracePinnedThreads` or `--enable-preview`
      for FFM code

### During an incident

- [ ] JFR collected with `jdk.VirtualThreadPinned#threshold` lowered to 1 ms before concluding
      there is no pinning of native origin
- [ ] The event's `stackTrace` identifies the origin as JNI or FFM — and that distinction was
      treated as irrelevant to the fix, since both need the same mitigation
- [ ] If any call uses `critical()`: the hypothesis that it is blocking and delaying safepoints
      for the **whole** JVM has been ruled out (`-Xlog:safepoint+stats=debug` showing raised
      wait time — not `-XX:+PrintSafepointStatistics`, which is removed and will not start)
- [ ] The log has been checked for `WARNING: ... restricted method ...` lines that appeared
      after a JDK upgrade — a sign the default native access behaviour moved and no flag was
      adjusted
- [ ] Before proposing "swap JNI for Panama" as the fix, it was confirmed whether the call
      blocks; if it does, that swap on its own changes nothing
