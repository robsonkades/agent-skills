# Native resources, parallelism and batching

## Ownership ledger

For each engine object involved in the change or suspected retention, record who creates/closes it,
thread-safety, native-memory estimate, device affinity, maximum live count, timeout/cancellation
behavior and a runtime live-count metric. Exercise
partial construction failure and shutdown while calls are active.

Distinguish a native handle from its backing storage. ONNX Runtime's Java `OnnxTensor`
can wrap a direct NIO buffer; closing the tensor does not deterministically free that
buffer's allocation. A non-direct input can cause a direct copy. Retain a bounded buffer
lease until the native operation and all consumers finish, even if the caller times out.
Mutating a buffer shared by overlapping calls can corrupt inputs without any heap leak.
For a buffer-backed tensor in ONNX Runtime Java 1.22.0, `getBufferRef()` contains a view
sharing the backing storage, not a data copy. Do not use it as an ownership probe: although
its Javadoc promises an empty optional for ORT-allocated storage, the 1.22.0 implementation
passes a null buffer to `duplicate`, whose fallback dereferences it and throws
`NullPointerException`. Confirm behavior in the resolved release and track storage ownership
at construction. Reusing a buffer-backed tensor requires the same size and shape
and respecting the buffer range; independent view positions do not make concurrent mutation safe.

Include returned values in the ledger. In ONNX Runtime Java 1.22.0, closing
`OrtSession.Result` closes its owned output values; retaining a Java reference to one does
not extend its native lifetime. Consume or copy needed data before closing the result, or
keep the result owned until asynchronous consumers finish. Caller-supplied pinned outputs
are excluded from this cleanup (`isResultOwner(index)` reports ownership): their owner
must close them after their last use. Here "pinned output" means a caller-supplied output
value, not a guarantee of page-locked host memory. Test postprocessing failure and late
completion after timeout for both ownership modes.

DJL documents `Predictor` as not thread-safe; lease one per active use or apply the
documented serving manager. `NDManager` ownership determines tensor lifetime: request
temporaries attached to a long-lived model/predictor manager can accumulate. Transfer or
copy resource outputs deliberately before closing their owning manager. In DJL 0.33.0,
ordinary Java inputs/outputs through a `Translator` normally let `PredictorContext` own
the per-call temporaries; `NDArray`/`NDList` inputs or outputs need explicit manager and
release ownership. Do not add transfers to ordinary Java results that own no native resource.
These are documented examples, not a universal session contract; confirm the resolved
engine/provider release.

## Parallelism matrix

Start with the axes implicated by profiles, queue measurements or engine configuration;
vary one at a time before checking interactions among the promising settings:

```text
outer request workers x sessions/predictors x intra-op threads x inter-op threads x device streams
```

Keep offered workload, input distribution, affinity and warm-up comparable and record admitted
and rejected work. Collect useful throughput, queue/service time, tail latency and errors;
add CPU/device utilization, context switching, memory bandwidth or RSS when they distinguish
the suspected bottleneck. Efficiency has meaning only relative to the resource ceiling of that
configuration. A one-axis sweep can miss interactions; it does not establish a global optimum.

## Deadline-aware batching

Preserve each request's remaining upstream deadline, accounting for time already spent; assign a
local deadline only when the contract supplies no earlier one. Use a monotonic clock for local
elapsed budgets. Bound queue items and estimated bytes/tokens, and batch only compatible
model versions, shapes/dtypes and provider constraints (or explicitly validated padding).

For a candidate batch, dispatch when full or by the earliest item's latest safe dispatch time:
remaining deadline minus estimated execution, transfer/postprocessing and safety margin.
Also enforce the configured maximum batch wait. The oldest arrival need not have the earliest
deadline. Recompute when membership changes and reject/expire work that cannot plausibly finish;
an estimate is not a hard completion guarantee. Include engine/device queue time in the budget.

Example at the current instant: an older item has 40 ms remaining, a newer one has 8 ms;
execution plus other reserved work is 6 ms. This batch has at most 2 ms to wait, even if
the oldest item's batching timer would permit 10 ms. If the reserve rises to 9 ms, the
newer item is already infeasible under this policy and needs rejection or an agreed fallback.

Reject when admission limits are reached. Preserve item/result association and define behavior
for cancelled items: abandoning one result must not reclaim shared batch storage while device
work or other consumers still use it. Test single-item traffic, a steady sub-batch rate, bursts,
mixed shapes/deadlines, timeout during execution and shutdown.

Use documentation/source for the resolved engine version. DJL predictors, ONNX Runtime sessions
and provider threading contracts vary by release and execution provider; validate rather than
generalize one wrapper's behavior.

## Primary references

- [ONNX Runtime 1.22.0 OnnxTensor source](https://github.com/microsoft/onnxruntime/blob/v1.22.0/java/src/main/java/ai/onnxruntime/OnnxTensor.java) — buffer construction/close behavior and the `getBufferRef` null-buffer discrepancy between Javadoc and implementation.
- [ONNX Runtime 1.22.0 OrtSession source](https://github.com/microsoft/onnxruntime/blob/v1.22.0/java/src/main/java/ai/onnxruntime/OrtSession.java) — `Result.close`, `isResultOwner` and caller-supplied pinned-output ownership.
- [DJL 0.33.0 inference performance](https://github.com/deepjavalibrary/djl/blob/v0.33.0/docs/development/inference_performance_optimization.md) — predictor concurrency; engine tuning details require their own version checks.
- [DJL 0.33.0 memory management](https://github.com/deepjavalibrary/djl/blob/v0.33.0/docs/development/memory_management.md) — manager ownership, `PredictorContext` and resource outputs.
- [HotSpot JDK 25 NMT](https://docs.oracle.com/en/java/javase/25/vm/native-memory-tracking.html) — tracking scope excludes third-party native allocations; it is not a process RSS ledger.
- [JEP 444](https://openjdk.org/jeps/444) and [JEP 491](https://openjdk.org/jeps/491) — virtual threads became final in JDK 21; native execution remains a carrier concern after JDK 24's monitor changes. Pin events concern blocking while pinned, not every interval of native CPU work.

The library sources above are the reviewed versions, not required dependencies or a project
upgrade recommendation. Match the target's Java/native artifacts and provider contracts before
applying version-sensitive details. No universal authoring JDK baseline or measured engine
performance is implied by these source checks.
