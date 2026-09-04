# Native resources, parallelism and batching

## Ownership ledger

For each engine object record who creates/closes it, thread-safety, native-memory estimate, device
affinity, maximum live count, timeout/cancellation behavior and a runtime live-count metric. Exercise
partial construction failure and shutdown while calls are active.

## Parallelism matrix

Vary one axis at a time:

```text
outer request workers x sessions/predictors x intra-op threads x inter-op threads x device streams
```

Keep admitted workload, input distribution, affinity and warm-up fixed. Collect useful throughput,
queue time, service time, tail latency, CPU/device utilization, context switching, memory bandwidth,
RSS and errors. Efficiency has meaning only relative to the resource ceiling of that configuration.

## Deadline-aware batching

Admission time gives each item a deadline. Dispatch when maximum batch size is reached or the oldest
item reaches its wait budget, whichever comes first. Reject when the bounded queue is full. Preserve
item/result association and define behavior for cancelled items. Test single-item traffic, a steady
sub-batch rate, bursts, mixed shapes, timeout during execution and shutdown.

Use the exact engine's current API documentation. DJL predictors, ONNX Runtime sessions and provider
threading contracts vary by release and execution provider; validate rather than generalize one
wrapper's behavior.
