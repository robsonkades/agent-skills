# Native resources, parallelism and batching

## Serving correctness and provider placement

Treat the model artifact, input/output signature and pre/postprocessing as one tested version.
Inspect input names, dtype, rank, supported dynamic dimensions and layout; feature order,
normalization, tokenization and output-label mapping need application/model evidence, not just
shape metadata. ONNX Runtime's `getInputInfo()` and `getOutputInfo()` expose node metadata;
they do not establish those application semantics.

Before accepting an engine/provider, precision, tensor-layout or batch change, run representative
accepted inputs through the whole path, including pre/postprocessing. Check output shape and
item association plus agreed numerical tolerances or task decisions; do not invent an epsilon
or require bitwise identity unless that is the contract. Include boundary shapes and batched
versus individual results where relevant. Quantization can change accuracy; a faster kernel
alone does not establish acceptable results. This regression gate preserves an existing quality
target, rather than defining model quality or a training method.

Provider registration does not prove every operator runs there. ONNX Runtime assigns supported
nodes/subgraphs by provider capability and priority; unsupported work can run on a configured
CPU provider. Inspect actual placement using supported logs/profiles, and separate preprocessing,
host/device transfers and engine execution before increasing concurrency. Decide whether such
fallback meets the deployment contract and budgets; required accelerator execution and an
allowed CPU fallback are different readiness conditions.

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

When replacing a model in place, include both generations' weights, sessions/workspace and
in-flight buffers in the peak host/device budget. Validate and warm the new version before
routing new work to it; couple its preprocessing and postprocessing to that same version.
Acquire and retire generation leases with a protocol that prevents new acquisition during
retirement. Close the old resources only after queued/active uses and output consumers have
completed or transferred ownership, including abandoned callers' still-running native work.
Construction/warm-up failure must release new resources without closing the active version.
If both versions cannot coexist within budget, plan a drained replacement or separate serving
capacity and its availability/rollback cost; do not assume a live pointer swap solves lifetime.

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
For stateful inference, preserve sequence identity and state ownership, with ordering or instance
affinity where the state contract requires them. Explicit state carried in each request does not
by itself require one fixed predictor. A stateless dynamic batcher is not interchangeable with a
sequence scheduler; use the engine/server's supported mechanism or retain unbatched execution
when necessary.

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
- [ONNX Runtime execution providers](https://onnxruntime.ai/docs/execution-providers/) and [profiling](https://onnxruntime.ai/docs/performance/tune-performance/profiling-tools.html) — graph placement by capability/priority and operator-level evidence; use the target Java/provider release's available controls.
- [ONNX Runtime quantization](https://onnxruntime.ai/docs/performance/model-optimizations/quantization.html) — quantization is not lossless; performance alone does not establish acceptable outputs.
- [Triton dynamic and sequence batching](https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/user_guide/batcher.html) — a concrete serving distinction between stateless batching and stateful sequence routing, not a requirement to adopt Triton.
- [HotSpot JDK 25 NMT](https://docs.oracle.com/en/java/javase/25/vm/native-memory-tracking.html) — tracking scope excludes third-party native allocations; it is not a process RSS ledger.
- [JEP 444](https://openjdk.org/jeps/444) and [JEP 491](https://openjdk.org/jeps/491) — virtual threads became final in JDK 21; native execution remains a carrier concern after JDK 24's monitor changes. Pin events concern blocking while pinned, not every interval of native CPU work.

The library sources above are the reviewed versions, not required dependencies or a project
upgrade recommendation. Match the target's Java/native artifacts and provider contracts before
applying version-sensitive details. No universal authoring JDK baseline or measured engine
performance is implied by these source checks.
