---
name: java-thread-safety-contracts
description: >
  Specifying and reviewing thread-safety as a caller-visible behavioral contract: ownership and
  confinement, immutability, atomic operations and compound invariants, consistency/iteration,
  lock identity and scope, callbacks/alien calls, deadlock ordering, progress/fairness,
  publication, lazy initialization, cancellation, and lifecycle. Use when a shared class has an
  ambiguous guarantee or a proposed lock/atomic/concurrent collection may preserve individual
  methods but violate multi-call semantics. JMM proofs, lock-free algorithms and incident
  diagnostics have separate owners.
---

# Java thread-safety contracts

## Purpose

State what concurrent callers may do and observe, then check implementation and evidence against
that promise. “Uses a concurrent collection” and “all methods synchronized” describe mechanisms, not the
atomicity, consistency, progress or callback behavior of the abstraction.

Guidance is authored against Java 25 API/JLS contracts; inspect the target compiler/runtime,
preview policy, framework scopes and synchronization paths before applying it. Do not upgrade or
enable preview for a contract fix. Missing ownership/publication evidence is an open question,
not proof of thread safety. Snippets are partial examples, not complete lifecycle implementations.

## Contract template

```text
ownership/confinement and publication:
operations safe concurrently:
atomic operations and compound sequences:
state invariant and consistency/snapshot semantics:
iteration/live-view behavior:
blocking, progress, fairness and reentrancy:
callback execution thread, ordering and lock state:
interrupt/cancel/timeout/shutdown behavior:
failure atomicity and partial side effects:
external synchronization, if any, and stable lock identity:
```

## Contract classes

| Class                          | Promise                                                                           | Caller obligation                                  |
| ------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------- |
| immutable                      | observable state cannot change after construction; mutable internals never escape | use the documented publication/access protocol     |
| thread-safe                    | documented operations may be invoked concurrently with stated atomicity/progress  | obey method preconditions and multi-call semantics |
| conditionally thread-safe      | safety depends on an external protocol or operation grouping                      | follow the named protocol/lock/lifecycle           |
| not thread-safe                | no concurrent-use guarantee                                                       | confine or serialize all access/publication        |
| thread/task/actor-confined     | one named owner mutates/accesses it                                               | do not leak across that ownership boundary         |
| thread-hostile/global mutation | affects process-global state beyond instance lock                                 | coordinate system-wide or restrict to startup      |

Request scope is not automatically thread confinement: asynchronous callbacks, reactive execution,
parallel fan-out and virtual threads can move or multiply execution. Name the actual owner.
If stability depends on callers not mutating an aliased object, document that ownership protocol
as a condition rather than claiming the abstraction is unconditionally immutable.

## Design hierarchy

Prefer, when semantics permit:

1. no shared mutable state / explicit ownership;
2. immutable snapshots safely published;
3. library abstraction whose atomic operations match the invariant;
4. one private lock/condition protecting a coherent state machine;
5. multiple locks/optimistic/lock-free design only with measured need and stronger proof/tests.

This is a decision order, not “locks are last because they are slow.” A clear lock can be the safest,
fastest-to-operate solution for a multi-field invariant.

## Atomicity and consistency

A thread-safe collection makes its specified operations safe. It does not make arbitrary sequences
atomic:

```java
if (!map.containsKey(key)) map.put(key, value); // compound race
```

Use `putIfAbsent`, `compute`, `merge`, a lock, or immutable/CAS update according to required
semantics. Read exact API contracts: mapping functions have reentrancy/blocking restrictions;
`LongAdder.sum()` is not an atomic snapshot suitable for IDs or money; weakly consistent iterators
are not point-in-time snapshots.

For multi-field state, choose and document one consistency model:

- lock-guarded transition and snapshot;
- immutable aggregate replaced through volatile/atomic reference;
- versioned optimistic read with validation/retry;
- deliberately weak/approximate observation with acceptable outcomes.

With immutable aggregates, each logical reader captures the reference once and reads related fields
from that object; repeated volatile reads or `get()` calls can mix versions. Publication does not
coordinate a read-modify-write sequence: volatile assignment or `AtomicReference.get()` followed by
`set()` can overwrite another writer's derived change. Use one serialized writer, a lock covering
the whole transition, or an atomic CAS/update operation. Independent replacements may use
last-writer-wins only when the contract permits it; they do not merge concurrent changes.

Keep retrying atomic updater functions side-effect-free: contention may invoke them again. Never
mutate the previously published aggregate. If an external effect must agree with the state change,
define its commit/failure protocol; moving it after CAS alone does not make the two atomic.

## Lock identity and scope

Private locks protect encapsulation and allow implementation change, but public/intrinsic locks can
be an intentional external-synchronization contract (for example synchronized wrappers). If a lock
is externally visible, document stable identity, supported compound operations, reentrancy and
deadlock responsibility.

The critical section covers exactly the invariant transition, including failure atomicity. Moving
work outside changes semantics if observers/callbacks require ordering with state. Precompute or
snapshot outside only after specifying what may become stale and how failures are reconciled.

Avoid blocking I/O, unbounded waits and caller-controlled code while holding a lock by default.
Sometimes an atomic callback-under-lock is required; then bound/document the callback, analyze
reentrancy and lock graph, and consider an event/outbox/snapshot design. “Never call alien code” is
a strong heuristic, not a semantic law.

## Deadlock and liveness

Review monitors, `Lock`s, conditions, class initialization, pool/queue permits, futures and external
resources in one wait-for graph. JVM monitor deadlock detection does not find every starvation/
resource cycle.

