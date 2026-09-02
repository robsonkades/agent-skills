# Methods, experiments and the failure modes of an investigation

The process in `SKILL.md` is one method. This file names the others, says which question each
answers, states the two scaling laws correctly, sets out the minimum of experimental design a
production measurement needs, and catalogues the ways an investigation goes wrong while looking
like it is going well.

## Which question am I answering

Pick the method from the question, not from the tool that happens to be open. Each method
below produces a specific artefact; if the artefact is not on the page, the method was not
applied.

| Question                                     | Method                                               | What it must produce                                                                                                                  |
| -------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Is any resource the bottleneck?              | USE — Gregg                                          | One row per resource (CPU, memory, disk, network, connection pool, thread pool, heap): utilisation, saturation (queue length), errors |
| Is the service meeting its contract?         | RED — Wilkie                                         | Per service: request rate, error rate, duration distribution, over the SLO window                                                     |
| What is the load, and did it change?         | Workload characterisation — Gregg                    | Who sends it, why, what it is (mix, sizes, hot keys), how it varies over time — with a before/after of each                           |
| Where in the stack does the time go?         | Drill-down analysis — Gregg, after McDougall & Mauro | Monitoring → identification → analysis: each level names the next level's target and the tool that opens it                           |
| Which part of one request is slow?           | Latency analysis; Method R — Millsap & Holt          | The response time of one user action decomposed into components summing to the total, ranked by net payoff                            |
| What changed?                                | Problem statement; baseline statistics — Gregg       | The symptom, when it started, what changed then, who it affects, and the baseline it is compared against                              |
| Is this fix worth doing?                     | Amdahl's Law — Amdahl 1967                           | The fraction `p` from a profile whose clock matches the SLO, and the ceiling `1/(1−p)`                                                |
| Will adding capacity help?                   | Gustafson 1988; queueing; the USL                    | Whether the work scales with the machines, and the utilisation at which queueing alone breaks the SLO                                 |
| Is the difference real?                      | Experimental design — Jain 1991                      | Replicated runs, alternated, with an interval, on the SLO's percentile                                                                |
| Is the change a regression or a coincidence? | Bisection; the falsification run                     | The fix switched off and on under the same load, with the metric following it both ways                                               |

Sources: Gregg, _Systems Performance_, 2nd ed. (2020), ch. 2 "Methodologies", which also lists
the anti-methods below; the USE Method as published at brendangregg.com/usemethod.html; the
RED method is Tom Wilkie's (2015), not Gregg's, though Gregg's chapter lists it; Method R is
Millsap & Holt, _Optimizing Oracle Performance_ (2003); drill-down analysis is credited by Gregg
to McDougall & Mauro, _Solaris Performance and Tools_ (2006). Chapter section numbers are
omitted because they were not verified against the printed edition.

USE has a stated limit: its author puts it at "about 80% of server issues" and says other
problem types need other methods and longer time spans. It finds resource bottlenecks; it does
not find a slow algorithm on an idle machine, and its utilisation column is an average over the
interval — a 70% reading over five minutes can hide bursts of 100%. Read the queue (saturation)
before believing the utilisation.

## The anti-methods

Gregg names these because they are what people do by default. Each has a JVM form.

| Anti-method (Gregg) | Definition                                                                                       | What it looks like on a JVM                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Streetlight         | Pick familiar or random observability tools, run them, look for obvious issues                   | A CPU flame graph for a latency problem whose time is spent waiting; `top` and a GC dashboard because they were open    |
| Random change       | Measure a baseline, pick an attribute to change, measure in both directions, keep if better      | Forty accumulated JVM flags, each kept because a run once looked better; a pool size that has been "tuned" six times    |
| Blame-someone-else  | Hypothesise the issue is in a component you are not responsible for, redirect, repeat when wrong | "It's the database" from a service that holds the connection for 90% of the request; "it's the network" without a trace |
| Traffic light       | Treat a green dashboard as proof of health                                                       | A p99 panel under threshold while the mean exceeds the p99, or a fleet p99 computed by averaging instance p99s          |

The random-change anti-method is the one that most resembles engineering, because it measures.
What it lacks is a mechanism: a change kept on a single better run has a one-in-twenty chance of
having been noise at the 5% level, and after ten such trials the chance that at least one "won"
by noise alone is 40%. A flag with no mechanism attached is a random change that happened to
pass.

## Hypothesis, measurement and the ladder

A **hypothesis** predicts an observation: "if per-request `Pattern.compile` is the cause, a
wall-clock profile will show it above 30% of request time and a build with the pattern cached
will move p99 below 150 ms". A **measurement** records an observation with its method: "wall-clock
profile, 120 s, `profile.jfc`, 800 rps, `Pattern.compile` at 31% of samples, n = 6,100". A
sentence that does neither — "serialisation is slow" — is a suspicion, and an investigation that
cannot say which of its sentences are which has no way to tell whether it has learned anything.

