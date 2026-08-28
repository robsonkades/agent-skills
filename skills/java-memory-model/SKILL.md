---
name: java-memory-model
description: >
  The Java Memory Model as a contract about reordering: happens-before as the only currency,
  volatile piggyback publication, atomicity versus visibility versus ordering, safe
  publication and final-field semantics, double-checked locking, and why x86 and aarch64
  differ. Use when reviewing code where one thread writes a field another reads, when a flag
  between threads is not volatile, when an invariant spans two fields, when a constructor
  lets this escape, when two methods synchronise on different monitors, when Thread.sleep is
  used as synchronisation, when a bug appears only after migrating to aarch64, or when a
  mitigation only made a race rarer. Does not cover thread sizing and virtual threads
  (thread-sizing-and-virtual-threads), cache-line effects and false sharing
  (cpu-cache-and-numa), or lock contention profiling (jfr-and-async-profiler). Explicit
  access modes are varhandles-and-memory-ordering and monitor cost under contention is
  lock-inflation.
---

# Java Memory Model

## Purpose

Decide whether concurrent code is correct, rather than whether it currently appears to
work. The JMM is a contract about **reordering** — the caches are already coherent; what
has to be bought is order, from the JIT, from the processor and from the store buffer.

The failure this prevents is the code that looks synchronised, passes review, passes
tests, and has none of the guarantees it appears to have.

## Workflow

1. **For every field written by one thread and read by another, name the happens-before
   edge.** If you cannot name the rule that establishes it, there is no guarantee, and no
   amount of defensive code compensates.
2. **Classify the symptom**: visibility (never sees it), atomicity (loses updates), or
   ordering (sees it half-built). The three have different fixes.
3. **Ask what the unit of atomicity must be.** If the invariant lives _between_ two
   fields, no per-field `volatile` protects it — the answer is a single lock.
4. **Run static analysis before elaborating a hypothesis.** SpotBugs and Error Prone catch
   `IS2_INCONSISTENT_SYNC`, `DC_DOUBLECHECK` and `VO_VOLATILE_INCREMENT` in seconds of CI.
5. **Reduce the suspect pattern to a jcstress test** if it survives that.
6. **Validate the fix on x86 _and_ aarch64.** The bugs are not created by the migration;
   they are revealed by it.

## Rules

- Happens-before is not time. "A hb B" means that _if_ B happens, it sees A. `volatile`
  does not make a change visible _sooner_; it makes it visible.
- A `volatile` write publishes everything that preceded it on the same thread. This
  piggyback is why one anchor variable can publish a whole structure — provided the order
  is respected on both sides: write the data before the anchor, read the anchor before the
  data. Mark **the anchor** volatile, not the data field.
- `volatile` gives visibility and ordering, not read-modify-write atomicity. `counter++`
  on a volatile field loses increments, and frequently loses more than a plain field would.
- If the invariant spans two fields, no `volatile` protects it — there is no instant at
  which both are read consistently. Use one lock.
- The lock rule is `unlock(m)` hb `lock(m)` **for the same `m`**. Different monitors do not
  communicate; a class with `synchronized put` (monitor `this`) and
  `synchronized (data) get` has the full appearance of synchronisation and none of the
  guarantees.
- Never let `this` escape from a constructor — including the disguised form,
  `new Thread(this).start()`, which publishes `this` before a subclass constructor has
  run. Publish from a static factory after construction instead.
- `Thread.sleep` establishes happens-before with nothing. Sleeping "long enough" only makes
  the failure rare enough to reach production. Use `join()`, a `CountDownLatch` or a
  `Future`.
- Publish a collection by constructing it locally and assigning once through a `volatile`
  (or `final`) field, or use a genuinely concurrent collection. Mutating a `HashMap` after
  assigning it is unsafe publication.
- `final` fields publish safely for free, even under unsafe publication — as long as `this`
  did not escape the constructor.
- Double-checked locking requires `volatile`; the static holder idiom requires nothing,
  because class initialisation already provides the guarantee, at zero cost on the hot
  path.
- `Thread.onSpinWait` is a microarchitecture hint (`pause`/`isb`). It inserts no safepoint,
  yields no CPU, and substitutes for nothing.
- JFR measures **contention, not races**. A service broken by a missing `volatile` looks
  perfectly healthy in JFR, and the monitor events still default to a 20 ms threshold.

## References

- [Happens-before rules and safe publication](references/happens-before.md) — the rule
  table, the safe-publication idioms, and the memory-ordering difference between x86 (TSO)
  and aarch64. Read when establishing or auditing an edge.
- [Concurrency review checklist](references/review-checklist.md) — what to check in a code
  review and what to collect during a concurrency incident. Read before approving
  concurrent code or when investigating an intermittent correctness failure.
