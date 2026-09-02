---
name: tail-latency-analysis
description: >
  Where tail latency comes from and how to attack it: decomposing p99.9 into its
  contributors, tail amplification across fan-out and chained calls, hedged requests and
  their load cost, tail-tolerant design, and telling a systematic tail from a rare event.
  Use when p99 is fine but p99.9 is not, when each service meets its own SLO yet the
  user-facing request misses it, when per-stage p99s do not add up to the end-to-end p99,
  when a p99 spike needs to be attributed to GC, safepoint, cold start or throttling, when
  someone proposes hedging or an aggressive timeout-plus-retry, when a p50 optimisation
  made the tail worse, or when latency degrades for the first minutes after every deploy.
  Does not cover percentiles, histogram aggregation or sample adequacy
  (latency-statistics), the queueing contribution to the tail (queueing-models), or
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
`1-(1-0.01)^N`, so ten calls deliver roughly p90 and a hundred deliver roughly p37 — Dean
and Barroso's 63% (computed: 0.634). Every per-service SLO in a fan-out architecture has
to be derived backwards from the user-facing one, never copied from it.

## Workflow

1. **State the tail you are targeting and its budget.** Two percentiles minimum — p99 and
   p99.9 — plus the absolute max, which is a real stuck user, not a statistic. At a roughly
   constant arrival rate, an error budget of `x%` of requests is `x%` of the month:
   1% is ~7.2 h of a 30-day month, and that cross-check catches arithmetic errors.
2. **Establish whether the tail is systematic or a rare event.** Fit the shape: a dominant
   fast component plus one small slow component is one slow path; three or more stable
   components mean several distinct rare causes, and acting on one of them alone will not
   move the number. A smear with no second mode is queueing, not a cause.
3. **Check the temporal pattern before the amplitude.** The tail is not constant across the
   day — peak traffic, off-peak GC behaviour and post-deploy cold start each produce a
   different tail. Break p99 down per hour and per deployment before hypothesising.
4. **Decompose per stage before attributing.** Stage histograms first: if one stage's
   p99.9 matches the end-to-end p99.9, it owns the tail. If none does, the tail is
   correlated stages or a queue between them, and only per-request data — traces of the
   slow requests, a thresholded per-request event, exemplars — can say which. See
   `references/decomposing-the-tail.md`.
5. **Attribute the spike to a cause by duration, correlation and evidence.** Match the
   duration band, check whether every stage moved together (a shared pause) or one did,
   then confirm with the JFR or OS signal that names the cause, and hand it to the skill
   that owns it. See `references/attributing-the-tail.md`.
6. **Rule out cold start first.** Post-deploy tail degradation is uncompiled code, not a
   disabled JIT, and it resolves itself. Confirm or exclude it before investigating
   anything more exotic.
7. **Compute the fan-out amplification before blaming a single service.** With N parallel
   calls, `P(at least one exceeds) = 1-(1-p)^N`; the per-service budget is
   `1-(1-p_user)^(1/N)`. If the composite explains the number, no individual service is at
   fault. Chained calls share the probability formula but their latency is a sum, and a
   percentile of a sum is not a sum of percentiles.
8. **Choose the mitigation from the cause, then validate it on the same percentiles used
   to diagnose — and state its behaviour under an incident.** A hedge or retry that costs
   5% at nominal latency costs up to 100% when the callee degrades. See
   `references/hedging-and-tail-tolerance.md` for which lever fits which cause, hedging,
   tied requests, bounding and latency-aware balancing.

## Rules

- Never state an SLO at a single percentile. p99 alone leaves 1% unmeasured — at 1e9
  requests/day that is 10 million bad requests every day. Carry p99, p99.9 and the max.
- Never accept a per-service SLO that equals the user-facing SLO when there is fan-out.
  Derive each service's budget backwards from `1-(1-p)^N` — and state whether the calls
  are independent, because a shared host, pool or synchronised pause breaks the formula
  in both directions.
- Never add or subtract percentiles across stages. Independent stages give
  `p99(A+B) < p99(A)+p99(B)`; a shared cause gives roughly the sum. Per-stage p99s that
  "do not add up" are the normal state, and the discrepancy is itself the evidence of
  whether the tail is correlated.
- Always report the p99 and p99.9 impact of a p50 optimisation. A change that moves p50
  from 20 ms to 12 ms while moving p99 from 25 ms to 200 ms is a regression. Measure it
  with JMH `@BenchmarkMode(Mode.SampleTime)`, which reports percentiles; the default
  average mode cannot see this.
