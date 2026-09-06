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
`synchronized` pinning gap. Native/foreign blocking and particular I/O paths can still occupy
carriers; verify the deployed runtime rather than assuming every wait unmounts. What did
**not** lose force is real backpressure: a producer
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

| Scenario                                                                     | Better choice                                                                       | Why                                                                                                            |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Fan-out of three downstream HTTP calls, simple aggregation, no rate mismatch | Virtual threads with structured concurrency                                         | There is no rate mismatch to resolve — it is concurrent I/O orchestration, with direct stack traces            |
| Kafka topic at 200K msg/s with a handler sustaining 20K msg/s                | Partition/scale consumers or reduce ingress; pause/resume only bounds local intake  | A persistent 10× deficit cannot be repaired by a client API; broker lag and retention become the durable queue |
| Simple REST endpoint, 1:1 request/response, no streaming                     | Virtual threads (thread-per-request)                                                | The historical motivation does not apply: a blocked virtual thread costs a stack chunk, not an OS thread       |
| Streaming export to a slow client                                            | Streaming driver/transport with verified demand propagation; reactive is one option | Test that slow writes bound database fetching; HTTP/2 or limitRate alone does not establish the link           |
| Parallel calls with timeout and partial-failure tolerance                    | Virtual threads with structured concurrency                                         | The same problem the reactive combinators solve, with imperative control flow                                  |
| Multi-stage pipeline with different per-stage rates (parse, enrich, persist) | Reactive                                                                            | Condition 3 applies: the bottleneck can migrate, and each operator already carries its own notion of demand    |

## Overflow strategies

| Strategy                                       | Real operator                                                                   | Behaviour on overflow                                                                 | When to use                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Unbounded buffer                               | `onBackpressureBuffer()` (no arguments)                                         | Accumulates item by item, no ceiling                                                  | Effectively never in production                                                           |
| Bounded buffer, overflow is an error (default) | `onBackpressureBuffer(int maxSize, Consumer<? super T> onOverflow)`             | Calls overflow callback, cancels upstream; error follows buffered drain               | Fail with an explicit recovery contract; error alone does not preserve data               |
| Bounded buffer, drop the newest                | `onBackpressureBuffer(maxSize, onOverflow, BufferOverflowStrategy.DROP_LATEST)` | Keeps the older items; discards the arrival; the sequence **continues**               | Series where old items still matter and a passing spike can lose only its edge            |
| Bounded buffer, drop the oldest                | `onBackpressureBuffer(maxSize, onOverflow, BufferOverflowStrategy.DROP_OLDEST)` | Evicts the oldest buffered item to make room; the sequence **continues**              | Queues where the newest item matters but a small window of context is still worth keeping |
| Pure drop, no buffer                           | `onBackpressureDrop()` / `onBackpressureDrop(Consumer<? super T>)`              | Any item emitted with no pending demand is discarded immediately; nothing accumulates | Telemetry and logs where losing individual items is acceptable                            |
| Keep only the latest                           | `onBackpressureLatest()`                                                        | A single slot; the newest item overwrites the previous unconsumed one                 | Gauges and dashboards — the current value matters, the intermediate history does not      |
| Fail immediately                               | `onBackpressureError()`                                                         | No pending downstream demand causes an overflow error                                 | Reject local overload explicitly; this operator requested unbounded upstream demand       |

The two-argument `onBackpressureBuffer(maxSize, onOverflow)` is the most common
misunderstanding in this table. The name suggests "buffer with drop"; the actual behaviour
without an explicit strategy is notify-and-error after draining the queued values in 3.7.5.
These overflow operators request unbounded demand upstream and implement a local policy;
overflow is not by itself evidence that the source violated Reactive Streams. Failing loudly
does not preserve records unless the source/consumer has a durable retry or acknowledgement
contract. `limitRate` batches upstream requests; it is not a requests-per-second limiter or
proof that an HTTP driver's flow control reaches the database cursor.

## Prefetch and concurrency limits

```java
// publishOn takes a prefetch — default Queues.SMALL_BUFFER_SIZE (256)
Flux.range(1, 1_000_000)
    .publishOn(Schedulers.parallel(), 64)   // smaller buffer, more handoffs
    .subscribe();

// flatMap takes maxConcurrency (default 256) and a per-inner-source prefetch (default 32)
Flux.range(1, 100)
    .flatMap(n -> remoteCall(n),
             16,   // at most 16 active inner subscriptions per outer subscription
             1)    // prefetch from EACH inner publisher, not the outer source
    .subscribe();
```

`remoteCall` must create lazy work whose lifetime is represented by the inner publisher.
An already-running future, eager call or detached task can escape this bound. Two outer
subscriptions each allow 16 inners; a shared dependency may require a separate global bulkhead.
Budget outer requests, per-inner prefetch, publishOn queues, payload bytes, client buffers and
scheduler queues separately. Replacing `flatMap` must preserve the required admission scope.

For a blocking operation, defer invocation itself:

```java
// Partial: blockingCall returns a value; errors flow through the Mono.
Mono.fromCallable(() -> blockingCall())
    .subscribeOn(Schedulers.boundedElastic());
```

`Mono.just(blockingCall())` calls it before the scheduler can intervene. Bounded elastic
offloads blocking but its shared task queue is not the application's admission budget.
Cancellation may request interruption without stopping the underlying call: releasing a
permit merely on reactive cancellation can admit replacement work while the old work runs.
Release resources according to actual ownership and termination, not just observer completion.

The only two properties `reactor.util.concurrent.Queues` exposes:

```java
System.setProperty("reactor.bufferSize.small", "256"); // Queues.SMALL_BUFFER_SIZE
System.setProperty("reactor.bufferSize.x", "32");      // Queues.XS_BUFFER_SIZE
```

There is no `reactor.bufferSize.large` in Reactor 3.7.5; it is not read, and
it fails silently in this version. Defaults are captured when `Queues` initializes, so prefer
explicit operator arguments; setting a property later may not change initialized defaults.

## Reactive Streams, the parts that constrain a design

| Interface        | Methods                                          | Normative rules                     |
| ---------------- | ------------------------------------------------ | ----------------------------------- |
| `Publisher<T>`   | `subscribe(Subscriber<? super T>)`               | produces signals under the protocol |
| `Subscriber<T>`  | `onSubscribe`, `onNext`, `onError`, `onComplete` | consumes serialized signals         |
| `Subscription`   | `request(long n)`, `cancel()`                    | controls demand and cancellation    |
| `Processor<T,R>` | `Publisher<R>` plus `Subscriber<T>`              | obeys both sides                    |

- Cumulative `onNext` count must not exceed cumulative positive requested demand per subscription.
  Outstanding demand is requested minus delivered, not buffered items or active business work.
- The valid sequence is `onSubscribe`, zero or more `onNext`, then at most one `onError` or
  `onComplete`. The terminal signals are mutually exclusive and need no item demand.
- Calls to one subscriber must be serialised — a custom operator has to guarantee this itself.
- Requests add up, saturating at `Long.MAX_VALUE`, which is treated as unbounded: at that
  point item demand is unbounded on that subscription; another resource admission limit may remain.
- Nonpositive requests on an active subscription must signal `IllegalArgumentException` under
  the Reactive Streams contract; verify custom publishers/adapters with the relevant TCK.
- `cancel()` must be idempotent and eventually stop signaling; already in-flight signals may
  race with it. It need not emit a terminal signal and does not prove external work stopped.

## Discard and resource ownership

For pooled buffers or other owned resources, distinguish consumed, overflowed, queued then
cancelled, and late signals. Use the operator's documented discard support and place
`doOnDiscard(type, cleanup)` downstream of the operators it must cover. Local overflow
callbacks and discard cleanup can both see the same item: make cleanup idempotent or assign
one release owner, and avoid releasing a value still used by another consumer. Use `using`/
`usingWhen` where subscription-scoped resource acquisition/cleanup fits; asynchronous cleanup
must itself be observed. A global dropped-signal hook is not a universal resource finalizer.

Test with zero/one-item demand, a full buffer, cancellation with buffered owned values,
two simultaneous subscriptions and work that ignores interruption. Assert counts/bytes and
exactly the intended release ownership, not merely eventual reactive completion.

## The three possible outcomes once a buffer fills

With arrival rate `λ` above sustainable service rate `μ`, a buffer of size `B` fills, and
exactly three things can follow:

1. **Unbounded buffer** — resident memory grows roughly linearly past that point; the only
   variable is how long until OOM.
2. **Bounded buffer with an overflow policy** — drop/replace can continue with measurable
   loss; an error policy instead terminates this subscription according to its drain policy.
3. **Admission control at the source** — a `request(n)` the publisher honours, a consumer
   `pause()`, a semaphore acquired before dispatch. Effective `λ` is forced towards `μ`, and
   the producer waits rather than the consumer drowning.

Only option 3 both bounds **in-memory** backlog and keeps every item, and it requires that
something upstream can slow down. A durable queue is a fourth architecture: it moves the
backlog to bounded storage and makes retention/replay/recovery explicit. Replacing a pipeline
without preserving either mechanism regresses to unbounded pending work. Admission itself
needs bounded waiters/deadlines; moving an unbounded queue into waiting producer tasks is not a fix.

## Sources

- [Reactive Streams JVM 1.0.4 rules](https://github.com/reactive-streams/reactive-streams-jvm/blob/v1.0.4/README.md)
- [Reactor 3.7.5 Flux API](https://projectreactor.io/docs/core/3.7.5/api/reactor/core/publisher/Flux.html) — demand, prefetch and discard support.
- [Reactor 3.7.5 bounded-buffer implementation](https://github.com/reactor/reactor-core/blob/v3.7.5/reactor-core/src/main/java/reactor/core/publisher/FluxOnBackpressureBuffer.java)
