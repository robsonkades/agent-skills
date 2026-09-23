# Test Plan and Validity

Use the applicable parts for the requested experiment or evidence review. Existing valid
artifacts can satisfy these checks; a timing explanation or adequate-design review does not
require a new pilot, parser, recording or full plan. For a new run, resolve the conditions
that materially affect its claim before treating the result as evidence.

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

Pin generator plugins and Java/JDK compatibility separately from the target service's Java
baseline. A generator upgrade or a new executor is an experimental change, not a prerequisite
to accepting this skill; use supported tools with equivalent measured scheduling semantics.

## Generator sizing

For arrival scheduling, initial concurrent iterations are:

\[
L_g=\lambda_i E[W_i]
\]

Use iteration rate and duration, not request RPS unless one iteration is one request. Tail
or deadline bounds can guide allocation, but a pilot must cover client code, distribution,
connections and overhead.

For k6, use the chosen scenario's full iteration duration, including its client code,
retries and sleeps, rather than HTTP duration alone. The aggregate `iteration_duration`
metric can contain separate `setup`/`teardown` duration samples; those are not recurring VU
occupancy in the arrival scenario. Filter by the actual scenario name, for example
`iteration_duration{scenario:checkout}`, and verify that the `scenario` tag is enabled and
the selected samples exist. Do not silently substitute the unfiltered aggregate when the
scenario evidence is missing. Retain setup/teardown timing separately for lifecycle claims.

For k6 arrival-rate executors, preallocate enough VUs to avoid allocation as a confound.
Dropped iterations mean scheduled starts could not occur; retain the achieved arrival
process and diagnose VU supply, target/client iteration occupancy and generator resources
separately before choosing a remedy.

For these executors, no free VU can mean the target slowed and existing iterations remain
busy. In iteration-count executors the same `dropped_iterations` metric can instead mean
`maxDuration` expired. Interpret it against the selected executor. Measure scheduled-to-actual
start delay; dropped-start counts alone do not quantify arrival jitter or delayed catch-up bursts.
An allocation increase can restore starts when VUs are occupied and generator resources permit
it; extra generator hosts are justified by measured resource limits, not by dropped counts
alone. Revalidate the achieved schedule and preserve any evidence of target degradation.

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

Prove the correctness gate can fail with a deliberately invalid response in an isolated pilot.
In k6, a false `check()` records a failed check but does not by itself fail the test's exit
status; bind required checks to acceptance thresholds and verify the exit status with the
invalid fixture. `fail()` imported from `k6` throws and aborts only the current iteration;
it does not by itself make the test exit nonzero. HTTP status success is also insufficient
for business correctness.

When a correctness or safety fault requires stopping the whole run, use a supported test-level
abort such as `exec.test.abort()` from `k6/execution`, after checking the installed version.
That abort reports failure but still permits `teardown()` to run; cleanup and recovery remain
part of the protocol. Keep safety abort criteria separate from acceptance thresholds so a
planned overload experiment can retain rejection evidence instead of stopping at its first
expected SLO violation.

## Timing and outcome boundaries

For k6, `http_req_duration` measures sending, waiting and receiving; it excludes initial
DNS/connection setup. Capture blocked/connect/TLS phases or an explicit end-to-end timer
when the claim includes them. `http_req_*` timestamps are emitted at response completion or
timeout, so grouping them by timestamp creates completion windows, not admission cohorts.
Do not add per-phase percentiles to reconstruct end-to-end p99.

For a wall-clock window, reconcile `end_in_flight = start_in_flight + starts − departures`
at each boundary. Starts and completions within that window are usually different requests.
For an admission cohort, retain IDs and terminal outcomes plus unresolved members through
the declared follow-up period. A measured client timeout is a terminal client outcome;
the server's eventual completion may still be unknown, and its work may retain resources.
Keep graceful drain separate from the active offered-load interval instead of diluting rates
by dividing active-phase work by a longer teardown-inclusive duration.

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

Use existing authorization for the named target and load bounds; obtain missing authorization
before production execution or expansion beyond those bounds. Define safety abort and SLO
thresholds separately, cap load, isolate external effects with test accounts/sinks, protect
credentials/data, respect dependency quotas, verify recovery and clean only owned test state.

## Sources for tool-specific interpretation

- [k6 built-in metric boundaries](https://grafana.com/docs/k6/latest/using-k6/metrics/reference/)
- [k6 scenario-scoped iteration duration](https://grafana.com/docs/k6/latest/using-k6/workaround-iteration-duration/)
- [k6 checks and thresholds](https://grafana.com/docs/k6/latest/using-k6/checks/)
- [k6 fail: iteration abort versus test failure](https://grafana.com/docs/k6/latest/javascript-api/k6/fail/)
- [k6 execution: test-level abort and teardown](https://grafana.com/docs/k6/latest/javascript-api/k6-execution/)
- [k6 dropped iterations](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/dropped-iterations/)
