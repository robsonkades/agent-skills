---
name: load-testing-advanced
description: >
  Selecting and executing advanced load profiles—baseline, capacity-envelope,
  breakpoint, stress, spike, ramp, soak and recovery—using bracketed boundaries,
  scenario-specific validity, phase isolation and server-side evidence. Use when one
  steady run is presented as capacity, when overload and SLO boundaries are conflated,
  when burst/recovery or long-duration resource retention must be tested, or when
  automation parses generator output. Basic workload validity belongs to load-testing;
  coordinated omission to coordinated-omission; statistical inference to
  latency-statistics; provisioning to capacity-planning.
---

# Advanced Load Testing

## Purpose

Choose a load profile that identifies the decision variable without confusing:

- SLO boundary with physical saturation or collapse;
- a tested passing point with an exact maximum;
- steady-state capacity with burst/recovery behavior;
- retained resources with normal cache/pool growth;
- application failure with generator or dependency failure.

Every published number is conditional on workload, version, resources, topology, state,
duration and SLO semantics.

## Profile selection

| Profile             | Question                                         | Required output                                  | Does not prove               |
| ------------------- | ------------------------------------------------ | ------------------------------------------------ | ---------------------------- |
| baseline            | what is normal at a controlled operating point?  | distribution and run variance                    | maximum capacity             |
| envelope/breakpoint | where does a specific guardrail cross?           | highest passing and lowest failing tested load   | universal capacity           |
| stress/overload     | how does useful work fail and recover?           | rejection/collapse/recovery behavior             | safe operating point alone   |
| spike/impulse       | can finite headroom and controls absorb a burst? | queues, deadlines, shedding and recovery         | sustained capacity           |
| ramp                | how do transitions and controllers track growth? | lag, hysteresis, warm-capacity response          | one steady boundary          |
| soak                | what changes with elapsed time/cycles?           | retained-resource slope/change points            | leak merely from rising heap |
| failure scenario    | what survives topology/dependency loss?          | useful capacity and recovery under named failure | normal peak                  |

Combine profiles only when phases remain separately tagged and prior overload cannot
contaminate the next phase. Randomize or use fresh environments when order effects matter.

## Breakpoint and capacity-envelope procedure

1. Define a pass predicate over the full evaluation window: latency, errors/correctness,
   useful throughput, resource guardrails and stability.
2. Establish a clearly passing load and a reproducibly failing load with an arrival model
   matching production.
3. Search between them using discrete steps or adaptive bracketing. Keep workload/state
   constant and use independent repetitions near the decision boundary.
4. Report an interval: highest tested reproducible pass to lowest tested reproducible fail.
   The “last passing step” is not an exact breakpoint.
5. Classify why the upper point failed and verify the generator still produced its intended
   process.
6. Repeat recovery after load removal; overload that leaves queues, breakers, caches or
   instances unhealthy is a separate finding.

Analytical predictions choose search bounds and detect unit/topology mistakes. Divergence
does not prove the script is wrong: it can reveal model-assumption failure, variable demand,
hidden resources or generator bias. Diagnose rather than applying an order-of-magnitude
rule.

Do not assume every offered rate above nominal service capacity creates an unbounded queue.
Finite admission, deadlines, abandonment and shedding can stabilize waiting while rejecting
work. Measure offered, admitted and useful rates.

## Spike and ramp design

Specify the arrival trajectory, duration, synchronized tenant/key composition and whether
connections/caches arrive cold. A spike's integral deficit matters:

\[
B(t)=\max\left(0,B(0)+\int_0^t[\lambda_a(u)-\mu(u)]du\right)
\]

This fluid estimate can bound expected backlog only under its assumptions; validate
partition skew, priorities, abandonment and variable service cost with observation or
simulation.

For autoscaling, correlate metric windows, controller reconciliation, scheduling, startup,
readiness, routing and useful warmup. “Pod ready” is not necessarily “full capacity.”

## Stress and recovery design

Continue far enough beyond the SLO boundary to observe the intended overload policy, within
safety limits. Record:

- accepted, rejected, timed-out, cancelled and successful useful work;
- queue age/depth and in-flight work;
- retry/fan-out amplification;
- resource exhaustion, crash/health-check and dependency feedback;
- degradation quality and fairness by tenant/priority;
- time and intervention required to return to baseline.

A high attempted throughput with collapsing useful throughput is failure, not capacity.
Use a separately authorized abort criterion for data corruption, uncontrolled external
impact or unsafe resource exhaustion.

## Soak and retention design

