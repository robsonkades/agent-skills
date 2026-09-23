# Distribution Strategies

Choose per interaction, not per system. One pair of services frequently uses two of these
for different operations, and that is correct.

## The four shapes

| Strategy                          | Caller needs the answer      | Coupling                 | Consistency          | Failure of callee                         |
| --------------------------------- | ---------------------------- | ------------------------ | -------------------- | ----------------------------------------- |
| Synchronous request/response      | usually now                  | temporal + contract      | API/store contract   | caller fails or degrades                  |
| Asynchronous command              | completion may be later      | contract + broker        | application contract | backlog grows within capacity/retention   |
| Event notification                | no immediate consumer result | contract + broker        | application contract | consumer lags; publication can still fail |
| Event-carried state / replication | reads locally                | schema + update pipeline | lag-dependent        | stale data; enforce freshness policy      |

The decision is mostly one question: **does the caller need the answer to complete its own
work?** If not, consider asynchronous completion against its operational cost. Synchronous
transport by itself guarantees neither freshness nor atomicity.

## Synchronous request/response

Correct when the answer changes what the caller does next: an authorisation decision, a
price quote, a validity check.

For the project's actual runtime and client version, configure and verify pool-acquisition,
connect and response limits against the remaining end-to-end deadline. Include DNS/TLS
coverage, retries and queueing; connect/read timeouts alone are not a total call bound.
Bound concurrency and waiting queues (`concurrency-limiting-and-bulkheads`). A circuit
breaker can reject calls during failures but is not a concurrency limit. Define safe
failure behaviour, including failing closed when a fallback would violate correctness.

For an all-required independent-success chain, availability is the product of service
availabilities; see the numerical example in SKILL.md. Shared failures and recovery
policies require a different model. Measure which dependency dominates before choosing
between fewer hops and improving a link.

## Asynchronous command

The caller wants something done, not answered. Latency is decoupled and the callee's
downtime can become queue depth after durable acceptance. Broker outages, full queues,
expired retention and missed completion deadlines still affect the business operation.

The cost is the intermediate state: the caller must return before the work completes, so
the API returns "accepted", and the caller's user interface must represent in-progress
work. Teams frequently pay the messaging cost and then hide the intermediate state behind a
synchronous poll, which reintroduces the coupling.

## Event notification

The producer announces a fact; consumers decide what it means. Not naming consumers reduces
direct coupling, but schema, data and business dependencies remain. Adding a consumer need
not change the producer; it still adds delivery, access and operational obligations.

Its risk is a required workflow with no explicit owner. For each required downstream outcome,
name the owner, completion/freshness bound and evidence of missing or failed work. Preserve
existing workflow ownership and use appropriate lag, correlation and outcome signals. An
optional analytics consumer need not become a prerequisite for completing the order; operate
it under its own contract rather than waiting for every subscriber.

Events must describe facts in the producer's language and must not be commands in disguise.
`OrderPlaced` is a fact; `SendConfirmationEmail` published as an event is a command with a
broker in the middle, and it couples the producer to a consumer's responsibility.

## Event-carried state transfer / replication

The consumer keeps a local copy of what it needs, updated by events, and reads it without a
remote call on that read path. Freshness checks or cache misses may still call remotely.

Correct when the data is read far more often than it changes and slight staleness is
acceptable — a product catalogue in an order service, a customer's tier in a pricing
service.

The costs are real: storage duplicated per consumer; a bootstrap path for a new consumer
(replay, or a snapshot API); staleness that must be bounded and monitored; and a schema
that now has as many readers as there are consumers (`consistency-models`). Eventual
consistency provides no finite lag bound by itself; define when stale reads stop being safe.

## Losing atomicity: sagas, compensation, outbox

Independent local commits are not one atomic transaction. Choose application recovery or
an explicitly supported distributed transaction; these mechanisms offer different guarantees.

### Outbox — makes the local write and publication intent atomic

Partial imperative Spring-style Java snippet; domain types and framework setup are omitted.
Both repositories must enlist in the same database transaction, and invocation must actually
pass through the configured transaction boundary. Failures that prevent recording the outbox
entry must roll back the order write. Spring's default rules cover `RuntimeException`/`Error`,
not checked exceptions; inspect applicable rollback rules when adapting the example. Do not
swallow a failure and commit an incomplete unit: propagate it under a matching rollback rule
or mark the transaction rollback-only (`enterprise-transactions`).

