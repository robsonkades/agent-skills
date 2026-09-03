# Mapping production systems to queueing abstractions

Real components are not intrinsically “an M/M/c”. They expose a topology—queues, service
positions, routing, admission and feedback—that may be approximated by a model after arrival and
service assumptions are tested.

## Structural map

| System                                               | Candidate structural abstraction                        | Evidence/qualification required                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Fixed `ThreadPoolExecutor` + shared queue            | one queue, `c` worker positions, finite/infinite `K`    | service includes all time occupying worker; arrivals/classes/discipline are measured            |
| Growing `ThreadPoolExecutor`                         | time/state-dependent `c` coupled to queue-full rule     | actual worker history, keep-alive, prestart and queue offer behaviour                           |
| Connection pool with acquisition wait/deadline       | finite servers with abandonment                         | checkout-to-return service, acquisition patience, unusable connections, database bottleneck     |
| Semaphore `tryAcquire` no wait                       | loss/admission gate                                     | retry feedback and service distribution; Erlang B only for M/M/c/c assumptions                  |
| Event loop or one serial partition lane              | one server per lane, often general service              | scheduling/batches, handler blocking, key skew and cross-lane shared resources                  |
| Kafka consumer group                                 | partition-affine queues mapped to consumers             | poll batches, one consumer serving multiple partitions, pause/rebalance/commit and key skew     |
| Pods behind a load balancer                          | routed per-pod queues, not automatically a shared M/M/c | connection stickiness, policy, stale load state, retries, heterogeneity and shared dependencies |
| Autoscaled fleet                                     | transient routed network with delayed `c(t)`            | metric/control/scheduling/readiness/warm-up delays and scale-down policy                        |
| Fixed users with think time                          | closed network                                          | population/session semantics and think/service distributions match production                   |
| Exogenous arriving sessions with sequential journeys | semi-open network                                       | session arrival process plus per-session closed/request routing                                 |

`c` counts model service positions, not pods or threads by naming. A hot partition can be a
single-server bottleneck while idle partitions coexist. A consumer with several partitions is not
several independent servers if one thread processes them serially.

## Routing determines pooling—and rarely perfectly

- Independent random thinning of a Poisson stream yields Poisson per-destination arrivals, but
  hash/sticky routing and hot keys break balance.
- Ideal round-robin splitting of one Poisson stream yields more regular Erlang gaps per destination;
  multiple dispatchers, persistent connections, failures and retries break the construction.
- Least-connections/join-shortest-queue can approach pooling benefits, but observations are delayed,
  service requirements are unknown, and assigned work cannot migrate. It is not literally M/M/c.
- A central queue gives statistical pooling but expands blast radius and may weaken ordering or
  tenant isolation. Per-key queues preserve affinity while exposing skew.

Measure per-destination arrival rate, queue depth/age, service mix and utilisation distribution.
Compare model predictions under the actual routing rather than setting `c=podCount`.

## Open, closed and semi-open behaviour

An open model has exogenous offered arrivals. If offered `λ` exceeds service capacity, inventory
grows until a finite queue, rejection, abandonment or workload response intervenes. A closed
population of `N` users with mean think time `Z`, response `R` and throughput `X` obeys:

```text
N = X(R+Z)
```

As the bottleneck saturates, closed-system throughput approaches its capacity and response time
grows with population waiting inside; resource utilisation can approach one. It is false that a
closed generator cannot saturate a resource. It cannot maintain an offered throughput above the
bottleneck independently of response time.

Closed-network asymptotic bounds require their stated network/service assumptions and bound means,
not individual response maxima. Stochastic service can have unbounded support. Use mean value
analysis or simulation rather than applying open M/M/1 wait curves to fixed users.

A zero-capacity handoff (`SynchronousQueue`) is not itself a closed population: submissions may
block in an upstream component, create a worker, execute via caller-runs or reject. Draw that
upstream boundary and outcome.

## Retries, hedges and feedback

If each failed attempt independently retries with fixed probability `p` forever, expected attempts
per original request are `1/(1−p)`; with at most three total attempts they are `1+p+p²`. Production
retries are normally state-dependent: timeout probability rises with queue wait, retries add load,
and shared backoff schedules synchronize. Treat the formulas as low-load accounting checks, not a
stationary arrival prediction.

Count original operations, attempts, hedges, cancellations and successful/failed terminals. Model
attempt classes and their resource demand; cancelled losers may continue executing. Backoff/jitter
changes time correlation but does not remove added work. See `retries-and-backoff`.

