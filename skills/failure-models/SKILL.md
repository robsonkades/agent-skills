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

1. **Write a fault-model card for each boundary.** Name the fault classes, failure domains,
   synchrony assumption, recovery source, detection mechanism, and maximum tolerated
   combination. Crash-stop, crash-recovery, omission, timing and Byzantine are not labels
   for the whole system: a trusted database replica may be crash-recovery while an
   Internet-facing client is arbitrary or hostile. A process that restarts from durable
   state is crash-recovery; any in-flight operation whose completion was not durably
   recorded must be retried, reconciled, or abandoned by an explicit rule.
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
5. **Do conditional availability arithmetic** on the request path before promising a
   number. Required dependencies in series multiply availability only when their events are
   independent and their SLI windows and success definitions align; genuinely independent
   redundant alternatives multiply _unavailability_. Correlated and conditional failure
   needs a measured joint distribution or an explicit common-cause model. See
   `references/failure-domains-and-arithmetic.md`.
6. **Walk the eight fallacies as a checklist** — reliable network, zero latency, infinite
   bandwidth, secure network, unchanging topology, one administrator, zero transport cost,
   homogeneous network. Each is checkable in code, not just prose: a client with no read
   timeout has asserted the first, an unbounded in-memory queue the third, a hostname
   resolved once at startup the fifth.

## Fault classes

```text
Assume crash-stop when:
- the algorithm may treat a stopped participant as never returning. Replacing its process
  identity with a fresh replica does not make the original participant crash-recovery.
Assume crash-recovery when:
- the same logical participant can return after a crash and recover durable state — local
  log, database rows, committed offsets, epochs or leases. Volatile state is lost; durable
  state may lag acknowledged work unless the durability contract proves otherwise.
Assume omission (a message or a response silently lost) when:
- the underlying transport, queue, proxy or load balancer can drop sends or receives.
  A higher-level reliable-channel abstraction may mask omissions, but its retry,
  deduplication and terminal-failure assumptions then become part of the model.
Assume timing/performance failure when:
- correctness or usefulness depends on a deadline. A correct-but-late response can be a
  failure to the caller. Allocate the caller's end-to-end deadline across attempts,
  queueing and cleanup; a timeout is not automatically useful merely because it is shorter.
Include Byzantine faults when:
- input crosses a trust boundary — a client, another tenant, a third party — where a
  participant may send arbitrary, inconsistent or hostile data. Input validation protects
  an API but does not make its replication protocol Byzantine-fault tolerant. Under common
  quorum protocols, tolerating `f` crash failures typically needs `2f+1` voting members and
  Byzantine agreement commonly needs `3f+1`; the exact bound depends on synchrony,
  authentication, quorum and protocol assumptions. State those assumptions instead of
  transplanting a replica count.
```

## Fault-model card

For every important operation, make these fields reviewable:

| Field              | Question that must have an answer                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------- |
| Safety invariant   | What must remain true even during a partition, retry or recovery?                                    |
| Liveness condition | Under which timing and quorum assumptions must progress resume?                                      |
| Faults tolerated   | Crash-stop, crash-recovery, send/receive omission, delay, corruption, arbitrary peer?                |
| Bound              | How many simultaneous faults, and in which independent domains?                                      |
| Detector           | Timeout, lease, heartbeat, quorum observation, operator signal? Which false suspicion is acceptable? |
| Durable truth      | Which log, row, offset, epoch or manifest reconstructs state after restart?                          |
| Ambiguous effect   | How is an unknown outcome deduplicated, queried, reconciled or escalated?                            |
| Recovery objective | What RTO/RPO and backlog-drain time are required, and under what load?                               |
| Re-entry           | How is a recovered or partitioned participant fenced before it can mutate state again?               |

Do not merge **fault**, **error** and **failure**. A fault is the hypothesised cause; an error
is incorrect internal state; a failure is externally visible deviation from the service
contract. The distinction prevents a host reboot from being counted as one customer-visible
failure per request and prevents a latency SLO failure from being dismissed because every
response was eventually correct.

## Rules

- **Partial failure is the defining property.** A local call returns or throws. A remote call
  returns, throws, or leaves you not knowing — and the third outcome is where almost every
  distributed bug lives. Code that maps a timeout onto "it failed" has erased it: a timeout
  states the _caller's_ patience, never the callee's state, and the callee may complete the
  work after the caller gave up.
- Crash-recovery makes the recovery path a correctness surface. For each recovery step,
  state whether it is idempotent and under which key. The mechanics are `idempotency`; the
  requirement to have an answer is here.
