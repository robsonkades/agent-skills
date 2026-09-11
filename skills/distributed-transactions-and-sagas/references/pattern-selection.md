# Choosing the pattern

## The defect everything else is a response to

```java
@Transactional
public void placeOrder(OrderRequest request) {
    Order order = orders.save(Order.from(request));   // 1. database
    events.publish(new OrderPlaced(order.id()));      // 2. broker — not in the transaction
}
```

This partial Spring sketch assumes the save joins the active local database transaction and
the broker is not enlisted. `save` or flush is not the surrounding transaction's commit:

- **Crash before publishing.** An uncommitted local insert normally rolls back. A committed row
  without a message arises if the save committed independently; inspect the actual boundary.
- **Publish succeeds, then local commit fails or the process crashes.** A message can reference
  an absent order. An asynchronous publish not durably acknowledged before local commit can
  instead leave the order without durable delivery.
- **The publish throws or times out.** The broker may already have accepted the message. Local
  rollback depends on annotation/manager rules: Spring defaults to rollback for unchecked
  exceptions and errors, not every checked exception. Enlistment/outbox and outcome recovery must
  be explicit; method shape alone is a review lead rather than proof of a defect.

Replacing `events.publish` with `restClient.post` has the same atomicity and acknowledgement
gaps. A lost response can leave a successful remote effect; `failure-models` treats that as an
unknown outcome that the caller cannot classify from its own view alone.

## The five options compared

|                           | Atomicity                                                                  | Isolation                                                                 | Blocking behaviour                                                                                 | Operational cost                                                                                          | Failure recovery                                                                                 |
| ------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **One local transaction** | Atomic commit over enlisted writes                                         | The database's chosen isolation level                                     | Locks/versions held for the transaction duration                                                   | Lowest when one owner/store is valid                                                                      | Database recovery plus application retry for ambiguous commit                                    |
| **XA / 2PC**              | Atomic protocol across enlisted resources; heuristic outcomes can break it | Each resource manager's own                                               | Prepared branches retain resource-specific locks/reservations until a recoverable decision arrives | A transaction manager with a durable recovery log, plus a runbook for resolving in-doubt branches by hand | Coordinator recovery resolves prepared branches; heuristic/missing decisions need reconciliation |
| **Transactional outbox**  | Full over the database write plus the _intent_ to publish                  | The database's chosen isolation; the message is visible later             | None beyond the local transaction                                                                  | A relay process, its lag metric, and a claim column if it is not singleton                                | Relay resumes from unsent rows; delivery is at-least-once (`delivery-semantics`)                 |
| **Orchestrated saga**     | No atomic commit; drives declared completed/compensated/repair outcomes    | No automatic global isolation; local isolation and semantic guards remain | No database lock should span remote steps; semantic reservations may persist                       | Replicated coordinator, durable/versioned saga state and workers                                          | Claims one instance, resolves unknowns, then advances or compensates                             |
| **Choreographed saga**    | No atomic commit; same semantic obligation                                 | No automatic global isolation                                             | Event dependencies can wait indefinitely without deadlines                                         | Flow, schemas and recovery logic distributed across participants                                          | Requires correlated durable events/status; a separate projection may expose whole flow           |

The deciding columns are the atomic boundary, observable intermediate state, blocking during
failure, and who owns recovery. Local saga steps still have isolation; what is absent is one
global isolation boundary.

## Sequencing an XA decision

XA can be the right answer for a small, stable set of XA-capable resource managers — often a
relational database and JMS broker — under one transaction manager with durable identity and
recovery log. More processes/resources enlarge failure, latency and operational ownership;
they do not change the protocol into a saga by definition.

Check these before choosing it, because each one has ended an XA rollout:

- Both drivers actually implement `XAResource` and the vendor supports recovery, not just
  enlistment.
- The recovery process can access the durable decision log after a pod is lost. Losing its
  sole copy on an emptyDir or ephemeral filesystem prevents automatic decision recovery.
- Recovery recognizes the original manager's branches under the provider's identity/ownership
  rules. Verify any supported takeover; starting an unrelated replica does not establish recovery.
- Someone can list and resolve in-doubt transactions in both resources, and has done it once
  in a drill.

If resource recovery/identity is unsupported, atomic recovery is not established. If only the
drill/runbook is missing, the protocol may still be correct but the deployment is not
production-ready. Close the gap or choose an outbox/saga whose failure modes the team can own.

## Orchestration or choreography

```text
Use an orchestrated saga when:
- the step order branches, spans several participants, or needs one explicit recovery model
- the failure path must be readable in one place — a regulator, an auditor or an on-call
  engineer has to answer "what happens if step 3 fails" from one file
- steps need a timeout, a retry count or a manual-intervention hook per step
- orchestrator replicas can atomically claim/version saga instances and use a durable store

Avoid an orchestrated saga when:
- the orchestrator would end up owning business rules that belong to the participants,
  turning publish/subscribe back into RPC with extra hops (event-driven-architecture)
- there is no durable store available to it

Prefer a choreographed saga when:
- the participant graph is small and stable enough to reason about end to end
- the participants are already event-driven and each compensation is local to one service

Accept with choreography that:
- without an explicit contract/projection, the failure path exists in no single file, so
  answering “what happens after step 3 fails?” requires reading several services
- adding a participant changes the flow with no central place to review the change
- the flow's current position is only reconstructible from correlated events, so a
  correlation id on every event is mandatory rather than nice to have
```

## Anti-patterns, as shapes

- `@Transactional` on a method that also calls an unenlisted broker or HTTP participant —
  inspect actual enlistment before calling the method shape a dual-write defect.
- A saga step that calls `orderRepository.delete(id)` as a "compensation" for a step another
  service committed: deleting your own row does not un-reserve their inventory.
- A compensation implemented as `try { … } catch (Exception e) { log.error(…) }`. The
  inconsistency is now permanent and invisible.
- A saga driven by chained `CompletableFuture`s or `@Async` calls with no persisted state:
  correct until the first restart, then instances vanish with no record they existed.
- `@Retryable` on a saga step whose failure was a business rejection rather than a transient
  fault — the retries cannot succeed and merely delay the compensation
  (`retries-and-backoff`).
- Two orchestrator replicas both advancing the same unversioned saga row. Use an atomic claim
  or optimistic version transition; still make participant commands repeat-safe because a
  commit response can be lost.

Source: [Spring rollback rules](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/rolling-back.html);
inspect the project's resolved framework version and effective overrides.
For enlisted branches, read-only votes and heuristic recovery states, see the
[XAResource contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.transaction.xa/javax/transaction/xa/XAResource.html)
and Jakarta Transactions 2.0 section 3.4.8. This reference does not require upgrading the project JDK.
