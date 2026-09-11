---
name: blocking-and-nonblocking-io
description: >
  Four things routinely conflated into one: a blocking API, a blocked OS thread,
  non-blocking I/O at the syscall, and an asynchronous programming model. Covers which JDK
  operations unmount a virtual thread and which capture the carrier, the difference between
  capture-with-compensation and pinning, the socket poller behind blocking socket calls,
  file I/O as the case Loom does not fix, and what blocking an event loop costs. Use when
  someone says virtual threads make I/O non-blocking, when a file-heavy workload on virtual
  threads grows the carrier pool, when a blocking call sits inside a Netty or Reactor
  pipeline, when jdk.virtualThreadScheduler.maxPoolSize is raised to fix a symptom, or when
  an argument turns on whether the model or the syscall is the bottleneck. Not choosing
  between the two models (reactive-and-virtual-thread-selection), continuation mechanics and
  pinning diagnosis (virtual-threads-internals), demand signalling (reactive-backpressure),
  or copy avoidance (io-uring-and-zero-copy).
---

# Blocking and Non-Blocking I/O

## Purpose

Keep four distinct properties distinct, because every confused architecture argument about
virtual threads and reactive programming comes from collapsing them:

```text
Blocking API          the caller may wait for this call's specified result
Blocked OS thread     a kernel-schedulable entity is parked and unavailable
Non-blocking I/O      no wait for readiness; partial progress or would-block is possible
Asynchronous model    completion is represented separately, e.g. a stage or callback
```

A virtual thread reading a supported socket path without an enclosing pinning frame uses a
**blocking API**, does **not** dedicate a blocked carrier to that request, sits on top of
**non-blocking I/O** plus a shared poller in the current JDK implementation, and is written
in a **synchronous** model. All four at once. Any sentence that treats them as the same axis
is wrong somewhere.

Define what completion means before releasing resources: a read may return fewer bytes than
requested, and a streaming response may return before its body is consumed. Readiness, API
return, transfer completion and a remote business effect are different milestones; none alone
proves the others. The classification reference gives a concrete streaming example.

## Compatibility and evidence

Virtual-thread APIs require Java 21 (standard, no preview flags). Implementation guidance
here targets HotSpot JDK 21–25; the monitor behavior changes at JDK 24. Before applying it,
inspect compiler/toolchain settings, the deployed JDK vendor and version, OS, resolved
client/framework versions, transport and scheduler configuration. These can differ from
the development JDK. Recheck implementation claims for other releases; do not upgrade the
project or add instrumentation dependencies merely to apply this skill.

## Workflow

1. **Ask which property the claim is about.** "Is this blocking?" is four questions;
   answer the one that determines the decision at hand.
2. **Classify each I/O call on the path**: does it unmount, capture the carrier with
   compensation, or pin? The three have different costs and different fixes.
3. **Check for file system I/O.** Identify the concrete synchronous path and whether the
   JDK marks it for compensation; a package name alone does not establish this.
4. **Check for foreign code**: JNI, FFM, a driver with a native transport. A native frame
   pins, and pinning is not compensated.
5. **If an event loop is involved, find every blocking call inside it** — one is enough to
   stall every connection that loop serves.
6. **Measure before concluding.** Carrier count over time, `jdk.VirtualThreadPinned`, and a
   wall-clock profile answer this; reasoning about the library's name does not.
   Missing events do not rule out native blocking. Without runtime evidence, return a
   conditional classification and the measurement that would confirm or refute it.

## Rules

- **A blocking API is not necessarily a blocked carrier.** On a virtual thread,
  `InputStream.read` on a supported socket path registers interest with the JDK's poller,
  parks the virtual thread, unmounts, and frees the carrier. Kernel poller threads still
  wait for readiness; the point is that there is no blocked OS thread per socket request.
