---
name: virtual-threads-internals
description: >
  Virtual thread internals: the continuation freeze algorithm, mount and unmount and
  StackChunk copying, forced deoptimisation of non-freezable frames, the dedicated
  ForkJoinPool scheduler and its automatic compensation, what jdk.VirtualThreadPinned
  actually measures, the heap cost of suspended stacks per collector, and the residual
  pinning cases on the current baseline. Use when pinning is suspected, when
  -Djdk.tracePinnedThreads appears in a runbook, when ForkJoinPool worker threads grow
  past the configured parallelism, when a JNI or FFM call sits on the hot path, when
  someone proposes replacing synchronized with ReentrantLock to stop pinning, when
  virtual threads run CPU-bound work, or when GC marking time rose after adopting them.
  Does not cover the introductory adoption and sizing treatment
  (thread-sizing-and-virtual-threads), happens-before and correctness
  (java-memory-model), or work-stealing pool mechanics in general
  (forkjoinpool-and-work-stealing).
---

# Virtual Threads Internals

## Purpose

Tell pinning, starvation and compensation apart. All three look the same from outside —
low throughput, carriers busy — and each needs a different fix, so confusing them means
correcting the wrong cause. This skill exists for the case where the introductory
treatment has already been applied and the numbers still do not add up.

The second failure it prevents is measuring the wrong thing. A pinned task still
completes successfully; a completion counter therefore proves nothing about pinning. Only
the `jdk.VirtualThreadPinned` event, at a threshold low enough to see the pins, answers
that question.

## Workflow

1. **Confirm virtual threads are actually in use.** No popular web framework enables them
   without opt-in except Helidon Nima. Spring Boot 3.2+ needs
   `spring.threads.virtual.enabled=true`; Quarkus needs `@RunOnVirtualThread` per method.
   Assuming the wrong default means measuring a platform pool and calling it Loom.
2. **Instrument the pinning event, not a counter.** Consume `jdk.VirtualThreadPinned`
   through `RecordingStream` with an explicit threshold — the default is 20 ms and hides
   short, frequent pins. Recipe in `references/pinning-diagnostics.md`.
3. **Read the stack trace of the event.** It names the cause: a native frame (JNI/FFM) or
   a `<clinit>` in progress. Anything else is an unverified assumption.
4. **Separate the three effects.** Pinning: carriers held, events present. Starvation:
   virtual threads `RUNNABLE` waiting for a free carrier, no pinning events. Legitimate
   waiting on a downstream resource: neither.
5. **Check whether compensation is running.** Count `ForkJoinPool-<n>-worker-<m>` threads
   in a JSON thread dump over time. Sustained growth towards `maxPoolSize` is compensation
   happening now.
6. **Fix by isolating the blocking native call** into a dedicated, Little's-Law-sized
   platform executor. Raising `maxPoolSize` only postpones the same ceiling and buys it
   with memory.
7. **If the GC profile moved, reduce concurrently suspended virtual threads**, not a
   collector flag. Fewer suspended stacks means less live `StackChunk` to scan.

## Rules

- The only source of truth on pinning is the JFR event `jdk.VirtualThreadPinned`.
  `-Djdk.tracePinnedThreads` was removed in JDK 24: it is still accepted on the command
  line and does absolutely nothing. It must not appear in any runbook.
- Never infer pinning from task completion counts. A pinned task completes too — it just
  held a whole carrier while doing so.
- Set an explicit threshold on the event (1 ms is a reasonable floor) before concluding
  "there is no pinning".
- On JDK 24+ (JEP 491) `synchronized` does not pin. Migrating `synchronized` to
  `ReentrantLock` for that reason has zero effect. Choose on semantics: `tryLock` with
  timeout, `lockInterruptibly`, fairness, multiple `Condition`s, or introspection.
- Two residual pinning causes remain, and neither is fixed by changing lock type: a native
  frame on the stack (JNI or FFM downcall), and a `<clinit>` in progress. Compression,
  cryptography and legacy driver libraries are the usual suspects.
- `jdk.internal.vm.Continuation`, not `java.lang.Continuation`. It is internal and must not
  be used by application code.
- The virtual-thread scheduler is a **dedicated** `ForkJoinPool` instance, never the same
  reference as `commonPool()`, running `asyncMode = true` (FIFO). Configure it through
  `jdk.virtualThreadScheduler.*`, not through a constructor.
- Treat `jdk.virtualThreadScheduler.maxPoolSize` as a memory budget, not a safety net:
  `maxPoolSize × ThreadStackSize` of reserved address space, plus per-thread kernel
  overhead. Set it deliberately and alarm on its saturation.
- CPU-bound work on virtual threads has no unmount point. It is identical to a fixed pool
  of N carriers plus scheduling overhead, with no gain.
- `Thread.sleep()` unmounts correctly and is still not a coordination primitive. Use
  `CountDownLatch`, `Semaphore` or `StructuredTaskScope.join()`.
- No collector has a "virtual thread mode" flag. G1, generational ZGC (default since
  JDK 23, JEP 474) and generational Shenandoah (product since JDK 25, JEP 521) each gained
  a dedicated `StackChunk` scan path; the lever is the volume of live chunks, measured by
  comparing `-Xlog:gc*` before and after.
- `StructuredTaskScope` is still preview on every released JDK (JEP 505 in 25, JEP 525 in 26),
  built around `open(Joiner)`. `ShutdownOnFailure` and `ShutdownOnSuccess` were **removed**,
  not renamed — code copied from pre-2025 material will not compile.
- Use `jcmd <pid> Thread.dump_to_file -format=json`. `jstack` does not list virtual
  threads.

## References

- [Continuation mechanics](references/continuation-mechanics.md) — the freeze algorithm
  step by step, why a native frame stops it, the forced deoptimisation of non-freezable
  frames, how the scheduler differs from an application `ForkJoinPool`, and what each
  collector does with a `StackChunk`. Read when you need the mechanism to explain an
  observation, or before reasoning about the heap cost of suspended stacks.
- [Pinning diagnostics](references/pinning-diagnostics.md) — the `jdk.VirtualThreadPinned`
  field reference, the `RecordingStream` instrumentation, the compensation-counting
  command, the wall-clock flame-graph signature, the `maxPoolSize` budget matrix, and the
  pre-production and incident checklists. Read when collecting evidence or sizing the
  scheduler.
