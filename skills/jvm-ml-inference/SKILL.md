---
name: jvm-ml-inference
description: >
  Engineering CPU and accelerator-backed ML inference from JVM applications: choosing in-process
  versus remote serving, bounding native sessions and predictors, coordinating engine and request
  parallelism, batching under a latency deadline, reusing direct buffers, warming deployments and
  diagnosing native memory outside NMT. Use when DJL, ONNX Runtime or another native inference
  engine loses throughput as concurrency rises, leaks RSS, overloads a model pool or needs graceful
  degradation. Model quality and training pipelines are outside scope.
---

# JVM ML Inference

## Purpose

Treat inference as a bounded native resource and queueing system. More request threads do not create
CPU, accelerator streams, native sessions or memory bandwidth; they can oversubscribe the engine and
worsen both throughput and tail latency.

## Workload contract

Record model/version, engine/provider/version, target devices, input shapes and batch distribution,
pre/post-processing, in-process or remote boundary, session/predictor ownership, engine thread
settings, admitted concurrency/queue, warm-up state, latency SLO, useful throughput, heap/RSS/native
memory and failure/fallback semantics.

## Workflow

1. Decide in-process versus remote serving from latency, isolation, scaling, model cadence,
   accelerator sharing, failure domain and operational ownership.
2. Inventory every native resource and lifetime. Bound sessions, predictors, arenas, tensors and
   direct buffers; close them deterministically.
3. Build a concurrency matrix across outer requests, session count, intra-op/inter-op threads and
   device streams. Measure absolute goodput and tail latency, not speedup alone.
4. If batching is used, bound both batch size and oldest-item wait. Test sparse and burst traffic;
   full-batch throughput is not a latency policy.
5. Warm the JVM code path and the model/engine separately, then gate readiness on a representative
   successful inference rather than model-file load.
6. Overload deliberately. Use bounded admission, deadline-aware rejection/cancellation and an
   explicit fallback whose quality is part of the contract.

## Decision rules

- Pool only resources documented as non-thread-safe or expensive to create. Pool size must match a
  measured useful concurrency limit, not request concurrency.
- Reuse direct, native-order buffers when the API permits. Moving allocation from heap to direct
  memory inside the hot path does not remove allocation.
- Native CPU work can retain a virtual-thread carrier and does not gain throughput from virtual
  threads. Isolate/admit it with a bounded executor when necessary.
- NMT excludes many third-party native allocations. Compare process/cgroup RSS with NMT categories
  and application counters for live sessions/tensors; use native profilers where required.
- `jdk.VirtualThreadPinned` absence cannot clear CPU-bound time inside native code; the event needs a
  relevant park/block path to become visible.
- A cancelled Java future may not stop native computation. Define abandonment, late completion and
  resource reclamation explicitly.

## Evidence output

Separate measured result from analytical ceiling. Pin environment and raw output; report confidence,
what the experiment cannot prove, and the same metrics after a change.

## References

- [Native resources, parallelism and batching](references/native-resources-and-batching.md) — read
  when sizing pools, engine threads, buffers or a dynamic batcher.
- Use `jni-and-ffm`, `off-heap-memory`, `concurrency-limiting-and-bulkheads` and
  `load-testing-advanced` for their owning mechanisms.
