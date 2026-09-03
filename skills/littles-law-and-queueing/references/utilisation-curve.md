# Reading utilisation curves without turning models into laws

## M/M/1 is a sensitivity baseline

For stationary Poisson arrivals, independent exponential service, one work-conserving FCFS server,
infinite waiting room and `ρ=λS<1`:

```text
E[R]  = S/(1−ρ)
E[Wq] = ρS/(1−ρ)
E[L]  = ρ/(1−ρ)
```

| `ρ` |                  `E[R]/S` | Model reading                                                             |
| --: | ------------------------: | ------------------------------------------------------------------------- |
| .50 |                       2.0 | mean queue wait equals mean service time                                  |
| .70 |                      3.33 | small demand/load errors already amplify                                  |
| .80 |                       5.0 | 10% relative more arrivals gives `ρ=.88`, `E[R]=8.33S`                    |
| .90 |                      10.0 | 10% relative more arrivals gives `ρ=.99`, `E[R]=100S`                     |
|  ≥1 | no stationary finite mean | backlog grows until a finite limit, shedder or workload change intervenes |

The derivative `d(E[R]/S)/dρ=1/(1−ρ)^2` explains nonlinear sensitivity; it does not create a
universal 70%, 80% or 90% operating threshold. Real headroom also covers burstiness, failover,
autoscaling delay, correlated service, retries and uncertainty in demand.

Do not use this curve when evidence contradicts its assumptions. A bounded executor blocks or
rejects rather than possessing an infinite queue; a database pool has multiple servers and
downstream contention; a CPU with SMT/NUMA does not supply identical independent servers.

## Variability is a first-class capacity input

For an M/G/1 FCFS queue with Poisson arrivals and general service time:

```text
E[Wq] = λ E[S²] / (2(1−ρ))
      = ρ(1 + C_s²)E[S] / (2(1−ρ))
```

`C_s` is the coefficient of variation of service time. At the same mean demand and utilisation,
larger variance raises queue wait. Deterministic service (`C_s=0`) has half the M/M/1 mean queue
wait (`C_s=1`); a rare slow path can dominate `E[S²]` even when its request fraction is small.

Example for one shared server:

```text
99% at 10 ms, 1% at 500 ms
E[S]  = 14.9 ms
E[S²] = .99(.010²) + .01(.500²) = .002599 s²
at 50 req/s: ρ=.745; E[Wq]≈255 ms
```

The two paths' demand contributions add only if they visit the same capacity boundary. If they use
different pools/resources, model each boundary and routing probability separately. A mixture mean
is valid for aggregate demand even though it describes neither mode.

## Multiple servers and “doubling capacity”

Erlang C models M/M/c with one FCFS queue and `c` identical servers. Under those assumptions, a
single server at total offered load `a=.8` has `E[R]=5S`; two servers at the same total load have
per-server utilisation `.4` and `E[R]≈1.19S`. That illustrative 4.2× improvement is a queueing
effect, not a promise from doubling arbitrary production capacity. Sharding queues, unequal
servers, connection affinity, lock contention and downstream bottlenecks change it.

Measure the curve: hold workload mix and state, step offered load or capacity, record throughput,
queue, service demand and latency distribution, and test whether the fitted model predicts held-out
points. `queueing-models` owns selection/fitting.

## Utilisation is boundary-specific

Use demand law for a resource visited `V_k` times per completed transaction:

```text
D_k = V_k × E[S_k]          # resource time per completed transaction
U_k = X × D_k / m_k         # fraction per equivalent capacity unit
```

Units must cancel. CPU-seconds/request × requests/second gives cores, not “CPU percent” until
divided by effective capacity. A connection's residence includes the whole checkout-to-return hold
time, not only SQL execution. Retries add visits. Failures may consume demand without appearing in
successful throughput.

## Diagnose with converging evidence

| Symptom                            | Competing explanations                                                                                         | Evidence that distinguishes them                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| High process CPU, runnable backlog | CPU demand, spin, kernel work, quota throttling, memory bandwidth                                              | per-cgroup CPU/throttling, run queue, CPU profile, IPC/cache/NUMA evidence         |
| Low process CPU, high latency      | downstream wait, timer/backoff, lock parking, admission queue, idle capacity due affinity, external throttling | wall-clock profile/JFR events, queue/permit metrics, trace critical path, host CPU |
| `BLOCKED` platform threads         | monitor entry contention at dump instant                                                                       | repeated dumps plus `jdk.JavaMonitorEnter`/lock-site evidence and hold/wait time   |
| `WAITING`/`TIMED_WAITING`          | normal idle worker, future/permit wait, timeout, downstream pool                                               | stack/owner, queue depth, task age, dependency telemetry                           |
| Latency rises through run          | accumulating queue, data/cache state, leak, throttling, generator drift                                        | inventory slope, arrival/departure gap, state metrics, generator timestamps        |

Thread state is a snapshot, not a diagnosis. Inspect event settings and thresholds on the running
JDK; lower JFR thresholds gradually within an overhead budget. “Zero events” means zero recorded
events under that configuration, not zero contention or I/O.

## Overload and recovery tests

Test more than the steady point:

1. finite burst below queue capacity;
2. sustained offered load above service capacity;
3. dependency slowdown while arrival remains fixed;
4. one server/zone removed;
5. client cancellation and deadlines while work is queued/running;
6. load returned below capacity—measure queue drain and whether stale work monopolises recovery.

Record offered, admitted, started, completed, failed, rejected, timed-out and cancelled counts.
Verify queue age as well as depth, memory per queued task, and whether abandoned work is removed.

## Sources

- [Little, “A Proof for the Queuing Formula: L = λW” (1961)](https://doi.org/10.1287/opre.9.3.383)
- [Denning and Buzen, “The Operational Analysis of Queueing Network Models”](https://www.columbia.edu/~ww2040/8100S12/DenningBuzen1978.pdf)
- [Oracle JDK 25 `ThreadPoolExecutor`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html)
- [Oracle JDK 25 JFR troubleshooting](https://docs.oracle.com/en/java/javase/25/troubleshoot/troubleshoot-performance-issues-using-jfr.html)
