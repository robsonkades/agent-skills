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
Those properties can change silently in a change that appears to be about performance;
inspect which execution paths and contracts actually change.

## Workflow

Inspect the compiler/toolchain, deployed JDK/vendor/build, framework/client versions and effective
executor configuration. Standard virtual threads require Java 21+; Java 17 cannot use the virtual
factory examples. Java 24 removes monitor-only pinning, and ScopedValue is final only in Java 25.
Do not upgrade Java/frameworks or enable preview merely to perform this migration.

Apply the stages needed for the requested decision and affected execution paths. A narrow API,
source or incident question can close from sufficient evidence without a service-wide inventory,
new benchmark or migration. Retain adequate existing execution, limits and observability. Missing
baseline data limits a comparative performance claim; it does not block independent reasoning or
already authorized recovery through a validated rollback/drain path.

1. **Keep the relevant baseline.** For a performance comparison, record p50/p99 at the target rate,
   in-flight concurrency, thread counts, heap, connection-pool utilisation and downstream errors.
   Reuse sufficient comparable data; do not invent a baseline or claim improvement without one.
2. **Inventory affected pools and write down what they limit.** Include shared resources and
   callers whose demand changes. For each: how many threads,
   what resource sat behind it, and what happens if that number becomes unbounded. This
   inventory supports the migration decision; include queues, ordering, context and lifecycle ownership.
3. **Audit for blockers** — native/foreign pinning, carrier-capturing or file-heavy
   paths, `ThreadLocal` caches, thread-name dependencies, executors that encode ordering.
   The greps are in the playbook.
4. **Preserve required limits before removing the old enforcement.** A separate platform-thread
   deployment can isolate limit-policy risk; an evidenced paired change can be appropriate when
   coexistence changes queue/deadline semantics. Compare predeclared SLO, correctness and overload
   criteria; unchanged throughput is not proof of equivalence.
5. **Change one bounded workload**, using a flag or scoped deployment with owned drain/rollback.
   Choose from actual objective, downstream bounds, blast radius and evidence. Validate the claimed
   behavior under representative demand before widening.
6. **Revalidate the connection pool deliberately**, using measured hold time, required throughput,
   queueing headroom and the database's aggregate capacity — not in proportion to new thread count.
   Keep an adequate pool size; a review need not produce a resize.
7. **Confirm the observability works** on the new model before widening: JSON thread dumps,
   pinning events, scheduler/resource metrics and request correlation as relevant. Names are one
   diagnostic aid, not a mandatory replacement for adequate context and signals.
8. **Widen one workload at a time**, with the rollback criteria stated before each step.

## Rules

- **Prefer staged changes with an observed scope.** A framework flag may affect several
  execution paths while leaving custom executors and client pools unchanged. Inventory which
  paths actually switch; the flag alone neither establishes safe migration nor removes every limit.
- **Every required property of a removed pool needs a replacement before the flip.** Write the pairs
  down: "payment concurrency was limited by request workers → measured provider gate plus
  bounded ingress". Record a justified removal when a limit served no required property.
  Bound waiting tasks as well as active calls, across replicas, retries and fan-out.
- **`newSingleThreadExecutor` and `newFixedThreadPool(1)` are often correctness, not
  performance.** They serialise. Replacing them with per-task virtual threads silently
  removes ordering and mutual exclusion. Find every one and classify it before touching it.
- **Downstream pressure can increase.** Treat that as a hypothesis to measure, not proof of
  success. Respect existing shared-capacity budgets and coordination arrangements before
  increasing aggregate demand.
- **The connection pool is not the thing to grow first.** More concurrent requests do not
  make the database faster; excess concurrency can worsen queueing and timeout rates.
- **Do not expect CPU-bound work to improve.** Virtual threads add no CPU capacity. A request can
  still use one virtual lifetime while CPU-heavy phases are isolated/bounded; migrate only for a
  demonstrated lifecycle/operability reason.
- **Separate waiting capacity from dependency latency.** Cheaper waiting can be a valid objective
  when the dependency has measured headroom and demand remains bounded. It does not make an
  individual slow call faster. More concurrency against a saturated dependency is not a remedy.
- **Check the JDK baseline before auditing locks.** On JDK 21–23 a virtual thread that blocks while
  holding a monitor can pin; on 24+ (JEP 491) monitor use/`Object.wait` no longer causes pinning, and
  `-Djdk.tracePinnedThreads` was removed and does nothing. Migrating on 21 and migrating on
  25 are different projects.
  Blocking with a native/foreign frame still present can pin on 24+, including Java callbacks.
- **Keep or introduce bounded platform execution where evidence requires it**: CPU parallelism,
  thread affinity/priority, or causal native/foreign/file paths that the current JDK cannot handle
  efficiently. A migration need not be total.
- **Rollback should be fast and rehearsed.** A per-workload runtime/configuration switch is ideal;
  where architecture prevents it, staged deployment rollback must still preserve task ordering,
  drain and compatibility.
- **Load-test against the real dependency or a faithful simulator.** The entire mechanism
  being changed is what happens while waiting; a mocked dependency that returns instantly
  removes the phenomenon under test.
- **Compare at the workload's controlled demand.** For open traffic, compare target arrival
  rate/mix and count offered, admitted, useful completions, timeouts and drops. A closed-user
  workload can use fixed population/think time; capacity sweeps can also be useful. Neither
  increased admission nor a faster saturation result alone proves target-rate SLO improvement.

Record the workload/limit inventory, observed baseline and canary outcomes, context/order/cancellation
checks, rollback/drain procedure and unresolved evidence. Keep this proportionate to the changed scope.

## References

- [The staged playbook](references/migration-playbook.md) — the stages with entry and exit
  criteria, the audit commands, the limit-inventory template, canary and rollback criteria,
  and the pool re-sizing arithmetic. Read at the start of the migration and at each stage
  boundary.
- [What breaks quietly](references/what-breaks.md) — the catalogue of behaviours that change
  without an error: thread naming and log correlation, `ThreadLocal` caches, ordering
  guarantees, pool metrics that go to zero, `@Async` and `@Scheduled`, tests that depended on
  a pool. Read during the audit, and again when something inexplicable appears after a flip.
- [JEP 444: Virtual Threads](https://openjdk.org/jeps/444)
- [JEP 491: Synchronize Virtual Threads without Pinning](https://openjdk.org/jeps/491)
- [Java 25 virtual-thread adoption guide](https://docs.oracle.com/en/java/javase/25/core/virtual-threads.html)
