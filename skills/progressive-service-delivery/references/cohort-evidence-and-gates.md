# Cohort evidence and gates

Read when choosing cohorts and evidence for a release decision. The arithmetic below is
synthetic, and the decision block is planning pseudocode; neither is a production query,
statistical test or measured rollout result.

## Define the population before reading the graph

Specify what was assigned, what actually reached the candidate, and what completed with
the changed behavior. Use the appropriate unit: attempts for a transport failure metric,
logical operations for a business outcome, completed work items for pipeline quality.
Reconcile admitted, completed, timed-out, cancelled and still-pending work so vanished
requests do not improve the success rate. Count retries separately where they matter;
their amplification can hurt a shared dependency even when the final outcome succeeds.

Record build and flag configuration revisions at the point the behavior is selected.
Bound metric label cardinality: release, region, operation and a small set of meaningful
cohort classes often suffice. Inspect individual tenant incidents through access-controlled
logs/traces or a governed analytical query; do not export every tenant identifier as a
permanent metrics label. Attribution does not require publishing customer identity.

Choose cohort assignment according to the invariant. Tenant assignment helps keep colleagues
in the same cohort when assignment rules and the effective configuration revision are
consistent across the relevant paths. Verify those paths during flag propagation; stable
tenant identity alone does not prevent conflicting behavior. Tenant cohorts can also
under-sample small tenants. Stable operation assignment keeps retries and a multi-step
workflow interpretable. An explicitly isolated
read-only candidate can compare responses without committing writes; if comparison invokes
business code, prove that notifications, billing, events and other effects are suppressed
or deduplicated under a shared authoritative contract.

Internal users are useful for an early smoke check but may lack real permissions, data
sizes, legacy clients and regional dependencies. Name that coverage limit. Before widening,
exercise representative risky operations, including the affected write path; successful
reads say little about a delayed settlement or nightly export.

## Require usable comparisons

Use the same metric definition and aligned, post-activation windows for candidate and
control. Capture collection delay and a measurement cutoff; a five-minute query spanning
pre-release data can dilute a short rollout. Compare within relevant strata before using
a combined result. Traffic mix, JVM warm-up, dependency changes and simultaneous releases
can confound a before/after difference; use contemporaneous control evidence where possible
and record shared effects that make even that comparison imperfect.

Choose a few user-visible harm signals: outcome correctness, availability, deadline success
and a relevant business invariant. Resource saturation and queue delay can explain or warn
of harm. Keep an absolute guard even if the candidate/control difference is small, because
a candidate can degrade their shared database and make both groups equally bad.

Derive minimum samples and windows from the regression worth detecting, ordinary variance,
rare operations and allowed exposure. Document the uncertainty method when the decision
depends on a statistical claim. Correlated retries or work from one tenant do not become
independent evidence merely by increasing the request counter. Repeatedly checking a
fixed-window significance test until it passes changes its error behavior. For statistical
promotion claims, use one predeclared final analysis or a method controlling error across
repeated looks; predetermined review windows alone do not provide that control. Severe-harm
containment need not wait for a statistical endpoint. Do not invent universal sample sizes
or use low-sample p99 estimates as decisive evidence.

If latency is aggregated, use mergeable distributions with compatible buckets/populations
or the actual observations. Averaging replica p99 values does not produce the cohort p99.
If the needed distribution is unavailable, return that evidence gap rather than computing
a reassuring but invalid aggregate.

## Check whether the exposure budget is feasible

Use the owner's remaining harm allowance after accounting for earlier steps.
For a fault that can harm each admitted operation, a simple exposure bound is `q * T + B`:
`q` is the enforced sustained admission ceiling for risky operations per second; `T` bounds
the time from fault onset to effective admission stopping; `B` bounds work already in
flight at fault onset plus any additional burst allowance. Count each operation once.
Include retry-driven admissions if they can produce additional harm. An average request
rate or replica percentage cannot establish `q`.

Include delayed outcome visibility, collection/query lag, decision scheduling, any operator
response and routing/flag convergence in `T`. A controller accepting the abort command does
not prove admission has stopped. These must be defensible bounds with margin, not average
timings. Unknown delay or unbounded background work leaves this bound unknown; consider a
bounded batch with admission stopped while awaiting outcomes.

Synthetic example: `q = 20/s`, `B = 100` and `T = 90s` allow 1,900 exposed operations,
exceeding a remaining allowance of 1,000. Change only the proven containment time to `30s`
and exposure is at most 700 under these assumptions. The second case fits this budget,
but still needs compatibility and sufficient cohort evidence before promotion. This is
an exposure calculation, not a prediction of failures. Shared-dependency damage, variable
monetary impact or multiple effects per operation require their own harm model.

