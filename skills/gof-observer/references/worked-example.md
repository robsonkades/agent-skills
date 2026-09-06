# Worked example: an in-process listener that had to become a message

Illustrative migration, not a reported production incident or executed integration suite.
Java 17 partial snippets with project-specific collaborators/imports omitted; Spring transaction,
async and Kafka behavior requires the deployed configuration and effective proxies.

A `PolicyRenewed` reaction started as an in-process listener and moved to a broker when the
consumer became another service. Almost nothing about the Java changed; almost everything about
the semantics did.

## Stage 1 — in-process, and correct for what it was

```java
@Service
public class RenewalService {

    @Transactional
    public void renew(PolicyId id) {
        var policy = policies.byId(id);
        policy.renew(clock.instant());
        policies.save(policy);
        events.publishEvent(new PolicyRenewed(id, policy.newTermEnd()));
    }
}

@Component
class RenewalNotificationListener {
    @TransactionalEventListener            // AFTER_COMMIT by default
    void on(PolicyRenewed event) {
        notifications.sendRenewalConfirmation(event.policyId());
    }
}
```

Two decisions already made here, both correct:

- **`@TransactionalEventListener`, not `@EventListener`.** The confirmation must not be sent for a
  renewal that rolls back. A plain listener runs inside the publisher's transaction and would send
  the email first.
- **No database write in the listener.** AFTER_COMMIT may still expose resources from the finished
  transaction, but further writes there will not commit. Durable writes require an effective new
  transaction boundary such as proxied REQUIRES_NEW
  (`event-driven-architecture`).

What this stage does **not** provide, and did not need to: durability. If the process dies between
commit and listener, the confirmation is lost. That was acceptable because a nightly job
reconciled unsent confirmations. That job also needs duplicate handling for ambiguous send outcomes;
after-commit timing alone does not provide exactly-once email.

## Stage 2 — the consumer moved to another service

The naive change is one line:

```java
@TransactionalEventListener
void on(PolicyRenewed event) {
    kafka.send("policy.renewed", event);          // now a dual write
}
```

A happy-path test misses this failure; crash/fault injection can expose it. The database transaction has committed; the
broker send is a separate operation that can fail, and there is no transaction left to roll back.
The renewal happens and the event never arrives — for a downstream service that bills on renewal,
that can leave revenue unbilled. Kafka send completion must also be observed; returning from an
asynchronous send is not a broker acknowledgement.

## Stage 3 — the outbox

```java
@Transactional
public void renew(PolicyId id) {
    var policy = policies.byId(id);
    policy.renew(clock.instant());
    policies.save(policy);
    outbox.enqueue(OutboxMessage.of("policy.renewed", 1,
            new PolicyRenewedV1(EventId.newId(), id, policy.newTermEnd(), clock.instant())));
}
```

When both writes enlist in the same effective database transaction, the event and policy rows
commit atomically. A relay
reads the outbox and publishes; if publication fails it retries, and if it succeeds twice the
consumer deduplicates. That is the whole point: **the dual write becomes a single write plus
retriable publication with possible duplicates** (`event-driven-architecture`).

Concurrent relays need a bounded claim/ownership protocol and ordered publication where required.
Claims can expire and acknowledgements can be lost, so they do not eliminate duplicates; stable
event IDs survive retries, and pending rows remain until acknowledgement. Liveness also depends
on monitoring/retry operation and retention, not merely storing an outbox row
(`distributed-locks-and-leases`).

## What the consumer then needed

```java
@KafkaListener(topics = "policy.renewed")
@Transactional
public void on(PolicyRenewedV1 event) {
    if (!processed.tryInsert(CONSUMER_ID, event.eventId())) return;
    billing.recordRenewal(event.policyId(), event.termEnd()); // LOCAL DB effect in this transaction
}
```

