---
name: distributed-transactions-and-sagas
description: >
  Ending a multi-service operation consistently when no transaction spans it: the dual-write
  defect and why @Transactional does not cover a broker publish; two-phase commit stated
  fairly — the blocking window that rules it out between services, and where XA is still
  correct; sagas, whose defining property is atomicity but not isolation; compensation
  design, pivot ordering and the persisted saga log. Use when a method saves a row then
  publishes or calls another service, when @Transactional is expected to span two services,
  when a rollback is proposed for work another service committed, when a saga's state lives
  in memory, or when nobody can say which step a process reached. Not the outbox
  (delivery-semantics), repeat-safe steps (idempotency), what readers observe
  (consistency-models), choreography versus orchestration (event-driven-architecture), retry
  policy (retries-and-backoff), one owner of a role (leader-election,
  distributed-locks-and-leases), or one-database boundaries (enterprise-transactions).
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
2. **Try to delete the distribution first.** Two writes into stores the same service owns is
   one local transaction. Moving a table into the owning service beats writing a saga, and
   this option is skipped far more often than it is rejected.
3. **Check for one transaction manager over resources it controls.** JTA across a database
   and a broker inside one application is a legitimate 2PC use; across independently
   deployed services it is not.
4. **Order the steps by compensability, pivot last.** Reversible cheap steps first, the step
   that cannot be undone (payment capture, external submission, the email) last.
5. **Persist the saga state before invoking each step and the outcome after.** A position
   that exists only in a call stack, a `CompletableFuture` chain or an in-memory map is lost
   on restart, silently.
6. **Design each compensation as idempotent and retryable**, and write down what happens
   when it fails — nothing compensates a compensation.
7. **Give every step a timeout and every instance a query.** Define "stuck" numerically, and
   make "which step is saga X on" answerable from a datastore, not from logs.

## Decision block

```text
Use a saga when:
- two or more independently deployed services own the writes, or no one transaction manager
  reaches every store
- every step has a business-meaningful compensating action its owner will accept
- the business tolerates a stated window — seconds or minutes — in which the operation is
  partially applied and visible
- the operation is long relative to a lock hold time: human approval, a batch, a third-party
  call with a multi-second p99
Avoid a saga when:
- the intermediate state must never be observable and no semantic lock is acceptable
- a step has no compensation and cannot be moved into the pivot position
- there is no durable store for the saga log, so a restart loses in-flight instances
Prefer one local transaction when every write lands in one database one service owns —
  including when a table can be moved to make that true.
Prefer XA/JTA when one transaction manager in one application drives a small fixed set of
  XA-capable resources over a LAN, with a durable recovery log and an in-doubt runbook.
Prefer the transactional outbox when the only non-database write is "publish a message";
  that reduces to one local commit and is delivery-semantics, not a saga.
```

## Rules

- **A saga provides atomicity, not isolation.** Each step commits locally and is immediately
  visible, so two sagas can interleave on one entity, a reader can observe a state no
  completed operation produces, and a compensation can land after someone acted on the
  intermediate value. The countermeasures are design obligations, not optimisations: a
  **semantic lock** (an explicit `PENDING`/`RESERVED` status other operations are written to
  respect), **commutative updates** (`credit`/`debit`, not absolute `SET balance`), and
  **re-reading and re-validating inside the step** rather than trusting a value read at saga
  start. What readers observe is `consistency-models`. Never write "the saga guarantees
  consistency": the honest claim is that the system converges **once every step or its
  compensation has completed**, and is observably inconsistent until then.
- The reviewable dual-write shape is one `@Transactional` method holding both
  `repository.save(..)` and `broker.send(..)`/`restClient.post(..)`. Its reduction is the
  outbox, whose mechanics are `delivery-semantics`.
- **2PC's real objection is blocking, not overhead.** Having voted yes, a participant is _in
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
- **The hardest-to-compensate step goes last.** That step is the pivot: before it the saga
  compensates backwards, after it only retriable forward steps may remain. A pivot in the
  middle creates a region where neither direction is available.
- **Nothing compensates a failed compensation.** The only correct policy is retry with
  backoff, indefinitely, plus an alert and a manual-intervention queue holding the saga id,
  step and payload. A `catch (Exception e) { log.error(..) }` around a compensation turns a
  recoverable inconsistency into a silent permanent one.
- A **choreographed saga's failure path exists nowhere in one place**: step 4's compensation
  lives in service D, triggered by an event service C emits, and no file holds the ordering.
  That is choreography's saga-specific cost; the general fork is
  `event-driven-architecture`. Orchestration puts the failure path in one readable state
  machine and pays for it with a coordinator that must be available and singleton per
  instance (`leader-election`, `distributed-locks-and-leases`).
- A saga instance must be **queryable** — current step, attempt count, age, last error. If
  answering "which step is order 4471 on" means grepping logs across services, the saga is
  unoperable. Export saga age and the count of instances past their step timeout, and alert
  on the second.

## References

- [Choosing the pattern](references/pattern-selection.md) — the dual-write defect in code,
  then one local transaction, XA/2PC, orchestrated saga and choreographed saga compared on
  atomicity, isolation, blocking, operational cost and failure recovery, with a decision
  block for orchestration versus choreography. Read before choosing a mechanism.
- [Sagas and compensation in Java](references/saga-and-compensation-in-java.md) — the saga
  as a persisted state machine with a sealed step type, an idempotent retryable
  compensation, pivot ordering, the failed-compensation escalation path, and a test that
  injects a failure at every step. Read when implementing, reviewing or testing a saga.
