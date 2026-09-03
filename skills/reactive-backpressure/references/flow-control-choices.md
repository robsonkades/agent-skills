# Choosing where and how to control flow

## Concurrency versus flow control

| Question                                                   | Axis         | What answers it                                                          | What happens if it is ignored                                                                              |
| ---------------------------------------------------------- | ------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Does a blocking call tie up the whole thread?              | Concurrency  | Virtual threads — unmounting frees the carrier                           | Scarce platform threads sit waiting; throughput falls for lack of threads, not memory                      |
| How many work items may be pending at once?                | Flow control | Reactive backpressure, or an explicit limiter (semaphore, bounded queue) | Pending work grows without a ceiling until OOM, or until GC dominates CPU time                             |
| Is the producer structurally faster than the consumer?     | Flow control | Nothing about the concurrency model decides this — it is rate arithmetic | The mismatch simply migrates from "explicit buffer full" to "implicit queue of suspended tasks full"       |
| Must an I/O task wait without occupying a whole OS thread? | Concurrency  | Virtual threads, or historically the reactive model                      | Under the old model this motivated much of the reactive design; that specific motivation no longer decides |

Much of Project Reactor's historical justification — do not block an expensive platform
thread while waiting on I/O — lost force as a standalone argument once virtual threads made
a blocked thread cheap (JEP 444, final in JDK 21) and JEP 491 (JDK 24) closed the
`synchronized` pinning gap. What did **not** lose force is real backpressure: a producer
structurally faster than its consumer. That was never about the cost of a thread.

## The three conditions

These signals make reactive backpressure progressively more valuable; they need not all hold:

1. **Sustained rate mismatch** — the producer generates items faster than the consumer
   processes them, persistently under normal load, not as an occasional burst a small buffer
   absorbs.
2. **End-to-end propagation** — flow control must cross a process or protocol boundary, for
   example a slow HTTP/2 client that must actually slow the server's reads from the database,
   not merely the response write.
3. **Multiple stages at different rates** — parse, enrich, validate, persist, each with its
   own sustainable rate, where the bottleneck can move between stages as load changes.

With none present — a parallel fan-out with an aggregated response, a simple request/response
endpoint, an isolated I/O task — thread-per-request is often simpler, subject to the team's
existing stack and migration cost.

## Scenario comparison

| Scenario                                                                     | Better choice                                                                      | Why                                                                                                            |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Fan-out of three downstream HTTP calls, simple aggregation, no rate mismatch | Virtual threads with structured concurrency                                        | There is no rate mismatch to resolve — it is concurrent I/O orchestration, with direct stack traces            |
| Kafka topic at 200K msg/s with a handler sustaining 20K msg/s                | Partition/scale consumers or reduce ingress; pause/resume only bounds local intake | A persistent 10× deficit cannot be repaired by a client API; broker lag and retention become the durable queue |
| Simple REST endpoint, 1:1 request/response, no streaming                     | Virtual threads (thread-per-request)                                               | The historical motivation does not apply: a blocked virtual thread costs a stack chunk, not an OS thread       |
| Streaming export of millions of rows to a client slower than the database    | Reactive with `limitRate` and end-to-end backpressure over HTTP/2                  | Flow control must cross the network protocol; thread-per-request has no built-in "send me N more"              |
| Parallel calls with timeout and partial-failure tolerance                    | Virtual threads with structured concurrency                                        | The same problem the reactive combinators solve, with imperative control flow                                  |
| Multi-stage pipeline with different per-stage rates (parse, enrich, persist) | Reactive                                                                           | Condition 3 applies: the bottleneck can migrate, and each operator already carries its own notion of demand    |

## Overflow strategies