Prefer single-lock ownership. When multiple acquisitions are unavoidable, define a total stable
order including tie handling and callbacks. Timed `tryLock` converts indefinite waiting into a
recoverable failure only if the entire operation can abandon/retry safely; it does not prove absence
of livelock/starvation.

State progress guarantees: blocking, obstruction-free, lock-free, wait-free, starvation/fairness,
and whether they apply per operation or system-wide. Do not market a concurrent collection as a
stronger guarantee than its implementation/API provides.

## Lazy initialization

Prefer eager initialization when it is cheap, commonly used, or should fail before readiness.
Prefer lazy when avoiding unused cost matters and first-use latency/failure is owned.

| Pattern                             | Use                             | Caveats                                            |
| ----------------------------------- | ------------------------------- | -------------------------------------------------- |
| class initialization/holder         | lazy static value               | class-loader scope, recursive init, sticky failure |
| synchronized instance accessor      | simple single initialization    | lock/blocked initializers, failure/retry semantics |
| volatile double-check               | hot read path after proven need | exact JMM idiom, initializer side effects/failure  |
| CAS/single-check duplicate creation | creation can repeat safely      | dispose losers; idempotence and external effects   |
| future/promise memoization          | callers share result/failure    | cancellation, retry and poisoned failure cache     |

Do not hold a monitor across remote initialization without deadline/cancel/failure policy. See the
reference for state-machine designs.

## Modern Java considerations

Virtual threads make blocked-thread representation cheaper, not critical sections parallel. Large
arrival concurrency can expose lock queues and resource bounds previously hidden by a platform-
thread pool. JEP 491 changes monitor pinning behavior in JDK 24, but does not remove mutual
exclusion, contention, native/pinning edge cases or need for target-version evidence. Do not replace
`synchronized` solely from old pinning folklore.

Scoped values are immutable context bindings, not a replacement for all shared state. Structured
concurrency clarifies subtask lifetime but does not make shared objects thread-safe.
An immutable binding can still refer to a mutable object; its payload needs its own protocol.

## Verification

Reuse applicable caller contracts, API guarantees and existing tests before adding checks. Select
checks for relevant unresolved failure modes; an adequate confined/immutable or library-backed design
does not require a new primitive stress suite or load experiment merely to complete this review.

- publication/happens-before argument plus ownership/atomicity reasoning for each shared invariant;
- sequential semantic/oracle tests plus concurrent history/invariant tests;
- jcstress/model testing when primitive patterns need that verification;
- stress/load tests when progress, fairness, contention or memory claims require workload evidence;
- deadlock, timeout, interrupt, callback reentry/failure and shutdown tests;
- documentation tests/examples showing supported multi-call usage.

Happens-before does not make a compound operation atomic. Finite tests can expose counterexamples;
passing runs support only the exercised conditions and do not replace the contract/correctness argument.
Report the contract change, evidence for each relevant invariant/publication edge, tests actually
run and unresolved lifecycle/liveness cases. Route detailed JMM proofs to java-memory-model and
primitive algorithm verification to concurrency-testing rather than declaring safety from stress alone.

## Anti-patterns

| Anti-pattern                                      | Failure                                    | Better approach                                 | Narrow exception         |
| ------------------------------------------------- | ------------------------------------------ | ----------------------------------------------- | ------------------------ |
| “Every method is synchronized => thread-safe API” | multi-call invariant/escape remains        | caller-visible atomicity contract               |
| Always private lock                               | breaks intended external compound protocol | private by default; public only as explicit API |
| `LongAdder` for exact state                       | sum not atomic snapshot                    | `AtomicLong`/lock/database invariant            | telemetry counter        |
| Snapshot then callback called “equivalent”        | ordering/failure semantics changed         | specify event/callback consistency              | best-effort notification |
| Request-scoped means thread-confined              | request may fan out/hop                    | task/actor ownership or synchronization         |
| Lazy by default                                   | first-use herd/failure and complexity      | eager unless avoided cost is material           |
| `tryLock` fixes deadlock                          | may livelock/partially apply               | lock order or redesigned ownership              |

## Definition of done

Apply these checks to the supported operations and lifecycle, not hypothetical features.

- [ ] Callers can understand atomicity, consistency, progress, callbacks and lifecycle without code.
- [ ] State ownership/publication and every compound invariant have one protocol.
- [ ] Escaped references, iterators/views, callbacks and failure paths preserve the contract.
- [ ] Lock/wait-for graph, ordering, interrupt/timeout and shutdown are reviewed.
- [ ] If initialization is lazy, it defines first-use, failure, retry, cancellation and cleanup.
- [ ] Relevant correctness/liveness claims have evidence and targeted checks; untested limits are explicit.

## References

- [Documenting thread safety](references/documenting-thread-safety.md) — when writing caller guarantees, views or ownership rules.
- [Lock scope, callbacks and deadlock](references/lock-scope-and-alien-calls.md) — when moving work across a lock or reviewing a wait-for graph.
- [Lazy initialization state machines](references/lazy-initialisation.md) — when choosing initialization, retry or close-race semantics.
- [Java concurrency API memory effects](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/package-summary.html#MemoryVisibility)
- [AtomicReference update contracts](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/atomic/AtomicReference.html) — when choosing atomic aggregate updates or reviewing retrying functions.
- [JLS 17](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html)
- [JEP 491](https://openjdk.org/jeps/491)