Every investigation climbs the same ladder. Each rung has an artefact that proves it was
climbed, and a way of being skipped that looks like progress.

| Rung             | Must produce                                                                                                 | Skipped when                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| **Observation**  | Baseline and workload recorded; USE/RED tables; a profile whose clock matches the symptom                    | The first hypothesis arrived before the first profile                               |
| **Hypothesis**   | Component, mechanism, predicted effect on the SLO metric, and the observation that would refute it           | It cannot be wrong ("the system is under-provisioned")                              |
| **Measurement**  | The predicted observation taken, with tool, load, duration, sample count and interval                        | A dashboard glance stands in for a measurement; the sample count is not on the page |
| **Diagnosis**    | The mechanism stated so that it explains the magnitude and the timing, not only the direction                | The finding explains 5% of the gap and is accepted as "the cause"                   |
| **Optimisation** | One change, its Amdahl ceiling computed beforehand, its expected effect written down before the run          | Several changes shipped together; the expected effect written after the result      |
| **Validation**   | The SLO metric re-measured by the baseline's method, every other metric checked, the fix switched off and on | A better graph after a deploy; the improvement never reproduced without the deploy  |

Diagnosis has to account for the size of the effect. A lock that is held for 2 ms per request
does not explain a 400 ms p99 on its own, whatever the flame graph highlights; the arithmetic
either closes or the mechanism is incomplete.

## Amdahl and Gustafson, stated correctly

**Amdahl (1967).** For a fixed amount of work, of which a fraction `p` is sped up by a factor
`s`, the overall speedup is

```
S = 1 / ((1 − p) + p / s)          ceiling as s → ∞:  1 / (1 − p)
```

The ceiling is a speedup ratio, and the corresponding reduction in time is `p`, never more.
Numerically:

| `p`  | `s = 2` | `s = 10` | `s → ∞` | Maximum time saved |
| ---- | ------- | -------- | ------- | ------------------ |
| 0.05 | 1.03×   | 1.05×    | 1.05×   | 5%                 |
| 0.20 | 1.11×   | 1.22×    | 1.25×   | 20%                |
| 0.45 | 1.29×   | 1.68×    | 1.82×   | 45%                |
| 0.80 | 1.67×   | 3.57×    | 5.00×   | 80%                |
| 0.95 | 1.90×   | 6.90×    | 20.0×   | 95%                |

Three ways the law is misapplied on a JVM:

- **`p` from the wrong clock.** A CPU profile gives the fraction of _CPU samples_; a latency
  SLO is about _wall time_ on the request's critical path. For a service that waits, the CPU
  fraction of a frame says nothing about its share of p99. Take `p` from a wall-clock profile
  or from the trace of a slow request.
- **`p` from the mean rather than the tail.** A component at 45% of the average request may be
  2% of the requests above p99, or 90% of them. The SLO names the percentile; measure `p`
  there.
- **Speedup read as reduction.** 1.82× is a 45% reduction in time, not "82% faster". State the
  before and after in the SLO's unit.

**Gustafson (1988).** When the problem size grows with the resources — more machines process
more work in the same wall time, which is the scale-out case — the scaled speedup with `N`
units is

```
S = (1 − p) + p × N
```

where `p` is the parallel fraction measured _on the parallel run_, not on the serial one. The
two laws answer different questions and use different `p`: with `p = 0.95` and `N = 16`, Amdahl
gives 9.1× for a fixed workload and Gustafson gives 15.3× for a workload that grew with the
machines. Neither models contention or coherence cost between the units; the Universal
Scalability Law adds those terms and is where "adding pods made it worse" is explained
(`universal-scalability-law`). Both original papers — Amdahl, AFIPS 1967, "Validity of the
single processor approach…"; Gustafson, _CACM_ 31(5) 1988, "Reevaluating Amdahl's Law" — are
short and worth reading in full.

## Experimental design, the minimum

Jain, _The Art of Computer Systems Performance Analysis_ (1991), Part IV, is the reference.
The parts a production measurement cannot skip:

- **A control.** The unchanged build, on the same hardware, under the same load, in the same
  period. Without it the comparison is against memory or against yesterday's traffic.
- **Repetition.** One run per arm is a sample of size one; its "p99" has no interval. Three
  runs per arm is the practical minimum and the spread between them is the first uncertainty
  estimate. `latency-statistics` owns what to do with the numbers.
- **Alternation.** A B A B, not A A A B B B. The run order absorbs drift — thermal state,
  a neighbour's load, a cache filling — and blocks it from lining up with the arm.
