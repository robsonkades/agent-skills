# Reducing allocation and validating the fix

## Triage: is high GC overhead the collector or the application?

```
GC overhead > 10-15% of CPU time
│
├── 1. Allocation rate: GC log (Eden allocated / interval between Young GCs),
│      or jdk.ThreadAllocationStatistics / ThreadMXBean for the exact figure.
│
├── 2. Is that rate high for this workload? There is no universal number —
│      compare against a documented baseline for the SAME service.
│
├── 3. asprof -e alloc for 30-60s in production (low overhead, safe),
│      or jcmd <pid> JFR.view allocation-by-site → where are the bytes concentrated?
│
├── 4. Are the named sites avoidable application code
│      (concatenation in a loop, a discarded collect(), avoidable boxing)?
│      ├── YES → fix the code, reprofile, and only then consider collector
│      │         tuning if the residual overhead still breaks the SLO.
│      └── NO (allocation is inherent — e.g. deserialising genuinely large
│                payloads) → heap sizing and collector choice are the right lever;
│                on G1 check first whether the payloads are humongous.
│
└── 5. Never expect TLAB flags to fix aggregate overhead.
```

## Allocation shapes worth looking for

These are what the profile usually names in a hot path, and each has a mechanical fix:

| Shape                                                       | What the profile shows                           | Fix                                                                   |
| ----------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------- |
| String concatenation in a loop (`report += ...`)            | `byte[]` under `StringConcatHelper`              | Pre-sized `StringBuilder`                                             |
| `String.format` / `MessageFormat` per call                  | `Formatter`, `char[]`, regex objects             | `StringBuilder`, or format once outside the loop                      |
| Charset round trips (`getBytes`, `new String(bytes)`)       | `byte[]` under `String.encode` / `decode`        | Keep one representation; write through `CharsetEncoder` into a buffer |
| A finite set of computed names rebuilt per item             | `String` at one site, high count                 | Precompute the set once into an array or map                          |
| `new ArrayList<>()` / `HashMap` for a known-size result     | `Object[]` under `grow`, `Node[]` under `resize` | Pre-size the capacity so the backing array is not reallocated         |
| `groupingBy` + `averagingDouble` in a hot path              | `HashMap$Node`, `double[]`, boxed `Double`       | Accumulate sum and count into a small array per key                   |
| Boxing in a numeric pipeline                                | `Integer` / `Long` / `Double`                    | Primitive accumulators, or a primitive stream                         |
| Capturing lambdas and iterators per call                    | `$$Lambda`, `ArrayList$Itr`                      | Non-capturing lambda, indexed loop; only if the site is hot           |
| Varargs helpers (`log.info("x {}", a, b)`, `List.of(a, b)`) | `Object[]` at the call site                      | Fixed-arity overloads, guard with `isDebugEnabled`                    |
| Per-request byte buffer of megabytes                        | `byte[]` outside TLAB, `(G1 Humongous …)`        | Chunked streaming, or a reused buffer sized once                      |

None of these is worth doing on a site the profile did not name.

## Pooling decision matrix

| Condition                                                                     | Pool?                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Small object (< 200 bytes), short-lived, no initialisation cost               | No — the TLAB fast path is cheaper than any pool                                                                                                                                                                     |
| Expensive to construct (connection, socket, native I/O buffer)                | Yes — the avoided cost is initialisation, not allocation                                                                                                                                                             |
| Mutable object that would hold references to fresh young objects              | No — a pooled object ages into Old Gen, and each such store pays a write barrier and a remembered-set entry (G1 card / region set); the young objects it points at are then kept alive until the slot is overwritten |
| Large array (≥ 1 KB) allocated at sustained high frequency, no external state | Case by case — measure before and after with `asprof -e alloc`; on G1 a pool is the standard fix for humongous buffers                                                                                               |
| Expected pool hit rate below 90%                                              | No — the miss fraction pays the pool cost without the benefit                                                                                                                                                        |

A pool also costs what allocation does not: an atomic operation per borrow and return, state
cleanup, and the risk of stale state leaking between uses. A slot never returned is a leak of
its own kind.

## Levers that are not code changes

Measure each with the allocation rate before and after; none is a substitute for removing an
avoidable site, and none changes _where_ the bytes come from.

