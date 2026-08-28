# The staged playbook

## Stage 0 — Baseline

**Exit criteria:** a recorded baseline nobody has to argue about later.

| Measure                                   | Why it is on the list                                 |
| ----------------------------------------- | ----------------------------------------------------- |
| p50 / p95 / p99 at the target rate        | the only comparison that survives the migration       |
| In-flight concurrency (per endpoint)      | tells you what the new limits must allow              |
| Thread count, by pool                     | the implicit limits, enumerated                       |
| Connection-pool utilisation and wait time | whether the database is already the bottleneck        |
| Downstream error and latency rates        | so their regression is attributable                   |
| Heap after full GC, and GC overhead       | suspended stacks are heap; this is the before picture |

Run it at the real arrival rate. A baseline collected at saturation measures the queue, not
the service.

## Stage 1 — Inventory the implicit limits

One row per executor, per HTTP client, per anything with a size:

```text
| Pool / setting                  | Size | What it was really limiting        | Replacement          |
|---------------------------------|------|------------------------------------|----------------------|
| server.tomcat.threads.max       | 200  | total in-flight requests           | edge shedding at 250 |
| paymentClientPool               | 24   | concurrency at the payment API     | Semaphore(24)        |
| reportExecutor (single thread)  | 1    | ORDERING of report generation      | keep as is           |
| hikari maximumPoolSize          | 20   | database concurrency               | unchanged            |
| batchExecutor                   | 8    | memory: 8 × 200 MB working set     | Semaphore(8)         |
```

The fourth column is the deliverable. Empty cells are the migration's risk register.

## Stage 2 — Audit

```bash
# Single-thread executors: ordering or mutual exclusion in disguise
rg -n 'newSingleThreadExecutor|newFixedThreadPool\(\s*1\s*\)|newSingleThreadScheduledExecutor'

# ThreadLocal: classify each as context or cache
rg -n 'ThreadLocal|InheritableThreadLocal'

# Thread-name dependencies: broken by empty virtual-thread names
rg -n 'getName\(\)|currentThread\(\)\.getName|thread_name|%thread'

# Native and file I/O on request paths
rg -n 'System\.loadLibrary|native |FileInputStream|Files\.(read|write)|FileChannel'

# Pool metrics and dashboards that will read zero afterwards
rg -n 'getActiveCount|getPoolSize|getQueue\(\)|tomcat.threads'
```

Then, at runtime, on the current version:

```bash
# Pinning, at a threshold low enough to see the frequent short case.
# On JDK 21-23 synchronized will appear here; on 24+ it will not.
jfr print --events jdk.VirtualThreadPinned recording.jfr
```

**Exit criteria:** every hit classified as _keep_, _replace with X_, or _irrelevant_.

## Stage 3 — Declare the limits, on platform threads

Deploy the semaphores, bulkheads and bounded queues from the inventory **before** enabling
virtual threads, while the pools are still there. Two reasons: it isolates the risk of the
limit being wrong from the risk of the model being wrong, and if the numbers are right,
nothing changes — which is the cheapest possible proof.

**Exit criteria:** limits deployed; p99 and throughput indistinguishable from the baseline;
each limit exporting available permits, wait time and rejections.

## Stage 4 — Flip one workload

Pick the first candidate by these properties, in order: I/O-bound, high concurrency, a
downstream with a known bound, low blast radius, and easy to load-test. A read-heavy internal
endpoint is the classic first move; a payment path is not.

```properties
# One flag, one workload, no rebuild to reverse it
app.virtual-threads.reports=true
```

Canary for at least one full traffic cycle (a business day, usually — not ten minutes), and
compare against the baseline:

| Signal                                    | Expected                     | Roll back if                           |
| ----------------------------------------- | ---------------------------- | -------------------------------------- |
| p99 at target rate                        | equal or better              | worse by more than the noise band      |
| Downstream error rate                     | unchanged                    | rises at all                           |
| Connection-pool wait time                 | unchanged or lower           | rises — the pool is now the bottleneck |
| Heap after full GC                        | modestly higher              | grows without bound                    |
| Carrier count (`ForkJoinPool-1-worker-*`) | near `availableProcessors()` | climbing towards `maxPoolSize`         |
| `jdk.VirtualThreadPinned`                 | absent                       | present on a hot path                  |

Write the rollback criteria **before** the canary. Written afterwards they become negotiable
in the exact moment they should not be.

## Stage 5 — Re-size the connection pool

The instinct is to raise it because concurrency rose. Resist it and do the arithmetic:

```text
L = λ × W        λ = 400 queries/s, W = 8 ms hold time  →  L ≈ 3.2 connections
Database ceiling: what the server can actually serve concurrently (its own configuration,
                  its CPU count, its own connection limit)  →  say 40 across all clients
Our share:        40 ÷ 6 replicas ≈ 6

maximumPoolSize = 6, not 200.
```

Raising the pool past the database's capacity does not add throughput; it moves the queue
from your process (where it is visible, bounded and cheap to reject at) into the database
(where it is none of those). Watch `W` after the migration: hold time often _rises_ because
more requests are in flight, and that is the number to fix, not the pool size.

## Stage 6 — Verify observability, then widen

```bash
# jstack does not list virtual threads. Every runbook that says jstack is now wrong.
jcmd <pid> Thread.dump_to_file -format=json /tmp/dump.json

# Name the factories, or the dump is thousands of VirtualThread[#38]/runnable
```

**Exit criteria before widening:** dumps readable and named, pinning events wired to an
alert, per-limit metrics on a dashboard, and every runbook updated. Then repeat from Stage 4
for the next workload.

## What "done" means

Not "every thread is virtual". Done is: each workload runs on the model that suits it, every
scarce resource has a declared limit with a metric, no runbook mentions `jstack` or
`-Djdk.tracePinnedThreads`, and the baseline comparison is recorded somewhere the next team
can find it.
