---
name: lock-free-patterns
description: >
  Lock-free algorithm patterns: CAS retry loops and how they fail, the ABA problem and when
  it is actually reachable in Java, lock-free versus wait-free versus obstruction-free
  progress, spin backoff, LongAdder-style striping, lock-free queues and stacks, and
  deciding when a plain lock is the better answer. Use when a CAS loop spins without
  backoff, when AtomicLong stops scaling with thread count, when CPU is high but throughput
  is flat and jstack shows no BLOCKED threads, when a node pool is added to a lock-free
  structure, when someone plans to hand-roll a structure that java.util.concurrent already
  ships, or when a lock-free rewrite is justified by "biased locking" or measured with a
  System.nanoTime loop. Does not cover the access modes and barriers the algorithms are
  built from (varhandles-and-memory-ordering), happens-before and safe publication
  (java-memory-model), or what a contended monitor actually costs (lock-inflation).
---

# Lock-Free Patterns

## Purpose

Decide whether an algorithm should be lock-free at all, and if so, get the retry loop, the
progress guarantee and the contention profile right. The failure this skill prevents is the
lock-free rewrite that is slower than the lock it replaced — because CAS under contention
pays the same cache-coherency cost that made the lock expensive, and the rewrite added a
spin loop on top.

"Lock-free" is a _system_ progress guarantee: at least one contending thread completes per
round. It does not mean nobody waits, it does not mean no contention, and it does not mean
no cache-line bouncing. Individual starvation is explicitly permitted.

## Workflow

1. **Check `java.util.concurrent` first.** `ConcurrentLinkedQueue`, `LongAdder`,
   `ConcurrentHashMap` and the rest already implement the published algorithms. Hand-rolling
   one is a decision that needs a reason.
2. **Confirm the symptom is CAS contention.** High CPU with flat throughput and no `BLOCKED`
   threads is the signature; allocation, GC and I/O produce similar-looking graphs. Confirm
   with hardware counters before rewriting anything. See
   `references/measuring-cas-contention.md`.
3. **State the progress guarantee you need.** Wait-free (every thread finishes in bounded
   steps), lock-free (at least one finishes), or obstruction-free (only in isolation).
   Composite operations are rarely wait-free; do not claim a guarantee the retry loop does
   not deliver.
4. **Write the retry loop with the ordering anchor in the right place.** Fields of the new
   node are written _before_ the publishing CAS, never after. Add `Thread.onSpinWait()` to
   the failure path.
5. **Ask whether ABA is reachable here.** It is not for object references the algorithm
   never recycles; it is for pooled nodes and for CAS over primitives that cycle. Only then
   reach for `AtomicStampedReference`.
6. **Pick the structure to the contention profile.** Simple atomics at low contention,
   striping for cumulative counters at high contention, a ring buffer for a
   high-throughput pipeline. See `references/lock-free-structures.md`.
7. **Validate the mechanism, not just the number.** CAS attempts per successful operation
   must fall, and the fix must not have introduced false sharing between the new fields.

## Rules

- Never write an unbounded CAS retry loop without `Thread.onSpinWait()` on the failure path.
  It emits `PAUSE` on x86 and reduces the energy and pipeline cost of spinning.
- Do not justify a lock-free rewrite with "locks have zero overhead only thanks to biased
  locking". Biased locking was disabled by default in JDK 15 (JEP 374) and removed from the
  source in JDK 18 (JDK-8256425). On a JDK 25 baseline the low-contention fast path is
  `LM_LIGHTWEIGHT` fast-locking, default since JDK 23.
- Prefer the lock until measurement proves it limits throughput under the real load profile.
  A lock is simpler, correct more often, and can be elided entirely by the JIT; CAS pays a
  cost even uncontended.
- Never benchmark CAS contention with a `System.nanoTime()` loop in `main()`. Without an
  isolated fork the JIT state of the previous benchmark contaminates this one; without
  separate warmup the interpreter, C1, deoptimisation and C2 recompilation are all folded
  into the number; without a `Blackhole` or a consumed return value, dead-code elimination
  inflates it. Use JMH with `@Fork`, separate `@Warmup`/`@Measurement`, and a consumed result.
- Vary the thread count (1, 2, 4, 8, 16+) in any contention benchmark. CAS contention is not
  linear in the number of competitors, so a single thread count proves nothing.
- Report CAS attempts per successful operation alongside throughput. A throughput rise with
  an unchanged attempt rate means something else changed.
- "Lock-free" says nothing about memory layout. Two adjacent `AtomicLong` fields written by
  different threads at high frequency contend on one cache line even though they share no
  logical state. Check for false sharing after any striping change.
- ABA is not automatically impossible in Java. The guarantee is reference identity, not
  address stability — G1, ZGC and Shenandoah all move objects and reuse addresses. ABA is
  unreachable for live object references the algorithm never recycles; it returns with an
  explicit node pool, and with CAS over primitives that legitimately cycle back to a prior
  value.
- Use `AtomicStampedReference` when ABA is reachable — the stamp only ever increases, which
  makes ABA arithmetically impossible within the stamp space. `AtomicMarkableReference`
  carries one bit instead and solves a narrower case.
- `AtomicLong` is for low contention; a heuristic threshold is fewer than about four threads
  writing the same field, and the real threshold depends on write rate and cache topology,
  so measure it. Above that, use `LongAdder` — but only for cumulative operations, never
  where an arbitrary CAS on the value is needed.
- There is no JFR event for CAS failure. Nothing corresponds to `jdk.JavaMonitorEnter` here,
  so diagnosis is hardware profiling and comparative measurement, not an event filter.
- Do not attribute a ring-buffer pipeline's throughput to "being lock-free". Pre-allocation
  (no per-message GC pressure) and contiguous-array cache locality typically weigh as much
  or more. The published LMAX figure is about 5x over `ArrayBlockingQueue` — roughly 26M
  against 5M ops/s in a 1-producer/1-consumer unicast benchmark on that benchmark's own
  hardware — not the orders of magnitude often quoted.

## References

- [Lock-free structures](references/lock-free-structures.md) — the progress-guarantee table,
  the Treiber stack and Michael-Scott queue with the CAS anchors marked, the
  `AtomicStampedReference` ABA fix, and the Disruptor ring buffer with its five distinct
  causes of throughput and its wait strategies. Read when implementing or reviewing a
  lock-free structure.
- [Measuring CAS contention](references/measuring-cas-contention.md) — the symptom-to-tool
  table with the `perf` and async-profiler invocations, the CAS hardware cost ladder from
  uncontended to cross-socket, the approach-selection matrix, and the investigation and
  validation checklists. Read before concluding that CAS contention is the problem, or that
  a change fixed it.