- Under the hood, supported socket paths use **non-blocking mode** and shared readiness
  pollers. OS mechanisms and platform/virtual poller-thread arrangements vary by JDK and
  provider; see the poller reference. That is an implementation detail, not a specification —
  do not build a design on it, but do use it to explain observations.
- **Many synchronous filesystem paths retain the carrier** in the target HotSpot releases.
  Recognized blocking regions can trigger **compensation**, temporarily expanding the
  scheduler under an expansion policy initialized by `jdk.virtualThreadScheduler.maxPoolSize`.
  Do not generalize this to every provider, native call or memory-mapped access; inspect the
  path and measure.
- **Capture with compensation is not pinning.** Compensation can add carriers to preserve
  progress within resource limits, at the cost of memory and OS threads. Pinning — a native
  frame or a blocking class initialiser — gets no compensation, so it removes a carrier
  outright. Raising `maxPoolSize` helps the first and does nothing for the second.
- The number of platform threads in the scheduler may therefore legitimately exceed
  `availableProcessors()`. Growth towards `maxPoolSize` under operations the scheduler
  recognizes for compensation is the system working as designed; native-frame pinning is
  specifically **not** compensated. Sustained saturation says the compensated-blocking
  workload reached this implementation ceiling, not that raising it is automatically safe.
- **`synchronized` no longer pins** on JDK 24 and later (JEP 491), and `Object.wait` unmounts
  too. On these releases, replacing `synchronized` solely for pinning is unnecessary;
  `-Djdk.tracePinnedThreads` was removed and silently does nothing.
- **Non-blocking I/O is not the reactive model.** A `SocketChannel` in non-blocking mode with
  a `Selector` is non-blocking I/O written imperatively. Reactor and RxJava can compose
  blocking, non-blocking or in-memory work; neither requires Netty. Identify the actual
  transport and execution thread before classifying a pipeline.
- **Both models can use the same kernel facilities on a given transport**, but their
  batching, buffer ownership, syscall cadence and wakeups can differ. Do not infer equal
  performance from a shared `epoll`/`read` foundation; measure CPU, allocation, throughput
  and tail latency. The architectural difference is where suspended logical state lives and
  how it is diagnosed.
- **Blocking inside an event loop is a different severity of bug** from blocking on a pooled
  thread. An event-loop thread serves many connections, so blocking it can stall every
  connection assigned to it. Loop count and assignment are framework/configuration details,
  not a universal `2 × cores`. Combine compatible BlockHound tests, where available, with
  loop-lag and wall-clock evidence.
- A "non-blocking" client library is only non-blocking to the boundary of its own API. A
  reactive database driver that hands work to a bounded internal pool has a worker/queue
  ceiling distinct from connection limits and database capacity; inspect each bound.
- Virtual threads make blocking calls **cheap**, not **free**: each in-flight call still
  holds a stack on the heap, a connection, a buffer and any lock it took. The scarce
  resource moved; it did not disappear.
- Readiness-based socket polling does not characterize every `java.nio` API or provider.
  Verify the target implementation before claiming io_uring or completion-based I/O;
  use `io-uring-and-zero-copy` for that investigation.

## Minimum result

For each consequential finding, identify the call and execution thread, API/model versus
carrier behavior, supporting evidence and remaining uncertainty. Retain an adequate path, or
propose the smallest change with a resource bound and a before/after check (loop lag,
carrier/native memory, throughput and tail latency as relevant). Do not label an unmeasured
optimization a fix.

## References

- [What unmounts and what does not](references/what-unmounts.md) — the operation-by-operation
  table, the capture / compensation / pinning distinction with the evidence that separates
  them, handling file-heavy workloads, and verifying a third-party client's behaviour. Read
  when classifying a path or when carrier count is growing.
- [Event loops, pollers and blocking detection](references/event-loops-and-pollers.md) — how
  the JDK's socket poller works and its tuning knobs, the event-loop model and the cost of
  blocking one, BlockHound in tests, and the diagnostics for each model. Read when working on
  or debugging an event-loop-based stack.
