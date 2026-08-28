# Distribution Strategies

Choose per interaction, not per system. One pair of services frequently uses two of these
for different operations, and that is correct.

## The four shapes

| Strategy                          | Caller needs the answer | Coupling                | Consistency       | Failure of callee                  |
| --------------------------------- | ----------------------- | ----------------------- | ----------------- | ---------------------------------- |
| Synchronous request/response      | yes, now                | temporal + contract     | immediate         | caller fails or degrades           |
| Asynchronous command              | no                      | contract only           | eventual          | queued; caller unaffected          |
| Event notification                | no; callee decides      | contract only, inverted | eventual          | consumer lags; producer unaffected |
| Event-carried state / replication | no; reads locally       | contract only           | eventual, bounded | stale local data, still serves     |

The decision is mostly one question: **does the caller need the answer to complete its own
work?** If not, synchronous coupling is being bought for nothing.

## Synchronous request/response

Correct when the answer changes what the caller does next: an authorisation decision, a
price quote, a validity check.

```java
@Bean
RestClient inventoryClient(RestClient.Builder builder) {
    return builder
        .baseUrl(inventoryProperties.baseUrl())
        .requestFactory(ClientHttpRequestFactoryBuilder.httpComponents()
            .build(ClientHttpRequestFactorySettings.defaults()
                .withConnectTimeout(Duration.ofMillis(200))
                .withReadTimeout(Duration.ofSeconds(2))))   // never unbounded
        .build();
}
```

Non-negotiables: a connect and read timeout shorter than the caller's own deadline; a
bounded connection pool; a circuit breaker or bulkhead so one slow dependency cannot consume
the caller's capacity (`concurrency-limiting-and-bulkheads`); a defined behaviour when it
fails, which is a design decision, not a `catch` block.

**Availability multiplies.** A → B → C → D at 99.9% each yields 99.6%. Reducing hops beats
improving any single link.

## Asynchronous command

The caller wants something done, not answered. Latency is decoupled and the callee's
downtime becomes queue depth rather than caller failure.

The cost is the intermediate state: the caller must return before the work completes, so
the API returns "accepted", and the caller's user interface must represent in-progress
work. Teams frequently pay the messaging cost and then hide the intermediate state behind a
synchronous poll, which reintroduces the coupling.

## Event notification

The producer announces a fact; consumers decide what it means. This is the least coupled
shape, because the producer names no consumer, and consumers can be added without touching
it.

Its risk is the inverse: nobody owns the end-to-end behaviour. "Order placed" fires and
five consumers do something; when one of them silently stops, no single component is
responsible for noticing. Event-driven systems need explicit end-to-end observability —
consumer lag, a correlation identifier through every hop, and an alert on a missing
downstream effect — as part of the design, not afterwards.

Events must describe facts in the producer's language and must not be commands in disguise.
`OrderPlaced` is a fact; `SendConfirmationEmail` published as an event is a command with a
broker in the middle, and it couples the producer to a consumer's responsibility.

## Event-carried state transfer / replication

The consumer keeps a local copy of what it needs, updated by events, and reads it without a
remote call. This removes the synchronous dependency completely.

Correct when the data is read far more often than it changes and slight staleness is
acceptable — a product catalogue in an order service, a customer's tier in a pricing
service.

The costs are real: storage duplicated per consumer; a bootstrap path for a new consumer
(replay, or a snapshot API); staleness that must be bounded and monitored; and a schema
that now has as many readers as there are consumers (`consistency-models`).

## Losing atomicity: sagas, compensation, outbox

A business transaction spanning services cannot be atomic in practice. Three mechanisms
cover the ground.

### Outbox — makes the local write and the message atomic

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

Both rows commit together, so the message cannot be lost or sent for work that rolled back.
Delivery becomes at-least-once, which pushes the duplicate-handling requirement onto every
consumer (`idempotency`, `delivery-semantics`). Ensure the relay is a single logical worker
or that duplicate publication is tolerated — several replicas polling the same outbox will
otherwise publish twice.

### Saga — a sequence with compensations

```text
reserve stock ──→ take payment ──→ schedule dispatch
     │                 │                  │
 release stock ←── refund payment ←── cancel dispatch          (compensations)
```

Rules that make sagas survivable:

- Every step needs a compensation, or must be the last step. Steps with no possible
  compensation (an email sent, a physical action) must be ordered last.
- Compensations are semantic, not rollbacks: a refund is a new fact, not an undo.
- Every step and every compensation must be idempotent — they will be retried.
- The intermediate state is visible to users and to other systems, and must be a legitimate
  business state with a name ("payment pending"), not an accident.
- Someone must own timeouts: a saga stuck between steps needs a defined resolution, or it
  becomes a manual reconciliation queue nobody drains.

### Two-phase commit

Real atomicity, at the price of locks held across a network, in-doubt transactions after a
coordinator failure, availability that is the product of every participant's, and the
practical fact that HTTP APIs and most modern brokers do not participate. Defensible for
one database plus one XA-capable resource; not a general answer between services.

## Fan-out

One request producing N downstream calls is where remote latency becomes visible.

- **Sequential fan-out** costs the sum. Almost never right when the calls are independent.
- **Parallel fan-out** costs the maximum — which is the p99 of the slowest, and the
  probability of hitting some tail grows with N.
- **Bounded fan-out.** N must be bounded by design; a call per row of a result set is the
  remote N+1, and it appears in production at a list size no test used.
- **Partial results.** Decide in advance whether the response degrades or fails when one
  call does. With virtual threads, a structured concurrency scope makes that decision
  explicit and cancels the losers (`structured-concurrency`).

## Choosing, in one table

| Condition                                                     | Strategy                                     |
| ------------------------------------------------------------- | -------------------------------------------- |
| Caller cannot proceed without the answer                      | Synchronous, with timeout and fallback       |
| Caller needs work done but not the result                     | Asynchronous command                         |
| Other parties may care about a fact; producer should not know | Event notification                           |
| Data is read often, changes rarely, staleness tolerable       | Event-carried state / replication            |
| Multi-step business process across services                   | Saga with compensations, outbox at each step |
| The two sides genuinely need one transaction                  | Do not distribute them                       |
