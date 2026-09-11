# Event loops, pollers and blocking detection

## The JDK's poller: an event loop you already run

A supported socket wait on an unpinned virtual thread can release the carrier. HotSpot puts
the channel in non-blocking mode; if the operation is not immediately ready it registers the
file descriptor with a **poller** and parks the virtual thread. Poller topology is
OS/release-specific: OpenJDK 25 uses epoll on Linux, kqueue on macOS and wepoll on Windows.
Its Linux default uses virtual sub-pollers plus a platform master when continuations are
supported; not every poller is a dedicated platform thread. Readiness wakes a waiter to
retry I/O, not to assume a complete response is available.

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
Pooled platform thread blocked   → caller waits; one worker unavailable to queued tasks
Virtual thread unmounted         → caller still waits; carrier can run other tasks
Event-loop thread blocked        → callbacks for connections on that loop cannot progress
```

If connections were evenly assigned across 8 loops, one blocked loop could affect roughly
one eighth of them; active connections and callbacks are rarely uniform, so `10 000 / 8` is
only a capacity illustration. Measure event-loop lag and affected requests rather than
turning this arithmetic into an incident estimate.

The escape hatch is to move blocking work to a scheduler designed for it —
`Schedulers.boundedElastic()` in Reactor, `executeBlocking` in Vert.x — with the reminder
that offloading has a concurrency limit, queue and rejection behavior. Reactive pipelines
can already contain queues; offloading does not eliminate overload.

For Reactor, defer the call with `Mono.fromCallable(() -> client.call())` and apply
`subscribeOn(Schedulers.boundedElastic())` to that source. This is a partial expression
using the project's Reactor dependency and client, not a standalone program.
`Mono.just(client.call())` executes eagerly; a downstream `publishOn` cannot move that call.
Verify the actual call's thread in a test and measure queue wait, rejection and loop lag.
Do not assume cancellation interrupts a driver or releases its connection: configure its
timeout and keep resource cleanup tied to completion of the underlying operation.

## Finding blocking calls inside a non-blocking stack

Use source review to locate candidate calls and instrumentation to exercise those paths.
Neither proves the absence of blocking in unexercised or uninstrumented native code.

```java
// Partial test setup; requires a compatible reactor-tools BlockHound dependency.
// Test scope only. It instruments known blocking methods and fails when one is
// called on a thread marked non-blocking.
BlockHound.install();
```

When compatible instrumentation is available or its addition is in scope, use it in tests:
it is a diagnostic agent with real overhead. Otherwise use source inspection, call-thread
assertions and loop-lag/wall-clock evidence, recording detection gaps. Every allow-list entry
is a documented decision; a growing allow-list requires review rather than automatic suppression.
If using BlockHound, verify its version supports the test JDK and its required JVM flags
(the project's documentation describes `-XX:+AllowRedefinitionToAddDeleteMethods` for JDK
13+). Include a negative control: a known blocking call on a marked non-blocking thread
must fail, then the offloaded path must pass. Do not allowlist the defect being investigated.

Complementary evidence, in order of cost:

```bash
# Wall-clock profile: shows time spent NOT on CPU, which is where blocking hides.
asprof -e wall -d 60 -f wall.html <pid>

# JFR: socket and file events carry the thread, so an event-loop thread
# doing file I/O is directly visible.
jfr print --events jdk.SocketRead,jdk.FileRead recording.jfr | grep -i 'nio-\|reactor-http'
```

A CPU profile cannot account for off-CPU waiting; it remains useful to distinguish CPU
work from stalls. A runbook with only `-e cpu` lacks the evidence needed to attribute waits.
The shell examples assume a POSIX shell, installed compatible tools, attach permissions
and an existing JFR recording with the relevant events enabled. Replace name filters with
observed thread names; empty filtered output is not proof that no blocking occurred.

## Reactor and virtual threads together

Reactor can run `Schedulers.boundedElastic()` on virtual threads by setting
`reactor.schedulers.defaultBoundedElasticOnVirtualThreads=true` (Reactor 3.6.0+, Java 21+).
Verify the resolved Reactor release and set the property before scheduler initialization.
Note precisely
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
- [ ] Blocking detection has exercised the relevant path; compatible BlockHound tests, if used,
      include the known-blocking control and a reviewed allow-list
- [ ] Blocking work offloaded to a scheduler with a stated bound
- [ ] `defaultBoundedElasticOnVirtualThreads` assessed with its retained caps and queues
- [ ] Wall-clock, not CPU, profiling in the runbook for latency questions
- [ ] Poller and scheduler internals used as explanation, never as configuration

## Sources

- [OpenJDK 25 Poller modes](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/share/classes/sun/nio/ch/Poller.java)
  and the [Linux](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/linux/classes/sun/nio/ch/DefaultPollerProvider.java),
  [macOS](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/macosx/classes/sun/nio/ch/DefaultPollerProvider.java)
  and [Windows](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/windows/classes/sun/nio/ch/DefaultPollerProvider.java)
  providers: implementation-specific readiness mechanisms and platform/virtual poller placement.
- [Reactor blocking-call FAQ](https://projectreactor.io/docs/core/release/reference/faq.html#faq.wrap-blocking):
  deferred source and `subscribeOn` placement.
- [Reactor threading and schedulers](https://projectreactor.io/docs/core/release/reference/coreFeatures/schedulers.html):
  boundedElastic implementations and their version requirements; check the matching
  reference for the project's release before relying on defaults.
- [BlockHound project documentation](https://github.com/reactor/BlockHound):
  instrumentation scope, thread marking and JVM compatibility requirements.
