# Test Plan and Validity

## Claim

```text
Question / decision:
System boundary and version:
Population and workload unit:
Arrival model and why:
Configuration and topology:
Response variables / SLO window:
Scenarios and excluded states:
Experimental unit and comparison design:
Minimum decision-relevant effect:
```

## Workload contract

Record offered schedule or population/think time; requests and useful work per iteration;
operation mix; payload/data/key/tenant distributions; correlation/workflows; session,
connection and TLS behavior; retries/timeouts/abandonment; cache/data initialization; and
background/dependency state.

## Executor recognition

Verify syntax against the installed version's official documentation.

| Tool       | Closed-model examples              | Open-model examples and caveats                                    |
| ---------- | ---------------------------------- | ------------------------------------------------------------------ |
| k6         | constant/ramping VUs; per-VU loops | constant/ramping arrival rate; an iteration can make many requests |
| Gatling    | concurrent-user injection          | users-per-second injection; scenario loops can add closed feedback |
| JMeter     | looping Thread Group               | Open Model Thread Group is marked experimental in current docs     |
| wrk family | wrk uses connection feedback       | wrk2 schedules rate; verify fork/version semantics                 |
| Locust     | user loops, including pacing       | pacing alone is not independent-arrival injection                  |

Classify scheduling semantics, not names.

## Generator sizing

For arrival scheduling, initial concurrent iterations are:

\[
L_g=\lambda_i E[W_i]
\]

Use iteration rate and duration, not request RPS unless one iteration is one request. Tail
or deadline bounds can guide allocation, but a pilot must cover client code, distribution,
connections and overhead.

For k6 arrival-rate executors, preallocate enough VUs to avoid allocation as a confound.
Dropped iterations mean scheduled starts could not occur; retain the achieved arrival
process and diagnose VU supply versus generator/iteration degradation.

## Environment contract

Record artifact/image/JDK/JVM/resources, generator version/host, topology/network/TLS/DNS,
dependency versions/quotas/data, observability, measured clock offset, and state-based
readiness/warmup criteria.

Do not impose generic JVM flags. Equal Xms/Xmx and AlwaysPreTouch change startup, memory
commitment and paging; use them only when matching production or isolating that factor.

## Pilot gates

- [ ] checks distinguish expected failures from corruption
- [ ] requests and useful work per iteration are measured
- [ ] parser fails on absent or changed output fields
- [ ] generator has calibrated headroom beyond the planned schedule
- [ ] client and target timelines can be correlated
- [ ] incomplete work, timeouts and graceful stop remain visible
- [ ] setup/reset is reproducible enough for the claim
- [ ] telemetry overhead is measured or held constant

## Run validity matrix

| Dimension          | Evidence                                        | If violated                              |
| ------------------ | ----------------------------------------------- | ---------------------------------------- |
| arrival fidelity   | scheduled vs started timestamps; dropped starts | claim applies only to achieved process   |
| generator headroom | CPU/runnable delay/GC/network/connections       | generator-limited; rerun or narrow claim |
| target identity    | digest/config/resources/replicas                | reject treatment comparison              |
| dependency state   | latency/errors/quota/version                    | qualify scenario or rerun                |
| completeness       | missing samples, clock gaps, histogram overflow | tail/causal claim may be unidentified    |
| workload fidelity  | mix/payload/key/tenant state                    | external validity is limited             |

Application errors are not a generic validity failure when they are an intended response.
A correctness/safety fault may abort the run; a controlled rejection during stress can be
the finding.

## Analysis and reproducibility

- Keep offered, started, admitted, attempted and useful rates separate.
- State latency boundaries and retry/timeout treatment.
- Preserve independent run results instead of pooling them.
- State histogram precision/range and aggregation.
- Correlate queues, resources, JVM and dependencies before attribution.
- Treat preregistered model predictions as diagnostics, not oracles.
- Record every exclusion and anomaly.

Choose repetitions to resolve the declared effect or report inconclusive. Randomize/block
treatment order. Predeclare sequential stopping to avoid repeatedly testing until a desired
result appears.

Archive plans, scripts, immutable identifiers, raw output, target telemetry, environment
metadata and analysis code.

## Safety

Authorize production load; define separate safety abort and SLO thresholds; cap load;
prevent real payments/messages; protect credentials and personal data; coordinate
dependency quotas; verify recovery; and clean test state.
