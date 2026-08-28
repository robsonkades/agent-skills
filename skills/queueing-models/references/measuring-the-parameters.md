# Measuring lambda, mu, c and c_s without contaminating them

A model is only as good as the four numbers fed into it, and three of the four have a standard
way of being measured wrong.

## lambda — arrival rate

Count completed requests over a **stable** window. Exclude ramp-up periods; a load ramp makes
the rate a moving target and the model assumes it is not.

## mu — service rate

Mean service time of completed requests, measured with the server **unsaturated**, at
`rho < 0.3`.

This is the most common methodological error in the whole subject: measuring mu under load
measures `W`, not `1/mu`. `W = Wq + 1/mu`, and at rho = 0.8 the queue term is already 4x the
service term — so a "service rate" derived from observed response time under load understates
mu several-fold, and every downstream prediction inherits the error.

If low utilisation is not achievable, call the service component directly, outside the queue.

## c — the _effective_ number of servers

`c` is the number of units that actually make progress in parallel, not the nominal pool size.
If 20 of 100 threads are permanently blocked on I/O, `c = 80`.

```bash
jcmd <pid> Thread.print | grep "java.lang.Thread.State:" | sort | uniq -c
```

Three cases for a `ThreadPoolExecutor`, all decided by the queue and not by the size fields:

| Configuration                                     | Effective `c`                                 |
| ------------------------------------------------- | --------------------------------------------- |
| `core == max` (`newFixedThreadPool`)              | `c = core`. No ambiguity.                     |
| `core < max`, unbounded queue                     | `c = core`, forever. `max` is dead config.    |
| `core < max`, bounded queue or `SynchronousQueue` | `c` varies in `[core, max]` — model both ends |

`ThreadPoolExecutor.execute()` enqueues **before** it grows: it creates a thread above
`corePoolSize` only when the queue _rejects_ the task. An unbounded `LinkedBlockingQueue` never
rejects, so the pool never grows past `corePoolSize` no matter what `maximumPoolSize` says. An
M/M/c prediction using `max` under that configuration is systematically optimistic.

HikariCP is different: it has no core/max split, so `maximumPoolSize` **is** the real, fixed
number of connections and is the model's `c` directly. A thread waiting for a connection parks
in `LockSupport.park()` until one is returned or the acquisition timeout fires, at which point
HikariCP throws `SQLTransientConnectionException` (not `PoolInitializationException`, which is
an initialisation failure only).

With virtual threads the platform thread count stops being the concurrency limit for I/O-bound
work, and the `c` that matters moves downstream — to the database connection pool or to an
external service's own limit. Note also that `jcmd Thread.print` does **not** list virtual
threads; use `jcmd <pid> Thread.dump_to_file -format=json`.

## c_s — coefficient of variation of service time

```python
c_s = np.std(service_times_ms) / np.mean(service_times_ms)

# c_s < 0.5  : nearly deterministic     -> M/D/1, or G/G/1 with low c_s
# c_s ~ 1.0  : exponential              -> M/M/1 or M/M/c fits well
# c_s > 1.5  : heavy tail               -> M/* badly understates high percentiles
```

Common JVM causes of `c_s > 1`: GC pauses landing inside request processing, intermittent L3
or database cache misses, sporadic lock contention, JIT deoptimisation on a hot path.

Reduce `c_s` rather than only chasing rho: generational ZGC (JEP 474, the default in the JDK 25
baseline) or generational Shenandoah (JEP 521, product) to remove long pauses; a dedicated pool
for slow queries so one heavy request cannot occupy slots meant for fast ones; aggressive
timeouts and circuit breakers to cut the extreme tail; cgroup quotas to stop CPU bursts from
injecting variance.

## Measuring queue wait with JFR

```bash
jcmd <pid> JFR.start name=queueing settings=profile filename=queueing.jfr duration=60s
```

| Situation                                                          | Thread state    | Correct event          |
| ------------------------------------------------------------------ | --------------- | ---------------------- |
| Contended entry into `synchronized` (lock contention)              | `BLOCKED`       | `jdk.JavaMonitorEnter` |
| `Object.wait()`                                                    | `WAITING`       | `jdk.JavaMonitorWait`  |
| `java.util.concurrent` — **thread pool and connection pool waits** | `TIMED_WAITING` | `jdk.ThreadPark`       |

`jdk.MonitorWait` does not exist in any JDK version. Waiting for a pooled thread or connection
is not monitor entry — it is `LockSupport.park()`, and it appears as `jdk.ThreadPark` in
`TIMED_WAITING`, not `BLOCKED`.

All three events have a **threshold of 20 ms in `default.jfc` and 10 ms in `profile.jfc`**.
Fine-grained contention of a few milliseconds is invisible until the threshold is lowered:

```bash
jfr configure --input profile.jfc --output queueing-fine.jfc \
    jdk.ThreadPark#threshold=1ms \
    jdk.JavaMonitorEnter#threshold=1ms
jcmd <pid> JFR.start name=queueing settings=queueing-fine.jfc duration=60s filename=queueing.jfr
```

Reading the distribution back:

```java
new RecordingFile(Path.of("queueing.jfr")).readAllEvents().stream()
    .filter(e -> e.getEventType().getName().equals("jdk.ThreadPark"))
    .mapToLong(e -> e.getDuration().toNanos())
    .summaryStatistics();
```

## Other signals

```bash
vmstat 1 | awk 'NR>2{print "runq:", $1, "blocked:", $2}'   # NR>2 skips two header lines
curl -s localhost:8080/actuator/metrics/hikaricp.connections.active
```

HikariCP publishes the pool through a JMX MXBean (`com.zaxxer.hikari:type=Pool (<poolName>)`),
not through JVM flags — `jcmd VM.flags` has nothing to do with third-party library metrics.

Watch `hikaricp.connections.timeout.total`: a rising count means the pool is saturated and
dropping acquisition attempts. Rejected work does not appear in latency metrics at all, it
appears as errors, so a bounded queue can make measured latency look _better_ precisely as the
system saturates. Check the rejection counter before believing a good-looking `Wq`.

## Validating the model

```
error = |Wq_predicted - Wq_measured| / Wq_measured
```

Under 30%: the model applies as chosen. Over 30%: the assumptions are wrong, not the
arithmetic — measure `c_a` and `c_s` and redo the prediction with Kingman. Declare the
environment and the tolerance alongside the comparison, or the validation is not reproducible.
