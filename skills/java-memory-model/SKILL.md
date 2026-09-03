---
name: java-memory-model
description: >
  Proving inter-thread visibility, ordering and atomicity under the Java Memory Model. Covers
  actions/executions, synchronization order, synchronizes-with and happens-before, data races,
  sequential consistency for correctly synchronized programs, volatile publication, monitor and
  lifecycle edges, final-field freeze semantics, safe publication, compound invariants, benign
  races, constructor escape, wait/notify, and architecture/JIT independence. Use for shared-state
  correctness reviews and intermittent outcomes. VarHandle modes, algorithms, locks and testing
  mechanics have separate owners.
---

# Java Memory Model

## Purpose

Prove which values an execution is permitted to observe. The JMM constrains compiler, runtime and
hardware transformations through actions and consistency rules; it is not merely a cache-coherence
or processor-reordering explanation.

The central review question is not “will the other thread probably see it?” It is: which rule orders
each conflicting access, which atomic invariant is represented, and what outcomes remain legal if
the program has a data race?

## Ownership boundary

- This skill owns the JLS memory-model proof and safe-publication contract.
- `varhandles-and-memory-ordering` owns explicit access modes and fences.
- `java-thread-safety-contracts` owns class-level guarantees and lock policy.
- `lock-free-patterns` owns algorithms, progress, ABA and reclamation.
- `concurrency-testing` owns jcstress/model/stress test construction.
- `cpu-cache-and-numa` owns cache/coherence/locality cost, not language correctness.

## Proof contract

```text
shared locations and conflicting reads/writes:
threads/tasks and action lifecycle:
state invariant and required atomic transition/snapshot:
program-order actions per thread:
synchronization actions and synchronizes-with edges:
happens-before graph and read-allowed writes:
final-field construction/freeze and reachability:
publication and post-publication mutation:
cancellation/interruption/shutdown edges:
legal, interesting, forbidden and unacceptable outcomes:
```

If the claim depends on elapsed time, “eventually,” x86 behavior, debug logging, a safepoint, or a
test never failing, it is not yet a JMM proof.

## Core model

- Two accesses conflict when they target the same variable, at least one is a write, and they are
  not both reads. A data race exists when conflicting accesses are not ordered by happens-before.
- Program order orders actions within a thread according to that thread's inter-thread semantics;
  it is not a global wall-clock order.
- Synchronization actions participate in a synchronization order. Specific pairs create
  **synchronizes-with** edges; happens-before is program order plus synchronizes-with plus
  transitivity.
- A correctly synchronized program—sequentially consistent executions have no data races—has the
  sequential-consistency guarantee described by JLS 17.4.5.
- A racy execution is still constrained by the JMM, but ordinary sequential reasoning is not a
  valid proof. “It works on this CPU” does not narrow the language-permitted executions.

Happens-before is stronger than “earlier in time” and subtler than “read B sees the last write A.” A
read is allowed to observe a write only under the JLS rules; intervening/unordered writes and races
matter. Draw actual actions rather than using “visibility” as a magic word.

## Synchronizes-with edges used in reviews

| Source action                   | Destination action                         | Scope/caveat                                      |
| ------------------------------- | ------------------------------------------ | ------------------------------------------------- |
| monitor unlock                  | subsequent lock                            | same monitor                                      |
| volatile write                  | subsequent volatile read                   | same variable, synchronization order              |
| thread actions before `start()` | actions in started thread                  | correct `Thread` lifecycle                        |
| actions in thread               | successful detection of termination        | for example `join()` return/isAlive false per JLS |
| interrupt call                  | interrupted thread determines interruption | exact detection API/control flow matters          |
| class initialization            | subsequent active use                      | class/interface initialization rules              |
| concurrent utility handoff      | documented memory-consistency effect       | read the exact API contract                       |

Default initialization also has a happens-before rule. Final-field semantics are special freeze/
dereference rules and should not be mislabeled as a generic publication happens-before edge.

## Volatile publication

For immutable or safely isolated data built before publication:

```java
private Config config;
private volatile boolean ready;

void publish(Config next) {
    config = next;      // ordinary writes before anchor
    ready = true;       // volatile write
}

Config current() {
    if (!ready) throw new IllegalStateException(); // volatile read first
    return config;                                  // ordinary read after anchor
}
```

The proof uses program order, volatile synchronizes-with, and transitivity. Every reader must read
the anchor before dependent state, and every publishing path must perform the ordered anchor write.
Post-publication mutation needs its own synchronization.

`volatile` makes each access to that variable atomic and ordered as specified; it does not make a
compound read-modify-write (`x++`) atomic, nor a multi-field invariant a snapshot. Multi-field state
can use one lock, an immutable aggregate published through one volatile/atomic reference, or another
formally proven protocol.

