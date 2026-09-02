# Reporting a performance finding

A performance investigation ends in a claim someone else will act on — a change approved, a
change refused, or a budget spent. The claim is only as good as what is attached to it, and the
attachments are the part routinely omitted.

## The five things a finding must carry

| Part                                | Why it is not optional                                                                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **The claim**                       | One sentence, falsifiable. "Deserialisation is 40% of request CPU", not "serialisation is slow".                                             |
| **The measurement**                 | What was measured, with which tool, under which load, on which JDK and hardware. A number with no method is an opinion with a decimal point. |
| **The uncertainty**                 | A range, an interval or a sample count. A single number implies a precision that no measurement of a running system has.                     |
| **The mechanism**                   | Why the cause produces the effect. Without it, the finding is a correlation and the fix is a coincidence waiting to be discovered.           |
| **The falsification you attempted** | What you did to try to make the finding wrong, and what happened. This is the part that separates a finding from a first plausible story.    |

The fifth is the one that gets left out and the one a reviewer should ask for first. An
investigation that never tried to break its own conclusion has not tested it.

## Before and after, stated so it can be checked

```
Claim      Request p99 falls from 340 ms to 95 ms by replacing the per-request Pattern
           compilation on the validation path.

Method     Load test, open loop, 800 rps for 15 min, warm-up discarded (first 5 min).
           Temurin 25.0.3, 4 vCPU / 8 GB container, cgroup v2, G1, -Xms=-Xmx=4g.
           Latency from the generator with coordinated-omission correction on.

Before     p50 21 ms   p99 340 ms   p99.9 890 ms   n = 720,000
After      p50 19 ms   p99  95 ms   p99.9 210 ms   n = 715,000
           Three runs each, alternating, p99 spread 88-99 ms after / 331-352 ms before.

Mechanism  The Pattern was compiled per call on a path executing once per request.
           Confirmed in the flame graph: Pattern.compile at 31% of self time before,
           absent after. gc.alloc.rate.norm on the JMH isolation of the same method
           drops from 4.1 kB/op to 0.
Falsified  Ran the "after" build with the cache disabled by flag: p99 returns to 336 ms.
           The improvement tracks the change and not the deploy.
```

The last block is what makes this a finding. Anything can improve after a deploy; only a
mechanism you can switch off and on again shows that this change caused it.

## The refusals, which are also findings

Three outcomes that people hesitate to write down and should:

- **"The measurement does not support the change."** The optimisation was real and the effect was
  inside the noise. Report the interval and the fact that it overlaps.
- **"The bottleneck is elsewhere."** Amdahl's Law applies before the work, not after: a component
  that is 4% of the request cannot return more than 4%, however much faster it gets.
- **"There is no measurement yet."** The honest deliverable is the measurement to take, not a
  ranked list of plausible causes. `jvm-performance-review` treats this as a first-class output
  rather than a failure, and so should a report.

## What not to put in

- **A single number with no interval.** Two means that differ by 3% with overlapping intervals
  have not been shown to differ at all; `latency-statistics` owns why.
- **A mean latency.** Latency distributions are heavy-tailed. The mean is dominated by the
  routine case and hides the event that breaks the SLO.
- **A microbenchmark presented as a system result.** A JMH number is a statement about a method,
  and the conversion to a system prediction is arithmetic that must be shown, not assumed.
- **A percentage with no baseline.** "30% faster" needs the two absolute numbers and the load
  they were taken at, or it cannot be checked or reused. A mean of ratios across several
  workloads depends on which side is the base and can be made to favour either — Jain's
  "ratio game" (_The Art of Computer Systems Performance Analysis_, 1991, ch. 11).
- **The best run.** If runs were discarded as noisy, the report is the best of `k`, not a
  measurement. Report every run, or the number fixed in advance.
- **Numbers carried across a JDK, a machine or a load shape.** They are numbers about the
  configuration that produced them; `jdk-upgrade-impact` covers the version case.

## Writing it for the person who decides

The technical reader wants the mechanism. The person approving the work wants the trade. Both are
served by the same order, which is the one `engineering-communication` sets out: what is true,
what follows from it, what is still uncertain, the options, and a recommendation.

What this skill adds to that order is the evidence discipline: every "what is true" carries its
method, every "what follows" carries its mechanism, and "what is still uncertain" is the section
that must not be empty. If it is empty, the investigation stopped at the first plausible answer.
