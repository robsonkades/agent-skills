# The staged playbook

## Stage 0 — Baseline

**Exit criteria:** a recorded baseline nobody has to argue about later.

| Measure                                                | Why it is on the list                                       |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| p50 / p95 / p99 at the target rate                     | the only comparison that survives the migration             |
| In-flight concurrency (per endpoint)                   | tells you what the new limits must allow                    |
| Thread count, by pool                                  | the implicit limits, enumerated                             |
| Connection-pool utilisation and wait time              | whether the database is already the bottleneck              |
| Downstream error and latency rates                     | so their regression is attributable                         |
| Retained heap after comparable recovery, and GC phases | suspended stacks/state are heap; this is the before picture |

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

Deploy justified semaphores, bulkheads and bounded admission from the inventory **before** enabling
virtual threads, while the pools are still there. This isolates limit-policy risk from execution-model
risk. Expect possible queue/wait changes if two gates temporarily coexist; equivalence is a hypothesis
to validate, not proof from unchanged throughput.

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

Canary long enough to cover the workload's relevant peak, batch/cron and dependency variability;
duration follows evidence, not a universal business-day rule. Compare against a concurrent control
or seasonally matched baseline:

| Signal                                 | Expected                                 | Roll back if                                        |
| -------------------------------------- | ---------------------------------------- | --------------------------------------------------- |
| p99 at target rate                     | equal or better                          | worse by more than the noise band                   |
| Downstream error rate                  | inside error budget/no causal regression | statistically/operationally significant causal rise |
| Connection-pool wait time              | inside capacity/SLO envelope             | sustained queue-age/SLO breach                      |
| Retained heap and GC phases            | stable at repeated load/recovery         | retained state or GC violates budget                |
| Scheduler MXBean queued/pool estimates | explained and SLO-safe                   | sustained causal pressure/exhaustion                |
| `jdk.VirtualThreadPinned`              | measured/impact understood               | native/foreign pins causally constrain throughput   |

Write the rollback criteria **before** the canary. Written afterwards they become negotiable
in the exact moment they should not be.

## Stage 5 — Re-size the connection pool

The instinct is to raise it because concurrency rose. Resist it and do the arithmetic:

```text
L = λ × W        λ = 400 queries/s, W = 8 ms average hold time  →  average L ≈ 3.2
Database ceiling: what the server can actually serve concurrently (its own configuration,
                  its CPU count, its own connection limit)  →  say 40 across all clients
Our provisional share must include all clients, rollout overlap and headroom.
```

`3.2` is an average occupancy consistency check, not a safe pool size; `40 ÷ 6` assumes even traffic
and full authority over the database budget. Sweep candidate sizes under representative variance and
choose the smallest that meets SLO/throughput without exceeding the database envelope.

Raising the pool past the database's capacity does not add throughput; it moves the queue
from your process (where it is visible, bounded and cheap to reject at) into the database
(where it is none of those). Watch `W` after the migration: hold time often _rises_ because
more requests are in flight, and that is the number to fix, not the pool size.

## Stage 6 — Verify observability, then widen

```bash
# Traditional dumps remain useful for platform locks but omit virtual threads.
jcmd <pid> Thread.dump_to_file -format=json /tmp/dump.json

# Name the factories, or the dump is thousands of VirtualThread[#38]/runnable
```

**Exit criteria before widening:** both platform/all-thread evidence is understood, pinning and
scheduler/resource signals are observable with bounded overhead, per-limit metrics are on a
dashboard, and runbooks are updated. Then repeat from Stage 4
for the next workload.

## What "done" means

Not "every thread is virtual". Done is: each workload runs on the model that suits it, every scarce
resource has a declared admission policy/metric, traditional dumps are retained for platform-lock
questions while all-thread dumps cover virtual lifetimes, removed pin diagnostics are gone, and the
baseline/canary/rollback record is durable.

## Authoritative references

- [Java 25 virtual threads](https://docs.oracle.com/en/java/javase/25/core/virtual-threads.html)
- [Java 25 `VirtualThreadSchedulerMXBean`](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.management/jdk/management/VirtualThreadSchedulerMXBean.html)
- [JEP 444](https://openjdk.org/jeps/444)
- [JEP 491](https://openjdk.org/jeps/491)