## Final-field semantics

At normal constructor completion, writes to final fields are frozen. If the object reference is
later observed through a permitted execution and `this` did not escape during construction, special
final-field rules provide stronger guarantees for the final values and referenced object/array state
reachable through those finals as defined by JLS 17.5.

This is not “safe publication for free”:

- the reader can still fail to obtain the reference correctly or observe stale non-final fields;
- mutation after the freeze is not covered;
- constructor escape can break the guarantee;
- reflection, deserialization and special mutation mechanisms have additional rules;
- final fields do not make referenced mutable objects immutable or operations thread-safe.

Prefer proper safe publication even for immutable objects: class initialization, volatile/atomic
reference, monitor/lock handoff, thread start, or a concurrent collection/queue with documented
memory effects.

## Constructor escape and lifecycle

Escape includes registering listeners, submitting/staring work with `this`, publishing to static or
shared state, callbacks from overridable methods, and lambdas capturing `this`. Subclass fields may
not be initialized when base-constructor escape invokes overridden behavior. Construct privately,
then publish from a factory or owner after completion.

Thread pools complicate `start()` intuition: submitting a task does not start a new worker per task.
Rely on the executor/queue/Future API's documented memory-consistency effects, not the historical
creation of the worker thread.

## Wait, notification and conditions

`wait()` atomically releases and later reacquires the monitor, but wakeups can be spurious and the
condition can be consumed by another thread. Always wait in a predicate loop under the same lock:

```java
synchronized (lock) {
    while (!condition()) lock.wait();
    consumeState();
}
```

Notification is not state; update the predicate under the lock. Define interruption, timeout,
shutdown and `notify` versus `notifyAll` consequences. Prefer higher-level synchronizers/queues
when their contract fits.

## Architecture and code generation

JLS guarantees do not depend on x86, AArch64, RISC-V, interpreter, C1, C2 or Graal. Stronger
hardware ordering can make some racy outcomes hard to observe, while compiler optimizations remain
legal. Conversely, an architecture migration does not guarantee a race will reproduce.

Use assembly only to study implementation/cost after the language proof is complete. Do not encode
specific instructions or “volatile reads are free” as portable correctness/performance rules.

## Diagnosis and validation

1. Preserve the wrong business outcome and relevant inputs/version; thread dumps/JFR may show
   liveness/contention but usually not a data race.
2. Minimize the state/action pattern and enumerate outcomes.
3. Build a jcstress test with explicit acceptable/interesting/forbidden outcomes.
4. Use static analysis and code review for inconsistent locking, unsafe publication and compound
   operations, but verify tool rule limitations.
5. Fix the proof, then run stress/load tests across target JDKs/architectures for integration—not as
   proof that all executions are safe.

## Anti-patterns

| Anti-pattern                           | Why wrong                                        | Better approach                           | Narrow exception |
| -------------------------------------- | ------------------------------------------------ | ----------------------------------------- | ---------------- |
| Sleep as synchronization               | creates no edge                                  | latch/future/join/condition               |
| Final reference means safe mutable map | freeze is not later mutation safety              | immutable snapshot or concurrent protocol |
| Volatile each field in invariant       | no atomic snapshot/transition                    | immutable aggregate/lock/proven protocol  |
| Test passed on x86                     | finite observations do not prove JMM correctness | formal hb graph + jcstress                |
| Log statement fixed race               | timing/compiler perturbation only                | establish missing ordering/atomicity      |
| Different locks for reader/writer      | no shared monitor edge                           | one guard or another explicit edge        |
| JFR found no contention                | races need not block                             | outcome/model/static analysis             |

## Definition of done

- [ ] Every conflicting access is ordered or all racy outcomes are explicitly acceptable.
- [ ] Compound invariants have one atomicity protocol, not per-field assumptions.
- [ ] Publication, mutation and lifecycle edges use exact JLS/API contracts.
- [ ] Final-field guarantees are separated from safe publication and immutability.
- [ ] Constructor escape, interruption, timeout and shutdown paths are covered.
- [ ] Legal/forbidden outcomes and jcstress/static/integration evidence are recorded.
- [ ] Correctness does not depend on processor/JIT timing folklore.

## References

- [Happens-before and publication proofs](references/happens-before.md)
- [Concurrency review and incident checklist](references/review-checklist.md)
- [JLS 17: Threads and Locks](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html)
- [JLS 17.4: Memory Model](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.4)
- [JLS 17.5: Final Field Semantics](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html#jls-17.5)
- [OpenJDK jcstress](https://github.com/openjdk/jcstress)
