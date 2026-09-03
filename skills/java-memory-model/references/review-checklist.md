# Concurrency review and incident checklist

## Correctness review

- [ ] Shared variables and conflicting accesses are inventoried, including callbacks and mutable
      objects reachable through fields.
- [ ] Required state invariants and atomic transitions/snapshots are stated.
- [ ] Each access follows the same guard/publication/access-mode protocol.
- [ ] Read-modify-write and check-then-act use one atomic operation or lock/protocol.
- [ ] Safe publication is explicit; final-field freeze is not mistaken for later mutation safety.
- [ ] No constructor escape, unsafe listener registration or overridable call exposes partial state.
- [ ] Executor/queue/future handoff relies on documented API memory effects.
- [ ] Wait/condition code loops on predicates and defines spurious wakeup, interrupt and timeout.
- [ ] Shutdown/cancel/error paths preserve ordering and do not publish partial state.
- [ ] Long/double nonvolatile atomicity and word-tearing concerns are checked against JLS when
      relevant, not assumed from one VM.
- [ ] Reflection/serialization/native/unsafe mechanisms that mutate finals or bypass construction
      are identified.

Static analyzers can find suspicious inconsistent synchronization, volatile increments, escape and
lock patterns, but rule availability/names change. Record tool/version/configuration and review
suppression rationale; no analyzer proves the whole JMM contract.

## Incident workflow

```text
wrong outcome/invariant
  -> preserve exact values, request/task identity, version, inputs and timing
  -> separate visibility/order/atomic compound operation/lifecycle ownership hypotheses
  -> map conflicting actions and synchronization edges
  -> minimize to a litmus/jcstress model
  -> fix protocol and validate integration under target schedules/load

no progress/latency only
  -> likely liveness/contention/queueing path; route to concurrency-diagnostics
  -> still inspect state race if progress predicate/publication may be stale
```

Thread dumps can identify where threads are parked/blocked, not which ordinary write a read
observed. JFR can show events/contention with configured thresholds, not general data races. Hardware
race detectors and sanitizers have coverage/runtime limitations in managed/native mixed code.

## jcstress outcome design

Before writing annotations, enumerate:

```text
acceptable: required by correct executions
acceptable-interesting: legal but exposes mechanism/performance concern
forbidden: impossible under the claimed protocol
unknown/unmodeled: requires expanding actors/arbiter/state
```

Use enough actors to represent the minimal relation, an arbiter for final state when appropriate,
and avoid adding synchronization through test infrastructure. A result not observed is not proven
forbidden; jcstress evidence complements the JMM proof.

## Fix validation

- run the minimized jcstress test across supported JDKs/architectures/configurations;
- run semantic concurrency tests and production-like load/failure/shutdown;
- verify no new deadlock/starvation/contention or allocation regression;
- review compatibility/serialization/public API if state representation changed;
- preserve the proof/outcome model with the code so later “optimizations” do not remove the edge.

Architecture diversity is useful integration coverage, not a mandatory two-machine proof. Correct
Java code is portable by specification; racy code may fail nowhere in finite tests.

## Authoritative references

- [JLS 17](https://docs.oracle.com/javase/specs/jls/se25/html/jls-17.html)
- [OpenJDK jcstress repository and samples](https://github.com/openjdk/jcstress)
- [Java concurrency APIs](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/package-summary.html)
