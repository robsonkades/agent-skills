# Choosing the interaction style

## Event, command, or request/response

| Shape                          | Selecting condition                                                                                                               | Name form                                 | Where failure surfaces                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Event** (fact)               | Records an immutable occurrence; consumers react independently and publisher completion does not require their immediate outcomes | Usually past tense, producer's vocabulary | Publish durability can fail immediately; consumer outcome appears later as lag/DLQ/drift |
| **Command** (addressed, async) | One known recipient; the producer must not block; the outcome is either not needed or reported back later                         | Imperative, recipient's vocabulary        | At the recipient — and the rejection needs a defined route back                          |
| **Request/response**           | The caller cannot continue without the result, or must show it to a user now                                                      | Verb plus resource                        | At the caller, including partial failure (`rpc-and-api-contracts`)                       |

One useful test: **would the statement still be true if nobody were listening?** `OrderPlaced`
remains a fact; `ShipOrder` requires a recipient. Tense is not a proof—`OrderRequested` can
still be a command disguised as a noun—so inspect ownership, rejection and required outcome.

A command over a broker is legitimate, and common: deferred work, back-pressure absorption, a
retry surface the caller need not own. What is not legitimate is calling it an event, putting
it on a fan-out topic, and then discovering that exactly one consumer must exist for the
system to work. Work distribution to interchangeable workers is
`task-queues-and-competing-consumers`.

## Choreography versus orchestration

| Dimension              | Choreography                                                                      | Orchestration                                                      |
| ---------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Where the flow lives   | Distributed across event contracts/subscriptions; may have a derived process view | Explicit coordinator/state machine                                 |
| Adding a step          | Subscribe a new consumer; no existing service changes                             | Edit the coordinator; participants unchanged                       |
| Answering "where is X" | Reconstruct from correlated logs and traces                                       | Query the instance's state                                         |
| Coupling               | Producers ignorant of consumers; consumers bound to schemas                       | Participants bound to the coordinator's command contract           |
| Failure handling       | Each consumer owns its retry and DLQ; compensation is ad hoc                      | Timeouts and compensating steps are explicit states                |
| Availability           | No central component to lose                                                      | Coordinator down means the flow stops (its state persists)         |
| Practical fit          | Independent reactions or a small stable dependency graph                          | Explicit branching, deadlines, compensation and recovery ownership |

```text
Choose choreography when:
- reactions are independently valuable and do not form one hidden sequential command chain
- each participant's failure is locally recoverable — retry or DLQ, with no cross-service undo
- the steps are genuine independent reactions to a fact, not a sequence with a business owner
Choose orchestration when:
- business sequencing/branching or compensation needs one explicit state machine
- a per-step timeout is required ("no shipment confirmation within 24 h" is a state, not a
  missing message)
- somebody has to answer "where is order 4711 now" from a system rather than from logs
- the flow itself changes on a business schedule and needs one place to change it
```

Two things that are true of both, and are usually what actually hurts:

- **Identity fields have distinct jobs.** Event/message ID supports deduplication, causation ID
  links a derived message to its trigger, trace context follows one execution, and business
  correlation groups a long-lived flow. Do not overload one ID or place unbounded IDs in metric
  labels.
- **A coordinator is a state machine, and it will be restarted mid-flow.** Its state must be
  durable, its steps re-issuable, and the participants' handlers repeat-safe (`idempotency`).
  A coordinator holding progress in memory is a saga that loses flows on deploy.

The common right answer is a hybrid: orchestrate the part that needs compensation and a
deadline, and let purely reactive consequences — notifications, projections, analytics —
choreograph off the facts the flow emits.

## FaaS versus a long-lived consumer

This is where the consumer runs, chosen after the interaction style, never instead of it.

| Condition              | Managed function/event-source runtime                     | Long-lived consumer                                |
| ---------------------- | --------------------------------------------------------- | -------------------------------------------------- |
| Traffic shape          | Elastic burst within provider scaling/poller limits       | Explicit capacity and autoscaling control          |
| Latency budget         | Includes cold/provisioned-start and batching behavior     | Includes JVM warm-up and deployment scale-out      |
| Downstream connections | Reused per warm environment but multiplied by concurrency | Pool lifetime/control explicit per process         |
| Ordering requirement   | Event-source-specific; some preserve partition/key order  | Consumer protocol/configuration under your control |
| Write pattern          | Provider-specific batch and partial-failure contract      | Custom batching, pause, commit and backpressure    |
| Cost/operations        | Invocation/provisioned/poller pricing and platform limits | Idle/headroom cost plus runtime ownership          |

What FaaS costs a **Java** consumer specifically:

- **Cold/warm lifecycle.** New on-demand environments can add JVM startup, class loading and
  warm-up to scale-out tails; provisioned concurrency, snapshots and provider reuse change the
  frequency and shape. Measure the chosen runtime/event source under burst scale-out.
  `startup-cds-crac-leyden` owns the mitigations (AppCDS, AOT caching, CRaC, native image) and
  what each actually removes.
- **Connection multiplicity.** Warm execution environments can reuse static clients/pools,
  while scale-out creates many environments. Bound platform concurrency and size aggregate
  database connections (`connection-pool-sizing`); a proxy changes connection management, not
  database capacity.
- **Managed ordering.** Some event-source mappings own long-lived pollers and process a Kafka
  partition sequentially even though function invocations are ephemeral. Verify provider
  behavior for retries, partial batches, parallelization and rebalances rather than assuming
  ordering is absent or guaranteed.
- **Platform retries are still at-least-once**, and often less configurable than a consumer
  loop's. The handler must be repeat-safe regardless (`delivery-semantics`, `idempotency`).

Prefer a long-lived consumer when protocol control, predictable warm latency, custom
backpressure/commit behavior or connection limits dominate. Prefer managed functions when its
scaling, failure and ordering contract fits and reduced runtime ownership outweighs platform
constraints. Benchmark backlog catch-up and failure paths, not only one warm invocation.
