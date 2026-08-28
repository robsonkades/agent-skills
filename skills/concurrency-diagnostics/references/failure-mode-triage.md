# Failure-mode catalogue

Each entry: how it presents, the measurement that confirms it (not the one that suggests it),
the fix, and what stops it recurring. Where another skill owns the depth, it is named.

## Deadlock

**Symptoms** — a subset of work never completes; CPU near zero; two dumps identical; other
requests fine until they need the same locks.

**Confirm** — `Thread.print` prints "Found one Java-level deadlock" for platform threads. For
virtual threads, nothing detects it: read the JSON dump for a set of threads parked on
resources each other holds, and prove it with two identical dumps.

**Fix** — impose a global lock order, or remove the second lock. Timeouts (`tryLock` with a
bound) turn a permanent deadlock into a detectable failure, which is a mitigation, not a fix.

**Prevent** — one lock per invariant; never call foreign or unknown code while holding a lock;
`java-memory-model` for the correctness argument, `lock-inflation` for the cost one.

## Livelock

**Symptoms** — CPU high, throughput near zero, stacks change between dumps but progress does
not. Common with unbounded CAS retry loops and with "back off and retry immediately".

**Confirm** — CPU profile shows a retry loop dominating; a success counter is flat while an
attempt counter climbs. The attempt/success ratio is the measurement.

**Fix** — randomised exponential backoff in the retry loop; make one participant yield
deterministically.

**Prevent** — every retry loop has a bound and jitter. `lock-free-patterns` for CAS loops,
`retries-and-backoff` for network retries.

## Starvation

**Symptoms** — some tasks never run while others do; tail latency far worse than median with
no corresponding resource saturation.

**Confirm** — per-task-class latency percentiles diverge; a fair-lock or fair-semaphore
experiment closes the gap; with virtual threads, threads sit RUNNABLE while carriers are busy
with something else.

**Fix** — fairness where hold times vary (`new Semaphore(n, true)`, `new ReentrantLock(true)`)
at a measured throughput cost; or partition the resource so classes do not compete.

**Prevent** — separate executors for work classes with different service times; never mix a
batch job and interactive traffic in one pool.

## Executor saturation

**Symptoms** — latency rises with no CPU increase; queue depth grows; eventually
`RejectedExecutionException` or an OOM if the queue is unbounded.

**Confirm** — queue depth over time is the direct measurement. In-flight count against the
pool size gives the utilisation; above ~0.8 the queueing curve explains the latency on its
own.

**Fix** — reduce arrival rate (shed), reduce service time, or add capacity — in that order,
and only after checking which one the numbers support.

**Prevent** — bounded queues, a chosen rejection policy, queue-depth alerts.
`littles-law-and-queueing` for the arithmetic, `executors-and-task-lifecycle` for the
configuration.

## Queue explosion / unbounded in-flight work

**Symptoms** — heap grows in proportion to elapsed time under load; GC overhead rises; OOM
whose heap dump is dominated by queued tasks or request objects.

**Confirm** — heap after full GC trending up with in-flight count; dominator tree in a heap
dump pointing at a queue, a `LinkedBlockingQueue` node chain, or many suspended
continuations.

**Fix** — bound the queue; declare a concurrency limit; shed at the edge.

**Prevent** — no unbounded queue anywhere on a path fed by the network, including the ones
hidden in `Executors` factory methods and reactive buffers.

## Task leak (work that silently never runs)

**Symptoms** — no error anywhere; a downstream effect is simply missing. Discovered days
later by reconciliation.

**Confirm** — the exception is sitting in a `Future` nobody joined. Grep for `submit(` whose
result is discarded; compare a submitted counter against a completed counter — the gap is the
measurement.

**Fix** — either join the future, or use `execute` so the uncaught-exception handler sees it,
or handle failures inside the task.

**Prevent** — submitted/completed/failed counters on every executor; a rule that a discarded
`Future` needs an explicit comment. `executors-and-task-lifecycle`.

## Periodic task that stopped

**Symptoms** — a scheduled job's effects stop; nothing is logged; a restart fixes it.

**Confirm** — a "seconds since last success" gauge is the only reliable detector; a failure
counter cannot see a task that is no longer scheduled.

**Fix** — wrap every periodic body in `try/catch (Throwable)`.

**Prevent** — freshness metrics with alerts on every scheduled job.

## Forgotten cancellation

**Symptoms** — timeouts fire and the system gets _worse_; connection pool exhausted; the
downstream sees more load after clients start giving up.

**Confirm** — in-flight count at the dependency exceeds the caller's concurrency limit;
threads remain in the JSON dump after the requests that started them returned.

