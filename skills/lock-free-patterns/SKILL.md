---
name: lock-free-patterns
description: >
  Designing and reviewing nonblocking Java algorithms: linearization points, lock-free,
  wait-free and obstruction-free progress, CAS/RMW loops, success/failure ordering, contention
  collapse, backoff/helping, ABA/version wrap, node reuse and reclamation, publication,
  linearizability, starvation and shutdown. For custom implementations or performance claims,
  compare JDK/library and lock-based alternatives; measure retry and topology effects when relevant.
  Use when implementing or diagnosing atomics, striped counters, queues, stacks or ring
  buffers—not as a synonym for “fast.”
---

# Lock-free patterns

## Purpose

Assess safety and progress of a nonblocking algorithm; for a custom design or performance claim,
establish why its complexity is justified. Lock-free means system-wide progress under defined
assumptions; one thread may retry/starve indefinitely, cache lines still contend, and external
blocking can remain.

## Entry gate

Start with the requested operation and claim, reusing existing API contracts, proofs and
measurements. A narrow semantic/progress review can close with a supported explanation or
no change; keep an adequate library implementation. Report a specific unresolved obligation
when evidence is missing instead of requiring a full benchmark or redesign for every review.

Before custom code:

1. Check `java.util.concurrent`, atomics and maintained libraries.
2. State the missing semantic/performance property.
3. Compare against a clear lock/immutable/confinement design.
4. Define linearization point, progress guarantee and scheduler/preemption assumptions.
5. Budget proof, testing, operability and future-maintainer cost.

Custom lock-free code is justified by requirements, not by absence of `BLOCKED` threads.

Inspect the project's Java baseline, concrete atomic type/library version and supported
architectures. References use JDK 25 documentation; `AtomicReference.getAcquire()` and
`Thread.onSpinWait()` need Java 9+. A Java 8 algorithm can use its supported atomic APIs
with their ordering contracts; these illustrations do not authorize an upgrade.

## Algorithm contract

```text
abstract object semantics and linearizable operations:
state representation and invariants:
linearization point per success/failure operation:
publication/access modes and immutable-after-publish fields:
progress class and assumptions:
CAS retry, helping, backoff, cancellation and shutdown:
ABA/version wrap/node reuse/reclamation:
memory retention and allocation policy:
fairness/starvation and overload behavior:
target JDK/architecture/topology evidence:
```

## Progress vocabulary

| Guarantee        | Meaning                                                | Caveat                                                   |
| ---------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| blocking         | a delayed owner can delay others                       | may offer fairness, simple invariants, efficient parking |
| obstruction-free | an operation completes if it eventually runs alone     | contention manager/backoff required for system progress  |
| lock-free        | continued system steps ensure some operation completes | individual starvation allowed                            |
| wait-free        | each operation completes in bounded own steps          | bound/operation/participants must be specified           |

GC pauses, OS descheduling, blocking callbacks and resource waits affect observed progress even if
the in-memory algorithm is lock-free. Do not extend the claim across the whole service.

## CAS loop

```java
// Partial method body: state is AtomicReference<State>; State is immutable after publication.
for (int failures = 0; ; ) {
    State current = state.getAcquire();
    State next = derivePure(current);
    if (state.compareAndSet(current, next)) return;
    contentionPolicy.onFailure(failures); // spin/yield/backoff/park/help/cancel by policy
    if (failures < Integer.MAX_VALUE) failures++; // diagnostic/backoff count saturates
}
```

This is a shape, not complete code. The selected VarHandle/atomic modes must publish `next` and
observe `current` correctly. Derivation can repeat, so it cannot perform irreversible effects.
Allocation on every failure can create a retry/GC feedback loop.

`AtomicReference.compareAndSet` compares reference identity, not `equals`; publish one immutable
aggregate when fields must change atomically. A failed strong CAS indicates a mismatching value
at that instant, but weak CAS can fail spuriously. Do not infer contention or another completed
operation from every failed weak CAS. Access ordering on both success and failure belongs to
the exact selected method, not the generic name "CAS" (`varhandles-and-memory-ordering`).

`Thread.onSpinWait()` is a processor hint, not a progress policy, cancellation point, yield, or
bound. Use short spinning when expected owner latency/topology justifies it, then yield/back off/
park/help/fail according to the algorithm. Measure tail latency, CPU and starvation.

The policy is part of the progress proof: an indefinite park awaiting another actor can make
the operation blocking. Helping must itself progress; randomized backoff alone is not a
deterministic lock-free proof. Scope guarantees to the atomic in-memory core and state what
allocation, callbacks, reclamation and runtime scheduling assume.

## Linearization and failure semantics

Identify where each operation takes effect in the abstract history. A failed `poll`, `contains`,
or CAS-derived operation also needs a point/interval and consistency contract. Multi-step methods
may need helping/descriptors; “each field update is atomic” does not make the operation linearizable.

Use history/model tests in addition to invariants. Define behavior on exceptions, interruption,
cancellation, close, empty/full state, counter/version overflow and thread death between preparation
and publication.

## ABA and reclamation

ABA occurs when the compared state returns to a value/reference that compares equal while relevant
intermediate history is lost. Moving GC does not itself cause reference ABA: Java reference identity
is preserved across relocation. ABA becomes reachable through:

- the same node/object being removed, reset and reinserted;
- pooled/recycled nodes;
- primitive indices, sequence numbers or tagged states wrapping/repeating;
- a compound state represented by too-small a comparison key.

Stamped/tagged references only enlarge the state space; finite stamps can wrap. Prove maximum reuse/
lag or use a reclamation/version design that remains safe. GC keeps reachable Java objects alive,
which simplifies memory reclamation compared with manual memory, but off-heap/native structures and
explicit pools restore use-after-free/reuse hazards.

## Structures and trade-offs

- **Atomic counter:** exact linearizable updates, one coherence hotspot under write contention.
- **Striped adder:** distributed updates and non-atomic aggregate reads during updates; suitable
  for metrics, not unique sequences, balances, or exact limit enforcement.
- **Treiber stack:** compact CAS head; contention/ABA/reclamation and LIFO semantics.
- **Michael–Scott-style queue:** linked-node enqueue/dequeue with helping; allocation/retention,
  sentinel and tail-lag proof complexity.
- **Ring buffer:** bounded contiguous storage and sequence protocol; capacity/full policy, wrap,
  gating, wait strategy, producer/consumer topology and false sharing dominate correctness/cost.

Preallocation/locality/batching may explain a ring buffer's gain independently of progress class.
Measure mechanisms separately.

## Diagnosis

High CPU plus flat throughput and no blocked monitors is not a CAS signature. Competing causes include
application compute, GC/JIT, polling, serialization, logging, kernel work and measurement scope.

Use aligned evidence:

- CPU profile showing retry/RMW/spin path and owning operation;
- attempts/failures/help/backoff per successful useful operation;
- thread-count and key/state contention distribution;
- compiled code or supported hardware counter evidence with multiplex/topology caveats;
- GC/allocation from failed attempts;
- throughput, tail, fairness/starvation and deadline-abandoned work.

No standard JFR event universally counts CAS failure; application counters and diagnostic builds are
often the discriminating evidence. See `references/measuring-cas-contention.md`.

## Validation

Use the checks that challenge the requested operation's safety/progress or performance claim.
Reuse applicable library contracts and existing evidence for a narrow review. Custom protocol
changes still need their relevant invariant, memory-order and progress justification; a
performance claim also needs representative comparisons and measurements.

- sequential oracle and representation invariants;
- linearizability/history testing over bounded models;
- jcstress for memory-ordering/atomic litmus patterns;
- schedule/stress/fault tests including stalled/preempted actors;
- wrap/reuse/empty/full/shutdown/cancellation cases;
- JMH/component load over thread/topology/contention distributions;
- comparison with library and lock-based baseline;
- memory retention, allocation, power/CPU and observability review.

Finite tests do not prove lock-free or wait-free progress. The algorithmic proof states the guarantee;
tests challenge assumptions and integration.

## Anti-patterns

| Anti-pattern                        | Failure                            | Better approach                                 | Narrow exception                 |
| ----------------------------------- | ---------------------------------- | ----------------------------------------------- | -------------------------------- |
| Add `onSpinWait` to unbounded loop  | burns CPU/starves without recovery | adaptive policy with progress/cancel metrics    | very short bounded handoff       |
| “ABA impossible with GC”            | same object/value can be reused    | analyze identity reuse/wrap/reclamation         | immutable never-reinserted nodes |
| Stamp only increases                | finite stamp wraps                 | prove horizon or stronger state/reclamation     | bounded lifetime below wrap      |
| AtomicLong threshold “four writers” | hardware/rate/topology vary        | sweep and retry counters                        | local heuristic, non-decisive    |
| Lock-free means faster              | coherence/retry/complexity ignored | measured baseline and total cost                | hard progress requirement        |
| Throughput only                     | starvation/failures hidden         | successes, retries, tail, fairness, correctness |

## Definition of done

Apply these obligations to the requested scope and distinguish existing evidence, executed
checks and proposed follow-up. Do not demand new tests or measurements unrelated to the claim.

- [ ] Semantics, invariants and linearization points cover success and failure.
- [ ] Progress class is scoped with scheduler/participant assumptions.
- [ ] Publication and CAS success/failure modes have a JMM proof.
- [ ] ABA, wrap, reuse, reclamation and off-heap lifetime are handled.
- [ ] Backoff/help/cancel/shutdown have explicit progress and observability contracts; individual
      retries may be unbounded under lock-freedom, and a retry cap changes the operation's outcome.
- [ ] A custom design has considered library and lock-based alternatives; performance claims
      compare them under representative contention/topology.
- [ ] Relevant safety/history/stress and performance/fairness/memory evidence support the claim.

## References

- [Lock-free structures and proof obligations](references/lock-free-structures.md) — read when
  selecting or proving a stack, queue, adder, ring buffer or reclamation strategy.
- [Measuring CAS contention](references/measuring-cas-contention.md) — read when retry cost,
  topology or a claimed performance gain drives the decision.
- [Java atomics API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/atomic/package-summary.html)
- [Java VarHandle API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/invoke/VarHandle.html)
- [OpenJDK jcstress](https://github.com/openjdk/jcstress)
