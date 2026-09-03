---
name: task-queues-and-competing-consumers
description: >
  Distributing work to a pool of interchangeable workers through a queue: the lease and
  visibility-timeout model, and why an expired lease duplicates work instead of failing it;
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
assignment: a worker pulls, so the fastest worker gets the next item and no scheduler has to
know how loaded anyone is.

The failure this prevents is the silent double-execution. A worker does not remove a message;
it **leases** it for a bounded time, and when that time expires the message becomes visible
again for another worker. If the first worker is still running — slow dependency, long GC
pause, a batch that grew — the message is now being processed twice, concurrently, with
nothing failing and nothing retrying. **The visibility timeout is a bet on how long the work
takes, and losing the bet duplicates the work.**

## Workflow

1. **Run the decision block below** before designing anything: independent items, stateless
   workers, no ordering requirement across items.
2. **Measure lease exposure**, not just handler time: prefetch/permit wait + queue client work +
   handler + acknowledgement, under degraded dependencies and pauses. Select an explicit
   premature-redelivery versus crash-recovery objective; there is no universal percentile.
3. **Pick one of the three responses to lease expiry** and write down which: size from the
   tail, extend by heartbeat while working, or make the handler repeat-safe (`idempotency`)
   and accept the overlap. Most systems need the third regardless.
4. **Bound accepted backlog by age, bytes/items, retention and recovery capacity.** If the
   managed broker cannot reject at a depth, enforce admission upstream and specify what the
   producer sees (`rate-limiting-and-load-shedding`).
5. **Bound worker concurrency at the poll**, not after it: acquire the permit before fetching
   the message. The limit itself is `concurrency-limiting-and-bulkheads`.
6. **Scale from a signal set.** Age is closest to a latency SLO, but combine it with depth,
   arrival/drain rate, in-flight saturation and startup delay; broker age can be approximate or
   reset by redelivery. `references/worker-loop-and-scaling.md` gives the control model.
7. **Prove it by killing a worker mid-lease** and asserting redelivery, one observable side
   effect, and no lost item. A happy-path test proves nothing here.

## Decision block

```text
Use a task queue with competing consumers when:
- items commute, or ordering is explicitly enforced by a broker group/partition and the
  worker preserves that lane's ownership
- the worker is stateless and any worker can take any item
- producer and consumer rates differ over time and a bounded buffer absorbs the difference
- the work is retryable and its side effect can be made repeat-safe

Avoid a task queue when:
- correctness needs an order the queue cannot express or preserve through retry/redelivery;
  FIFO/message-group queues can serialize a key, but head-of-line blocking is the cost
- the same item must be consumed independently by several subscribers with their own
  positions, or must be replayable after it succeeded; here an acked message is gone

Prefer a partitioned log instead when:
- per-key ordering, replay, or several independent consumer groups are required
  (kafka-consumers-in-java)

Prefer fenced ownership or resource-side concurrency control when:
- stale concurrent execution would violate correctness. Neither a queue lease nor leader
  election alone proves exactly one effect (leader-election)

Prefer an in-process executor instead when:
- the work need not survive the process (executors-and-task-lifecycle)
```

## Rules

- **A visibility timeout is not a lock.** It bounds how long a message stays hidden; it excludes
  nobody, and two workers holding one item is the model working as designed. Mutual exclusion
  needs a fencing token the _resource_ checks (`leader-election`) — a lease alone does not
  survive a GC pause on its holder.
- Size from the measured **receive-to-ack** distribution plus safety/resolution margin, against
  a stated premature-redelivery error budget and maximum crash-recovery delay. Segment by task
  class; censored timings from already-expired work do not reveal the unseen tail.
- A heartbeat that extends the lease has its own failure mode: a heartbeat thread that keeps
  renewing while the work thread is wedged means the item is **never** redelivered. Cap total
  lease time, and drive the heartbeat from observable progress, not from thread liveness.
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
  the clock at once. Acquire the permit before `poll`.
- Queue depth alone cannot predict wait, while oldest-message-age alone can be stale,
  approximate, reset by retry, or dominated by one poison item. Use age for SLO alerting and a
  controller signal set—visible/in-flight depth, arrival/drain rate, service-time distribution,
  saturation, startup delay and downstream capacity. Validate stability and scale-down hysteresis.
- A single shared queue _is_ work stealing: workers pull, so heterogeneous task cost
  self-balances. Per-worker queues with push assignment do not, and need explicit stealing; the
  in-JVM mechanics are `forkjoinpool-and-work-stealing`.
- Strict priority starves the low class permanently while high-priority arrivals sustain above
  capacity. Bound the starvation explicitly — age items into a higher class after a stated time
  in queue, or give each class a weighted share of workers. "Rarely happens" is not a policy.
- On shutdown, stop polling **first**, then finish or return what is held. Returning an
  unfinished item (nack, or letting the lease lapse) beats being killed mid-handler with the
  lease running; the sequence and grace-period budget are `kubernetes-service-lifecycle`.
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
- [RabbitMQ consumer acknowledgements](https://www.rabbitmq.com/docs/confirms) — delivery acknowledgement and requeue semantics, which are not identical to SQS visibility.
- [JMS acknowledgement modes](https://jakarta.ee/specifications/messaging/3.1/jakarta-messaging-spec-3.1) — session and acknowledgement semantics.

## References

- [The lease model](references/lease-model.md) — choosing the visibility timeout from the
  processing-time distribution, the duplicate-work window drawn as a sequence, heartbeat
  extension with its failure mode and its cap, and what to do instead of treating a lease as a
  lock. Read when setting or reviewing a visibility timeout, or when duplicate side effects
  appear with no retry in the code.
- [Worker loop and scaling](references/worker-loop-and-scaling.md) — a competing-consumer loop
  in Java with bounded concurrency, lease heartbeat and drain-on-shutdown; the autoscaling
  signal against the wrong ones; priority with ageing; and a test that kills a worker mid-lease.
  Read before writing or reviewing a worker, or when deciding what the pool scales on.