- **A slow node can be more damaging than a dead one.** A definitively stopped endpoint is
  eventually excluded; a slow endpoint may retain traffic and consume caller threads,
  connections and deadline budget. But aggressive suspicion can eject a healthy node and
  destroy quorum or capacity. That the system's view of health can differ from the client's
  — _differential observability_ — is why "fail fast" is a policy, not a fact. In a fully
  asynchronous network a detector cannot distinguish crash from unbounded delay; practical
  systems assume some eventual timing bound and trade false suspicion against detection
  delay. Record that trade-off for readiness checks, leases and failover.
- **Redundancy inside one failure domain is not redundancy.** Three replicas on one host is
  one replica with extra memory cost. Ask what they share: host, rack, AZ, control plane,
  image, config, deploy, certificate, downstream dependency. A shared deploy is the one most
  often missed — rolling one bad artefact to every replica correlates them perfectly, which
  makes deploy strategy an availability control rather than a release convenience.
- **Adding a required dependency multiplies availability under an independence model and
  therefore increases total unavailability.** Ten independent dependencies at 99.9% in
  series produce about 99.0% path availability — roughly 87 hours a year unavailable, not
  8.8. Real incidents are often correlated, so use this as a comparison model, not a
  forecast. Either define a tested degraded mode that removes the dependency from the
  required path, or stop quoting the higher number. Redundant alternatives multiply
  unavailability only under independence; common causes set an unavailability floor.

## Decision framework

```text
If the operation crosses a process boundary:
  classify timeout/cancellation/disconnect as Unknown unless protocol evidence proves
  the request could not have applied.

If progress requires suspecting a peer:
  preserve safety with quorum, epochs or fencing;
  tune the detector only for liveness and recovery speed.

If replicas share any host, zone, control plane, deploy, credential or dependency:
  model that cause once as a common failure domain;
  do not multiply replica availability as if independent.

If a recovered participant can still write:
  require a new epoch/term/fencing token or an authoritative ownership check before re-entry.

If the design claims availability during partition:
  state which operations remain safe, which side may progress, and what reconciliation
  occurs after healing. "The service stays up" is not a consistency contract.
```

## Failure injection and recovery proof

Test the model, not merely exception handlers:

- inject loss separately before send, after apply/before acknowledgement, and during
  response transfer; assert downstream state and duplicate count;
- pause a process and add latency/jitter rather than testing only clean termination;
- partition asymmetrically (`A` reaches `B`, `B` cannot reach `A`) and isolate data plane
  from control plane;
- crash after every durable-write boundary, restart from persisted state, and verify the
  safety invariant plus bounded recovery;
- expire credentials, deploy incompatible versions, exhaust pools/disk/file descriptors,
  and restore backups into an isolated environment;
- run at realistic load: failover that takes 20 seconds when idle can create hours of
  recovery backlog at saturation.

Observe detection latency, false-positive rate, unknown outcomes, duplicate/reconciliation
counts, quorum loss, recovery backlog, RTO and recovered data point (RPO). A test that only
asserts the client exception does not validate the distributed outcome.

## Anti-patterns

| Anti-pattern                         | Why dangerous / symptom                                                 | Better alternative                                                          |
| ------------------------------------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| One fault model for the whole system | Trust and durability assumptions leak across boundaries                 | Model each operation and participant role, then compose them                |
| Timeout means rollback               | Retried writes duplicate after lost acknowledgements                    | Preserve `Unknown`; use idempotency, status lookup or reconciliation        |
| Health check means truth             | Gray/asymmetric failures stay green or healthy nodes flap               | Compare client-view signals; define detector error costs                    |
| Replica count means availability     | Common deploy, zone or datastore defeats all replicas                   | Draw domains and measure joint/common-cause failures                        |
| Failover equals recovery             | Traffic moves but stale owners write, data is missing, backlog explodes | Fence old owners; prove state recovery and capacity during catch-up         |
| Chaos without invariants             | Generates outages but no falsifiable learning                           | Declare safety/liveness hypotheses, blast radius and abort conditions first |

## References

- [The unknown outcome](references/the-unknown-outcome.md) — the three-outcome model in Java,
  how a JDBC, HTTP and Kafka call each maps onto it, and what an unknown write forces the
  design to provide. Read when adding a retry, handling a timeout, or writing across a
  process boundary.
- [Failure domains and availability arithmetic](references/failure-domains-and-arithmetic.md)
  — series and parallel composition worked through, correlated failure, and the questions
  that expose a hidden shared dependency. Read when promising an availability number, sizing
  replicas, or reviewing a topology.
