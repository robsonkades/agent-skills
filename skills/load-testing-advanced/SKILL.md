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

Use the requested decision and authorized load range to select the profile. Reuse adequate
supplied evidence; a focused review can conclude that the current report is sufficient.
A baseline or a passing authorized ceiling does not require inducing overload to become
useful evidence.

## Profile selection

| Profile             | Question                                         | Required output                                                   | Does not prove               |
| ------------------- | ------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------- |
| baseline            | what is normal at a controlled operating point?  | distribution and run variance                                     | maximum capacity             |
| envelope/breakpoint | where does a specific guardrail cross?           | pass/fail bracket, or passing point with upper boundary unlocated | universal capacity           |
| stress/overload     | how does useful work fail and recover?           | rejection/collapse/recovery behavior                              | safe operating point alone   |
| spike/impulse       | can finite headroom and controls absorb a burst? | queues, deadlines, shedding and recovery                          | sustained capacity           |
| ramp                | how do transitions and controllers track growth? | lag, hysteresis, warm-capacity response                           | one steady boundary          |
| soak                | what changes with elapsed time/cycles?           | retained-resource slope/change points                             | leak merely from rising heap |
| failure scenario    | what survives topology/dependency loss?          | useful capacity and recovery under named failure                  | normal peak                  |

Combine profiles only when phases remain separately tagged and prior overload cannot
contaminate the next phase. Randomize or use fresh environments when order effects matter.

## Breakpoint and capacity-envelope procedure

1. Define a pass predicate over the full evaluation window: latency, errors/correctness,
   useful throughput, resource guardrails and stability.
2. Establish a clearly passing load with an arrival model matching production. When locating
   the upper boundary is the authorized question, seek a reproducibly failing point within
   the load/impact limits. If the authorized ceiling passes, report that conditional tested
   lower bound and the unlocated upper boundary; do not exceed the ceiling to complete a bracket.
3. With both endpoints, search between them using discrete steps or adaptive bracketing. Keep workload/state
   constant and use independent repetitions near the decision boundary. Use a bracket only
   where pass/fail is consistent with monotonicity; otherwise publish the tested points and
   investigate state changes or multiple operating regimes.
4. When that ordering holds, report highest tested reproducible pass to lowest tested fail.
   The “last passing step” is not an exact breakpoint.
5. If a point failed, classify why and verify the generator still produced its intended process.
6. For an overload/recovery claim or when overload affected subsequent phases, verify recovery
   after load removal; queues, breakers, caches or instances left unhealthy are a separate finding.

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
X(t)=B(0)+\int_0^t[\lambda_a(u)-\mu(u)]du,\qquad
B(t)=X(t)-\min\left(0,\inf_{0\le s\le t}X(s)\right)
\]

Here arrival and potential service rates use the same work unit, initial backlog is
nonnegative, and the queue is work-conserving with no abandonment or overflow. Reflection
at zero prevents unused service before a burst from cancelling later backlog. For example,
ten idle seconds at service rate 10 followed by one second at arrival rate 20 leaves 10
units queued, not zero. This is a deterministic fluid approximation, not a general bound on
expected stochastic backlog; validate skew, priorities, loss and variable service cost.

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
Define abort criteria for data corruption, uncontrolled external impact or unsafe resource
exhaustion within the existing authorized test scope; stop when those criteria are met.

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

- Pin tool/version/extensions and output/summary mode; validate output against a real fixture.
- Treat raw event output and aggregated summaries as different schemas.
- Fail loudly on missing required fields, unknown coverage, histogram overflow or changed units.
  A confirmed-empty optional outcome cohort (for example, zero rejections) is valid evidence of
  zero occurrences; its quantiles are unavailable, not zero latency. Require a positive relevant
  population before accepting a request-latency or business-check predicate.
- Define every consumed statistic explicitly when tool configuration controls aggregation.
- Preserve raw timestamps and outcome tags; summary-only exports can prevent reanalysis.
- Size/preallocate generator concurrency through a pilot and monitor dropped scheduled
  starts plus generator resources.
- Separate scenario acceptance thresholds from run-validity and safety-abort thresholds.

Tool-specific commands and current caveats belong in
[generator configuration](references/generator-configuration.md); read it when configuring
a generator or output parser. Read [test profiles](references/test-profiles.md) when selecting
phase duration, refining a boundary, or designing spike, soak and recovery acceptance.
Inspect the project's actual JDK, collector, framework, build and deployed topology before
choosing diagnostic commands. The k6 options are partial JavaScript configuration, not a
Java baseline or authorization to upgrade the service or its tooling.

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

Apply the items that support the requested claim. Return the result, its evidence and limits,
plus any material gap or smallest next check; do not invent a finding or an unrequested profile.

- [ ] claim, workload unit, SLO population/window and profile are explicit
- [ ] offered, started, admitted, attempted and useful work are reconciled
- [ ] environment, dependency state and generator headroom are valid
- [ ] a claimed boundary is bracketed where justified, or tested points/lower bounds and run-level uncertainty are reported
- [ ] failure cause and recovery are characterized when those behaviors are part of the claim
- [ ] consumed parser output and units are fixture-tested
- [ ] timeout/censoring/graceful-stop treatment is disclosed
- [ ] raw artifacts, configuration and analysis are reproducible
- [ ] safety, privacy and external-impact controls were followed

## Cross-skill routing

- load-testing: workload model, environment and base validity.
- coordinated-omission: lost scheduled arrivals and correction limits.
- latency-statistics: histogram, quantile and comparison inference.
- capacity-planning: scenario/configuration selection and cost.
- heap-dump-analysis: retained heap and ownership after a soak signal.
- allocation-profiling: allocated-byte rate/stacks when allocation pressure is the question;
  allocation alone does not identify retained ownership.

## Authoritative references

- [Grafana k6: scenarios](https://grafana.com/docs/k6/latest/using-k6/scenarios/)
- [Grafana k6: arrival-rate allocation](https://grafana.com/docs/k6/latest/using-k6/scenarios/concepts/arrival-rate-vu-allocation/)
- [Gatling: injection](https://docs.gatling.io/concepts/injection/)
- [Apache JMeter component reference](https://jmeter.apache.org/usermanual/component_reference.html)
- [Google SRE: Addressing cascading failures](https://sre.google/sre-book/addressing-cascading-failures/)
- [Honnappa, Jain and Ward: fluid net-input reflection](https://arxiv.org/abs/1206.0720) — reflection at zero; application workload assumptions still require validation.
