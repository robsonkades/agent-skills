---
name: distributed-transactions-and-sagas
description: >
  Coordinating a business operation across transactional owners: dual writes, XA/2PC,
  persisted sagas, compensation, pivot/forward recovery, ambiguous outcomes and manual
  repair. Use when a local transaction is expected to cover a broker or remote service, or
  in-flight workflow state cannot survive restart. Outbox delivery, idempotency, consistency,
  retries and single-database transaction design remain in their owning skills.
---

# Distributed Transactions And Sagas

## Purpose

Decide how a business operation spanning several owners ends in a consistent state when no
transaction covers it, then implement that mechanism so it survives a crash mid-flight. The
choice is between removing the distribution, one transaction manager over resources it
controls, and a saga — and only one of the three is usually available.

The failure this prevents is the **dual write**: a method that saves a row and then
publishes a message or calls another service. On a crash between the two lines the database
has the order and the rest of the world does not, with no error anywhere, and
`@Transactional` does not fix it — the broker and the remote service are not enrolled in
that transaction, so the annotation only makes the defect look handled. The second is the
saga presented as a transaction: compensations exist, the happy path works, and nobody
accounts for the window in which a half-applied state is readable by everyone else.

## Workflow

1. **Enumerate the writes and their owners.** For each: which store or service, is it
   reversible, and what an observer sees between it and the next write.
2. **Test whether one transactional owner is architecturally valid.** Writes in one database
   transaction are simpler, but moving data changes ownership, scaling, security and team
   coupling. Record that trade rather than treating consolidation as free.
3. **Check whether one transaction manager can recover every enlisted XA resource.** XA may
   fit a small, stable resource set; service autonomy, long network calls and unavailable
   recovery ownership usually make it a poor cross-service boundary.
4. **Classify and order steps.** Compensatable steps precede the pivot; after the first
   non-compensatable committed pivot, only forward-retriable steps may remain. The pivot need
   not be last, but nothing after it may require backward recovery.
5. **Persist the saga state before invoking each step and the outcome after.** A position
   that exists only in a call stack, a `CompletableFuture` chain or an in-memory map is lost
   on restart, silently.
6. **Design execute, status, compensation and completion protocols.** Each is repeat-safe and
   keyed by saga/step identity. Define terminal business rejection, ambiguous outcome,
   transient failure and permanent/manual-repair states separately.
7. **Give every step a timeout and every instance a query.** Define "stuck" numerically, and
   make "which step is saga X on" answerable from a datastore, not from logs.

## Decision block

```text
Use a saga when:
- two or more independently deployed services own the writes, or no one transaction manager
  reaches every store
- every pre-pivot step has a business-meaningful compensation, the pivot has a resolvable
  outcome, and every post-pivot step can be retried/repaired forward
- the business tolerates a stated window — seconds or minutes — in which the operation is
  partially applied and visible
- the operation is long relative to a lock hold time: human approval, a batch, a third-party
  call with a multi-second p99
Avoid a saga when:
- the intermediate state must never be observable and no semantic lock is acceptable
- a step has no compensation and cannot be moved into the pivot position
- there is no durable store for the saga log, so a restart loses in-flight instances
Prefer one local transaction when every write can validly land in one database one service owns —
  including when a table can be moved to make that true.
Prefer XA/JTA when one transaction manager in one application drives a small fixed set of
  XA-capable resources over a LAN, with a durable recovery log and an in-doubt runbook.
Prefer the transactional outbox when the only non-database write is "publish a message";
  that reduces to one local commit and is delivery-semantics, not a saga.
```

## Rules

- **A saga is not an ACID transaction.** Each step commits locally and is immediately
  visible, so two sagas can interleave on one entity, a reader can observe a state no
  completed operation produces, and a compensation can land after someone acted on the
  intermediate value. The countermeasures are design obligations, not optimisations: a
  **semantic lock** (an explicit `PENDING`/`RESERVED` status other operations are written to
  respect), **commutative updates** (`credit`/`debit`, not absolute `SET balance`), and
  **re-reading and re-validating inside the step** rather than trusting a value read at saga
  start. What readers observe is `consistency-models`. State terminal business invariants for
  completed, compensated and manual-repair outcomes; convergence is not guaranteed when a
  compensation is impossible or permanently fails.
