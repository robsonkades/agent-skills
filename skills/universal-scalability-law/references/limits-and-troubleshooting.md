# Limits, marginal decisions and troubleshooting a USL fit

## What USL can and cannot answer

USL represents useful throughput versus one declared load/resource axis under a stable workload and
homogeneous regime.

| Question                            | USL contribution                                             | Additional model/evidence                                           |
| ----------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------- |
| Marginal capacity from another unit | `X(N+1)−X(N)` with prediction uncertainty                    | unit cost, failure domain and deployment feasibility                |
| Continuous/integer throughput peak  | only when `β>0`, `α<1` and identified                        | feasible discrete N, guardrails and direct high-N evidence          |
| Latency at open arrival rate        | capacity scenario only                                       | queue topology/arrival/service model (`queueing-models`)            |
| Closed-user mean response           | `R=N/X−Z` if N is the closed population and clocks reconcile | response distribution/SLO needs measurement or closed network model |
| Queue/pool size                     | none directly                                                | Little/demand/admission analysis (`littles-law-and-queueing`)       |
| Cost/reliability/autoscaling        | capacity curve as one input                                  | failure/failover load, lag, SLO and budget (`capacity-planning`)    |
| Root cause of `α`/`β`               | mechanism hypothesis                                         | profile, waits, hardware/network traffic and intervention           |

Do not mix curves where N changes meaning. “32 users on one JVM” and “32 pods at fixed users per
pod” are different experiments even when both columns say 32.

## Closed-system response relation

Gunther's derivation relates the USL to a synchronous load-dependent machine-repairman model. If N
is a fixed closed user population, `X(N)` is **absolute** completed throughput and mean think time is
`Z`, the interactive law gives:

```text
R(N) = N/X(N) − Z
```

This is a mean response for that closed loop. It does not produce a p99 and must not be reused when N
is cores/pods or when users arrive exogenously. Verify `N≈X(R+Z)` from measurements at each point;
in-flight work outside the clock or changing think time invalidates the conversion.

For an open system, measured USL capacity `μ_cap(N)` is only one queue-model parameter. Mean/tail
latency depends on offered/admitted arrival process, variability, topology, loss/abandonment and
operating distance from capacity.

## Phase changes the smooth curve cannot represent

Segment or change models when residuals reveal:

- CPU sockets/NUMA domains/SMT or cgroup quota thresholds;
- pool, partition, license, connection or file-descriptor caps;
- autoscaling steps and heterogeneous instance generations;
- working-set/cache fit changes from partitioning;
- a load balancer or shard map changing topology;
- JIT/GC/cache/leak state evolving through a point;
- workload mix or correctness/output changing with N.

A smooth high-R² curve across a step can still give a wrong marginal decision. Preserve the
breakpoint as a mechanism, not an outlier to remove.

## Fit a curve or run a breakpoint test?

If the decision is “will exactly 12 pods carry target load?”, a production-shaped test at 12 plus
nearby/failure configurations may be more direct. Fit USL when the decision concerns curve shape,
marginal returns over several N, architectural comparison, or an unprovisionable scenario. The fit
never replaces testing feasible high-risk points.

Choose N adaptively from uncertainty and model discrimination. More low-N repetitions may estimate
`γ/α`; a safe high-N point may identify `β`. Do not demand crossing a harmful peak merely to satisfy
a methodology—report the unsupported bound.

## Marginal and economic reading

For each feasible integer N, compute:

```text
absolute gain  ΔX = X(N+1)−X(N)
relative gain      ΔX/X(N)
efficiency         X(N)/(Nγ)
```

Propagate joint coefficient uncertainty. Compare gain with infrastructure and coordination cost,
latency/error guardrails, failover reserve and placement constraints. The economically optimal N
can be below the throughput peak; reliability reserve can require running above a pure cost optimum.
Never recommend retrograde N solely because spare instances improve availability—separate active
capacity from standby/failover architecture.

## Superlinear observations

`X(N)>N X(1)` can result from:

- cold or otherwise disadvantaged baseline;
- working set becoming cache/memory-local after partitioning;
- vectorisation/turbo/frequency or NUMA changes;
- algorithm or workload/output changing with N;
- measurement/generator error.

Some are real steady-state effects over a bounded regime. A standard constrained USL with
nonnegative `α,β` cannot represent them. Repeat baselines, verify equal useful work and per-unit
resources, measure cache/hardware state, and segment at the phase transition. Do not constrain away
the evidence or extrapolate superlinearity indefinitely.

## Troubleshooting residuals

| Observation                                      | Competing explanations                                              | Next discriminating check                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| coefficients hit bounds or change sign           | superlinear regime, narrow N range, poor start/solver, mixed states | unconstrained/profile fits, raw plot, additional discriminating N         |
| `α` and `β` strongly correlated                  | curvature insufficient to separate terms                            | bootstrap/leave-one-N-out; safe higher N or report bound                  |
| residuals step at topology boundary              | heterogeneous capacity or cap                                       | segment by socket/node/pool/shard transition                              |
| throughput falls while useful-output errors rise | overload/correctness/generator failure, not capacity                | offered/admitted/completed/error counts and generator telemetry           |
| production below fitted capacity but unsaturated | production is operating below ceiling                               | queue/utilisation and offered demand; no coefficient adjustment           |
| production saturated below fit                   | workload/data/topology or downstream cap differs                    | demand/mix, per-node resources, routing and downstream metrics            |
| production scales past fitted peak               | test-specific bottleneck or weakly identified β                     | coefficient interval, test-rig resources, production coordination metrics |
| regression over time at fixed N                  | nonstationary state, not N scaling                                  | queue, heap/live set, cache/data and throttling timeline                  |
| fit changes without code change                  | coefficients depend on workload/environment                         | compare JDK/hardware/mix/data/routing and state criteria                  |

Residual direction suggests hypotheses but cannot uniquely identify them. Never hand-tune a
coefficient to make production match; remeasure the changed regime and validate held-out points.

## Extrapolation contract

Every prediction beyond measured N must state:

- distance from measured range and feasible topology transitions crossed;
- coefficient/prediction interval and sensitivity to leaving out each N;
- invariants assumed for per-unit resources, routing, data and workload;
- whether `β`/peak is identified by actual curvature;
- a breakpoint measurement that will accept/reject the projection before full rollout.

Canary expansion should include stop/rollback thresholds on useful throughput, latency, errors,
rejections, cost and downstream saturation. An autoscaler acting on a retrograde curve can amplify
an incident; cap scale while the model is being tested.

## Sources

- Gunther, [“A General Theory of Computational Scalability Based on Rational Functions”](https://arxiv.org/abs/0808.1431)
- Holtman and Gunther, [“Getting in the Zone for Successful Scalability”](https://arxiv.org/abs/0809.2541)
- [CRAN `usl` package and reference manual](https://cran.r-project.org/package=usl)
- Denning and Buzen, [operational queueing-network laws](https://www.columbia.edu/~ww2040/8100S12/DenningBuzen1978.pdf)
