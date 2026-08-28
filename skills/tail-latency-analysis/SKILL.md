---
name: tail-latency-analysis
description: >
  Where tail latency comes from and how to attack it: decomposing p99.9 into its
  contributors, tail amplification across fan-out and chained calls, hedged requests and
  their load cost, tail-tolerant design, and telling a systematic tail from a rare event.
  Use when p99 is fine but p99.9 is not, when each service meets its own SLO yet the
  user-facing request misses it, when a p99 spike needs to be attributed to GC, safepoint,
  cold start or throttling, when someone proposes hedging or an aggressive timeout-plus-
  retry, when a p50 optimisation made the tail worse, or when latency degrades for the first
  minutes after every deploy. Does not cover percentiles, histogram aggregation or sample
  adequacy (latency-statistics), the queueing contribution to the tail (queueing-models), or
  turning the analysis into a capacity decision (capacity-planning).
---

# Tail Latency Analysis

## Purpose

Decide what is producing the tail and what will actually shrink it. The failure this skill
prevents is attacking the tail with the wrong lever: adding replicas when the cause is a
stop-the-world pause shared by every in-flight request, or enabling hedging when the cause
is a saturated shared resource that duplication makes worse.

The tail is not a worse version of the median. It is governed by the maximum, and in
fan-out it composes multiplicatively: N independent calls each meeting p99 give the user
`1-(1-0.01)^N`, so ten calls deliver roughly p90 and a hundred deliver roughly p37. Every
per-service SLO in a fan-out architecture has to be derived backwards from the user-facing
one, never copied from it.

## Workflow

1. **State the tail you are targeting and its budget.** Two percentiles minimum — p99 and
   p99.9 — plus the absolute max, which is a real stuck user, not a statistic. At a roughly
   constant arrival rate, an error budget of `x%` of requests is `x%` of the month:
   1% is ~7.2 h of a 30-day month, and that cross-check catches arithmetic errors.
2. **Establish whether the tail is systematic or a rare event.** Fit the shape: a dominant
   fast component plus one small slow component is one slow path; three or more stable
   components mean several distinct rare causes, and acting on one of them alone will not
   move the number.
3. **Check the temporal pattern before the amplitude.** The tail is not constant across the
   day — peak traffic, off-peak GC behaviour and post-deploy cold start each produce a
   different tail. Break p99 down per hour and per deployment before hypothesising.
4. **Attribute the spike to a cause by duration and by evidence.** Match the duration band
   to the taxonomy, then confirm it with the correct JFR events rather than inference. See
   `references/attributing-the-tail.md`.
5. **Rule out cold start first.** Post-deploy tail degradation is uncompiled code, not a
   disabled JIT, and it resolves itself. Confirm or exclude it before investigating
   anything more exotic.
6. **Compute the fan-out amplification before blaming a single service.** With N parallel
   calls, `P(at least one exceeds) = 1-(1-p)^N`. Chained calls compose the same way. If the
   composite explains the number, no individual service is at fault.
7. **Choose the mitigation from the cause, then validate it on the same percentiles used
   to diagnose.** See `references/hedging-and-tail-tolerance.md` for hedging, bounding and
   latency-aware balancing.

## Rules

- Never state an SLO at a single percentile. p99 alone leaves 1% unmeasured — at 1e9
  requests/day that is 10 million bad requests every day. Carry p99, p99.9 and the max.
- Never accept a per-service SLO that equals the user-facing SLO when there is fan-out.
  Derive each service's budget backwards from `1-(1-p)^N`.
- Always report the p99 and p99.9 impact of a p50 optimisation. A change that moves p50
  from 20 ms to 12 ms while moving p99 from 25 ms to 200 ms is a regression. Measure it
  with JMH `@BenchmarkMode(Mode.SampleTime)`, which reports percentiles; the default
  average mode cannot see this.
- Never discard latency outliers before analysis — no `> 2σ` filter, no silent trim. The
  outliers are the thing being measured. If data is genuinely invalid (clock skew,
  instrumentation bug), fix the cause rather than dropping the points.
- Use `jdk.GarbageCollection` with the `sumOfPauses` field to correlate GC with the tail,
  and `jdk.SafepointStateSynchronization` / `SafepointBegin` / `SafepointEnd` /
  `SafepointCleanup` for time-to-safepoint. `jdk.GCPauseL3` and `jdk.SafepointWait` do not
  exist in any HotSpot JFR — a runbook naming them was never executed.
- `-Xlog:gc` shows the GC's own work, not the time spent waiting for threads to reach the
  safepoint. A long TTSP is invisible there and can exceed the collection itself.
- Never describe post-deploy slowness as "the JIT is disabled". The JIT is never off by
  default; the interpreter and the compilers coexist under tiered compilation, and the
  early tail is code C1/C2 have not compiled yet.
- Set the hedge trigger from the overhead table, not by feel: triggering at p50 costs 50%
  extra backend load (1.5x total); p95–p99 costs 1–5%. State the chosen percentile and its
  cost in the change.
- Do not enable hedging when the slowness comes from a saturated shared resource — an
  exhausted connection pool, a downstream near capacity. Duplication adds load exactly
  where it already hurts. Hedging assumes a local, uncorrelated cause.
- Do not treat `least_conn` / `leastconn` as equivalent to P2C. Envoy `least_request`
  (default `choice_count` 2) and HAProxy `random(2)` sample two backends per decision at
  O(1); HAProxy `leastconn` and Nginx `least_conn` full-scan at O(N) and can converge on
  the same "least loaded" backend under concurrent decisions. Pick deliberately.

## References

- [Attributing the tail](references/attributing-the-tail.md) — the duration taxonomy of
  tail causes, the JFR events and commands that confirm each one, and the mitigation and
  validation metric per cause. Read when a p99 or p99.9 spike needs a named cause rather
  than a hypothesis.
- [Hedging and tail tolerance](references/hedging-and-tail-tolerance.md) — hedge trigger
  cost table, tied requests, the conditions under which hedging backfires, bounded
  timeout-plus-retry, and P2C versus deterministic least-connections. Read before enabling
  hedging, tightening a timeout, or changing a load-balancing policy for tail reasons.
