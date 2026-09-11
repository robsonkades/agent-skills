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

Use the request and existing artifacts to identify the affected inference path and decision. For
capacity or serving design, record model/version, engine/provider/version, target devices,
input shapes and batch distribution, pre/post-processing, in-process or remote boundary,
session/predictor ownership, engine thread
settings, admitted concurrency/queue, warm-up state, latency SLO, useful throughput, heap/RSS/native
memory and failure/fallback semantics. For a focused correction, collect the subset needed to
establish its contract; missing unrelated measurements need not block it.

Inspect build toolchains, compiler release, runtime image, resolved Java/native artifacts and
provider/device support. This skill prescribes no universal JDK baseline; engine requirements
and virtual-thread guidance are version-specific (virtual threads are final in JDK 21).
Do not upgrade Java or the engine merely to apply an example from current documentation.

## Workflow

1. When choosing or reconsidering the serving boundary, compare in-process versus remote serving
   from latency, isolation, scaling, model cadence, accelerator sharing, failure domain and
   operational ownership. Preserve an adequate existing boundary.
2. For native lifecycle changes or memory diagnosis, inventory the affected resources and lifetimes.
   Bound sessions, predictors, arenas, tensors and direct buffers; close resources that expose
   ownership/close contracts and bound retained storage where reclamation is GC-managed.
   Reuse only after actual native completion.
3. For concurrency tuning, use the relevant axes of outer requests, session count,
   intra-op/inter-op threads and device streams. Start from current settings and a measured
   bottleneck; measure absolute goodput and tail latency, not speedup alone.
4. If batching is used, bound size/storage and maximum wait, and dispatch before the earliest
   member deadline minus the execution/remaining-work budget. Test sparse and burst traffic;
   full-batch throughput is not a latency policy.
5. For deployment/readiness changes, warm the JVM code path and the model/engine separately,
   then gate readiness on a representative successful inference rather than model-file load.
6. When changing admission or failure behavior, test overload in an isolated or authorized load
   environment. Use bounded admission, deadline-aware rejection/cancellation and an explicit
   fallback, if required by the contract, whose quality is also verified.

## Decision rules

- Pool only resources documented as non-thread-safe or expensive to create. Pool size must match a
  measured useful concurrency limit, not request concurrency. A documented shareable session
  with bounded admission may already suffice; non-thread-safe resources can also be confined
  or serialized without a pool.
- Reuse direct, native-order buffers when the API permits, with exclusive ownership across
  filling, native execution and result consumption. Moving allocation from heap to direct
  memory inside the hot path does not remove allocation or guarantee zero device copies.
- Native CPU work can retain a virtual-thread carrier and does not gain throughput from virtual
  threads. Isolate/admit it with a bounded executor when necessary.
- NMT excludes many third-party native allocations. Compare process/cgroup RSS with NMT categories
  and application counters for live sessions/tensors; use native profilers where required.
  RSS growth alone does not identify a leaking owner, and RSS minus NMT is not a leak-size metric.
- `jdk.VirtualThreadPinned` absence cannot clear CPU-bound time inside native code; the event needs a
  relevant park/block path to become visible.
- A cancelled Java future may not stop native computation. Define abandonment, late completion and
  resource reclamation explicitly.

## Evidence output

For a focused review, return the finding, supporting contract/evidence, consequence and smallest
correction or check. When measurements are missing, keep causal diagnoses and sizing conditional
and name the evidence that would distinguish the hypotheses. For experiments, separate measured
result from analytical ceiling, pin environment and raw output, and compare the same metrics
after a change. Report what was verified and what remains unknown; an adequate existing design
is a valid outcome.

## References

- [Native resources, parallelism and batching](references/native-resources-and-batching.md) — read
  when reviewing native ownership, sizing pools, engine threads, buffers or a dynamic batcher;
  includes versioned library sources and diagnostic coverage limits.
- Use `jni-and-ffm`, `off-heap-memory`, `concurrency-limiting-and-bulkheads` and
  `load-testing-advanced` for their owning mechanisms.
