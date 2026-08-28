# Reducing allocation and validating the fix

## Triage: is high GC overhead the collector or the application?

```
GC overhead > 10-15% of CPU time
│
├── 1. GC log: what is the allocation rate?
│      (Eden allocated / interval between Young GCs)
│
├── 2. Is that rate high for this workload? There is no universal number —
│      compare against a documented baseline for the SAME service.
│
├── 3. asprof -e alloc for 30-60s in production (low overhead, safe)
│      → where are the bytes concentrated?
│
├── 4. Are the named sites avoidable application code
│      (concatenation in a loop, a discarded collect(), avoidable boxing)?
│      ├── YES → fix the code, reprofile, and only then consider collector
│      │         tuning if the residual overhead still breaks the SLO.
│      └── NO (allocation is inherent — e.g. deserialising genuinely large
│                payloads) → heap sizing and collector choice are the right lever.
│
└── 5. Never expect TLAB flags to fix aggregate overhead.
```

## Allocation shapes worth looking for

These are what the profile usually names in a hot path, and each has a mechanical fix:

| Shape                                            | Fix                                                           |
| ------------------------------------------------ | ------------------------------------------------------------- |
| String concatenation in a loop (`report += ...`) | Pre-sized `StringBuilder`                                     |
| A finite set of computed names rebuilt per item  | Precompute the set once into an array or map                  |
| `new ArrayList<>()` for a known-size result      | Pre-size the capacity so the backing array is not reallocated |
| `groupingBy` + `averagingDouble` in a hot path   | Accumulate sum and count into a small array per key           |
| Boxing in a numeric pipeline                     | Primitive accumulators, or a primitive stream                 |

None of these is worth doing on a site the profile did not name.

## Pooling decision matrix

| Condition                                                                      | Pool?                                                          |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Small object (< 200 bytes), short-lived, no initialisation cost                | No — the TLAB fast path is cheaper than any pool               |
| Expensive to construct (connection, socket, native I/O buffer)                 | Yes — the avoided cost is initialisation, not allocation       |
| Large object (> 1 KB) allocated at sustained high frequency, no external state | Case by case — measure before and after with `asprof -e alloc` |
| Expected pool hit rate below 90%                                               | No — the miss fraction pays the pool cost without the benefit  |

A pool also costs what allocation does not: an atomic operation per borrow and return, state
cleanup, and the risk of stale state leaking between uses. A slot never returned is a leak of
its own kind.

## TLAB flags: real defaults, OpenJDK 25

Verified with `java -XX:+PrintFlagsFinal -version` on a G1 default heap. Reproduce in your own
environment before trusting absolute values; the relationships are the durable part.

| Flag                      | Default      | Controls                                                                  |
| ------------------------- | ------------ | ------------------------------------------------------------------------- |
| `UseTLAB`                 | `true`       | The TLAB mechanism as a whole                                             |
| `ResizeTLAB`              | `true`       | Adaptive recomputation of `desired_size`                                  |
| `TLABSize`                | `0` (auto)   | Fixed initial size; `0` delegates to the adaptive calculation             |
| `MinTLABSize`             | `2048` bytes | Floor on TLAB size                                                        |
| `TLABRefillWasteFraction` | `64`         | Divisor of `desired_size` for the refill waste tolerance                  |
| `TLABWasteIncrement`      | `4`          | Percentage relaxation of the waste limit after an outside-TLAB allocation |
| `TLABWasteTargetPercent`  | `1`          | Target % of heap tolerated as aggregate waste                             |
| `TLABAllocationWeight`    | `35`         | Weight of the moving average estimating each thread's allocation share    |
| `ZeroTLAB`                | `false`      | Zero the whole TLAB at refill; diagnostic, high cost                      |

## When touching TLAB flags is (rarely) justified

| Specific symptom                                                                       | Candidate                                | Validation                                                  |
| -------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------- |
| Fixed-size large objects near `desired_size`, with high `slow allocs` in the trace log | Raise `TLABWasteTargetPercent`           | `-Xlog:gc+tlab=trace` before and after; `refills` must fall |
| Thousands of short-lived threads, each paying for a TLAB it barely uses                | Rethink the thread pooling, not the flag | This is a concurrency-design problem                        |
| Suspected bug in the allocation subsystem itself                                       | `ZeroTLAB=true`, diagnostic only         | Never in continuous production                              |

Two independent judgements happen on the slow path — "is this object too large for any TLAB?"
(via `max_size()`) and "is it worth discarding the current TLAB?" (via `refill_waste_limit`).
Only the second depends on `TLABRefillWasteFraction`. The mechanism is adaptive in both
directions: it starts conservative and relaxes the waste limit by `TLABWasteIncrement` when
too many allocations are landing outside the TLAB.

## Checklist before calling the fix done

- [ ] The hypothesis was written down as "allocation at X is Y% of total because Z"
- [ ] Churn and promotion were distinguished by comparing against the GC log promotion rate
- [ ] Any latency spike attributed to allocation was matched to `Pause Young` lines, not to TLAB
- [ ] The fix was reprofiled with `asprof -e alloc` and the site measurably shrank
- [ ] If pooling was introduced, the object has real initialisation cost per the matrix above
