---
name: failure-models
description: >
  Stating a system's fault model before designing against it: crash-stop, crash-recovery,
  omission, timing and Byzantine faults; partial failure and the third outcome of every
  remote call (unknown); gray failure and the slow node whose health check stays green; the
  eight fallacies as a checklist; blast radius, correlated versus independent failure, and
  the availability arithmetic of a dependency chain. Use when a design says "if the service
  is down" without defining down, when a retry is added to a call whose outcome is unknown,
  when a node is slow rather than dead, when replicas share a host, an AZ or a database, or
  when an availability target is quoted for a service built on ten others. Does not cover
  what the model implies about messages (delivery-semantics) or reads (consistency-models),
  how a failure spreads (cascading-failures), the named shapes
  (distributed-failure-catalogue), what an orchestrator does with a failed pod
  (kubernetes-service-lifecycle), or failures as types (java-exception-design).
---

# Failure Models

## Purpose

Fix the fault model in writing before designing anything else. Every downstream decision —
whether a retry is safe, whether a read may be stale, how many replicas are enough — is an
answer to "which faults do we tolerate?", and a design that never asked the question has
answered it by accident.

The failure this prevents is the one-word fault model. "The service can go down" is not a
model: it silently assumes crash-stop, which lets a developer write recovery code that is
not idempotent, treat a timeout as a definite failure, and count three replicas on one host
as three. Naming the class turns each of those into a visible, arguable claim.

## Workflow

1. **Write down the fault classes you tolerate.** Crash-stop, crash-recovery, omission,
   timing, Byzantine — pick, do not assume. A JVM service that restarts and reads back its
   own database is **crash-recovery**, so recovery re-executes work and every recovery path
   must be idempotent or reconcilable.
2. **Give every remote call three outcomes**, not two: success, definite failure, unknown.
   Definite failure means the request provably never applied; anything else — read timeout,
   reset after the bytes went out, a broker ack that never arrived — is unknown. Then decide
   per call what happens on unknown: retry (safe only if idempotent), reconcile later, or
   escalate to a human. "Retry and hope" is a decision too; make it explicit. See
   `references/the-unknown-outcome.md`.
3. **Add gray failure to the model.** Assume a node that is up, passing its health check, and
   answering at ten times its normal latency. If the design has no answer for that node, it
   has no answer in production either.
4. **Draw the failure domains.** For a process, a host, a rack, an AZ, a dependency and a
   deploy, write what each one takes down. Anything sharing a domain is one unit, not N.
5. **Do the availability arithmetic** on the request path before promising a number.
   Required dependencies in series multiply availability; only genuinely independent
   redundancy multiplies _unavailability_. See
   `references/failure-domains-and-arithmetic.md`.
6. **Walk the eight fallacies as a checklist** — reliable network, zero latency, infinite
   bandwidth, secure network, unchanging topology, one administrator, zero transport cost,
   homogeneous network. Each is checkable in code, not just prose: a client with no read
   timeout has asserted the first, an unbounded in-memory queue the third, a hostname
   resolved once at startup the fifth.

## Fault classes

```text
Assume crash-stop when:
- the failed instance is never reused: a fresh replica replaces it and no local durable
  state survives the crash.
Assume crash-recovery when:
- the process restarts and reads back its own state — database rows, local disk,
  committed offsets, a lease it may still hold. This is nearly every Java service, and
  it means work in flight at crash time runs again, so recovery must be idempotent or
  reconcilable.
Assume omission (a message or a response silently lost) when:
- anything crosses a network, a queue, a proxy or a load balancer. Not optional.
Assume timing/performance failure when:
- the workload has a deadline. A correct-but-late response is a failure to the caller,
  which is why every remote call needs a timeout shorter than the caller's own budget.
Include Byzantine faults when:
- input crosses a trust boundary — a client, another tenant, a third party — where a
  participant may send arbitrary or hostile data. Validate there, treat the peer as
  adversarial, and stop there: tolerating Byzantine faults in the protocol itself costs
  3f+1 replicas and cryptographic verification against 2f+1 for crash faults, a price an
  ordinary business service should not pay for participants that are its own code.
```

## Rules

- **Partial failure is the defining property.** A local call returns or throws. A remote call
  returns, throws, or leaves you not knowing — and the third outcome is where almost every
  distributed bug lives. Code that maps a timeout onto "it failed" has erased it: a timeout
  states the _caller's_ patience, never the callee's state, and the callee may complete the
  work after the caller gave up.
- Crash-recovery makes the recovery path a correctness surface. For each recovery step,
  state whether it is idempotent and under which key. The mechanics are `idempotency`; the
  requirement to have an answer is here.
- **A slow node is worse than a dead one.** The dead one is removed by the failure detector;
  the slow one keeps its endpoint, keeps accepting traffic, and holds a caller thread or
  connection for every request. That the system's view of health can differ from the
  client's — _differential observability_ — is why "fail fast" is a property you build, not
  one you observe. No failure detector over an asynchronous network can tell a crashed
  process from a slow one, so every health check is a timeout-based guess: tune it for the
  cost of each error direction and never claim to have _detected_ a crash.
- **Redundancy inside one failure domain is not redundancy.** Three replicas on one host is
  one replica with extra memory cost. Ask what they share: host, rack, AZ, control plane,
  image, config, deploy, certificate, downstream dependency. A shared deploy is the one most
  often missed — rolling one bad artefact to every replica correlates them perfectly, which
  makes deploy strategy an availability control rather than a release convenience.
- **Adding a required dependency multiplies unavailability.** Ten dependencies at 99.9% in
  series is 99.0% — roughly 87 hours a year, not 8.8. Either give the dependency a fallback
  with defined degraded behaviour, or stop quoting the higher number. Redundancy multiplies
  unavailability _only_ under independence: with a shared component the composite is capped
  by that component whatever the replica count.

## References

- [The unknown outcome](references/the-unknown-outcome.md) — the three-outcome model in Java,
  how a JDBC, HTTP and Kafka call each maps onto it, and what an unknown write forces the
  design to provide. Read when adding a retry, handling a timeout, or writing across a
  process boundary.
- [Failure domains and availability arithmetic](references/failure-domains-and-arithmetic.md)
  — series and parallel composition worked through, correlated failure, and the questions
  that expose a hidden shared dependency. Read when promising an availability number, sizing
  replicas, or reviewing a topology.