If sufficient evidence cannot arrive within the allowed exposure, do not expand merely to
get samples. Reduce hazardous admissions, isolate the experiment, improve containment or
defer it; a lower rate can require a longer observation window and must be checked again.

## Worked decisions

Assume the predeclared candidate failure limit for this synthetic task is 1%, the fleet
limit is 0.5%, and comparable samples/coverage otherwise meet the task's policy:

| Population |  Attempts | Failures | Observed rate |
| ---------- | --------: | -------: | ------------: |
| Control    |   990,000 |      990 |          0.1% |
| Candidate  |    10,000 |      200 |            2% |
| Combined   | 1,000,000 |    1,190 |        0.119% |

The fleet passes its limit while the candidate fails. Abort further candidate exposure
and use its verified recovery path. Those limits are task inputs, not recommended defaults.

The same failure can hide _inside_ the candidate. Assume a predeclared 1% limit per region
as well. Suppose its 10,000 attempts contain 100 regional attempts with 20 failures and
9,900 elsewhere with none. Its combined rate is 0.2%, but the affected region is at 20%.
Apply the regional guard; do not average away
the region just because it is small. This demonstrates why the affected cohort must be
named before promotion rather than selected afterward to support a preferred result.

Contrast two otherwise identical candidates with no observed errors: one has covered the
required operations, business cycle and predeclared sample/uncertainty criteria; the other
has twelve requests and has not run the changed settlement path. The first can qualify
for the next bounded step if the other gates pass. The second remains inconclusive. A
longer wait is useful only if it can produce the missing evidence within the exposure
budget; otherwise use an isolated targeted exercise, change the cohort or defer the release.

## Decision wiring

Pseudocode; map outcomes onto the deployed controller's actual behavior:

```text
if credible severe harm or a predefined harm limit is breached:
    abort admission; run the compatible containment/recovery procedure
else if compatibility, recovery capacity or next-step prerequisites are unresolved:
    pause; keep current exposure only within its accepted risk budget
else if required evidence is absent, stale, invalid, insufficient or not representative:
    pause as inconclusive; assign owner, evidence action and investigation deadline
else if every required cohort passes its absolute and comparison gates:
    permit exactly the next bounded step; start a new attributed observation window
else:
    pause for the defined investigation; do not treat the unmatched state as success
```

Automated logic needs explicit tests for no traffic, a missing series, zero denominator,
provider failure, NaN/infinity, delayed outcomes, threshold equality and stale successful
results from a prior candidate. A tool's default treatment of an empty result may contradict
the release policy. Preserve the evaluated inputs and decision before retention deletes them.

Argo Rollouts supports successful, failed and inconclusive analysis; inconclusive runs can
pause the rollout, and query expressions determine handling of NaN and empty results. This
is an implementation example, not a required platform or proof that its sample configuration
enforces this policy. Pin the installed controller/CRDs, inspect the provider semantics,
and test the actual template before relying on it.

## Sources and limits

- [Google SRE Workbook: Canarying Releases](https://sre.google/workbook/canarying-releases/)
  supports separating candidate/control signals, representative populations and absolute
  checks when shared dependencies contaminate comparisons, and relates release impact to
  exposure and detection/recovery time. The bound and worked decisions above are this skill's
  application guidance with stated assumptions, not a universal numerical policy.
- [Pete Hodgson: Feature Toggles](https://martinfowler.com/articles/feature-toggles.html)
  describes stable cohorts, separating activation from deployment and keeping toggle
  decisions separate from their implementation. Local authorization and state contracts
  still determine which assignment unit is correct.
- [Argo Rollouts: Analysis](https://argoproj.github.io/argo-rollouts/features/analysis/)
  documents inconclusive runs and metric result handling. The page is version-evolving;
  confirm installed behavior rather than copying a success expression without its context.
- [Prometheus: Histograms and summaries](https://prometheus.io/docs/practices/histograms/)
  supports aggregating distributions rather than precomputed quantiles. It does not
  establish that the target service's instrumentation represents the intended population.
- [Johari, Pekelis and Walsh: Always Valid Inference](https://arxiv.org/abs/1512.04922v3)
  explains why continuous monitoring with data-dependent stopping invalidates ordinary
  fixed-sample inference and develops sequential alternatives. This skill does not select
  or implement a statistical test for an unspecified workload.

Sources consulted 2026-09-30. These sources and synthetic walkthroughs establish design
rationale; they do not validate a target service or measure an agent's behavior.