```java
@Transactional
public OrderId place(PlaceOrderCommand command) {
    Order order = Order.from(command);
    orders.save(order);
    outbox.save(new OutboxMessage(
        "order.placed", order.id().toString(), serialise(new OrderPlaced(order))));
    return order.id();     // a relay publishes after commit, with retries
}
```

Under those conditions, both rows commit together; this records a recoverable publication
intent, not atomic broker delivery. Verify with the actual transaction manager and database:
inject serialisation or outbox-persistence failure after saving the order and confirm neither
row commits. A relay that retries committed rows can publish at least once subject to durable
storage and eventual recovery. Even one relay can crash after publishing but before marking
the row sent, then publish again. Coordinate competing relays and tolerate duplicates at the
business effect (`idempotency`, `delivery-semantics`). Monitor backlog and retention.

### Saga — a sequence with compensations

```text
reserve stock ──→ take payment ──→ schedule dispatch
     │                 │                  │
 release stock ←── refund payment ←── cancel dispatch          (compensations)
```

Rules that make sagas survivable:

- Identify compensable steps and the irreversible pivot. After the pivot, use retryable
  forward recovery or explicitly owned repair; an irreversible step need not be last.
- Compensations are semantic, not rollbacks: a refund is a new fact, not an undo.
- Make retried steps and compensations repeat-safe under their actual operation identity.
  A timed-out step may still commit: use a supported repeat/status/compensation protocol
  covering unknown outcomes and late execution, or retain an explicitly owned
  reconciliation/repair state (`distributed-transactions-and-sagas`, `idempotency`).
- The intermediate state is visible to users and to other systems, and must be a legitimate
  business state with a name ("payment pending"), not an accident.
- Someone must own timeouts: a saga stuck between steps needs a defined resolution, or it
  becomes a manual reconciliation queue nobody drains.

### Two-phase commit

Atomic commitment requires all resources to participate in the chosen protocol. Prepared
participants may retain locks/resources and remain in doubt during coordinator failure.
An ordinary HTTP API does not automatically participate. Verify coordinator recovery,
resource support and isolation separately before choosing 2PC; do not infer availability
from an unconditional product formula (`distributed-transactions-and-sagas`).

## Fan-out

One request producing N downstream calls is where remote latency becomes visible.

- **Sequential fan-out** adds stage durations and orchestration overhead. Compare batching
  or bounded parallelism against downstream capacity and rate limits.
- **Parallel fan-out** waiting for all results takes approximately the maximum duration
  plus overhead when calls start together. Its p99 is not the largest individual p99;
  the joint distribution, correlations and concurrency limit matter.
- **Bounded fan-out.** N must be bounded by design; a call per row of a result set is the
  remote N+1, and it appears in production at a list size no test used.
- **Partial results.** Decide in advance whether the response degrades or fails when one
  call does. Choose an explicit task lifetime and cancellation policy supported by the
  project's runtime; for Java structured concurrency, consult `structured-concurrency` and
  its version requirements. Local cancellation is cooperative and does not prove a remote
  operation stopped.

## Choosing, in one table

| Condition                                                     | Strategy                                                           |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| Caller cannot proceed without the answer                      | Synchronous, with deadline and safe failure behaviour              |
| Caller needs work done but not the result                     | Asynchronous command                                               |
| Other parties may care about a fact; producer should not know | Event notification                                                 |
| Data is read often, changes rarely, staleness tolerable       | Event-carried state / replication                                  |
| Multi-step business process across services                   | Saga recovery; outbox where local state and publication must agree |
| The two sides genuinely need one transaction                  | Prefer one transaction boundary; assess supported 2PC if necessary |

## Sources

- [Spring 6.2 declarative rollback rules](https://docs.spring.io/spring-framework/reference/6.2/data-access/transaction/declarative/rolling-back.html): default exception handling and explicit rollback rules; verify the target project's configuration.
- [AWS transactional outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html): dual-write gap and duplicate publication.
- [Azure saga pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/saga): compensable, pivot and retryable transactions; lack of global isolation.
- [Fowler on event-driven patterns](https://martinfowler.com/articles/201701-event-driven.html): notification, hidden workflow coupling and state transfer.
