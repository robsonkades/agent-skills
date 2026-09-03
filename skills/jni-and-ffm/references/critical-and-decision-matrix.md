# `critical()`, boundary cost, and interop selection

## Model costs separately

1. **Transition and stub cost.** JNI and FFM establish a native call according to current
   HotSpot implementation and target ABI. Fixed cost depends on compiler/stub shape and flags.
2. **Marshaling and copying.** Strings, arrays, structs, callbacks and ownership transfer can
   dominate an otherwise tiny call. JNI accessors may copy or pin; FFM code may copy into
   native segments explicitly.
3. **Validation and lifetime checks.** JNI references/exceptions and FFM segment
   accessibility/liveness/descriptor checks have different safety surfaces.
4. **Native work and queueing.** Locks, I/O, page faults, allocator contention and callbacks
   determine worst-case duration and carrier/resource occupancy.

Benchmark the complete binding path. An empty native function measures only part (1), not the
production call.

## What `Linker.Option.critical` actually promises

The Java 25 API defines `critical(boolean allowHeapAccess)` as a hint that implementations
may use for optimizations valid only when the foreign function:

- has an extremely short running time in **all** cases, comparable to an empty function; and
- does not call back into Java, including through an upcall stub.

Violating those preconditions can cause performance loss or JVM crashes. The portable API
does not promise a particular HotSpot thread-state transition, instruction sequence or
safepoint behavior. Inspect and measure the deployed implementation if a decision depends on
those internals.

With `allowHeapAccess=true`, heap-backed segments may be passed for address-layout arguments.
The exposed native address is temporary and valid only for the call. This avoids requiring an
explicit off-heap copy in the Java code; it does not promise whether a collector/runtime pins,
copies or uses another mechanism. Native code must not retain the pointer.

## Eligibility gate

| Criterion    | Eligible for an experiment                                           | Reject `critical()`                                                    |
| ------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Duration     | bounded near empty-call cost across p99.99/worst tested inputs       | unbounded, data-dependent long tail, page fault or cold initialization |
| Blocking     | audited no I/O, locks, waits, callbacks or hidden lazy work          | any blocking/unknown dependency                                        |
| Upcalls      | none, directly or indirectly                                         | callback/reentrancy into Java possible                                 |
| Heap pointer | used only synchronously during the call                              | retained, published or used asynchronously                             |
| Value        | transition/copy cost is measured material at service level           | optimization is based only on a microbenchmark ratio                   |
| Operations   | canary monitors safepoint/carrier/native-call tails; rollback exists | no production visibility or safe rollback                              |

There is no universal one-microsecond threshold. “Extremely short” must be conservative
relative to the service's safepoint/tail objectives and the native function's worst case.

## Interop decision matrix

| Approach                   | Strengths                                                                 | Risks/costs                                                                   | Prefer when                                                       |
| -------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Existing JNI               | mature ecosystem, complete JNI/JVMTI control                              | manual references/errors, C glue, crash/memory-corruption surface             | stable audited legacy binding or capability unavailable in FFM    |
| Plain FFM downcall         | Java layouts/handles, explicit lifetime, no C shim for many ABIs          | descriptors can still be wrong; restricted access; native/arena lifecycle     | new JDK 22+ C ABI binding after platform validation               |
| FFM `critical`             | implementation may reduce transition cost; optional temporary heap access | severe preconditions, no upcall, implementation-specific internals            | measured tiny leaf function with bounded behavior and rollback    |
| `jextract` + FFM           | generates layouts/constants/handles from headers                          | tool/version/ABI coupling; generated code does not own lifecycle/error policy | large stable C headers with reproducible generation/review        |
| JNA/JNR or library wrapper | lower setup effort, ecosystem mapping                                     | extra layer and target-specific cost/behavior                                 | noncritical integration where supportability outweighs peak speed |
| Out-of-process service     | failure/memory isolation, independent native lifecycle                    | serialization/network/operations/partial failure                              | unsafe or blocking library warrants blast-radius isolation        |

FFM has stronger Java-side descriptors and lifetime checks than raw JNI, but neither makes a
wrong ABI safe. Type widths (`long` differs across LP64/LLP64), packing, alignment, unions,
bitfields, variadics and calling conventions require per-target validation.

## Batching trade-off

Batching amortizes fixed transitions and often improves locality, but increases call duration,
buffer ownership, cancellation latency and failure granularity. A 50 ms batch captures a
carrier for 50 ms and is categorically ineligible for `critical()`, even if per-element work
is tiny. Choose batch size from throughput, tail/cancellation budget, memory and overload
limits; expose partial-result/error semantics.

## Measurement design

- JMH: compare JNI, plain FFM and eligible critical FFM for the same exported function,
  descriptor, data copy and result consumption; use multiple forks and input sizes.
- Capture normalized allocation/copy volume, native call duration distribution, CPU, code
  cache/compilation state and end-to-end service tails.
- Run with realistic contention, cold pages/library initialization, failure codes and each
  supported OS/architecture ABI.
- For critical experiments, collect safepoint timing and carrier saturation in the same run;
  a faster mean with worse pauses/tails is a rejection.
- Verify native compiler flags/sanitizer builds in CI; use AddressSanitizer/UBSan where the
  toolchain permits, plus `-Xcheck:jni` for JNI tests.

## Primary references

- [Java 25 `Linker.Option`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/foreign/Linker.Option.html)
- [Java 25 `Linker`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/foreign/Linker.html)
- [JEP 454: Foreign Function & Memory API](https://openjdk.org/jeps/454)
- [JNI specification: array operations](https://docs.oracle.com/en/java/javase/25/docs/specs/jni/functions.html#array-operations)
- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