Choose duration and checkpoints from hypothesized cycles and expected growth rate:
credentials, cache expiry, rotations, compaction, class loading/unloading, scheduled jobs,
connection lifetimes and GC cycles. There is no universal multiple of the slowest cycle;
the run must contain enough independent observations and elapsed time to distinguish the
decision-relevant slope from noise and bounded transients.

Track the right state:

- heap occupancy after comparable GC phases plus live-set evidence;
- metaspace/class-loader counts;
- native-memory categories and RSS;
- platform/virtual-thread lifecycle;
- file descriptors, connections, queues and pool leases;
- storage/temp files and telemetry buffers.

Do not trigger periodic full GC merely to make points “comparable” unless that intervention
is explicitly part of the experiment; it changes latency, reference processing and
collector behavior. A positive linear fit alone does not prove a leak. Look for monotonic
retention across cycles, failure to plateau, ownership paths, time-to-limit and reproduction.

## Automation and output contracts

- Pin tool/version/extensions and validate output against a real fixture.
- Treat raw event output and aggregated summaries as different schemas.
- Fail loudly on missing fields, empty populations, histogram overflow or changed units.
- Define every consumed statistic explicitly when tool configuration controls aggregation.
- Preserve raw timestamps and outcome tags; summary-only exports can prevent reanalysis.
- Size/preallocate generator concurrency through a pilot and monitor dropped scheduled
  starts plus generator resources.
- Separate scenario acceptance thresholds from run-validity and safety-abort thresholds.

Tool-specific commands and current caveats belong in
[generator configuration](references/generator-configuration.md).

## Failure modes

| Symptom                        | Distinguish with                                         | Response                                      |
| ------------------------------ | -------------------------------------------------------- | --------------------------------------------- |
| boundary moves between runs    | state/order/dependency drift; interval overlap           | randomize/block and report uncertainty        |
| step passes briefly then fails | window too short, backlog/GC/controller cycle            | extend based on stabilization and SLO window  |
| load drops at high latency     | scheduled vs started arrivals, generator headroom        | qualify/correct generator before target claim |
| heap rises throughout soak     | after-GC state, allocation rate, cache bound, dominators | extend, reproduce and attribute ownership     |
| recovery remains slow          | queue age, retries, breaker/pool/cache/instance state    | report recovery defect separately             |
| only some tenants fail         | key/partition skew, priority/admission fairness          | preserve cohort metrics; do not average away  |

## Anti-patterns

**Single-run capacity number:** one passing point gives scenario evidence, not a maximum or
between-environment uncertainty.

**Fixed-duration folklore:** 30–60-second steps and eight-hour soaks are examples, not
validity rules. Duration follows SLO windows, system dynamics and estimation precision.

**Any dropped iteration invalidates everything:** it invalidates the configured-arrival
claim for that interval, but remains useful generator evidence and may not affect a
different earlier phase. Scope the consequence.

**Forced-GC leak proof:** an intervention can create behavior unlike production and still
does not identify retained ownership.

**Error rate as validity:** errors are often the response variable in stress tests.
Correctness and generator fidelity determine validity; the SLO determines acceptance.

## Publication checklist

- [ ] claim, workload unit, SLO population/window and profile are explicit
- [ ] offered, started, admitted, attempted and useful work are reconciled
- [ ] environment, dependency state and generator headroom are valid
- [ ] passing/failing boundary is bracketed with run-level uncertainty
- [ ] failure cause and recovery are characterized
- [ ] output parser and units are fixture-tested
- [ ] timeout/censoring/graceful-stop treatment is disclosed
- [ ] raw artifacts, configuration and analysis are reproducible
- [ ] safety, privacy and external-impact controls were followed

## Cross-skill routing

- load-testing: workload model, environment and base validity.
- coordinated-omission: lost scheduled arrivals and correction limits.
- latency-statistics: histogram, quantile and comparison inference.
- capacity-planning: scenario/configuration selection and cost.
- heap-dump-analysis or allocation-profiling: memory attribution after a soak signal.

## Authoritative references

- [Grafana k6: scenarios](https://grafana.com/docs/k6/latest/using-k6/scenarios/)
- [Grafana k6: arrival-rate allocation](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/arrival-rate-vu-allocation/)
- [Gatling: injection](https://docs.gatling.io/concepts/injection/)
- [Apache JMeter component reference](https://jmeter.apache.org/usermanual/component_reference.html)
- [Google SRE: Addressing cascading failures](https://sre.google/sre-book/addressing-cascading-failures/)
