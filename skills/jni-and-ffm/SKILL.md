---
name: jni-and-ffm
description: >
  Crossing into native code: JNI call overhead, critical sections and what they block, the
  FFM downcall and upcall path, `Linker` and method handles, why a native frame pins a
  virtual thread, and measuring the boundary cost. Use when a native call sits inside a
  tight loop, when someone proposes migrating JNI to Panama to fix pinning, when
  `Linker.Option.critical()` is applied without a measured duration, when
  `jdk.VirtualThreadPinned` events point at a `native` method or `MethodHandle.invokeExact`,
  when `WARNING: A restricted method ... has been called` appears after a JDK upgrade, when
  a runbook still references `-Djdk.tracePinnedThreads` or `--enable-preview` for FFM, when
  `jextract` is assumed to ship with the JDK, when a downcall fails with
  `WrongThreadException` on a confined arena, or when `GCLocker Initiated GC` appears as a
  cause in the GC log. Does not cover holding native memory (off-heap-memory), pinning as
  scheduling (virtual-threads-internals), or the native memory budget (jvm-memory-regions).
---

# JNI and the FFM Boundary

## Purpose

Reason about the cost and the risk of a call that leaves the JVM. The boundary has three
independent cost components — the thread-state transition, marshaling, and verification —
and almost every wrong decision here comes from collapsing them into one number, or from
treating an option that addresses one of them as if it addressed another.

The failure this prevents is the migration that fixes nothing. FFM can improve safety and
binding ergonomics without making a blocking foreign call unmountable. A native/foreign
frame prevents virtual-thread unmounting in current HotSpot; `critical()` is a narrowly
constrained optimization hint, not an asynchronous-native-call mechanism.

## Workflow

1. **Specify the native contract first.** ABI, ownership, lifetime, thread affinity,
   reentrancy/upcalls, cancellation, error channel, blocking behavior and worst-case duration
   decide correctness. API choice also affects checks, maintainability and deployment.
2. **Amortise fixed cost by batching** when the call is short and frequent: one transition
   for the whole batch, with the work loop inside the native code. This is a throughput
   technique and does nothing for pinning.
3. **Apply the documented `critical()` preconditions.** The function must be extremely short
   in every case and must not call back into Java. Prove bounded non-blocking behavior and
   benchmark the complete service; do not invent a universal microsecond cutoff. See
   `references/critical-and-decision-matrix.md`.
4. **Diagnose carrier capture with multiple signals.** `jdk.VirtualThreadPinned` reports a
   virtual thread attempting a blocking operation while pinned; it may not report C code
   simply blocking inside a native frame. Combine JFR, thread dumps, wall/native profiles,
   call-duration metrics and carrier saturation.
5. **Isolate or redesign blocking native calls:** use a bounded dedicated platform-thread
   pool, an asynchronous/non-blocking native API, process isolation or a Java alternative.
   Size/admit the pool from latency, concurrency, resource limits and overload policy, then
   let the virtual thread await the `Future`.
   Waiting on a `Future` is ordinary Java and unmounts normally. Allocate the call's
   segments on the pool thread, inside the task: a confined-arena segment created on the
   caller's thread fails the first downcall with `WrongThreadException`. See
   `references/arenas-upcalls-and-gc.md`.
6. **Declare native access explicitly in production.** `--enable-native-access=<module>` or
   `ALL-UNNAMED`, per module, rather than relying on the current warn-only default.
7. **Measure the boundary, do not estimate it.** JMH comparing JNI, a plain FFM downcall and
   a `critical` one for the same function, and `-prof gc` for the copy behaviour.

## Rules

- Current virtual-thread implementations cannot unmount across a native method or foreign
  function frame. JNI and FFM therefore both capture a carrier for blocking work; exact event
  visibility and stub behavior differ, so diagnose rather than assuming identical telemetry.
- `Linker.Option.isTrivial()` does not exist in the finalised FFM API. The final name, since
  JEP 454 (JDK 22 GA), is `Linker.Option.critical(boolean allowHeapAccess)`.
- `critical()` is an API hint that permits implementation optimizations valid only for an
  extremely short, no-upcall function. HotSpot versions may omit normal transitions/checks,
  increasing safepoint and crash risk if preconditions are violated. Do not encode a specific
  `_thread_in_native` implementation as the portable contract.
