---
name: task-queues-and-competing-consumers
description: >
  Distributing work to a pool of interchangeable workers through a queue: the lease and
  visibility-timeout model, and why an expired lease can duplicate work instead of failing it;
  sizing the timeout from processing plus prefetch wait; heartbeats and their failure mode;
  admission and retention bounds; priority starvation; and age, backlog, arrival and drain
  rate as autoscaling signals. Use when two workers process one message although nothing
  retried or failed, when a lease is relied on for mutual exclusion, when a handler outlives
  its lease, when a queue has no maximum depth, when autoscaling is driven by queue depth,
  or when a poll loop feeds an unbounded executor. Not ack placement (delivery-semantics),
  repeat-safe handlers (idempotency), the message that never succeeds
  (poison-messages-and-dlq), queue arithmetic (littles-law-and-queueing), the concurrency
  limit (concurrency-limiting-and-bulkheads), shedding (rate-limiting-and-load-shedding), or
  the Kafka consumer group, a log (kafka-consumers-in-java).
---

# Task Queues And Competing Consumers

## Purpose

Decide whether work belongs on a queue consumed by a pool of interchangeable workers, and
then operate that pool so the queue's own mechanics do not corrupt the work. The queue owns
assignment through pull or broker delivery/credit. Ready workers can take more work, but
prefetch, task size, priority and dispatch policy determine actual balance.

The failure this prevents is silent double-execution. In an SQS-style visibility model, receiving
does not remove a message; it hides it for a bounded time, and when that time expires it becomes visible
again for another worker. If the first worker is still running — slow dependency, long GC
pause, a batch that grew — another receive can start concurrent processing without an
application retry or exception. Expiry permits redelivery; a receiver must actually take the
message for this overlap to occur. **A visibility timeout does not establish exclusive
execution or one durable effect.**

## Workflow

Start with the requested decision: a source-level explanation, an existing design review, or
a change to intake, leases, effects, recovery or scaling. Use supplied evidence; an adequate
design can close with no change. Apply the steps and output below only to affected claims.
A narrow lease explanation need not invent a worker implementation or crash campaign.

Inspect relevant broker/queue type, acknowledgement mode, client/framework and Java versions, prefetch,
retention and redelivery configuration. RabbitMQ channel acknowledgements and JMS sessions
are not SQS receipt leases. Preserve the deployed baseline. Missing evidence is unknown;
report the affected ownership/ack/recovery path, assumptions and actual validation. Do not
infer deployed configuration or recovery guarantees from documentation alone. Run crash/requeue
experiments only in isolated or already authorized environments.

1. **Run the decision block below**: interchangeable workers and independent items, or explicit
   per-key lanes with ordering/recovery semantics.
2. **Measure lease exposure**, not just handler time: prefetch/permit wait + queue client work +
   handler + acknowledgement, under degraded dependencies and pauses. Select an explicit
   premature-redelivery versus crash-recovery objective; there is no universal percentile.
3. **Choose the effect and recovery contract.** Use repeat-safe effects (`idempotency`),
   resource-side concurrency guards, or explicitly accepted duplicate effects as appropriate.
   Sizing from exposure and bounded heartbeats reduce expiry overlap; neither replaces a
   required effect guarantee. Preserve an adequate existing combination.
4. **Bound accepted backlog by age, bytes/items, retention and recovery capacity.** If the
   managed broker cannot reject at a depth, enforce admission upstream and specify what the
   producer sees (`rate-limiting-and-load-shedding`).
5. **Bound all held work**: reserve permits before pulling, or use supported broker credit,
   bounded prefetch/dispatch and an equivalent intake limit. Account for running, queued and
   unresolved receive ownership, including lease time spent waiting locally. Handle receive
   failure and submission rejection without leaking capacity or deliveries. The limit is
   `concurrency-limiting-and-bulkheads`.
6. **Choose a controller for the workload.** One normalized metric can drive scaling when its
   capacity relationship and guards are established; retain age, rates and saturation for
   relevant diagnosis and SLO coverage. Broker age can be approximate or reset by redelivery.
   `references/worker-loop-and-scaling.md` gives the control model.
7. **Validate the affected failure windows.** For a new crash-recovery claim, a bounded
   isolated worker failure can test redelivery, the declared effect contract and item
   reconciliation. Reuse adequate relevant evidence; neither happy paths nor a few fault cases
   prove every failure mode. State remaining uncertainty instead of requiring unrelated tests.

## Decision block

```text
Use a task queue with competing consumers when:
- items are independent, commute, or use the ordering/concurrency controls their effects need;
  explicit per-key lanes must preserve ownership through retry and recovery
- any eligible worker can safely take the item; local caches or owned state are valid when
  their routing, reconstruction and handoff preserve the effect contract
- producer and consumer rates differ over time and a bounded buffer absorbs the difference
- the work's retry, duplicate and loss policy fits the delivery contract

Avoid a task queue when:
- correctness needs an order the queue cannot express or preserve through retry/redelivery;
  FIFO/message-group queues can serialize a key, but head-of-line blocking is the cost
- ordinary acknowledged messages must remain historically replayable but no retained log,
  archive or republication path supplies that requirement

For independent subscribers:
- a supported topic/exchange with a queue or durable subscription per subscriber can work;
  where a subscription permits multiple consumers, they share that subscription's work

Prefer a partitioned log instead when:
- retained ordered history and independently replayable positions fit the workload
  (kafka-consumers-in-java); per-key ordering or fanout alone does not require a log

Prefer fenced ownership or resource-side concurrency control when:
- stale concurrent execution would violate correctness. Neither a queue lease nor leader
  election alone proves exactly one effect (leader-election)

Prefer an in-process executor instead when:
- the work need not survive the process (executors-and-task-lifecycle)
```

