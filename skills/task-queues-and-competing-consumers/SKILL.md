---
name: task-queues-and-competing-consumers
description: >
  Distributing work to a pool of interchangeable workers through a queue: the lease and
  visibility-timeout model, and why an expired lease duplicates work instead of failing it;
  sizing the timeout from the processing-time distribution; heartbeats and their failure
  mode; bounding the queue; priority starvation; and oldest-message-age rather than queue
  depth as the autoscaling signal. Use when two workers process one message although nothing
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
2. **Measure the handler's duration distribution**, then set the visibility timeout from its
   p99.9 — never its mean. Reading the distribution is `latency-statistics`; the selection
   arithmetic is `references/lease-model.md`.
3. **Pick one of the three responses to lease expiry** and write down which: size from the
   tail, extend by heartbeat while working, or make the handler repeat-safe (`idempotency`)
   and accept the overlap. Most systems need the third regardless.
4. **Bound the queue and decide what the producer sees** when it is full — a rejection the
   producer handles, not a silent block (`rate-limiting-and-load-shedding`).
5. **Bound worker concurrency at the poll**, not after it: acquire the permit before fetching
   the message. The limit itself is `concurrency-limiting-and-bulkheads`.
6. **Scale and alert on oldest-message-age.** Depth is a stock, the SLO is a time;
   `references/worker-loop-and-scaling.md` has both, plus the priority/ageing policy.
7. **Prove it by killing a worker mid-lease** and asserting redelivery, one observable side
   effect, and no lost item. A happy-path test proves nothing here.

## Decision block

```text
Use a task queue with competing consumers when:
- items are mutually independent, or all items for one entity are produced by one writer
  that waits for completion before producing the next
- the worker is stateless and any worker can take any item
- producer and consumer rates differ over time and a bounded buffer absorbs the difference
- the work is retryable and its side effect can be made repeat-safe

Avoid a task queue when:
- items for the same entity must be applied in production order — N competing consumers
  have no ordering between them, whatever the broker orders internally
- the same item must be consumed independently by several subscribers with their own
  positions, or must be replayable after it succeeded; here an acked message is gone

Prefer a partitioned log instead when:
- per-key ordering, replay, or several independent consumer groups are required
  (kafka-consumers-in-java)

Prefer leader election instead when:
- exactly one instance may run the work and correctness depends on that. A queue gives
  at-least-once assignment, never mutual exclusion (leader-election)

Prefer an in-process executor instead when:
- the work need not survive the process (executors-and-task-lifecycle)
```

## Rules

- **A visibility timeout is not a lock.** It bounds how long a message stays hidden; it excludes
  nobody, and two workers holding one item is the model working as designed. Mutual exclusion
  needs a fencing token the _resource_ checks (`leader-election`) — a lease alone does not
  survive a GC pause on its holder.
- Size the timeout from measured handler duration at p99.9, and re-derive it when the handler
  changes. A timeout set from the mean redelivers a predictable share of traffic forever, and
  that share appears in no error metric.
- A heartbeat that extends the lease has its own failure mode: a heartbeat thread that keeps
  renewing while the work thread is wedged means the item is **never** redelivered. Cap total
  lease time, and drive the heartbeat from observable progress, not from thread liveness.
- **A batch fetch starts every lease at once.** Receiving ten messages and processing them
  serially means the tenth has been leased for nine handler durations before it is touched.
  Size the prefetch so `batch × handler_p99 < timeout`, or fetch one at a time.
- `nack` with immediate requeue and no delay is a hot loop: the same message returns
  instantly, fails again, and the pool spends its capacity on one item. Requeue with a delay
  and a delivery counter, and route it to `poison-messages-and-dlq` at the threshold.
- Never write `while (true) { var msg = poll(); executor.submit(() -> handle(msg)); }` onto an
  unbounded executor. It drains the broker's queue into the heap: the queue's backpressure
  disappears, depth reads zero while the process is overloaded, and every in-flight lease is on
  the clock at once. Acquire the permit before `poll`.
- **Queue depth alone is the wrong autoscaling signal.** It says nothing about arrival or drain
  rate: 10 000 items draining at 50 000/s is 200 ms of backlog, 100 items at 0.1/s is over an
  hour. Scale and alert on **oldest-message-age** — the queue's actual latency — and keep depth
  as a capacity signal only. The depth/rate/wait arithmetic is `littles-law-and-queueing`.
- A single shared queue _is_ work stealing: workers pull, so heterogeneous task cost
  self-balances. Per-worker queues with push assignment do not, and need explicit stealing; the
  in-JVM mechanics are `forkjoinpool-and-work-stealing`.
- Strict priority starves the low class permanently while high-priority arrivals sustain above
  capacity. Bound the starvation explicitly — age items into a higher class after a stated time
  in queue, or give each class a weighted share of workers. "Rarely happens" is not a policy.
- On shutdown, stop polling **first**, then finish or return what is held. Returning an
  unfinished item (nack, or letting the lease lapse) beats being killed mid-handler with the
  lease running; the sequence and grace-period budget are `kubernetes-service-lifecycle`.
- An unbounded queue converts a throughput problem into an out-of-memory or unbounded-latency
  one. Bound it, and make the producer's rejection a designed path
  (`rate-limiting-and-load-shedding`).

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