- Read `critical` as "critical section", not as "trivial" or "fast and always safe". That
  misreading is the most common error with this API.
- `critical(true)` permits heap-backed segments as address arguments for the call. It is
  conceptually related to JNI critical access but not an exact equivalence: JNI may return a
  copy or pin, and FFM/collector implementation can evolve. Treat the address as temporary,
  obey critical-section restrictions, and observe collector/safepoint behavior on the
  deployed JDK. See
  `references/arenas-upcalls-and-gc.md`.
- An exception escaping an upcall target terminates the JVM, per the `Linker` contract.
  Every upcall target catches `Throwable` and translates it into a return code, and no
  upcall may run from a `critical` downcall. See `references/arenas-upcalls-and-gc.md`.
- Mitigate blocking native calls with bounded platform-thread isolation, a truly asynchronous
  native interface, process isolation or replacement. `critical()` and a JNI-to-FFM rewrite
  alone do not make the call unmountable.
- `-Djdk.tracePinnedThreads` was removed in JDK 24. Use `jdk.VirtualThreadPinned` for Java
  blocking attempts while pinned, plus wall/native profiles and carrier/call metrics for time
  spent blocking inside native code.
- JEP 472 brought JNI loading under the native-access restrictions already used by FFM in
  JDK 24. On JDK 24/25, unauthorized restricted use warns by default and can be configured;
  future policy is intended to deny. Declare `--enable-native-access` for the actual calling
  modules and test with the exact release's `--illegal-native-access` policy.
- Warnings are associated with restricted load/link operations such as native library loads,
  downcall/upcall creation and library lookup, typically once per caller module—not each
  segment read. Generated bindings do not inherit an exemption; attribution follows the
  module that invokes the restricted operation.
- FFM is final since JDK 22. No `--enable-preview` for FFM code; a start script that has it is
  out of date.
- `jextract` is an OpenJDK project/tool distributed separately from the standard JDK; vendor
  bundles can differ. Pin its version/target ABI and review generated ownership/error policy.
- Close confined/shared arenas according to the native ownership boundary. Automatic/global
  arenas are not manually closeable; their lifetimes make them unsuitable for arbitrary
  retained pointers. JNI critical/element APIs must be released on every path.
- Do not assume FFM is faster than JNI. Descriptor shape, checks, marshaling, JIT compilation,
  native work and copies dominate differently. Benchmark the same ABI/function/data path and
  retain safety and maintainability in the decision.
- An aggregate CPU overhead calculation is not a tail-latency prediction without an explicit
  queueing model connecting the two.
- A `FunctionDescriptor` is executable ABI metadata. Wrong C width, signedness, struct layout,
  variadic boundary, calling convention or callback lifetime can corrupt memory or crash the
  JVM despite Java's static types. Test against headers on every target platform.
- Native cancellation is cooperative: cancelling a `Future` or interrupting the Java caller
  does not reliably stop C code. Define timeout, abandonment, resource ownership and late
  completion behavior at the boundary.

## References

- [Critical, and choosing an interop approach](references/critical-and-decision-matrix.md) —
  the overhead components per call type, the thread-state and safepoint table, the measurable
  eligibility criteria for `critical()`, and the JNI/Panama/jextract/JNA decision matrix. Read
  before choosing an interop API or approving a `critical()` call.
- [Arenas, upcalls and the collector](references/arenas-upcalls-and-gc.md) — arena kinds at
  the interop boundary (confined handoff, shared close, stub lifetime, automatic arenas),
  the upcall contracts and cost order, `captureCallState` for `errno` and
  `firstVariadicArg`, what a critical region does to each collector, and the testing
  levers. Read when a downcall fails with `WrongThreadException` or `Already closed`,
  when designing a callback API, when a native function sets `errno` or is variadic, or
  when `GCLocker Initiated GC` appears in a GC log.
- [Detecting and mitigating native pinning](references/pinning-and-native-access.md) — the JFR
  and async-profiler recipes for pinning of native origin, the dedicated-pool mitigation
  pattern, the JEP 472 warning surface, `jextract` usage, and the operational checklists. Read
  during an incident, or before a service that makes native calls goes to production.