- **Warm-up and steady state.** C2 compiles a method after roughly 5,000 invocations
  (`Tier4InvocationThreshold`) or 40,000 loop back-edges (`Tier4BackEdgeThreshold`, JDK 25
  defaults); a path called ten times a second takes minutes, one called ten times an hour
  never warms. Declare steady state by an observable criterion — throughput stable across two
  consecutive windows, compilations on a plateau — and discard everything before it. A metric
  that keeps moving after that point is accumulated state (a filling cache, a growing heap, a
  queue), and the run is measuring the state, not the code.
- **The interval before the decision.** Decide in advance what difference counts, and read
  overlapping intervals as "not decided" rather than "equal".
- **One factor at a time, unless factors interact.** Changing one variable per run makes
  attribution trivial and is the right default. It cannot see an interaction — heap size and
  GC thread count, pool size and timeout — and Jain's argument for a `2^k` factorial design is
  exactly that case: every combination of `k` two-level factors, `2^k` runs, replicated, from
  which main effects and interactions are both estimated. Use it when two knobs are suspected
  of interacting; do not improvise it by changing two things and reasoning afterwards.

## The danger of averaging

A mean of latencies is dominated by the routine case and hides the event that breaks the SLO;
`latency-statistics` owns the percentile discipline. Two further forms belong to the
investigation rather than to the dashboard:

- **Averaging over the interval.** A five-minute utilisation of 70% is consistent with three
  and a half minutes at 100% and ninety seconds idle. The queue length and the p99 over the
  same window show which; the average cannot.
- **Averaging over instances.** A fleet mean or a fleet p99 computed from instance percentiles
  hides one bad pod, one bad node and one bad shard. Look at the distribution across instances
  before the distribution within one.
- **Averaging ratios.** The mean of per-benchmark speedups depends on which system is the
  base — Jain's "ratio game", ch. 11 — and can be made to favour either side with the same
  data. Report absolute numbers and the load they were taken at.

## Failure modes of the investigation itself

Each of these produces a result that looks like a finding.

| Failure mode                    | What happened                                                                                                                                                                                 | Defence                                                                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The deploy confound**         | The fix shipped with a restart (JIT profile reset, caches emptied, connections re-established, pods rescheduled onto other nodes, heap compacted) and the improvement belongs to one of those | Enumerate what moved with the deploy; reproduce the improvement with the fix toggled off and on without redeploying; compare against a restarted control with no fix  |
| **Regression to the mean**      | The investigation started because the metric was at its worst; the worst is followed by the ordinary whatever is done                                                                         | Compare against the baseline's distribution over days, not against the incident window; require the improvement to hold across the periodic pattern (hour, day, week) |
| **Survivorship**                | Profiles, dumps and metrics come from the instances that stayed up; the ones that OOM-killed or were rotated took their evidence with them                                                    | Capture from a degrading instance before the restart, in the incident capture order; treat "all healthy instances look fine" as a statement about the survivors       |
| **Optimising the benchmark**    | The benchmark improves, the SLO does not; the work was steered by the number that was easy to move                                                                                            | Gate the work on the SLO metric under production-shaped load; a microbenchmark result is a prediction to be tested, not a result                                      |
| **Rerunning until it improves** | Runs that showed no gain were discarded as "noisy"; the reported run is the best of `k`                                                                                                       | Fix the run count in advance, report every run, alternate arms                                                                                                        |
| **The streetlight**             | The tool chose the hypothesis: CPU profiles for a wait problem, GC logs for a lock problem                                                                                                    | Choose the clock and the method from the symptom before opening a tool                                                                                                |
| **Stopping at the first cause** | A real finding that explains 5% of the gap ends the investigation                                                                                                                             | Do the Amdahl arithmetic on every finding against the SLO gap; a cause that cannot close the gap is a contributor, not the cause                                      |
| **Time-scale mismatch**         | A 1 s pause is invisible in a 5-minute average and a 10-minute profile is asked to explain a 200 ms spike                                                                                     | Match the observation window to the symptom's duration; for spikes, event-level data (JFR events, traces) rather than averages                                        |
| **The wrong environment**       | Staging reproduced the symptom's shape but not its cause, because the data, the hot keys, the concurrency or the uptime differ                                                                | State the four differences explicitly and test the hypothesis on the one that matters, in production if the observation is passive                                    |
| **Unfalsifiable hypothesis**    | "It needs more resources", "the code is inefficient" — nothing observable would refute it                                                                                                     | Rewrite until it names a component, a mechanism and a number                                                                                                          |

The survivorship row's capture order is `incident-evidence-capture`; the conversion of a
microbenchmark number into a system prediction is `jmh-microbenchmarks`.

## Symptom of a bad investigation → what went wrong → fix

