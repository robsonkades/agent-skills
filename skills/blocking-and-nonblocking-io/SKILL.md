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
Blocking API          the method returns when the operation is done
Blocked OS thread     a kernel-schedulable entity is parked and unavailable
Non-blocking I/O      the syscall returns immediately with whatever is ready
Asynchronous model    the code is expressed as callbacks or stages, not statements
```

A virtual thread doing `socket.read()` uses a **blocking API**, does **not** dedicate a
blocked carrier to that request, sits on top of **non-blocking I/O** plus a shared poller in
the current JDK implementation, and is written in a
**synchronous** model. All four at once. Any sentence that treats them as the same axis is
wrong somewhere.

## Workflow

1. **Ask which property the claim is about.** "Is this blocking?" is four questions;
   answer the one that determines the decision at hand.
2. **Classify each I/O call on the path**: does it unmount, capture the carrier with
   compensation, or pin? The three have different costs and different fixes.
3. **Check for file system I/O.** It is the category that does not unmount, and the one most
   often assumed to.
4. **Check for foreign code**: JNI, FFM, a driver with a native transport. A native frame
   pins, and pinning is not compensated.
5. **If an event loop is involved, find every blocking call inside it** — one is enough to
   stall every connection that loop serves.
6. **Measure before concluding.** Carrier count over time, `jdk.VirtualThreadPinned`, and a
   wall-clock profile answer this; reasoning about the library's name does not.

## Rules

- **A blocking API is not necessarily a blocked carrier.** On a virtual thread,
  `InputStream.read` on a supported socket path registers interest with the JDK's poller,
  parks the virtual thread, unmounts, and frees the carrier. Kernel poller threads still
  wait for readiness; the point is that there is no blocked OS thread per socket request.
- Under the hood, socket channels are put in **non-blocking mode** by the JDK and a small
  number of dedicated poller threads (`epoll`/`kqueue`) unpark virtual threads when a file
  descriptor becomes ready. That is an implementation detail, not a specification — do not
  build a design on it, but do use it to explain observations.
- **File system I/O does not unmount** on any released JDK: it is an OS limitation, not a
  Loom oversight. The blocking syscall captures the carrier, and the scheduler
  **compensates** by temporarily expanding its parallelism up to
  `jdk.virtualThreadScheduler.maxPoolSize`.
- **Capture with compensation is not pinning.** Compensation adds a carrier so throughput
  survives, at the cost of memory and OS threads. Pinning — a native frame or a blocking
  class initialiser — gets no compensation, so it removes a carrier outright. Raising
  `maxPoolSize` helps the first and does nothing for the second.
- The number of platform threads in the scheduler may therefore legitimately exceed
  `availableProcessors()`. Growth towards `maxPoolSize` under operations the scheduler
  recognizes for compensation is the system working as designed; native-frame pinning is
  specifically **not** compensated. Sustained saturation says the compensated-blocking
  workload reached this implementation ceiling, not that raising it is automatically safe.
- **`synchronized` no longer pins** on JDK 24 and later (JEP 491), and `Object.wait` unmounts
  too. Advice to replace `synchronized` with `ReentrantLock` for pinning reasons is obsolete;
  `-Djdk.tracePinnedThreads` was removed and silently does nothing.
- **Non-blocking I/O is not the reactive model.** A `SocketChannel` in non-blocking mode with
  a `Selector` is non-blocking I/O written imperatively. Reactor and RxJava are a programming
  model that happens to sit on non-blocking I/O. Netty is the non-blocking I/O layer under
  both.
- **Both models ultimately use the same kernel facilities on a given transport**, but their
  batching, buffer ownership, syscall cadence and wakeups can differ. Do not infer equal
  performance from a shared `epoll`/`read` foundation; measure CPU, allocation, throughput
  and tail latency. The architectural difference is where suspended logical state lives and
  how it is diagnosed.
- **Blocking inside an event loop is a different severity of bug** from blocking on a pooled
  thread. An event-loop thread serves many connections, so blocking it can stall every
  connection assigned to it. Loop count and assignment are framework/configuration details,
  not a universal `2 × cores`. Combine BlockHound tests with loop-lag and wall-clock evidence.
- A "non-blocking" client library is only non-blocking to the boundary of its own API. A
  reactive database driver that hands work to a bounded internal pool has the same ceiling as
  a JDBC pool, expressed differently.
- Virtual threads make blocking calls **cheap**, not **free**: each in-flight call still
  holds a stack on the heap, a connection, a buffer and any lock it took. The scarce
  resource moved; it did not disappear.
- `java.nio` does not use io_uring on any released JDK, so "non-blocking" here means
  readiness-based (`epoll`), not completion-based. See `io-uring-and-zero-copy` before
  claiming otherwise.

## References

- [What unmounts and what does not](references/what-unmounts.md) — the operation-by-operation
  table, the capture / compensation / pinning distinction with the evidence that separates
  them, handling file-heavy workloads, and verifying a third-party client's behaviour. Read
  when classifying a path or when carrier count is growing.
- [Event loops, pollers and blocking detection](references/event-loops-and-pollers.md) — how
  the JDK's socket poller works and its tuning knobs, the event-loop model and the cost of
  blocking one, BlockHound in tests, and the diagnostics for each model. Read when working on
  or debugging an event-loop-based stack.
