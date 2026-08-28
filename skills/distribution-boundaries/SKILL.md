---
name: distribution-boundaries
description: >
  Deciding whether a boundary should be a process boundary, and designing it when it must
  be: what distribution actually costs (latency, serialisation, partial failure, lost
  atomicity, independent deployment), why a remote interface must be coarser than a local
  one, and choosing between synchronous call, messaging and replication. Use when a module
  is proposed for extraction into a service, when microservices are being adopted without a
  named driver, when a service call sits inside a transaction, when one request fans out to
  a dozen downstream calls, when two services share a database, when a "service" cannot be
  deployed without another being deployed too, when a synchronous chain has three or more
  hops, or when a distributed transaction is being designed. Does not cover the remote API's
  shape and payload types (remote-facade-and-dto), contract compatibility and versioning
  (rpc-and-api-contracts), transaction mechanics on one database (enterprise-transactions),
  or in-process layering (layering-and-boundaries).
---

# Distribution Boundaries

## Purpose

Make distribution a decision with a stated driver and a stated price, rather than a default
architecture. A process boundary is not a stronger version of a module boundary; it is a
different kind of thing, with different failure semantics, and the properties it removes —
atomicity, synchronous certainty, refactorability, a single stack trace — are exactly the
properties that make in-process code cheap to change.

The first law here is old and still correct: **do not distribute your objects.** Distribute
when something else forces it, and then design the boundary to be worth its cost.

## What crossing a process boundary actually costs

| Property      | In-process                 | Across a process boundary                                                |
| ------------- | -------------------------- | ------------------------------------------------------------------------ |
| Call cost     | nanoseconds                | hundreds of microseconds to milliseconds, plus tail                      |
| Failure modes | exception                  | exception, timeout, partial success, duplicate delivery, indefinite hang |
| Atomicity     | one transaction            | none; you get sagas, outboxes and compensation                           |
| Refactoring   | rename across the boundary | a coordinated release across teams                                       |
| Debugging     | one stack trace            | correlated traces across systems, if you built that                      |
| Types         | shared                     | a wire contract with independent lifecycles                              |
| Coupling      | compile-time, visible      | runtime, invisible until it fails                                        |
| What you gain | —                          | independent deploy, independent scaling, isolation, team autonomy        |

Every row in the left column is a property you are spending. The right column's gains are
real, and they are the only legitimate reasons.

## Workflow

1. **Name the driver.** Independent deployment, independent scaling, fault isolation, team
   ownership, or a technology/regulatory constraint. "Microservices" is not a driver, and
   neither is anticipated scale nobody has measured.
2. **Check the boundary in-process first.** If the module cannot be cleanly separated as a
   module, extracting it as a service will not separate it either — it will produce the same
   coupling over HTTP, where it is slower and harder to see
   (`layering-and-boundaries`).
3. **Draw the data ownership line.** One writer per table. Two services writing the same
   table are one service with a network in the middle, and every subsequent problem follows
   from that.
4. **Coarsen the interface.** A remote operation should be a complete business request, not
   a getter. Design it as a Remote Facade over the local model
   (`remote-facade-and-dto`).
5. **Decide the consistency story explicitly.** What is atomic, what is eventual, what is
   the visible intermediate state, and what compensates a partial failure.
6. **Give every call a timeout, a retry policy and a fallback**, and make the operation
   idempotent so retries are safe (`timeouts-and-deadlines`, `retries-and-backoff`,
   `idempotency`).
7. **Verify the boundary is real.** If the two sides must be released together, it is not a
   boundary — it is a distributed monolith, with all of the costs and none of the benefits.

## Decision rules

```text
The two sides change together in most commits
        → keep in-process. A network will not decouple what the design
          has coupled.

The driver is independent deployability, and the module has a stable,
narrow, business-shaped interface
        → a candidate. Extract as a module first, run it that way, then
          separate the process when the interface has stopped churning.

The driver is scaling one part independently
        → measure first. A module that is 3% of CPU does not need its own
          process; a module that needs GPUs, 60 GB of heap, or a
          different scaling curve does.

The driver is fault isolation
        → valid, and often the strongest one — but only if the caller has
          a defined behaviour when the callee is down. Isolation without a
          fallback is just a new failure mode.

The driver is team autonomy
        → valid and usually decisive in practice. Say so plainly; it
          survives review better than the technical proxy it is normally
          disguised as.

Two candidate services would share a database table
        → they are one service. Split the data first or do not split.

The operation requires atomicity across both sides
        → either keep them together, or redesign the operation so
          atomicity is not required (saga, outbox, idempotent retry).
          Two-phase commit across services is rarely available and
          rarely worth its availability cost.

A synchronous chain would be three or more hops deep
        → the availability and latency multiply. Consider events, or
          collapsing hops.
```

## Rules

- **Remote interfaces must be coarse.** A local design ported call-for-call across a
  network produces a chatty interface whose latency is dominated by round trips; the fix is
  not a faster serialiser, it is fewer calls (`architecture-and-performance`).
- Availability multiplies along a synchronous chain. Four hops at 99.9% each is 99.6%
  — roughly 3.5 hours a month of failure caused purely by the topology. Asynchronous steps
  and caches break the multiplication; retries do not, on their own.
- **Distribution removes atomicity; it does not weaken it.** Anything written across a
  boundary needs a designed intermediate state and a designed reconciliation. The most
  common bug in enterprise service architectures is a local commit plus a remote call, with
  no plan for the case where the second fails (`enterprise-transactions`).
- The shared database is the boundary violation that undoes everything else. Two services
  reading one another's tables cannot be deployed, scaled, migrated or reasoned about
  independently, no matter how the code is organised.
- Chattiness and coupling trade off. A coarse operation that returns everything the caller
  might need transfers data nobody uses; a fine one requires many round trips. Resolve it
  from the caller's actual use cases, not by symmetry with the domain model.
- A boundary is only a boundary if it can absorb change. If adding a field requires a
  coordinated release of both sides, the contract is not versioned properly
  (`rpc-and-api-contracts`).
- Prefer asynchronous messaging where the caller does not need the answer to proceed. It
  removes the availability multiplication and the timeout tuning, at the price of eventual
  consistency and a visible intermediate state — which is usually the cheaper trade
  (`delivery-semantics`).
- Do not extract a service to fix a code quality problem. A tangled module becomes a
  tangled module you cannot refactor with an IDE.
- Distribution is close to irreversible in practice. Merging two services back is a
  migration, not a refactor, so this decision deserves the analysis that one-way decisions
  get (`architecture-decision-making`).

## References

- [Local versus remote boundaries](references/local-vs-remote.md) — the concrete arithmetic
  of a chatty interface, the failure modes a local call does not have, why an in-process
  module is the right rehearsal for a service, the distributed monolith's detectable
  symptoms, and how to run an extraction so it can be abandoned halfway. Read before
  proposing or reviewing an extraction.
- [Distribution strategies](references/distribution-strategies.md) — synchronous request,
  asynchronous messaging, event-carried state transfer and replication compared on
  coupling, consistency and failure; sagas and compensation; the outbox; fan-out and its
  latency; and choosing per interaction rather than per system. Read when designing the
  interaction between two services.