| Lever                            | What it changes                                                                                                                                                                                          | What it does not change                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `-XX:+UseCompactObjectHeaders`   | JEP 519, product on JDK 25, off by default: 8-byte header instead of 12, so objects whose size sat just above an 8-byte boundary shrink by one alignment step. Fewer bytes per object, same object count | Arrays of primitives at scale, or anything whose body dominates                            |
| `-XX:+UseStringDeduplication`    | Long-lived duplicate `String` values share one `byte[]` after `StringDeduplicationAgeThreshold` (3) GCs; retention only, all collectors since JDK 18 (JDK-8254598)                                       | The allocation of the string and its array, which happen first                             |
| `-XX:PretenureSizeThreshold=<n>` | Serial's DefNew allocates objects above `n` directly in Old ("Maximum size in bytes of objects allocated in DefNew generation", `gc_globals.hpp`)                                                        | Anything on G1, Parallel or ZGC — the flag is accepted and ignored                         |
| `-XX:G1HeapRegionSize=<n>`       | The humongous threshold (half a region); raising it turns humongous buffers back into ordinary young allocations                                                                                         | The allocation rate itself; fewer, larger regions also coarsen G1's collection-set choices |

Compact headers are the one lever that lowers the rate of the same code. The JEP's stated
expectation is a reduction in heap footprint for small-object-heavy workloads, not a fixed
percentage; the measured allocation rate of the service is the only figure to quote.

## TLAB flags: real defaults, OpenJDK 25

Verified with `java -XX:+PrintFlagsFinal -version` on Temurin 25.0.3 with G1 and a default
heap; descriptions are the flag strings from `gc/shared/tlab_globals.hpp`. Reproduce in your
own environment before trusting absolute values; the relationships are the durable part.

| Flag                      | Default      | Controls                                                                                                                        |
| ------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `UseTLAB`                 | `true`       | "Use thread-local object allocation"                                                                                            |
| `ResizeTLAB`              | `true`       | "Dynamically resize TLAB size for threads" — adaptive recomputation of `desired_size`                                           |
| `TLABSize`                | `0` (auto)   | "Starting TLAB size (in bytes); zero means set ergonomically"                                                                   |
| `MinTLABSize`             | `2048` bytes | "Minimum allowed TLAB size (in bytes)"                                                                                          |
| `TLABRefillWasteFraction` | `64`         | "Maximum TLAB waste at a refill (internal fragmentation)" — divisor of `desired_size` for the waste tolerance                   |
| `TLABWasteIncrement`      | `4`          | "Increment allowed waste at slow allocation" — added to the waste limit in **heap words** per slow allocation, not a percentage |
| `TLABWasteTargetPercent`  | `1`          | "Percentage of Eden that can be wasted (half-full TLABs at GC)" — of **Eden**, not of the heap                                  |
| `TLABAllocationWeight`    | `35`         | "Allocation averaging weight" — of the moving average estimating each thread's allocation share                                 |
| `ZeroTLAB`                | `false`      | "Zero out the newly created TLAB"; diagnostic use, high cost                                                                    |

`TLABWasteTargetPercent` also fixes the sizing target: `target_refills = 100 / (2 ×
TLABWasteTargetPercent)` = 50 refills per thread per GC epoch (`threadLocalAllocBuffer.cpp`),
which is why `desired_size` scales with Eden divided by the number of allocating threads.

## When touching TLAB flags is (rarely) justified

| Specific symptom                                                                       | Candidate                                | Validation                                                  |
| -------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| Fixed-size large objects near `desired_size`, with high `slow allocs` in the trace log | Raise `TLABWasteTargetPercent`           | `-Xlog:gc+tlab=trace` before and after; `refills` must fall |
| Thousands of short-lived threads, each paying for a TLAB it barely uses                | Rethink the thread pooling, not the flag | This is a concurrency-design problem                        |
| Suspected bug in the allocation subsystem itself                                       | `ZeroTLAB=true`, diagnostic only         | Never in continuous production                              |

Two independent judgements happen on the slow path — "is this object too large for any TLAB?"
(via `max_size()`) and "is it worth discarding the current TLAB?" (via `refill_waste_limit`).
Only the second depends on `TLABRefillWasteFraction`. `max_size()` is the collector's: on G1
it is the humongous threshold, `align_down(_humongous_object_threshold_in_words,
MinObjAlignment)` in `g1CollectedHeap.cpp`, so nothing a flag in this table sets. The
mechanism is adaptive in both directions: it starts conservative and relaxes the waste limit
by `TLABWasteIncrement` words each time an allocation lands outside the TLAB.

## Checklist before calling the fix done

- [ ] The hypothesis was written down as "allocation at X is Y% of total because Z"
- [ ] Churn and promotion were distinguished by comparing against the GC log promotion rate
      or an `asprof -e alloc --live` profile
- [ ] Any latency spike attributed to allocation was matched to `Pause Young`,
      `(G1 Humongous Allocation)` or `jdk.ZAllocationStall`, not to TLAB refill
- [ ] The fix was reprofiled with `asprof -e alloc` and the site measurably shrank
- [ ] If pooling was introduced, the object has real initialisation cost per the matrix above
- [ ] If a flag was changed, the allocation rate was measured before and after under the same
      load, and the flag is one the running collector honours
