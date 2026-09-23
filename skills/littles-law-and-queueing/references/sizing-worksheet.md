# Pool, queue and admission sizing worksheet

No equation below directly returns a safe executor size. It produces a consistency check, demand
estimate or model input. The chosen configuration must survive production-shaped load, failure and
recovery tests.

## 1. Define boundaries and inputs

```text
λ_offered, λ_admitted, X_completed   rates by outcome and request class
W_system                              admission-to-terminal mean residence
R_k / Q_k / S_k                       resource-k residence / queue wait / service time
V_k                                   visits to resource k per completed transaction
D_k = V_k S_k                         resource demand per completion
m_k                                   effective capacity units (cores, connections, workers)
deadlines and SLO                     include queueing and timeout semantics
burst/failover model                  magnitude, duration, autoscaling/recovery delay
```

Use means in Little/demand laws; a latency quantile cannot replace the mean, and adding marginal
quantiles does not generally give an end-to-end quantile. Preserve distributions for the SLO model.
Keep the same cohort and clock boundaries on both sides of every equation. In `D_k=V_k S_k`,
`S_k` is the mean over visits, not an unweighted average of per-transaction service means.

## 2. Reconcile observed concurrency

At a stable measured point:

```text
L_system ≈ X_completed × W_system
L_k      ≈ λ_k × R_k
```

`L_k` is average work holding or waiting for resource `k`; it is not the configured worker or pool
maximum. Match its residence boundary: acquisition-request-to-return includes waiting and
holding, while checkout-to-return predicts checked-out connections only. Include multiplicity:
if one transaction visits the database twice, `λ_db≈2X` before retries/failures. SQL execution
alone omits other time holding the connection.

If estimates disagree, check window edges/inventory change, success-only metrics, retries, fan-out,
clock endpoints and aggregation before adding a “safety factor”.

For a wall-clock window `[a,b)` with tracked admission/departure events:

```text
N_end = N_start + admitted_in_window − departed_in_window
mean L = sum(overlap of each request's residence interval with [a,b)) / (b−a)
```

Include requests already present at `a` and those still present at `b`. Full residence times
of only requests completing inside the window generally do not reproduce that area, even
when start/end counts happen to match. An admission cohort is a different measurement: track
its eventual terminal outcomes and outstanding members. Client timeout is an observed client
departure, but server work may continue; do not remove it from server occupancy until that
boundary actually releases it. An unfinished server residence is censored at observation end,
not a completed duration equal to the client timeout. See `latency-statistics`.

For an item with fixed accounted size `b` throughout residence `W`, integrate bytes over time:
in a stable population, `mean bytes = λ E[bW]`, not generally `λ E[b] E[W]`. For example, equally
frequent items with `(b,W)=(1 byte,9 s)` and `(9 bytes,1 s)` give `E[bW]=9 byte·s`, whereas the
product of means is `25 byte·s`. Shared storage, changing sizes and GC reclamation need their own
accounting boundaries; this arithmetic does not size the heap.

## 3. Establish resource capacity

For `m` equivalent units and mean demand `D` per completion:

```text
realised resource demand rate = X × D          # CPU-seconds/s = cores, for CPU
utilisation per unit  = X × D / m
throughput at target utilisation U* = mU* / D
```

Here `X` is the matching realised flow, not all offered requests. For capacity projection use
target admitted rates and corresponding demands. Account separately for failed/cancelled
classes and background work, for example `sum(X_class × D_class)` plus background CPU;
success-only throughput with success-only demand does not explain total utilisation.

`U*` is a decision derived from latency/failure headroom, not a universal 0.75. Effective CPU
capacity must reflect cgroup quota/cpuset and competition from GC, JIT, kernel and other workloads;
CPU topology and throttling make “cores” non-equivalent.

For blocking platform-thread work, the familiar heuristic
`threads ≈ mU*(1 + wait/service)` follows from the fraction of time a homogeneous worker consumes
CPU. Use it only as an initial experiment when wait/service is measured on that pool and does not
hold a scarcer downstream resource. It fails with mixed classes, asynchronous hand-offs, lock
convoys, CPU quotas and correlated waits. Sweep worker count under fixed offered load and observe
throughput, CPU, run queue, queue age, context switches and downstream saturation.

Example: `D_cpu=8 ms/request`, effective CPU capacity `m=4`, target `U*=.75` gives
`X*=4×.75/.008=375 request/s`. If target is 800 request/s, no worker-count formula creates CPU
capacity; reduce demand, add effective capacity, shed/admit less work, or change the architecture.

## 4. Size downstream permits from its boundary

Start with measured occupancy demand:

```text
λ_db = X × visits_per_request
L_db = λ_db × R_checkout_to_return
```

Then constrain by the downstream's own capacity, SLO and transaction behaviour. Fifteen average
concurrent checkouts does not imply a pool of fifteen: variability and bursts need headroom, while
database CPU/locks may make even fifteen excessive. Sweep pool limits while measuring acquisition
wait, hold-time distribution, database utilisation/locks, throughput, timeout rate and recovery.
`connection-pool-sizing` owns this decision.

Do not derive `N_db = configured_request_threads × R_db/R_total`; configured threads are not average
request population, and requests may visit zero or multiple times.

## 5. Give the queue a budget

Queue capacity is an overload policy, not spare throughput. Bound it by the tighter of:

- waiting-time budget before downstream execution can no longer meet the caller deadline;
- memory/retained-context budget per queued task;
- burst absorption needed while capacity catches up;
- fairness/priority and stale-work cancellation requirements.