**Fix** — pair every timeout with a cancellation that actually reaches the work: a request
timeout on the client, `setQueryTimeout` on statements, a structured scope.

**Prevent** — `cancellation-and-interruption`; a test that cancels and asserts the resource
came back.

## Permit or connection leak

**Symptoms** — throughput degrades over hours or days; a restart fixes it; available permits
or idle connections trend monotonically to zero.

**Confirm** — the available-permits gauge, plotted over a day. Monotonic decline is
conclusive; there is no other cause.

**Fix** — `release()`/`close()` in `finally`, with nothing between acquisition and the `try`.

**Prevent** — HikariCP `leakDetectionThreshold`; try-with-resources; a review rule that an
acquire and its release are visible in one screen. `connection-pool-sizing`.

## Connection pool exhaustion

**Symptoms** — threads waiting for connections; latency rises in steps; timeouts at the pool
rather than at the database.

**Confirm** — pool wait time and pending-connection count. Distinguish from a slow database
by checking the database's own query latency — if it is flat, the pool is the constraint.

**Fix** — reduce hold time (shorten transactions, move I/O out of them) before increasing the
pool. Under virtual threads, also check whether an unbounded number of requests is now
competing for the same pool.

**Prevent** — no network calls inside transactions; pool sized from Little's Law and the
database's ceiling. `connection-pool-sizing`.

## Retry storm

**Symptoms** — a dependency's inbound rate rises as its success rate falls; recovery does not
happen when the dependency recovers.

**Confirm** — plot the dependency's request rate against its error rate; a positive
correlation is the storm. Count retries separately from first attempts, per layer.

**Fix** — retry at exactly one layer; add jitter; add a retry budget expressed as a fraction
of first attempts.

**Prevent** — `retries-and-backoff`; make retry counts a first-class metric.

## Pinning and carrier starvation

**Symptoms** — throughput ceiling far below expectations on virtual threads; carriers busy;
CPU not saturated.

**Confirm** — `jdk.VirtualThreadPinned` with the threshold lowered to 1 ms; carrier count
over time from the JSON dump.

**Fix** — isolate native or file-heavy work on a sized platform executor; force class
initialisation at startup.

**Prevent** — audit native dependencies before migrating. `virtual-threads-internals`,
`blocking-and-nonblocking-io`.

## Unbounded fan-out

**Symptoms** — one request triggers hundreds of downstream calls; the dependency reports far
more concurrency than any configured limit; latency collapses under modest traffic.

**Confirm** — downstream concurrency ÷ inbound request rate gives the fan-out factor. Compare
it against what anyone intended.

**Fix** — a semaphore around the fan-out, or batch the calls, or bound the collection being
iterated.

**Prevent** — any loop that submits per element needs a stated limit next to it.
`concurrency-limiting-and-bulkheads`.

## Interrupt swallowed

**Symptoms** — shutdown hangs; the container is SIGKILLed after the grace period; cancelled
work continues; a scope closes long after it failed.

**Confirm** — grep for `catch (InterruptedException` whose body does not rethrow or restore;
a thread dump during shutdown shows tasks still running after `shutdownNow`.

**Fix** — propagate or restore-and-return, at every one of them.

**Prevent** — a lint rule or a review checklist item; this is one of the few concurrency bugs
a grep genuinely finds. `cancellation-and-interruption`.

## Race condition / visibility bug

**Symptoms** — intermittent wrong results; reproduces under load and not in tests; "fixed" by
adding a sleep or a log line.

**Confirm** — not by a dump. By reasoning about happens-before, and by `jcstress` for the
specific claim.

**Fix** — establish the missing happens-before edge, or remove the sharing.

**Prevent** — `java-memory-model`; `concurrency-testing` for how to test it at all.

## The routing summary

| Class                       | Owning skill                                              |
| --------------------------- | --------------------------------------------------------- |
| Deadlock, visibility, JMM   | `java-memory-model`                                       |
| Monitor contention          | `lock-inflation`                                          |
| CAS and lock-free loops     | `lock-free-patterns`                                      |
| Saturation and sizing       | `littles-law-and-queueing`                                |
| Executor configuration      | `executors-and-task-lifecycle`                            |
| Cancellation and timeouts   | `cancellation-and-interruption`, `timeouts-and-deadlines` |
| Limits and fan-out          | `concurrency-limiting-and-bulkheads`                      |
| Pinning and carriers        | `virtual-threads-internals`                               |
| Retries and storms          | `retries-and-backoff`                                     |
| Pools and databases         | `connection-pool-sizing`                                  |
| Reactive demand and buffers | `reactive-backpressure`                                   |
