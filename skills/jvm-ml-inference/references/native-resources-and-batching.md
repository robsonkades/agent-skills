# Native resources, parallelism and batching

## Ownership ledger

For each engine object record who creates/closes it, thread-safety, native-memory estimate, device
affinity, maximum live count, timeout/cancellation behavior and a runtime live-count metric. Exercise
partial construction failure and shutdown while calls are active.

Distinguish a native handle from its backing storage. ONNX Runtime's Java `OnnxTensor`
can wrap a direct NIO buffer; closing the tensor does not deterministically free that
buffer's allocation. A non-direct input can cause a direct copy. Retain a bounded buffer
lease until the native operation and all consumers finish, even if the caller times out.
Mutating a buffer shared by overlapping calls can corrupt inputs without any heap leak.

DJL documents `Predictor` as not thread-safe; lease one per active use or apply the
documented serving manager. `NDManager` ownership determines tensor lifetime: request
temporaries attached to a long-lived model/predictor manager can accumulate. Transfer or
copy outputs deliberately before closing their owning manager. These are documented
examples, not a universal session contract; confirm the resolved engine/provider release.

## Parallelism matrix

Vary one axis at a time:

```text
outer request workers x sessions/predictors x intra-op threads x inter-op threads x device streams
```

Keep admitted workload, input distribution, affinity and warm-up fixed. Collect useful throughput,
queue time, service time, tail latency, CPU/device utilization, context switching, memory bandwidth,
RSS and errors. Efficiency has meaning only relative to the resource ceiling of that configuration.

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

Use the exact engine's current API documentation. DJL predictors, ONNX Runtime sessions and provider
threading contracts vary by release and execution provider; validate rather than generalize one
wrapper's behavior.

## Primary references

- [ONNX Runtime Java OnnxTensor](https://onnxruntime.ai/docs/api/java/ai/onnxruntime/OnnxTensor.html) — backing-buffer and close contracts.
- [DJL inference performance](https://docs.djl.ai/master/docs/development/inference_performance_optimization.html) — predictor concurrency.
- [DJL memory management](https://docs.djl.ai/master/docs/development/memory_management.html) — manager ownership and output lifetime.

These documentation URLs track current development/API content; match claims to the pinned
artifact's documentation/source before changing a deployed binding.
