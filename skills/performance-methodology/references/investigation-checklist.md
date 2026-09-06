# Investigation checklist

## Before starting — written down, not held in mind

- [ ] SLO stated with metric, percentile, numeric threshold, window and load context
      (req/s, duration, hardware)
- [ ] The question being answered, in one sentence, and which method answers it
      (`methods-and-failure-modes.md`)
- [ ] Baseline recorded: p50/p90/p99/p99.9, throughput, CPU, heap, GC — over a full period
      of the metric's pattern where available; retain incident evidence and state missing history
- [ ] Workload recorded with the baseline: request mix, data volume, hot keys, concurrency,
      process uptime
- [ ] What changed recently, with timestamps: deploys, config, traffic, data, dependencies,
      infrastructure
- [ ] A comparator identified and its claim stated: randomised control, blocked concurrent
      control, restarted control, healthy neighbour, or historical baseline. Neighbours and
      previous periods are not called controls until allocation and confounders justify it
- [ ] The stopping criterion stated: the SLO met with what margin, or the gap declared
      unreachable locally
- [ ] Measurement environment identified — production, staging with real data, or an
      isolated benchmark — and, for staging, the four differences stated (data volume,
      access pattern, concurrency, uptime)
- [ ] Tooling selected for the question is available; report missing coverage rather than
      requiring every profiler before useful observation
- [ ] JDK version and **effective** flags recorded
      (HotSpot target: `jcmd <pid> VM.version`, `VM.command_line`, `VM.flags -all`;
      attach access and supported commands checked)

## During observation, before accepting a diagnosis

- [ ] RED filled for the service; USE filled for each plausible bounded resource, with
      aggregation window and per-instance distribution—not as a ritual before every profile
- [ ] The clock chosen from the symptom: wall clock for latency, CPU for CPU
- [ ] If JFR is the chosen instrument, settings, events, thresholds, duration, repository
      limits and expected overhead are recorded; duration is long enough for the required
      event/sample count and short enough for the production budget
- [ ] Effective recording settings are inspected, including overrides and overlapping
      recordings. JFC files alone do not establish active thresholds or event coverage;
      lowering thresholds may raise overhead
- [ ] GC evidence covers the symptom window where relevant; missing logs leave uncertainty,
      and pause logs alone do not exclude concurrent GC CPU or allocation effects
- [ ] Thread dumps are collected only when they test a runnable/blocking/deadlock hypothesis;
      cadence is chosen from the symptom, and collection impact/storage sensitivity is bounded
- [ ] System CPU checked, not only JVM CPU — kernel and I/O consume it too
- [ ] Process uptime noted, if the symptom is intermittent or progressive

## At hypothesis time

- [ ] The hypothesis is specific: it names the component, the mechanism and the expected
      impact
- [ ] The hypothesis is falsifiable: there is evidence that would refute it
- [ ] A fixed-work upper bound is computed where its assumptions hold. For tail latency, the
      slow-request cohort and critical path are defined; component quantiles are not added and
      a CPU sample fraction is not treated as a fraction of endpoint p99
- [ ] The expected effect written down before the run, in the SLO's unit

## While measuring

- [ ] Cold start, ramp and sustained state are deliberately included or excluded according to
      the production question, using observable state criteria rather than an arbitrary clock
- [ ] Request count, throughput, error/timeout/censoring mass and decision-relevant summary
      statistics are measured; quantiles and means are used for the questions they answer
- [ ] Load model matches the question. For scheduled arrivals, report offered starts,
      actual starts, start lateness, dropped starts and terminal outcomes; schedule alone
      does not prove absence of coordinated omission
- [ ] GC/allocation effects monitored as relevant (`-prof gc` is one JMH instrument,
      not proof that collection effects are isolated)
- [ ] Treatment is defined and other differences controlled; interactions use a designed
      factorial experiment rather than an undocumented bundle
- [ ] Independent experimental unit, sample-size rationale, run count, allocation/blocking,
      stopping rule and analysis are fixed in advance; every planned run is retained
- [ ] CPU frequency policy, quota/period, cpuset, NUMA placement and noisy-neighbour exposure
      are recorded and held comparable where they matter; `--cpus` alone does not pin CPUs

## When validating

- [ ] Result compared with the recorded baseline, not with memory
- [ ] All metrics re-checked, not just the target one (throughput, CPU, GC pauses)
- [ ] Observed treatment effect distinguished from the mechanism explanation; state which
      mechanism predictions were checked and what remains uncertain
- [ ] Deploy side effects enumerated and tested as alternative causes; unresolved ones named
- [ ] A defensible counterfactual was tested: safe AB/BA toggle, randomised allocation,
      restarted control, bisection or another design appropriate to the change
- [ ] The improvement holds across a full period of the metric's pattern
- [ ] Written up: hypothesis, evidence, change, before/after

## When stopping

- [ ] The SLO is met with margin, under its stated load, by the baseline's method — or the
      bounded options and credible combinations are insufficient, or further measurement
      has lower decision value than its cost. Single-component p99 fractions are not global bounds
- [ ] Every finding that was not the cause is recorded with its measured share
- [ ] If stopped for cost, the measurement that would reopen the investigation is named