tryInsert is an omitted database-specific atomic insert guarded by a unique key on consumer/event;
false means a committed duplicate, not an arbitrary database error. A check-then-record pair races.
The claim rolls back if billing fails, and both use the same transaction manager/database resource.
Do not catch a constraint exception and continue in a rollback-only transaction. Commit the effect
before acknowledging the Kafka offset; a crash in between causes safe redelivery. A remote billing
call needs its own durable idempotency protocol and is not rolled back by this annotation.

Four requirements to make explicit:

- **Idempotency**, keyed by an event id carried in the event, with the dedup record written in the
  same transaction as the effect (`idempotency`).
- **A schema version in payload or envelope**, because deployments are independent; distinguish it
  from the per-policy state version used for ordering. The event is a contract (`rpc-and-api-contracts`).
- **A dead-letter path** for permanently failing messages, or one poison message blocks its
  partition indefinitely (`poison-messages-and-dlq`).
- **Consumer lag and terminal failure monitoring.** Failure no longer shares the request stack;
  even in stage 1 an AFTER_COMMIT callback cannot roll back the completed renewal, and exception
  reporting depends on the transaction callback phase/configuration
  (`slo-and-alerting`).

## The ordering assumption that broke

The billing service also consumed `PolicyCancelled`, and assumed a cancellation always arrived
after the renewal that preceded it in time. That only holds locally when operations and notification are serialized; concurrent or reentrant
publishers need their own order contract. The migration also loses that assumption when events
are published to different topics/partitions or concurrent relays reorder them.

A possible failure: a cancellation processed before its renewal, leaving a policy billed for a
term it had cancelled.

Two possible approaches, with different applicability:

```text
(a) Partition by policy id
    → related event types must share an ordered topic/partition and key,
      with relays/producers preserving policy sequence and consumers processing in order.
      A shared key across different topics does not establish a common order.

(b) Make the consumer order-independent
    → for replaceable state snapshots, atomically apply only a newer policy version.
      Deltas or billing effects may not be skipped: detect gaps and buffer/reconcile
      or enforce ordered processing. Event-ID deduplication remains separate.
```

Neither is merely a partition-key configuration fix. Partitioning does not order upstream
concurrent sends or make side effects duplicate-safe; version filtering is correct only when newer
state subsumes everything discarded (`message-ordering-and-partitioning`).

## Suggested integration tests, not executed here

```java
// stage 1: the listener policy
@Test void confirmation_is_not_sent_when_the_renewal_rolls_back() { ... }

// stage 3: the outbox invariant
@Test
void the_event_row_and_the_policy_commit_together() {
    assertThatThrownBy(() -> renewalService.renewFailingAfterEnqueue(POLICY))
            .isInstanceOf(RuntimeException.class);
    assertThat(outbox.findAll()).isEmpty();          // rolled back with the policy
    assertThat(policies.byId(POLICY).termEnd()).isEqualTo(ORIGINAL_TERM_END);
}

// consumer: the two properties at-least-once forces
@Test void processing_the_same_event_twice_bills_once() { ... }
@Test void an_event_older_than_the_current_state_is_ignored() { ... }
```

Run the duplicate test concurrently as well as sequentially, and inject rollback after the claim,
crash after DB commit before offset commit, and relay failure around broker acknowledgement.
The stale-event test applies only to replaceable snapshots; for billing deltas test gaps and required
effects instead. Local retries/reconciliation can require duplicate tests in stage 1 too. These
snippets are test designs, not evidence of executed Spring/Kafka/database validation.

## What stayed the same

The domain code. `policy.renew(...)` never learned that anything was listening, in either stage.
That is the decoupling Observer genuinely provides, and it is why the migration was possible at
all — the change was entirely in the publication mechanism and the consumer's obligations, not in
the model.

Primary source for broker scopes and commit/offset failure windows:
[Kafka 4.1 delivery design](https://kafka.apache.org/41/design/design/).
The transaction callback sources are linked in observer-variants.md.
