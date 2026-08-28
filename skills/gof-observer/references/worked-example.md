# Worked example: an in-process listener that had to become a message

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
- **No write in the listener.** Had it needed one, `AFTER_COMMIT` runs with no active transaction,
  so it would need `@Transactional(REQUIRES_NEW)` — the silent-no-op failure
  (`event-driven-architecture`).

What this stage does **not** provide, and did not need to: durability. If the process dies between
commit and listener, the confirmation is lost. That was acceptable because a nightly job
reconciled unsent confirmations.

## Stage 2 — the consumer moved to another service

The naive change is one line:

```java
@TransactionalEventListener
void on(PolicyRenewed event) {
    kafka.send("policy.renewed", event);          // now a dual write
}
```

This is wrong in a way that is invisible in testing. The database transaction has committed; the
broker send is a separate operation that can fail, and there is no transaction left to roll back.
The renewal happens and the event never arrives — for a downstream service that bills on renewal,
that is unbilled revenue, discovered by reconciliation months later.

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

The event row and the policy row commit together, so either both happen or neither does. A relay
reads the outbox and publishes; if publication fails it retries, and if it succeeds twice the
consumer deduplicates. That is the whole point: **the dual write becomes a single write plus an
at-least-once delivery** (`event-driven-architecture`).

The relay itself runs in every replica, so it needs a lock or a claim, or the same message is
published N times — noisy but not incorrect, given the consumer is idempotent
(`distributed-locks-and-leases`).

## What the consumer then needed

```java
@KafkaListener(topics = "policy.renewed")
@Transactional
public void on(PolicyRenewedV1 event) {
    if (processed.contains(event.eventId())) return;        // at-least-once is guaranteed
    billing.recordRenewal(event.policyId(), event.termEnd());
    processed.record(event.eventId());                      // same transaction as the effect
}
```

Four requirements that did not exist in stage 1:

- **Idempotency**, keyed by an event id carried in the event, with the dedup record written in the
  same transaction as the effect (`idempotency`).
- **A version in the payload**, because the producer and consumer now deploy independently and the
  event is a contract (`rpc-and-api-contracts`).
- **A dead-letter path** for permanently failing messages, or one poison message blocks its
  partition indefinitely (`poison-messages-and-dlq`).
- **Consumer lag monitoring**, because a failing consumer is no longer visible to the publisher at
  all — in stage 1 an exception surfaced in the renewal request; now nothing does
  (`slo-and-alerting`).

## The ordering assumption that broke

The billing service also consumed `PolicyCancelled`, and assumed a cancellation always arrived
after the renewal that preceded it in time. That held in-process — the listeners ran in the order
the operations executed — and stopped holding on a broker, because the two events were published
to different partitions.

The observed failure: a cancellation processed before its renewal, leaving a policy billed for a
term it had cancelled.

Two available fixes, and why the second was chosen:

```text
(a) Partition by policy id
    → all events for one policy land on one partition, so per-policy
      order is preserved. Cheap, and it constrains throughput per policy.

(b) Make the consumer order-independent
    → each event carries the policy version it was produced from;
      the consumer ignores an event older than the state it has.
      More work, and it survives partition changes, replays and
      out-of-order redelivery.
```

(a) was applied immediately because it was a configuration change; (b) followed, because
at-least-once redelivery can present an old event again at any time and partitioning alone does
not protect against that (`message-ordering-and-partitioning`).

## Tests, per stage

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

The last two are the tests that distinguish a message consumer from a listener. Neither is needed
in stage 1, and both are mandatory in stage 3 — which is the concrete content of "an in-process
observer and a distributed subscriber are not the same thing".

## What stayed the same

The domain code. `policy.renew(...)` never learned that anything was listening, in either stage.
That is the decoupling Observer genuinely provides, and it is why the migration was possible at
all — the change was entirely in the publication mechanism and the consumer's obligations, not in
the model.
