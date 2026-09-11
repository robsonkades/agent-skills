# Reporting a performance finding

A performance investigation ends in a claim someone else will act on — a change approved, a
change refused, or a budget spent. The claim is only as good as what is attached to it, and the
attachments are the part routinely omitted.

## The evidence a finding needs

Scale the detail to the decision. An observation or a missing-measurement finding need not invent
a causal mechanism or numerical interval; explain the available support and its actual limits.

| Part                                | Contribution                                                                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The claim**                       | One sentence, falsifiable. "Deserialisation is 40% of request CPU", not "serialisation is slow".                                                        |
| **The measurement**                 | What was measured, with which tool, under which load, on the relevant runtime and hardware. A number with no method is an opinion with a decimal point. |
| **The uncertainty**                 | Coverage/measurement limits; numerical estimates need uncertainty tied to their experimental unit and analysis. Sample count alone is context.          |
| **The mechanism**                   | What explains the effect, and which parts remain hypotheses. A controlled treatment effect can be established before its detailed mechanism.            |
| **The falsification you attempted** | What you did to try to make the finding wrong, and what happened. This is the part that separates a finding from a first plausible story.               |

The fifth is the one that gets left out and the one a reviewer should ask for first. An
investigation that never tried to break its own conclusion has not tested it.

## Before and after, stated so it can be checked

The following numbers are illustrative, not an executed experiment or a published result.
The summaries describe one matched pair; a real report must attach every run's data and
its analysis, not copy these numbers.

```
Claim      Request p99 falls from 340 ms to 95 ms by replacing the per-request Pattern
           compilation on the validation path.

Method     Load test, open loop, 800 rps for 15 min sustained-state window after a
           separately reported 5 min ramp; process run is the experimental unit.
           Temurin 25.0.3, 4 vCPU / 8 GB container, cgroup v2, G1, -Xms=-Xmx=4g.
           Generator latency measured from scheduled start to terminal outcome; actual
           start lateness and dropped starts recorded. Correction, if used, is reported
           separately from raw measurements and does not reconstruct missing server load.

Before     p50 21 ms   p99 340 ms   p99.9 890 ms   n = 720,000
After      p50 19 ms   p99  95 ms   p99.9 210 ms   n = 720,000
           For this illustrative pair: 720,000 scheduled/started/completed requests per
           arm; no errors, timeouts or dropped starts; start cohort drained before analysis.
           Design: six matched process-run pairs, two per host/time block across three
           blocks, treatment order randomised within pairs. Report run-level contrasts
           and uncertainty accounting for blocking/dependence, not 720,000 independent runs.

Mechanism  The Pattern was compiled per call on a path executing once per request.
           CPU profile: compilation subtree has 31% of included samples before and
           no observed samples after; that is not proof of zero remaining cost.
           Isolated JMH allocation drops from 4.1 kB/op to below reported resolution.
           These support reduced CPU/allocation work, but do not explain the full p99
           reduction. Queueing/GC amplification remains a hypothesis requiring matched
           queue, service-demand and request-critical-path evidence.
Falsified  A pre-existing safe flag disabled the cache in the same build; p99 returned to
           the baseline range. A restarted unchanged control did not improve. These tests
           reduce—but do not eliminate—the remaining host and traffic explanations.
```

The counterfactual block strengthens attribution of the treatment effect; it does not
by itself establish the detailed mechanism. A safe reversible toggle
is one design; randomised allocation, a restarted control or bisection may be better for other
changes. No single test proves causation—state which alternatives remain plausible.

## The refusals, which are also findings

Three outcomes that people hesitate to write down and should:

- **"The measurement does not support the change."** The practical effect was
  not established at the required precision. Report the interval for the treatment contrast
  relative to zero and the practical threshold; neither non-significance nor overlapping
  marginal intervals proves equivalence.
- **"The bottleneck is elsewhere."** Amdahl's Law applies before the work, not after: a component
  that is 4% of comparable fixed-work elapsed time can save at most 4% if the remainder
  stays unchanged. This is not a bound on endpoint p99 or queueing amplification.
- **"There is no measurement yet."** The honest deliverable is the measurement to take.
  Existing code or incident evidence may prioritize hypotheses and discriminating checks, but does
  not turn them into measured causes. `jvm-performance-review` treats this as a first-class output
  rather than a failure, and so should a report.

## What not to put in

- **A single number with no uncertainty.** Two marginal intervals—overlapping or not—are not
  the interval for their paired difference. Analyse the contrast created by the design;
  `latency-statistics` owns why.
- **One summary statistic presented as the distribution.** A mean answers expected work and is
  tail-sensitive; a quantile answers a threshold question but omits what happens beyond it.
  Include errors, timeouts/censoring, counts and the summaries the decision actually needs.
- **A microbenchmark presented as a system result.** A JMH number is a statement about a method,
  and a system prediction needs explicit workload and bottleneck assumptions plus endpoint
  validation, not a CPU percentage multiplied into p99.
- **A percentage with no baseline.** "30% faster" needs the two absolute numbers and the load
  they were taken at, or it cannot be checked or reused. A mean of ratios across several
  workloads depends on which side is the base and can be made to favour either — Jain's
  "ratio game" (_The Art of Computer Systems Performance Analysis_, 1991, ch. 11).
- **The best run.** If runs were discarded as noisy, the report is the best of `k`, not a
  measurement. Report every run, or the number fixed in advance.
- **Numbers carried across a JDK, a machine or a load shape.** They are numbers about the
  configuration that produced them; `jdk-upgrade-impact` covers the version case.

Do not subtract percentiles of unrelated populations to label the difference as queue,
network or framework overhead. Even for matched requests, `p99(total) - p99(service)` is
not generally `p99(total - service)`: derive per-request residuals under valid clock and
interval definitions first. An endpoint before/after percentile contrast can describe a
treatment effect under comparable populations; it is not a component decomposition.

## Writing it for the person who decides

The technical reader wants the mechanism. The person approving the work wants the trade. Both are
served by the same order, which is the one `engineering-communication` sets out: what is true,
what follows from it, what is still uncertain, the options, and a recommendation.

What this skill adds is evidence discipline: each claim carries its method, each causal inference
states its support, and remaining uncertainty names a real limitation or follow-up. Do not invent
uncertainty or additional findings merely to fill a section; keep conclusions within tested scope.
