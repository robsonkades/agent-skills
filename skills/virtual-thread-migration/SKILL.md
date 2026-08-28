---
name: virtual-thread-migration
description: >
  Migrating an existing service to virtual threads as a staged programme rather than a flag:
  inventorying what each thread pool was implicitly limiting, auditing for pinning, file I/O
  and ThreadLocal caches, declaring the replacement limits before the flip, canarying one
  workload at a time, re-sizing the connection pool, and the rollback criteria. Use when a
  team plans to enable virtual threads service-wide, when a single flag is about to be
  flipped in production, when a migration made latency worse, when the database or a
  downstream started failing after adoption, when newSingleThreadExecutor is about to be
  replaced and it was providing ordering, when log correlation or metrics broke after the
  change, or when a migration is proposed for a CPU-bound service. Not the sizing arithmetic
  (thread-sizing-and-virtual-threads), continuation and pinning internals
  (virtual-threads-internals), or choosing between reactive and thread-per-request, and the
  framework flags for it (reactive-and-virtual-thread-selection).
---

# Virtual Thread Migration

## Purpose

Move a working service onto virtual threads without discovering, in production, that the
thread pool being removed was the only thing bounding a downstream dependency.

The migration itself is easy — that is the trap. The hard parts are the properties that were
never written down: a pool size that was an admission limit, a single-threaded executor that
was mutual exclusion, a `ThreadLocal` that was a cache, a thread name that was a log filter.
Each of those is removed silently by a change that appears to be about performance.

## Workflow

1. **Baseline first, and keep it.** Record p50/p99 at the target rate, in-flight concurrency,
   thread counts, heap, connection-pool utilisation and the downstream's error rate. A
   migration with no baseline cannot be evaluated and cannot be rolled back on evidence.
2. **Inventory every pool and write down what it was limiting.** For each: how many threads,
   what resource sat behind it, and what happens if that number becomes unbounded. This
   document is the actual deliverable of the migration's first week.
3. **Audit for blockers** — pinning from native frames and class initialisers, file-heavy
   paths, `ThreadLocal` caches, thread-name dependencies, executors that encode ordering.
   The greps are in the playbook.
4. **Declare the replacement limits** next to each scarce resource, and deploy _that_ change
   first, on platform threads. If it is correct, throughput and latency do not move — which
   is exactly the proof you want before changing anything else.
5. **Flip one workload, behind a flag**, starting with an I/O-bound path whose downstream has
   a known bound. Canary at real load against the baseline.
6. **Re-size the connection pool deliberately**, from Little's Law and the database's own
   capacity — not in proportion to the new concurrency.
7. **Confirm the observability works** on the new model before widening: JSON thread dumps,
   pinning events, carrier count, named thread factories.
8. **Widen one workload at a time**, with the rollback criteria stated before each step.

## Rules

- **A migration is a sequence of small deploys.** A single service-wide flag is not a
  migration; it is a change of every concurrency limit in the application, at once, in the
  same release.
- **Every removed pool bound needs a named replacement before the flip.** Write the pairs
  down: "Tomcat's 200 workers protected the payment API → semaphore of 24 in
  `PaymentClient`". A pair with an empty right-hand side is the incident.
- **`newSingleThreadExecutor` and `newFixedThreadPool(1)` are often correctness, not
  performance.** They serialise. Replacing them with per-task virtual threads silently
  removes ordering and mutual exclusion. Find every one and classify it before touching it.
- **Expect the bottleneck to move downstream and become visible.** That is the migration
  working. It is also a change to somebody else's service, so it needs their capacity
  numbers and, usually, their agreement.
- **The connection pool is not the thing to grow first.** More concurrent requests do not
  make the database faster; a pool sized past the database's capacity converts a fast
  rejection into a slow timeout for everyone.
- **Do not migrate CPU-bound work.** Virtual threads add no parallelism. If the profile is
  CPU-dominated, this migration will produce a rounding error and a lot of risk.
- **Do not migrate to fix a slow dependency.** More concurrency against a saturated
  dependency makes its queue longer, not its latency shorter.
- **Check the JDK baseline before auditing locks.** On JDK 21–23 `synchronized` pins and may
  genuinely need changing; on 24+ (JEP 491) it does not, `Object.wait` unmounts, and
  `-Djdk.tracePinnedThreads` was removed and does nothing. Migrating on 21 and migrating on
  25 are different projects.
- **Keep platform pools for what needs them**: CPU-bound work, native/JNI-heavy libraries,
  and file-heavy paths. A migration is not required to be total, and "everything is virtual"
  is not a goal.
- **Rollback must be configuration.** A flag per workload, flipped without a build. If
  rolling back requires reverting code, the canary is not a canary.
- **Load-test against the real dependency or a faithful simulator.** The entire mechanism
  being changed is what happens while waiting; a mocked dependency that returns instantly
  removes the phenomenon under test.
- **Judge the result at fixed arrival rate, not fixed concurrency.** Throughput at saturation
  will look better simply because more work is admitted; the questions that matter are
  latency at the target rate, error rate at the dependency, and memory.

## References

- [The staged playbook](references/migration-playbook.md) — the stages with entry and exit
  criteria, the audit commands, the limit-inventory template, canary and rollback criteria,
  and the pool re-sizing arithmetic. Read at the start of the migration and at each stage
  boundary.
- [What breaks quietly](references/what-breaks.md) — the catalogue of behaviours that change
  without an error: thread naming and log correlation, `ThreadLocal` caches, ordering
  guarantees, pool metrics that go to zero, `@Async` and `@Scheduled`, tests that depended on
  a pool. Read during the audit, and again when something inexplicable appears after a flip.
