# Event loops, pollers and blocking detection

## The JDK's poller: an event loop you already run

A blocking socket read on a virtual thread does not perform a blocking syscall. The JDK puts
the channel in non-blocking mode; if the operation is not immediately ready it registers the
file descriptor with a **poller** and parks the virtual thread. A small number of dedicated
threads run `epoll_wait` (or `kqueue`) and unpark the virtual thread when the descriptor is
ready.

So a thread-per-request Loom service _is_ an event-loop architecture — the loop is in the
JDK, and the continuation it resumes is a real stack rather than a callback. That is the
whole design, stated in one sentence, and it is why arguments of the form "event loops are
inherently more efficient" do not survive contact with the implementation.

The knobs exist and are **internal** (`sun.nio.ch.Poller`): `jdk.pollerMode`,
`jdk.readPollers`, `jdk.writePollers` (counts must be powers of two). Treat them as
diagnostic knowledge, not as configuration: they are unspecified, they have changed between
releases, and a system that needs them tuned usually has a different problem. The one
legitimate use is explaining an observation — for example, poller threads visible in a dump
that nobody in the application created.

## The event-loop model, and what blocking one costs

Netty (and therefore Reactor Netty, Vert.x, WebFlux, gRPC-Java) runs a fixed set of event
loops, typically `2 × availableProcessors()`. Each loop owns many connections. One loop
thread executes: read from ready sockets, run handlers, write, repeat.

```text
Pooled platform thread blocked   → 1 request delayed,  pool has N-1 threads left
Virtual thread blocked           → 0 requests delayed,  the carrier is reused
Event-loop thread blocked        → EVERY connection on that loop delayed
```

With 8 loops and 10 000 connections, blocking one loop for 200 ms delays roughly 1 250
connections by up to 200 ms. That is why the same JDBC call is a minor inefficiency in one
model and an incident in another, and why "just add a `block()` here" is never a local
decision in a reactive stack.

The escape hatch is to move blocking work to a scheduler designed for it —
`Schedulers.boundedElastic()` in Reactor, `executeBlocking` in Vert.x — with the reminder
that this reintroduces a bounded pool and therefore a queue, which is the thing the reactive
stack was chosen to avoid.

## Finding blocking calls inside a non-blocking stack

Review does not find these; instrumentation does.

```java
// Test scope only. It instruments the JDK's blocking methods and fails when one is
// called on a thread marked non-blocking.
BlockHound.install(builder -> builder
        .allowBlockingCallsInside("com.example.LegacyBridge", "onlyKnownOffender"));
```

Run it in the integration test suite, not in production: it is a diagnostic agent with real
overhead, and its value is in failing a build. Every entry in the allow-list is a documented
decision, and a growing allow-list is the signal that the model no longer fits the code.

Complementary evidence, in order of cost:

```bash
# Wall-clock profile: shows time spent NOT on CPU, which is where blocking hides.
asprof -e wall -d 60 -f wall.html <pid>

# JFR: socket and file events carry the thread, so an event-loop thread
# doing file I/O is directly visible.
jfr print --events jdk.SocketRead,jdk.FileRead recording.jfr | grep -i 'nio-\|reactor-http'
```

A CPU profile will not find blocking, by construction. If the tooling in a runbook is
`-e cpu` only, the runbook cannot diagnose this class of problem.

## Reactor and virtual threads together

Reactor can run `Schedulers.boundedElastic()` on virtual threads by setting
`reactor.schedulers.defaultBoundedElasticOnVirtualThreads=true` (Java 21+). Note precisely
what that changes: the scheduler creates a **new virtual thread per task** and drops the
bounded pool and its idle-thread reuse. The word "bounded" stays in the name and the bound
does not stay in the behaviour — the default cap of `10 × cores` with a 100 000-task queue is
what disappears.

That is fine when the work it runs is genuinely I/O-bound and something else bounds
concurrency. It is a silent removal of a limit when `boundedElastic` was the thing protecting
a downstream. Decide which case you are in before setting the flag.

The event loops themselves stay on platform threads, and should: a loop thread is meant to be
runnable almost all the time, which is what a platform thread is good at.

## Diagnostics by model

| Question                              | Thread-per-request (Loom)              | Event loop                                      |
| ------------------------------------- | -------------------------------------- | ----------------------------------------------- |
| What is this request doing right now? | its stack, in the JSON thread dump     | not answerable — no thread owns the request     |
| Why is latency high?                  | wall-clock profile, per-request stacks | loop lag, queue depth per loop, operator timing |
| Is something blocking?                | pinning events, carrier growth         | BlockHound, loop lag spikes                     |
| Where is the concurrency limit?       | wherever you declared one              | prefetch/demand plus the schedulers' bounds     |
| What does a stack trace tell you?     | the whole logical operation            | one operator, plus assembly context if enabled  |

Reactor's `Hooks.onOperatorDebug()` and checkpoint operators exist precisely to recover the
causal context a stack trace loses; they carry real overhead, which is the honest measure of
what the model costs in diagnosability.

## Review checklist

- [ ] No blocking JDK call, JDBC call or lock acquisition on an event-loop thread
- [ ] BlockHound running in the integration suite, with an allow-list that is reviewed
- [ ] Blocking work offloaded to a scheduler with a stated bound
- [ ] `defaultBoundedElasticOnVirtualThreads` set only where the removed bound is replaced
- [ ] Wall-clock, not CPU, profiling in the runbook for latency questions
- [ ] Poller and scheduler internals used as explanation, never as configuration