| Symptom                                              | What went wrong                                                     | Fix                                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Days in, no hypothesis has been refuted              | Hypotheses were not written so they could be                        | Write the current one with its refuting observation; go and take that observation today             |
| Every finding is "a contributor"                     | No finding was sized against the SLO gap                            | Rank findings by `p` on the SLO's clock and percentile; the top one is the investigation            |
| The fix worked in staging, not in production         | Staging differed on the axis that mattered                          | Name which of data volume, hot keys, concurrency, uptime differs, and measure in production         |
| It improved, then came back                          | The improvement was the restart, or the regression to the mean      | Toggle the fix without redeploying; compare across a full period of the metric                      |
| Two people disagree about the cause                  | Two measurements with different methods, or one with none           | Agree the measurement that would decide it, take it once, read it together                          |
| The profile "shows nothing"                          | Wrong clock, wrong event threshold, or not warm                     | Wall clock for waits; check the event threshold; confirm warm-up by criterion                       |
| The number moves with the run length                 | Accumulated state, not performance                                  | Find what accumulates (heap, cache, queue, file); measure after it plateaus or fix the accumulation |
| The team is tuning flags                             | Random-change anti-method                                           | Each flag needs a mechanism and a measurement; the rest come out                                    |
| The report has numbers and no intervals              | One run per arm                                                     | Three runs, alternated, spread reported                                                             |
| The optimisation is done and the SLO is still missed | Amdahl was applied after the work, or `p` came from the wrong clock | Recompute `p` on the SLO's clock and percentile before the next change                              |

## Production or staging

The investigation splits into observation and experiment, and they belong in different places.

**Observe in production.** The symptom is there, and the observation is mostly passive: a
continuous JFR recording at `default.jfc` states its own budget at under 1%, traces and metrics
are already exported, and a two-minute `profile.jfc` recording on one instance is cheap. What
production forbids is the experiment that could make the outage worse and the experiment whose
variable cannot be isolated because traffic never repeats. The healthy instance next to the
slow one is the free control, and the difference between them is often the finding.

**Experiment in staging, having stated the gap.** Staging is where a variable can be changed
and the load replayed. It is a model of production, and every model must state what it does not
reproduce; the four that most often decide a performance result are data volume (a plan that
scans 1,000 rows and one that scans 50,000,000 are different plans), access pattern (hot keys,
lock convoys, cache hit rate), concurrency (contention is non-linear in thread count) and
process uptime (JIT state, heap fragmentation, leaked state). A staging result is reportable
only with those four stated, and the load must be open-loop against a production-shaped
dataset (`load-testing`).

**Canary as the experiment.** A canary is the cleanest production experiment available: the
variable is the build, the control is the rest of the fleet, the load is real. Its confounds
are the ones a fresh process always carries — no JIT profile, empty caches, new connections —
so compare the canary against a control that was restarted at the same time, not against pods
with days of uptime, and do not read the first minutes.

## When to stop, and when the fix is architectural

Gregg's chapter gives three reasons to stop analysis: the bulk of the problem is explained, the
cost of further analysis exceeds the value of the remaining gain, or there is a larger gain to be
had elsewhere. In SLO terms:

- **Stop when the SLO is met with margin** under the load it was defined for, across a full
  period of the metric's pattern, by a measurement taken with the baseline's method. Not when
  the graph looks better.
- **Stop when no component's `p` can close the remaining gap.** If the SLO needs 40% off p99
  and the largest single component is 20% of tail time, no local optimisation reaches it; the
  answer is several changes with their ceilings summed, or a different shape.
- **Stop when the next measurement costs more than the gain is worth**, and write that down
  as the finding — with the measurement that would reopen it.

Signals that the fix is architectural rather than local, each of them a measurement rather than
an opinion:

- The bottleneck is a **queue** and the resource behind it is genuinely busy: at 75%
  utilisation an M/M/1 queue's mean response time is already 4× the service time and its p99
  about 18×; at 90%, 10× and 46× (`littles-law-and-queueing`). Faster code lowers the service
  time; only capacity or less work lowers the utilisation.
- Throughput **falls** as instances or threads are added: the USL's coherence term, which is
  shared state, not code (`universal-scalability-law`).
- The dominant `p` is a **call to another system** on the critical path, and its owner has no
  SLO to give. The fix is a cache, a batch, an asynchronous edge or a different boundary.
- The same class of fix has been applied **per feature** more than twice — each new endpoint
  needs the same N+1 repair, the same index, the same pool increase. The pattern is the
  finding.
- The saving available from the whole component is below the SLO gap **after** the component
  is made free (`p` itself). Nothing local remains.

An architectural finding is reported like any other — claim, measurement, uncertainty,
mechanism, falsification — with the difference that the recommendation names the option space
rather than a change. Sizing the capacity option is `capacity-planning`; the reporting order is
`engineering-communication`.
