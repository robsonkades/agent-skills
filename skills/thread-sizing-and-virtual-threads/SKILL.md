---
name: thread-sizing-and-virtual-threads
description: >
  Platform threads versus virtual threads in production: what a thread actually costs, the
  mount/unmount model, why virtual threads solve I/O and not CPU, residual pinning after JEP
  491, ThreadLocal as cache versus as context, thread naming, and what migrating to virtual
  threads exposes downstream. Use when choosing or reviewing a pool size, when a thread pool
  uses an unbounded queue, when ThreadLocal caches an expensive resource, when virtual
  threads are proposed for CPU-bound work, when a thread dump comes back suspiciously short,
  when someone repeats the pre-JDK-24 advice to replace synchronized with ReentrantLock, or
  when latency got worse after adopting virtual threads. Does not cover happens-before and
  correctness (java-memory-model), the queueing arithmetic (littles-law-and-queueing), or
  database pool specifics (connection-pool-sizing). Virtual thread internals are
  virtual-threads-internals and the work-stealing scheduler is
  forkjoinpool-and-work-stealing.
---

# Thread Sizing and Virtual Threads

## Purpose

Size concurrency correctly and adopt virtual threads without moving the bottleneck
somewhere less visible. Virtual threads do not create parallelism — they remove the cost
of _waiting_. Everything downstream of that sentence follows.

## Workflow

1. **Classify the work.** I/O-bound has unmount points and benefits; CPU-bound has none,
   and the ceiling stays at the core count no matter what.
2. **Find the smallest ceiling on the path** — request threads, connections, downstream
   service quota — and size _that_, because it is the one that governs.
3. **Size from Little's Law** (`L = λ × W`) with measured `λ` and `W`; treat the
   CPU-bound formula as a ceiling, not a target. The answer is the smaller of the two, and
   never larger than the downstream resource can actually take.
4. **Check projected peak utilisation stays below ~0.8.** The queue curve is hyperbolic:
   at 80% the wait is already ~4× the service time, at 90% ~9×.
5. **Bound every queue** and choose the rejection policy deliberately.
6. **If adopting virtual threads**, declare an explicit concurrency limit next to every
   scarce resource — the thread pool used to provide that limit implicitly and no longer
   does.

## Rules

- A platform thread costs about 1 MB of reserved stack (`ThreadStackSize = 1024` KB on
  Linux x86-64 and aarch64) plus a kernel-schedulable entity. RSS tracks actual stack use,
  but the thread ceiling is a real architectural constraint.
- Virtual threads yield the carrier cooperatively at known blocking points. That is exactly
  why they solve I/O and do nothing for CPU: submitting a million CPU-bound tasks to a
  virtual-thread executor gives the same result as a fixed pool the size of the carrier
  count, plus the cost of creating a million virtual threads.
- **On JDK 24+ (JEP 491), `synchronized` no longer pins.** The advice to swap it for
  `ReentrantLock` is obsolete, and `-Djdk.tracePinnedThreads` was **removed** — it is
  accepted on the command line and does nothing, which is worse than failing. Choose
  between `synchronized` and `java.util.concurrent.locks` by the semantics you need:
  `tryLock`, timeout, fairness, multiple conditions, non-reentrancy.
- Residual pinning comes from native frames (JNI/FFM) and class initialisers. Detect it
  with the JFR event `jdk.VirtualThreadPinned` — whose 20 ms default threshold hides
  precisely the pathological case. Confirm the cause; do not presume `synchronized`.
- `jstack` **does not list virtual threads**. The dump comes back short and the natural
  reading is the opposite of reality. Use
  `jcmd <pid> Thread.dump_to_file -format=json`.
- `ThreadPoolExecutor` enqueues before it grows: it creates a thread beyond core only when
  the queue **refuses**. With an unbounded queue, `maximumPoolSize` is dead configuration
  and `Executors.newFixedThreadPool` grows the queue to an `OutOfMemoryError`.
- `ThreadLocal` is not an anti-pattern with virtual threads — the JDK itself uses it.
  Caching an expensive or scarce resource _per thread_ is, once threads number in the
  millions. For context, use `ScopedValue` (JEP 506, final in 25); for a scarce resource,
  use a pool.
- Migrating to virtual threads removes the bottleneck that was hiding the others. The
  thread pool was also limiting downstream concurrency; once removed, that limit has to be
  declared explicitly, next to the resource it protects.
- Name your thread factories. An unnamed virtual thread has an **empty** `getName()` and
  appears as `VirtualThread[#38]/runnable`. In a dump with tens of thousands of them, the
  name is the difference between seconds and manual stack grouping.
- Structured Concurrency is still a preview API on every released JDK — JEP 505 in 25, JEP
  525 in 26, JEP 533 proposed for 27 — redesigned around `StructuredTaskScope.open(Joiner...)`;
  `ShutdownOnFailure` and `ShutdownOnSuccess` were removed. Details in structured-concurrency.
- Biased locking was disabled in JDK 15 (JEP 374) and removed in 18 — a decision that
  predates virtual threads and is unrelated to them.

## References

- [Sizing and adoption](references/sizing-and-adoption.md) — the pre-production checklist,
  the utilisation table, and what to declare explicitly when moving to virtual threads.
  Read before changing a pool size or enabling virtual threads.
- [Thread incident triage](references/incident-triage.md) — collecting and reading a
  virtual-thread-aware dump, the JFR events that matter, and confirming pinning. Read
  during an incident involving threads, latency or apparent deadlock.