## Time-varying load and capacity

Convex stationary curves imply that plugging a long-window mean utilisation into M/M/1 can differ
from averaging stationary responses across regimes. Neither calculation models a transient queue
unless each regime lasts long enough to equilibrate and routing/service remain fixed. Never replace
mean utilisation with p95 utilisation inside the formula.

For a first fluid overload bound with aggregate service capacity `μ_cap(t)`:

```text
dQ/dt ≈ admitted_rate(t) − μ_cap(t), while Q>0
Q(t)   = max(0, Q(0) + integral(admitted−capacity))
```

This estimates backlog, not stochastic tail/fairness. During a step from capacity 1000/s to offered
1300/s for 90 s, absent shedding, at most the simple constant-rate model accumulates 27,000 items.
If new capacity is 1500/s and arrivals remain 1300/s, net drain is 200/s: 135 s to clear. Real
service demand, warm-up, finite queues, cancellation and routing make the curve piecewise.

Autoscaling is a delayed feedback loop: scrape/aggregation, decision windows, provisioning,
placement, image pull, readiness and JVM/application warm-up all contribute. Test the complete
timeline and ensure the queue/admission policy survives it. A bounded queue is one option; direct
load shedding, upstream admission, reserved capacity and predictive scaling are others.

## Reading prediction residuals as hypotheses

Residual direction is not a unique diagnosis. Use it to prioritise evidence:

| Residual pattern                     | Competing hypotheses                                                                              | Distinguishing measurement                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| measured wait rises faster with load | service variance/state dependence, burst feedback, hidden shared bottleneck, per-server imbalance | service moments by load/class, actual arrivals, per-queue state, resource demand |
| measured wait lower but loss rises   | finite queue, timeout/abandonment, omitted failures                                               | offered/admitted/terminal counts, queue capacity and patience                    |
| model optimistic only for one class  | mixture/head-of-line, affinity/hot key, priority starvation                                       | per-class visits/service/queue age and routing                                   |
| model pessimistic at short burst     | no steady state reached, admission shed load, service sped up                                     | inventory trajectory, admitted rate, service demand by time                      |
| error flips by pod count             | topology/routing changes, shared-resource coherency, autoscaling state                            | per-pod arrivals/queues, throughput scaling, `c(t)` timeline                     |
| all endpoints disagree similarly     | wrong clock/boundary, generator omission, common downstream                                       | stage timestamps, planned/actual arrivals, trace critical paths                  |

Set acceptance criteria from decision error: a 5 ms absolute miss may be immaterial for capacity but
fatal near a 10 ms SLO, while relative error explodes near zero. Fit one subset and validate held-out
points. Do not “correct” residuals with an undocumented factor.

## When analytical models should stop

Prefer trace-driven or discrete-event simulation/direct measurement when:

- `μ` changes with queue/concurrency (cache thrash, lock convoy, GC/memory pressure);
- arrivals depend on system state (retry/herd/admission feedback);
- service positions share CPU, memory bandwidth, locks or downstream capacity;
- complex priorities, batching, vacations, abandonment or cancellation decide the outcome;
- routing changes while the window is aggregated;
- a non-Markovian tail is the decision and only moments are known.

Simulation still needs validation: reproduce Little/demand laws, M/M/1 and Erlang cases, run seeded
replications, attach uncertainty, and predict held-out traces. If parameters cannot be measured,
more model detail creates unidentified precision.

## Production failure tests

Exercise steady load, finite bursts, sustained overload, one service position lost, hot-key skew,
dependency slowdown, retry wave, cancellation, autoscaler lag and recovery/drain. For every test
reconcile offered/admitted/completed/rejected/timed-out/cancelled work; report queue age, not only
depth; verify stale work does not consume recovery capacity after callers leave.

## Sources

- [Schroeder et al., “Open Versus Closed: A Cautionary Tale”](https://www.usenix.org/conference/nsdi-06/open-versus-closed-cautionary-tale)
- Denning and Buzen, [“The Operational Analysis of Queueing Network Models”](https://www.columbia.edu/~ww2040/8100S12/DenningBuzen1978.pdf)
- Harchol-Balter, [_Performance Modeling and Design of Computer Systems_](https://www.cs.cmu.edu/~harchol/PerformanceModeling/book.html)
- [Oracle JDK 25 `ThreadPoolExecutor`](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/ThreadPoolExecutor.html)
