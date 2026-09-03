# Event loops, pollers and blocking detection

## The JDK's poller: an event loop you already run

A blocking socket read on a virtual thread does not perform a blocking syscall. The JDK puts
the channel in non-blocking mode; if the operation is not immediately ready it registers the
file descriptor with a **poller** and parks the virtual thread. A small number of dedicated
threads run `epoll_wait` (or `kqueue`) and unpark the virtual thread when the descriptor is
ready.

So the current JDK implementation uses readiness pollers beneath blocking socket APIs on
virtual threads. That does not make the application programming model an event-loop model,
nor prove equal cost: dispatch, buffer management, wakeups, continuation state and framework
operators remain different and must be measured.

The knobs exist and are **internal** (`sun.nio.ch.Poller`): `jdk.pollerMode`,
`jdk.readPollers`, `jdk.writePollers` (counts must be powers of two). Treat them as
diagnostic knowledge, not as configuration: they are unspecified, they have changed between
releases, and a system that needs them tuned usually has a different problem. The one
legitimate use is explaining an observation — for example, poller threads visible in a dump
that nobody in the application created.

## The event-loop model, and what blocking one costs

Netty-based stacks run configured event-loop groups; defaults are version-, transport- and
framework-specific and are often derived from available processors. Each loop can own many
connections. One loop
thread executes: read from ready sockets, run handlers, write, repeat.

```text
Pooled platform thread blocked   → 1 request delayed,  pool has N-1 threads left
Virtual thread blocked           → 0 requests delayed,  the carrier is reused
Event-loop thread blocked        → EVERY connection on that loop delayed
```

If connections were evenly assigned across 8 loops, one blocked loop could affect roughly
one eighth of them; active connections and callbacks are rarely uniform, so `10 000 / 8` is
only a capacity illustration. Measure event-loop lag and affected requests rather than
turning this arithmetic into an incident estimate.

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
what that changes: the scheduler creates a **new virtual thread per task** rather than
reusing an idle platform-thread pool. The concurrency cap and deferred-task bound remain;
current Reactor defaults derive the cap from `10 × availableProcessors` and expose a
per-backing-thread queue-size setting. Past the bound, scheduling can reject work.

The scheduler-wide cap is not a safe proxy for a database pool or vendor quota. Preserve a
resource-local limit, measure pending/rejected tasks, and verify the Reactor version's exact
defaults before setting the flag.

The event loops themselves stay on platform threads, and should: a loop thread is meant to be
runnable almost all the time, which is what a platform thread is good at.

## Diagnostics by model

| Question                              | Thread-per-request (Loom)               | Event loop                                                                 |
| ------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------- |
| What is this request doing right now? | often its stack in the JSON thread dump | requires trace/context/operator evidence; no thread owns its full lifetime |
| Why is latency high?                  | wall-clock profile, per-request stacks  | loop lag, queue depth per loop, operator timing                            |
| Is something blocking?                | pinning events, carrier growth          | BlockHound, loop lag spikes                                                |
| Where is the concurrency limit?       | wherever you declared one               | prefetch/demand plus the schedulers' bounds                                |
| What does a stack trace tell you?     | the whole logical operation             | one operator, plus assembly context if enabled                             |

Reactor's `Hooks.onOperatorDebug()` and checkpoint operators exist precisely to recover the
causal context a stack trace loses; they carry real overhead, which is the honest measure of
what the model costs in diagnosability.

## Review checklist

- [ ] No blocking JDK call, JDBC call or lock acquisition on an event-loop thread
- [ ] BlockHound running in the integration suite, with an allow-list that is reviewed
- [ ] Blocking work offloaded to a scheduler with a stated bound
- [ ] `defaultBoundedElasticOnVirtualThreads` assessed with its retained caps and queues
- [ ] Wall-clock, not CPU, profiling in the runbook for latency questions
- [ ] Poller and scheduler internals used as explanation, never as configuration