- The reviewable dual-write shape is one `@Transactional` method holding both
  `repository.save(..)` and `broker.send(..)`/`restClient.post(..)`. Its reduction is the
  outbox, whose mechanics are `delivery-semantics`.
- **2PC's defining failure cost is the in-doubt blocking window;** protocol latency, resource
  support and operational coupling matter too. Having voted yes, a participant is _in
  doubt_: it holds its locks and may not decide unilaterally without risking atomicity, so a
  coordinator crash in that window blocks it until the coordinator's recovery log returns.
  Across services that means one team's incident freezes another team's rows.
- XA is not disqualified everywhere. One application, one transaction manager, a database
  and a broker both exposing XA resource managers, a durable transaction log and operational
  access to in-doubt branches is correct, and a smaller machine than a saga. Say where that
  log lives: XA logging to ephemeral container storage is not recoverable.
- **A compensation is not an undo.** You cannot un-send an email (you send a correction),
  un-charge a card (you refund, a new fact with its own trail), or restore a seat someone
  else has taken. Write the compensation as the business action it actually is.
- Compensations must be **idempotent and retryable** (`idempotency`), because they run
  precisely where outcomes are unknown. A step timeout is an _unknown_ outcome, not a
  failure (`failure-models`): query the participant for that step's status by saga id before
  compensating, and make the compensation harmless against a step that never took effect.
- **The pivot defines recovery direction.** Before pivot commit, terminal rejection triggers
  backward compensation of completed compensatable steps. After pivot commit, continue
  forward; do not compensate earlier steps merely because a later forward-only step is
  temporarily failing.
- **Nothing automatically compensates a failed compensation.** Retry within an explicit
  time/attempt policy, retain durable status, page or queue manual repair, and reconcile.
  “Forever” may violate deadlines, retention or business policy; silent abandonment is never
  valid.
- A **choreographed saga's failure path exists nowhere in one place**: step 4's compensation
  lives in service D, triggered by an event service C emits, and no file holds the ordering.
  That is choreography's saga-specific cost; the general fork is
  `event-driven-architecture`. Orchestration puts the failure path in one readable state
  machine and pays for it with coordinator availability. Replicas should claim/version each
  saga instance with optimistic concurrency and issue idempotent commands; a global singleton
  leader is usually unnecessary.
- A saga instance must be **queryable** — current step, attempt count, age, last error. If
  answering "which step is order 4471 on" means grepping logs across services, the saga is
  unoperable. Export saga age and the count of instances past their step timeout, and alert
  on the second.

## References

- [Garcia-Molina and Salem, “Sagas”](https://www.cs.princeton.edu/techreports/1987/070.pdf)
- [Jakarta Transactions 2.0 specification](https://jakarta.ee/specifications/transactions/2.0/jakarta-transactions-spec-2.0.html)
- [MicroProfile Long Running Actions 2.0](https://download.eclipse.org/microprofile/microprofile-lra-2.0-RC1/microprofile-lra-spec-2.0-RC1.html)

- [Choosing the pattern](references/pattern-selection.md) — the dual-write defect in code,
  then one local transaction, XA/2PC, orchestrated saga and choreographed saga compared on
  atomicity, isolation, blocking, operational cost and failure recovery, with a decision
  block for orchestration versus choreography. Read before choosing a mechanism.
- [Sagas and compensation in Java](references/saga-and-compensation-in-java.md) — the saga
  as a persisted state machine with a sealed step type, an idempotent retryable
  compensation, pivot ordering, the failed-compensation escalation path, and a test that
  injects a failure at every step. Read when implementing, reviewing or testing a saga.