| Strategy                                                                | Real operator                                                                   | Behaviour on overflow                                                                         | When to use                                                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Unbounded buffer                                                        | `onBackpressureBuffer()` (no arguments)                                         | Accumulates item by item, no ceiling                                                          | Effectively never in production                                                           |
| Bounded buffer, overflow is an error (the **default** with no strategy) | `onBackpressureBuffer(int maxSize, Consumer<? super T> onOverflow)`             | On full: calls `onOverflow` for the excess item and **terminates the sequence with an error** | When losing data is unacceptable and failing loudly beats falling silently behind         |
| Bounded buffer, drop the newest                                         | `onBackpressureBuffer(maxSize, onOverflow, BufferOverflowStrategy.DROP_LATEST)` | Keeps the older items; discards the arrival; the sequence **continues**                       | Series where old items still matter and a passing spike can lose only its edge            |
| Bounded buffer, drop the oldest                                         | `onBackpressureBuffer(maxSize, onOverflow, BufferOverflowStrategy.DROP_OLDEST)` | Evicts the oldest buffered item to make room; the sequence **continues**                      | Queues where the newest item matters but a small window of context is still worth keeping |
| Pure drop, no buffer                                                    | `onBackpressureDrop()` / `onBackpressureDrop(Consumer<? super T>)`              | Any item emitted with no pending demand is discarded immediately; nothing accumulates         | Telemetry and logs where losing individual items is acceptable                            |
| Keep only the latest                                                    | `onBackpressureLatest()`                                                        | A single slot; the newest item overwrites the previous unconsumed one                         | Gauges and dashboards — the current value matters, the intermediate history does not      |
| Fail immediately                                                        | `onBackpressureError()`                                                         | First emission with no pending demand raises an overflow error                                | Strict contracts where unhonoured backpressure is a downstream programming bug            |

The two-argument `onBackpressureBuffer(maxSize, onOverflow)` is the most common
misunderstanding in this table. The name suggests "buffer with drop"; the actual behaviour
without an explicit strategy is notify-and-terminate.

## Prefetch and concurrency limits

```java
// publishOn takes a prefetch — default Queues.SMALL_BUFFER_SIZE (256)
Flux.range(1, 1_000_000)
    .publishOn(Schedulers.parallel(), 64)   // smaller buffer, more handoffs
    .subscribe();

// flatMap takes maxConcurrency (default 256) and a per-inner-source prefetch (default 32)
Flux.range(1, 100)
    .flatMap(n -> remoteCall(n),
             16,   // maxConcurrency — at most 16 simultaneous calls
             1)    // prefetch — request one from the source at a time
    .subscribe();
```

`maxConcurrency` is the flow-control knob in that call. A refactor that removes `flatMap`
must replace it with something equivalent, or the ceiling is gone.

The only two properties `reactor.util.concurrent.Queues` exposes:

```java
System.setProperty("reactor.bufferSize.small", "256"); // Queues.SMALL_BUFFER_SIZE
System.setProperty("reactor.bufferSize.x", "32");      // Queues.XS_BUFFER_SIZE
```

There is no `reactor.bufferSize.large`. Setting it has never been read by any version, and
it fails silently.

## Reactive Streams, the parts that constrain a design

| Interface        | Methods                                          | Normative rules                     |
| ---------------- | ------------------------------------------------ | ----------------------------------- |
| `Publisher<T>`   | `subscribe(Subscriber<? super T>)`               | produces signals under the protocol |
| `Subscriber<T>`  | `onSubscribe`, `onNext`, `onError`, `onComplete` | consumes serialized signals         |
| `Subscription`   | `request(long n)`, `cancel()`                    | controls demand and cancellation    |
| `Processor<T,R>` | `Publisher<R>` plus `Subscriber<T>`              | obeys both sides                    |

- A publisher may never deliver more items than the outstanding sum of `request(n)`.
- `onNext`, `onError` and `onComplete` are mutually exclusive; the latter two are terminal.
- Calls to one subscriber must be serialised — a custom operator has to guarantee this itself.
- Requests add up, saturating at `Long.MAX_VALUE`, which is treated as unbounded: at that
  point no admission control remains.
- `cancel()` is best-effort and idempotent.

## The three possible outcomes once a buffer fills

With arrival rate `λ` above sustainable service rate `μ`, a buffer of size `B` fills, and
exactly three things can follow:

1. **Unbounded buffer** — resident memory grows roughly linearly past that point; the only
   variable is how long until OOM.
2. **Bounded buffer with an overflow policy** — output throughput stabilises at `μ`, with
   loss that is visible and measurable.
3. **Admission control at the source** — a `request(n)` the publisher honours, a consumer
   `pause()`, a semaphore acquired before dispatch. Effective `λ` is forced towards `μ`, and
   the producer waits rather than the consumer drowning.

Only option 3 both bounds **in-memory** backlog and keeps every item, and it requires that
something upstream can slow down. A durable queue is a fourth architecture: it moves the
backlog to bounded storage and makes retention/replay/recovery explicit. Replacing a pipeline
without preserving either mechanism regresses to unbounded pending work.
