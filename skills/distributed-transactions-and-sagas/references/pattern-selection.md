# Choosing the pattern

## The defect everything else is a response to

```java
@Transactional
public void placeOrder(OrderRequest request) {
    Order order = orders.save(Order.from(request));   // 1. database
    events.publish(new OrderPlaced(order.id()));      // 2. broker — not in the transaction
}
```

Two independent failure windows, neither of which produces an error:

- **Crash between 1 and 2, or a rollback after 2.** The database has the order and nobody
  else knows, or the message is already in flight and the row it describes was rolled back.
  A broker publish is not enrolled in a JDBC transaction; the annotation changes nothing
  about it.
- **The publish throws.** The transaction rolls back, so the order silently does not exist —
  which is _sometimes_ what you want, and is a decision that should be written down rather
  than inherited from where the line happened to sit.

Replacing `events.publish` with `restClient.post` gives the same two windows plus a third:
the call may have succeeded while the response was lost. `failure-models` calls that the
third outcome; it is why the caller cannot classify the step from its own view.

## The five options compared

|                           | Atomicity                                                 | Isolation                                                 | Blocking behaviour                                                                                  | Operational cost                                                                                          | Failure recovery                                                                      |
| ------------------------- | --------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **One local transaction** | Full, over every write in it                              | Full, at the chosen isolation level                       | Locks held for the transaction's own duration only                                                  | Lowest — nothing new to run                                                                               | The database's own recovery; nothing to write                                         |
| **XA / 2PC**              | Full across the enlisted resource managers                | Each resource manager's own                               | **In-doubt participants hold locks until the coordinator decides**; a coordinator crash blocks them | A transaction manager with a durable recovery log, plus a runbook for resolving in-doubt branches by hand | Coordinator replays its log on restart; unresolved branches need an operator          |
| **Transactional outbox**  | Full over the database write plus the _intent_ to publish | Full for the database write; the message is visible later | None beyond the local transaction                                                                   | A relay process, its lag metric, and a claim column if it is not singleton                                | Relay resumes from unsent rows; delivery is at-least-once (`delivery-semantics`)      |
| **Orchestrated saga**     | Eventual: every step or its compensation completes        | **None** — each step commits and is visible immediately   | None; no step holds a lock across another step                                                      | An orchestrator that is available and singleton per instance, plus the saga store                         | Orchestrator reloads in-flight instances from the saga log and resumes or compensates |
| **Choreographed saga**    | Eventual, same as above                                   | **None**, same as above                                   | None                                                                                                | No new component, but the flow lives in N services' handlers                                              | Each participant recovers its own step; **no component knows the whole flow**         |

The two rows that decide most designs are the **isolation** column — only the first two
options have any — and **blocking**, which is 2PC's disqualifier between services.

## Sequencing an XA decision

XA is the right answer in a narrow, real case: **one** application process enlisting **two**
XA-capable resource managers it reaches over a LAN — typically a relational database and a
JMS broker — under one transaction manager whose log is on durable storage.

Check these before choosing it, because each one has ended an XA rollout:

- Both drivers actually implement `XAResource` and the vendor supports recovery, not just
  enlistment.
- The transaction log lives somewhere that survives the pod: an emptyDir or container
  filesystem means an in-doubt branch can never be resolved automatically.
- The same transaction-manager identity comes back after a restart, so it can recover its
  own branches; a randomly named replica cannot.
- Someone can list and resolve in-doubt transactions in both resources, and has done it once
  in a drill.

If any of these fails, the design is at-least-once with deduplication wearing XA's clothes.
Prefer the outbox, which needs none of them.

## Orchestration or choreography

```text
Use an orchestrated saga when:
- there are more than about three participants, or the step order is conditional on data
- the failure path must be readable in one place — a regulator, an auditor or an on-call
  engineer has to answer "what happens if step 3 fails" from one file
- steps need a timeout, a retry count or a manual-intervention hook per step
- you can run the orchestrator as a singleton per saga instance (leader-election,
  distributed-locks-and-leases) and give it a durable store

Avoid an orchestrated saga when:
- the orchestrator would end up owning business rules that belong to the participants,
  turning publish/subscribe back into RPC with extra hops (event-driven-architecture)
- there is no durable store available to it

Prefer a choreographed saga when:
- two or three participants, a fixed order, and no conditional branching
- the participants are already event-driven and each compensation is local to one service

Accept with choreography that:
- the failure path exists in no single file, so "which compensations run if step 3 fails"
  is answered by reading N services
- adding a participant changes the flow with no central place to review the change
- the flow's current position is only reconstructible from correlated events, so a
  correlation id on every event is mandatory rather than nice to have
```

## Anti-patterns, as shapes

- `@Transactional` on a method that also calls a broker or an HTTP client — the dual write.
- A saga step that calls `orderRepository.delete(id)` as a "compensation" for a step another
  service committed: deleting your own row does not un-reserve their inventory.
- A compensation implemented as `try { … } catch (Exception e) { log.error(…) }`. The
  inconsistency is now permanent and invisible.
- A saga driven by chained `CompletableFuture`s or `@Async` calls with no persisted state:
  correct until the first restart, then instances vanish with no record they existed.
- `@Retryable` on a saga step whose failure was a business rejection rather than a transient
  fault — the retries cannot succeed and merely delay the compensation
  (`retries-and-backoff`).
- Two orchestrator replicas both driving the same saga instance because nothing elects a
  single owner; every step runs twice, and only the idempotent ones survive it.
