# Measuring queue-model parameters without changing their meaning

## Begin with one boundary and cohort

Record the events and counts that define the model:

```text
offered → admitted → enqueued → service-start → service-end → terminal outcome
```

For each class preserve queue identity, route/partition, retry/attempt, deadline/cancellation and
server position. Use one monotonic clock for durations. Reconcile inventory at window edges; a
growing queue invalidates a stationary fit even when the window-average rates match.

## Arrival rate and process

Measure offered `λ`, admitted rate and completed throughput separately. Retries, hedges, fan-out,
health traffic and background tasks are distinct classes/visits, not an unexplained increment to
one homogeneous `λ`. A finite queue uses offered `λ` for blocking and `λ_eff` for admitted Little's
Law.

Mean inter-arrival CV is insufficient to establish a Poisson or renewal process. Characterise:

- time-varying intensity at resolutions finer than queue response/recovery;
- empirical gap distribution and hazard, autocorrelation and burst/batch sizes;
- count dispersion across several window widths;
- dependence on queue state, timeouts, retries, cron and admission feedback;
- per-source streams before and after routing/superposition.

Poisson has exponential independent gaps and variance equal to mean counts, but seeing one of
those properties in a finite trace does not prove the others. Detrend seasonality before estimating
`C_a`; otherwise rate variation appears as intrinsic burstiness. Scrape-interval counts may be too
coarse to recover the process.

## Service time, demand and `μ`

`S` is time occupying one modeled service position, not automatically endpoint wall time or CPU
time. For a platform-thread pool whose worker stays blocked on a downstream call, that block is
part of worker occupancy if the whole task is the service center. If instead the model separates
CPU, connection pool and remote dependency, measure visits/demand/residence at each node and model
the blocking interaction.

Capture enqueue/start/end timestamps directly. Do not derive `μ=1/W_endpoint`; endpoint residence
contains queues and other stages. Low-load measurement can reduce queue contamination, but CPU
frequency, cache/JIT state and batching may differ from production. Measure service at multiple
loads; if its distribution/demand changes with queue length or concurrency, `μ` is state-dependent
and a constant-rate model must be rejected or made piecewise.

For CPU centers, use profilers/JFR/OS counters or controlled attribution. JDK 25 `ThreadMXBean`
CPU-time methods apply to platform threads, may be unsupported/disabled, have precision not
accuracy guarantees and do not support virtual-thread accounting. Do not wrap asynchronous
requests with current-thread CPU time and call the result request demand.

## Service distribution

Compute moments from uncensored service-position samples and inspect the empirical distribution:

```python
mean_s = service.mean()
second_moment = (service ** 2).mean()
cs = service.std(ddof=0) / mean_s
```

The second moment directly feeds P–K. A CV of one does not establish exponential service; inspect
survival/hazard, modality and serial/class dependence. Mixtures should be modeled by routing class
when classification is available, while preserving their shared-resource interaction.

Timeouts and cancellations can right-censor service or abandon queue wait. Record whether work
actually stopped; a caller timeout may leave server work running. Success-only samples make both
`E[S]` and `E[S²]` optimistic. Survival methods require defensible censoring assumptions, and a
deadline cannot reveal the distribution beyond it without a model.

## What counts as `c`

`c` is structural simultaneous service capacity under the model's server assumptions. It is not:

- nominal host CPUs when a cgroup quota/cpuset supplies less;
- `maximumPoolSize` when an unbounded queue keeps `ThreadPoolExecutor` near core size;
- pool size minus threads currently blocked—those tasks may still occupy service positions;
- pod count when routing creates per-pod queues or pods share a downstream bottleneck;
- virtual-thread count when the constrained centers are CPU and downstream permits.

For `ThreadPoolExecutor`, record pool size over time, active count, task start/end and queue age.
After core workers, `execute` normally offers to the queue before adding non-core workers; a
bounded/full queue or `SynchronousQueue` is needed to trigger growth toward max. If worker count
changes, model `c(t)` or split the interval. A parked idle worker is available capacity; a worker
blocked inside a task remains occupied even if it consumes no CPU.

For a connection pool, configured max is only a candidate `c`: subtract disabled/leaked/broken
resources only through measured availability, and remember the database may saturate before all
connections provide independent progress. For virtual threads, bound actual scarce resources and
CPU admission; `ThreadMXBean`/legacy dumps do not provide a complete virtual-thread population.

## Measuring queue wait

Instrument task lifecycle at the queue boundary:

```java
long enqueuedAt = System.nanoTime();
executor.execute(() -> {
    long queueWait = System.nanoTime() - enqueuedAt;
    queueWaitRecorder.record(queueWait);
    runTask();
});
```

Production instrumentation must avoid capture/allocation/cardinality overhead, propagate
cancellation safely and include rejected submissions separately. Framework hooks or wrapped tasks
may be preferable; verify nested/resubmitted tasks and caller-runs execution.

JFR wait events answer different questions:

| Event                  | What it observes                                                   | What it does not observe                                                     |
| ---------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `jdk.JavaMonitorEnter` | platform-thread contended monitor entry above configured threshold | arbitrary executor task age                                                  |
| `jdk.JavaMonitorWait`  | `Object.wait` episodes                                             | monitor-entry contention or all conditions                                   |
| `jdk.ThreadPark`       | platform-thread park episodes from locks/conditions/permits        | time a `Runnable` object sits in an executor queue before any thread owns it |

Inspect the running JDK's JFC settings: enabled state, stack traces, cutoff/threshold and period are
version/configuration-specific. Lower thresholds on a short representative recording while
monitoring overhead; zero recorded events is not zero wait. For virtual threads use applicable
virtual-thread events plus application queue/permit timestamps; do not infer everything from
platform-thread states.

## Fit and falsify

1. Attach uncertainty and outcome/censoring policy to every parameter.
2. Fit/calibrate on selected stable operating points, not the same point used to claim validation.
3. Predict held-out load, service mix, server count or queue bound.
4. Compare mean queue wait, wait probability, loss and any supported distribution—not only one
   convenient metric.
5. Plot residual against load/time/class. Systematic curvature suggests variability, topology,
   state-dependent service or transient effects.
6. Set acceptable absolute/relative error from the decision/SLO before results. There is no
   universal 30% threshold, especially near zero.
7. Prefer a simpler sensitivity bound when parameter uncertainty is wider than option differences.

## Sources

- [Oracle JDK 25 `ThreadPoolExecutor`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html)
- [Oracle JDK 25 `ThreadMXBean`](https://docs.oracle.com/en/java/javase/25/docs/api/java.management/java/lang/management/ThreadMXBean.html)
- [Oracle JDK 25 JFR troubleshooting](https://docs.oracle.com/en/java/javase/25/troubleshoot/troubleshoot-performance-issues-using-jfr.html)
- Harchol-Balter, [_Performance Modeling and Design of Computer Systems_](https://www.cs.cmu.edu/~harchol/PerformanceModeling/book.html)
- Cox and Lewis, _The Statistical Analysis of Series of Events_ (1966).