- Never discard latency outliers before analysis — no `> 2σ` filter, no silent trim. The
  outliers are the thing being measured. If data is genuinely invalid (clock skew,
  instrumentation bug), fix the cause rather than dropping the points.
- A tail measured by a closed-loop generator, or by a timer that records only completed
  calls, is under-counted precisely during the events under investigation; confirm the
  source is free of coordinated omission (`coordinated-omission`) before decomposing it.
- Use `jdk.GarbageCollection` with the `sumOfPauses` field to correlate GC with the tail,
  and `jdk.SafepointBegin` / `SafepointEnd` joined on `safepointId`, with
  `jdk.ExecuteVMOperation` for the operation name, for time-to-safepoint.
  `jdk.SafepointStateSynchronization` is disabled in both stock `.jfc` profiles, and
  `jdk.SafepointCleanup`, `jdk.GCPauseL3` and `jdk.SafepointWait` do not exist on JDK 25
  (`jfr metadata`, 25.0.3) — a runbook naming them was never executed. The phase events
  are `jdk.GCPhasePause` and `GCPhasePauseLevel1` to `4`.
- `-Xlog:gc` shows the GC's own work, not the time spent waiting for threads to reach the
  safepoint. A long TTSP is invisible there and can exceed the collection itself;
  `pause-attribution` assigns the missing milliseconds, `safepoints` owns the mechanism.
- Never describe post-deploy slowness as "the JIT is disabled". The JIT is never off by
  default; the interpreter and the compilers coexist under tiered compilation, and the
  early tail is code C1/C2 have not compiled yet.
- Set the hedge trigger from the overhead table, not by feel: triggering at p50 costs 50%
  extra backend load (1.5x total); p95–p99 costs 1–5%. State the chosen percentile and its
  cost in the change — and the hedge rate under the callee's worst observed degradation,
  because a fixed-millisecond trigger hedges every request once the callee is slow.
  Bound it with a hedge budget or an adaptive trigger; never ship the nominal 5% alone.
- Do not enable hedging when the slowness comes from a saturated shared resource — an
  exhausted connection pool, a downstream near capacity — or when it is correlated
  across replicas. Duplication adds load exactly where it already hurts. Hedging assumes
  a local, uncorrelated cause, an idempotent operation (`idempotency`), one hedging layer,
  and no retry policy on the same call.
- Retries are a tail lever only while budgeted: attempts multiply across layers (three
  layers at four attempts each reach the bottom as 64), and a per-client retry budget as a
  fraction of successful traffic is the only bound that survives an incident.
  `retries-and-backoff` owns the policy, `cascading-failures` the loop it feeds.
- Do not treat `least_conn` / `leastconn` as equivalent to P2C. Envoy `least_request`
  (default `choice_count` 2) and HAProxy `random(2)` sample two backends per decision;
  HAProxy `leastconn` and Nginx `least_conn` consult every backend and, across independent
  balancers or on a stale load signal, converge on the same "least loaded" one. Pick
  deliberately.

## References

- [Decomposing the tail](references/decomposing-the-tail.md) — the amplification table
  with verified numbers and the backward budget derivation, why a percentile of a sum is
  not a sum of percentiles in either direction, stage histograms versus per-request
  traces and the order to use them, systematic tail versus rare event, and the
  coordinated-omission trap. Read at step 4, or when per-stage dashboards disagree with
  the end-to-end number.
- [Attributing the tail](references/attributing-the-tail.md) — the duration taxonomy, the
  cause catalogue with signature, discriminator, measurement and owning skill for each
  JVM, OS and network source of tail, the real JFR event names and stock thresholds on
  JDK 25, the thresholded per-request event that joins to them, and the mitigation and
  validation metric per cause. Read when a p99 or p99.9 spike needs a named cause rather
  than a hypothesis.
- [Hedging and tail tolerance](references/hedging-and-tail-tolerance.md) — which lever
  fits which cause, the hedge trigger cost table and the incident failure mode that turns
  5% into 100%, tied requests as the paper defines them, budgeted timeout-plus-retry and
  retry amplification, the paper's cross-request adaptations, synchronising background
  work behind a fan-out, and P2C versus deterministic least-connections. Read before
  enabling hedging, tightening a timeout, or changing a load-balancing policy for tail
  reasons.