## Rules

- **A visibility timeout is not a lock.** It controls delivery eligibility, not a running
  handler's authority. Protect effects with the actual resource's transaction, conditional
  transition or fencing contract as needed (`leader-election` for elected ownership).
  Fencing rejects old epochs after a newer one is accepted; it neither stops old computation
  nor deduplicates an earlier committed effect. A failed version check alone does not resolve
  an ambiguous earlier attempt of the same intent (`idempotency`).
- Size from the measured **receive-to-ack** distribution plus safety/resolution margin, against
  a stated premature-redelivery error budget and maximum crash-recovery delay. Segment by task
  class; censored timings from already-expired work do not reveal the unseen tail.
- A heartbeat that extends the lease can keep wedged work hidden until renewal stops or a
  broker limit is reached. Cap total
  lease time and use credible progress where available, never thread liveness as proof of progress.
- **A batch fetch starts every lease at receive time.** For `B` records processed serially, the
  last sees the sum of preceding durations; with `C` handler slots it waits behind roughly
  `ceil(B/C)-1` waves, but correlated tails and scheduling matter. Measure receive-to-start and
  receive-to-ack, reduce prefetch, or extend per message—do not multiply one percentile and call
  it a probabilistic bound.
- `nack` with immediate requeue and no delay is a hot loop: the same message returns
  instantly, fails again, and the pool spends its capacity on one item. Requeue with a delay
  and a delivery counter, and route it to `poison-messages-and-dlq` at the threshold.
- Never write `while (true) { var msg = poll(); executor.submit(() -> handle(msg)); }` onto an
  unbounded executor. It drains the broker's queue into the heap: the queue's backpressure
  disappears, depth reads zero while the process is overloaded, and every in-flight lease is on
  the clock at once. Acquire capacity before `poll`, or demonstrate an equivalent finite bound
  covering local buffering, outstanding receives and rejection recovery.
- Queue depth alone cannot predict wait, while oldest-message-age alone can be stale,
  approximate, reset by retry, or dominated by one poison item. Use age for SLO alerting and
  appropriate controller inputs/guards—visible/in-flight depth, arrival/drain rate, service-time
  distribution, saturation, startup delay and downstream capacity. A single normalized control
  metric need not consume every diagnostic signal. Validate relevant stability and scale-down behavior.
- A shared queue can balance work dynamically, but it is not the per-worker-deque work-stealing
  algorithm. Prefetch can strand work behind slow handlers; measure distribution and credit.
  The in-JVM mechanics are `forkjoinpool-and-work-stealing`.
- Strict priority can starve the low class while higher-priority eligible work stays backlogged.
  If the low class has a service guarantee, supply ageing or reserved capacity with bounded
  competing demand. An explicitly best-effort class may instead accept starvation and expiry;
  record that policy and observe dropped/expired work. "Rarely happens" is not a policy.
- On shutdown, stop intake and resolve polls racing with shutdown, then drain or cancel held
  work. Releasing a delivery while its old handler still runs invites overlap; retain resource
  guards/idempotency. Interruption does not prove termination. The grace budget and ordering
  are `kubernetes-service-lifecycle`.
- A durable broker may intentionally have no hard depth rejection, but accepted backlog is never
  economically unbounded. Set maximum useful age, retention/storage quotas and catch-up/recovery
  objectives; shed or defer admission before work becomes guaranteed-expired.

## Security and tenant isolation

- Authenticate producers/workers and authorize queue, task type and tenant; never trust a
  priority, callback URL, class name or serialized payload merely because it came from a queue.
- Validate size/schema before leasing expensive capacity. Encrypt sensitive payloads, minimize
  DLQ copies and define deletion/retention for primary, retry and dead-letter queues.
- Apply per-tenant concurrency/quotas so one tenant cannot consume every worker or age another
  tenant past its deadline. Preserve trace, task, attempt and idempotency identifiers without
  putting secrets or raw PII in metric labels.

## Primary references

- [Amazon SQS visibility timeout](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html) — redelivery, in-flight limits, FIFO groups and extension limits.
- [RabbitMQ 4.2 consumer acknowledgements](https://www.rabbitmq.com/docs/4.2/confirms) — AMQP 0-9-1 delivery acknowledgement and requeue semantics, which are not identical to SQS visibility.
- [RabbitMQ 4.2 exchanges](https://www.rabbitmq.com/docs/4.2/exchanges) — fanout routes copies to bound destinations; durability and subscription retention remain separate choices.
- [JMS acknowledgement modes](https://jakarta.ee/specifications/messaging/3.1/jakarta-messaging-spec-3.1) — session and acknowledgement semantics.

## References

- [The lease model](references/lease-model.md) — choosing the visibility timeout from the
  processing-time distribution, the duplicate-work window drawn as a sequence, heartbeat
  extension with its failure mode and its cap, and what to do instead of treating a lease as a
  lock. Read when setting or reviewing a visibility timeout, or when duplicate side effects
  appear with no retry in the code.
- [Worker loop and scaling](references/worker-loop-and-scaling.md) — a competing-consumer ownership
  protocol with bounded concurrency, lease heartbeat and drain-on-shutdown; the autoscaling
  signal against the wrong ones; priority with ageing; and a test that kills a worker mid-lease.
  Read before writing or reviewing a worker, or when deciding what the pool scales on.
