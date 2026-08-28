---
name: jni-and-ffm
description: >
  Crossing into native code: JNI call overhead and its pitfalls, critical sections and what
  they block, the FFM downcall and upcall path, `Linker` and method handles, why a native
  frame pins a virtual thread, and measuring the boundary cost. Use when a native call sits
  inside a tight loop, when someone proposes migrating JNI to Panama to fix pinning, when
  `Linker.Option.critical()` is applied without a measured duration, when
  `jdk.VirtualThreadPinned` events point at a `native` method or `MethodHandle.invokeExact`,
  when `WARNING: A restricted method ... has been called` appears after a JDK upgrade, when
  a runbook still references `-Djdk.tracePinnedThreads` or `--enable-preview` for FFM, or
  when `jextract` is assumed to ship with the JDK. Does not cover holding native memory
  without calling into it (off-heap-memory), pinning as a scheduling phenomenon
  (virtual-threads-internals), or the native memory budget (jvm-memory-regions).
---

# JNI and the FFM Boundary

## Purpose

Reason about the cost and the risk of a call that leaves the JVM. The boundary has three
independent cost components — the thread-state transition, marshaling, and verification —
and almost every wrong decision here comes from collapsing them into one number, or from
treating an option that addresses one of them as if it addressed another.

The failure this prevents is the migration that fixes nothing. `Linker.Option.critical()`
removes the safepoint transition cost, not pinning; swapping JNI for Panama changes the
overhead, not the pinning either. Pinning is a property of the **native frame on the
stack**, not of the API that produced it, and the only structural mitigation for a blocking
native call under virtual threads is isolating it on a dedicated platform-thread pool.

## Workflow

1. **Ask what the call does before asking which API it uses.** Duration and blocking
   behaviour decide everything downstream; the API choice decides only the fixed overhead.
2. **Amortise fixed cost by batching** when the call is short and frequent: one transition
   for the whole batch, with the work loop inside the native code. This is a throughput
   technique and does nothing for pinning.
3. **Apply the `critical()` criteria as measurements, not impressions.** Sub-microsecond
   duration measured with JMH under representative load, and proven absence of blocking. See
   `references/critical-and-decision-matrix.md`.
4. **Confirm pinning from the JFR event only.** `jdk.VirtualThreadPinned`, with the threshold
   lowered to 1 ms before concluding there is no native pinning — `profile.jfc`'s 20 ms
   default hides short frequent pinning.
5. **Mitigate blocking native calls structurally:** dispatch them to a dedicated fixed
   platform-thread pool sized by Little's Law, and let the virtual thread await the `Future`.
   Waiting on a `Future` is ordinary Java and unmounts normally.
6. **Declare native access explicitly in production.** `--enable-native-access=<module>` or
   `ALL-UNNAMED`, per module, rather than relying on the current warn-only default.
7. **Measure the boundary, do not estimate it.** JMH comparing JNI, a plain FFM downcall and
   a `critical` one for the same function, and `-prof gc` for the copy behaviour.

## Rules

- Pinning is a property of the native frame on the stack, not of the API that produced it. JNI
  and FFM downcalls — plain or `critical` — pin a virtual thread identically when the call
  blocks. "Migrating from JNI to Panama eliminates pinning" is false.
- `Linker.Option.isTrivial()` does not exist in the finalised FFM API. The final name, since
  JEP 454 (JDK 22 GA), is `Linker.Option.critical(boolean allowHeapAccess)`.
- `critical()` addresses safepoint transition overhead, not pinning. It tells the linker not to
  move the thread to `_thread_in_native`, which means the JVM cannot treat that thread as
  safepoint-safe for the whole call. A long or blocking `critical()` call can delay safepoints
  for the **entire JVM**, not just the calling thread — strictly worse than a plain downcall,
  not merely equally bad.
- Read `critical` as "critical section", not as "trivial" or "fast and always safe". That
  misreading is the most common error with this API.
- `critical(true)` is the FFM equivalent of JNI's `GetPrimitiveArrayCritical`: it permits
  passing a heap-backed array straight through via `MemorySegment.ofArray`, with no prior copy
  to off-heap memory.
- The only structural mitigation for a blocking native call under virtual threads is a
  dedicated platform-thread pool sized by Little's Law. Not a different interop API, not
  `critical()`.
- `-Djdk.tracePinnedThreads` was **removed in JDK 24**. The single source of truth on pinning
  is the `jdk.VirtualThreadPinned` JFR event, via `RecordingStream` or `jfr print`. A runbook
  still referencing that flag is broken.
- Since JDK 24 (JEP 472), JNI and FFM emit a restricted-native-access warning by default unless
  `--enable-native-access` is set. Treat that flag as mandatory production configuration now —
  the JEP states an intent to make `deny` the default in a future release. Warnings appearing
  in the log after a JDK upgrade are pending configuration, not noise.
- The warning fires at link or load time — `System.loadLibrary`, `Linker.downcallHandle`,
  `Linker.upcallStub`, `SymbolLookup.libraryLookup` — not on every subsequent segment access.
  `jextract`-generated code triggers it too, attributed to the module that uses the binding.
- FFM is final since JDK 22. No `--enable-preview` for FFM code; a start script that has it is
  out of date.
- `jextract` does **not** ship with the GraalVM or any OpenJDK distribution. It is a standalone
  project (github.com/openjdk/jextract) built against libclang, and it generates bindings, not
  memory-ownership semantics.
- Never leave an `Arena` unclosed — the FFM equivalent of leaking a JNI resource. In JNI the
  same mistake is a missing `ReleaseByteArrayElements` or `ReleasePrimitiveArrayCritical`,
  which leaves the array pinned or the copy never freed.
- FFM downcalls tend to be cheaper than JNI even without `critical()`, because a downcall is a
  `MethodHandle` the JIT can specialise and inline, while JNI goes through a runtime-resolved
  `JNINativeInterface` table. That is a JIT specialisation difference, not a difference in
  safepoint or pinning semantics.
- `asprof` is the async-profiler binary in the 3.x/4.x series. `profiler.sh` means an outdated
  installation.
- An aggregate CPU overhead calculation is not a tail-latency prediction without an explicit
  queueing model connecting the two.

## References

- [Critical, and choosing an interop approach](references/critical-and-decision-matrix.md) —
  the overhead components per call type, the thread-state and safepoint table, the measurable
  eligibility criteria for `critical()`, and the JNI/Panama/jextract/JNA decision matrix. Read
  before choosing an interop API or approving a `critical()` call.
- [Detecting and mitigating native pinning](references/pinning-and-native-access.md) — the JFR
  and async-profiler recipes for pinning of native origin, the dedicated-pool mitigation
  pattern, the JEP 472 warning surface, `jextract` usage, and the operational checklists. Read
  during an incident, or before a service that makes native calls goes to production.
