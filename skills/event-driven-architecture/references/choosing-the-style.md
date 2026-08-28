# Choosing the interaction style

## Event, command, or request/response

| Shape                          | Selecting condition                                                                                               | Name form                             | Where failure surfaces                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------- |
| **Event** (fact)               | The producer finishes without the outcome; the consumer set is open, may grow, and is not the producer's business | Past tense, producer's own vocabulary | Never at publish; as consumer lag, a DLQ, or a projection that drifts |
| **Command** (addressed, async) | One known recipient; the producer must not block; the outcome is either not needed or reported back later         | Imperative, recipient's vocabulary    | At the recipient — and the rejection needs a defined route back       |
| **Request/response**           | The caller cannot continue without the result, or must show it to a user now                                      | Verb plus resource                    | At the caller, including partial failure (`rpc-and-api-contracts`)    |

The test that separates the first two: **would the sentence still be true if nobody were
listening?** `OrderPlaced` is true whether or not a consumer exists. `ShipOrder` is
meaningless without a recipient — that is what makes it a command.

A command over a broker is legitimate, and common: deferred work, back-pressure absorption, a
retry surface the caller need not own. What is not legitimate is calling it an event, putting
it on a fan-out topic, and then discovering that exactly one consumer must exist for the
system to work. Work distribution to interchangeable workers is
`task-queues-and-competing-consumers`.

## Choreography versus orchestration

| Dimension              | Choreography                                                 | Orchestration                                              |
| ---------------------- | ------------------------------------------------------------ | ---------------------------------------------------------- |
| Where the flow lives   | Nowhere — emergent from the set of subscriptions             | One component; readable, diffable, unit-testable           |
| Adding a step          | Subscribe a new consumer; no existing service changes        | Edit the coordinator; participants unchanged               |
| Answering "where is X" | Reconstruct from correlated logs and traces                  | Query the instance's state                                 |
| Coupling               | Producers ignorant of consumers; consumers bound to schemas  | Participants bound to the coordinator's command contract   |
| Failure handling       | Each consumer owns its retry and DLQ; compensation is ad hoc | Timeouts and compensating steps are explicit states        |
| Availability           | No central component to lose                                 | Coordinator down means the flow stops (its state persists) |
| Practical limit        | Roughly three participants and no compensation               | Any count, and effectively required past that              |

```text
Choose choreography when:
- three or fewer participants, and no step needs undoing when a later step fails
- each participant's failure is locally recoverable — retry or DLQ, with no cross-service undo
- the steps are genuine independent reactions to a fact, not a sequence with a business owner
Choose orchestration when:
- more than three participants, or any failure requires compensating an earlier step
- a per-step timeout is required ("no shipment confirmation within 24 h" is a state, not a
  missing message)
- somebody has to answer "where is order 4711 now" from a system rather than from logs
- the flow itself changes on a business schedule and needs one place to change it
```

Two things that are true of both, and are usually what actually hurts:

- **Correlation is not optional in either style.** One id, generated at the entry point,
  propagated on every publish and required in every consumer log line. In choreography it is
  the only way to reconstruct the flow; in orchestration it is how you tie the coordinator's
  view to what participants actually did.
- **A coordinator is a state machine, and it will be restarted mid-flow.** Its state must be
  durable, its steps re-issuable, and the participants' handlers repeat-safe (`idempotency`).
  A coordinator holding progress in memory is a saga that loses flows on deploy.

The common right answer is a hybrid: orchestrate the part that needs compensation and a
deadline, and let purely reactive consequences — notifications, projections, analytics —
choreograph off the facts the flow emits.

## FaaS versus a long-lived consumer

This is where the consumer runs, chosen after the interaction style, never instead of it.

| Condition              | FaaS                                | Long-lived consumer                          |
| ---------------------- | ----------------------------------- | -------------------------------------------- |
| Traffic shape          | Spiky, low duty cycle, long idle    | Sustained, or continuously non-zero          |
| Latency budget         | Tolerates a cold start on scale-out | Does not                                     |
| Downstream connections | None, or a managed HTTP endpoint    | A JDBC or broker pool worth holding open     |
| Ordering requirement   | None                                | Per-key, needing a held partition assignment |
| Write pattern          | One record at a time                | Batched writes and batched commits           |
| Cost driver            | Idle time you refuse to pay for     | Throughput you pay for continuously          |

What FaaS costs a **Java** consumer specifically:

- **Cold start on every new instance**, and a burst is exactly when new instances appear — so
  the cold-start cost lands on the tail during the spike the elasticity was bought for. It is
  JVM startup plus class loading plus interpreted execution before the JIT warms.
  `startup-cds-crac-leyden` owns the mitigations (AppCDS, AOT caching, CRaC, native image) and
  what each actually removes.
- **No connection pool worth the name.** A per-invocation instance cannot amortise a JDBC pool;
  either connect per invocation or front the database with a proxy, at which point total
  concurrency — not instance count — is what sizes the pool (`connection-pool-sizing`).
- **No held partition assignment.** A per-invocation runtime is not a stable consumer-group
  member, so per-key ordering is not available to it
  (`message-ordering-and-partitioning`). If the handler needs ordering, this choice is closed.
- **Platform retries are still at-least-once**, and often less configurable than a consumer
  loop's. The handler must be repeat-safe regardless (`delivery-semantics`, `idempotency`).

A long-lived consumer is simply the right answer for sustained throughput, pooled connections,
batching, and any ordering requirement. Choose FaaS when the work is bursty and rare enough
that idle cost dominates, the handler is stateless and connectionless, and a cold start fits
the budget.