Measure queue **age** and deadline slack. A count of 100 can be harmless for 1 ms tasks and fatal
for 10 s tasks. Under sustained `λ>μ`, any finite queue eventually fills; define the admission
outcome, retry guidance and drain/recovery behaviour before that happens.

## 6. Understand `ThreadPoolExecutor` admission order

For `execute` on a running pool, the implementation conceptually:

1. starts a worker while worker count is below `corePoolSize`;
2. otherwise offers to `workQueue` and rechecks run state/worker availability;
3. if the offer fails, tries to add a worker up to `maximumPoolSize`;
4. rejects if no worker can be added (or if shutting down).

Thus an unbounded queue normally prevents growth beyond core size and makes `maximumPoolSize`
ineffective. This can deliberately smooth finite bursts, but sustained excess work permits
unbounded queue delay and memory retention. `Executors.newFixedThreadPool` documents an unbounded
shared queue; it is safe only when workload/admission bounds prevent uncontrolled growth.

```java
// Partial configuration: derive workers/queueCapacity; supply factory and rejection policy.
ThreadPoolExecutor executor = new ThreadPoolExecutor(
    workers,
    workers,
    0L,
    TimeUnit.MILLISECONDS,
    new ArrayBlockingQueue<>(queueCapacity),
    threadFactory,
    rejectionHandler);
```

Values are deliberately symbolic. A fixed pool makes concurrency ownership clearer than relying
on queue-full expansion, but is not universally preferable.

Check dependencies before accepting a pool size. If every worker holds its slot while calling
`get()`/`join()` on a child queued to the same fixed executor, no worker remains to start the
children. Low CPU plus a nonempty queue can then mean dependency starvation, even when measured
CPU demand would fit the machine. Confirm the parent waits, child placement and occupied worker
slots; low CPU alone does not establish this diagnosis. More queue space cannot break the wait,
and more workers may only hide one observed fan-out width.

Nonblocking completion composition can release the parent worker while children run. When blocking
must remain, consider separately budgeted dependency execution and check for cycles across pools
and held downstream permits. Preserve completion, rejection, cancellation and shutdown semantics;
`executors-and-task-lifecycle` and `completablefuture-composition` own those implementation details.
`SynchronousQueue` changes queueing into handoff, worker growth or rejection; a bounded maximum
still needs a progress argument, while unbounded growth creates a resource-exhaustion risk.
Validate with all parent slots occupied and children pending, then verify progress and terminal
outcomes within a bounded test. Capacity averages alone do not prove liveness.

## 7. Choose overload semantics

| Policy                        | Useful when                                                      | Failure mode to test                                                                            |
| ----------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Reject immediately            | caller can retry elsewhere/later and overload must be bounded    | retry storm, wrong 429 vs 503 semantics, lost idempotency context                               |
| Timed admission               | short bursts are valuable within remaining deadline              | submitter blockage, timeout races, work admitted after caller cancellation                      |
| `CallerRunsPolicy`            | trusted producer may safely execute task and feedback is desired | event-loop/acceptor blockage, reentrancy, priority inversion, ordering relative to queued tasks |
| Drop/replace/coalesce         | latest-state or sampling work where every item is not required   | silent data loss, fairness and observability                                                    |
| Separate bulkheads/priorities | classes have distinct criticality/cost                           | starvation, unused reserved capacity, cross-resource bottleneck                                 |

HTTP `429` means rate limiting; `503` more often represents temporary capacity unavailability.
Protocol semantics, idempotency and `Retry-After` determine the correct response. Cancellation must
remove or cheaply skip stale queued work.

`CallerRunsPolicy` runs the task directly only while the executor is not shut down. On shutdown
it discards without throwing; `submit()` can return a Future that never completes. A policy
that drops/coalesces work must explicitly resolve its completion/cancellation contract. Also
test many simultaneous callers: their inline tasks bypass the executor's maximum worker count.
Use a separate shared permit when the downstream requires a strict total concurrency limit.
Timed admission requires an explicit deadline-aware admission mechanism; do not implement it
by blindly inserting into `getQueue()`, bypassing executor lifecycle checks.

Virtual threads remove the need to pool threads merely because they are expensive, but not the
need to bound downstream permits, queued work and CPU demand. Parked virtual threads consume memory
and retain context; mounted runnable work still competes for carriers. See
`thread-sizing-and-virtual-threads`.

## 8. Validate in production-shaped tests

- Reconcile `L≈λW` at each boundary with start/end inventory and outcome counts.
- Observe offered/admitted/completed/rejected/timeout/cancel rates, queue depth **and age**.
- Record active workers/permits, service demand, hold time, utilisation and dependency saturation.
- Exercise cold start, burst, sustained overload, dependency slowdown, failover, shutdown and
  recovery/drain.
- Verify deadlines propagate and abandoned work stops consuming scarce capacity.
- Compare several pool/queue settings under the same open workload; report uncertainty and the
  chosen headroom rationale.

## Sources

- [Oracle JDK 25 `ThreadPoolExecutor`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html)
- [Oracle JDK 25 `Future.get` waiting contract](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Future.html#get()>)
- [Oracle JDK 25 `CompletableFuture` composition](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CompletableFuture.html)
- [CallerRunsPolicy shutdown behavior](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.CallerRunsPolicy.html)
- [Oracle JDK 25 `Executors`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/Executors.html)
- [Oracle JDK 25 `BlockingQueue`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/BlockingQueue.html)
- [Oracle JDK 25 `ThreadMXBean`](https://docs.oracle.com/en/java/javase/25/docs/api/java.management/java/lang/management/ThreadMXBean.html)
- [Little, “A Proof for the Queuing Formula: L = λW”](https://doi.org/10.1287/opre.9.3.383)
