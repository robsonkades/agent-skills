# Methods and arithmetic

## Three-point estimation and PERT

For each piece, three numbers:

- **O** — optimistic bound under the declared scope and risk model.
- **M** — mode (most likely value), not automatically the mean or P50.
- **P** — pessimistic bound under that same model; not an arbitrary collection of every
  imaginable failure. Check `0 <= O <= M <= P` and state units.

If eliciting P10/P50/P90 instead, fit or select a distribution consistent with those
quantiles and acknowledge unconstrained tails. Do not insert quantiles into the bound-based
formula below and retain its probabilistic interpretation.

The traditional PERT approximation uses:

```
E  = (O + 4M + P) / 6          expected value
SD ≈ (P − O) / 6               classical heuristic standard deviation
```

Worked, with O = 2, M = 3, P = 10 days:

```
E  = (2 + 12 + 10) / 6 = 4.00 days
SD = (10 − 2) / 6      = 1.33 days
```

**The formula's expected value is 4 days, while its modal input is 3.** That distinction is useful,
but the beta-distribution shape and endpoint interpretation are modelling assumptions, not measured
facts. The range/6 variance shortcut is not the exact variance of every beta-PERT
parameterization. State which distribution or heuristic you use. Model probabilities can be
reported conditionally; claiming observed reliability requires outcome-based calibration.
All numbers below are illustrative, not observed delivery data.

## Combining pieces

Expected values add for a sum of durations or effort. Project elapsed time also needs
precedence, resource capacity, working calendars and integration waits: parallel branches
waiting for all completions use a maximum, not a sum. The following is a fixed sequential
sum, not a general project schedule. For uncorrelated pieces, variances add:

```
E_total  = Σ Eᵢ
SD_total = √( Σ SDᵢ² )
Var_total = Σ SDᵢ² + 2 Σᵢ<ⱼ Cov(Tᵢ, Tⱼ)    general finite-variance sum
```

Five tasks each with E = 4.00 and SD = 4/3, independent and sequential:

```
E_total  = 20.0 days
SD_total = √5 × (4/3) = 2.98 days

Normal approximation, P50: 20.0 days
Normal approximation, P80: 22.5 days
Normal approximation, P90: 23.8 days
Normal approximation, P95: 24.9 days
```

Compare the two shortcuts people actually use:

| Approach                  | Result    | What it means                                                   |
| ------------------------- | --------- | --------------------------------------------------------------- |
| Sum of most-likely values | 15 days   | Usually optimistic for right-skewed work; probability unknown   |
| PERT expected value       | 20 days   | Mean of this model, not necessarily its median                  |
| Normal approximation P80  | 22.5 days | Conditional model deadline, not empirically calibrated coverage |
| Sum of pessimistic values | 50 days   | Assumes every task's worst case, simultaneously                 |

Both shortcuts discard probability information in opposite directions. Their calibration must be
checked against actual outcomes rather than asserted from the arithmetic alone.

Five skewed tasks need not have an approximately normal sum; the percentile rows are
conditional arithmetic, not validation of normality. P80 means predicted completion by
22.5 days under this approximation, not 80% coverage of an unspecified interval.

In this independent equal-task example, aggregation reduces relative uncertainty.
SD/mean of 33% on one task becomes 15% across five under these assumptions; these are
coefficients of variation, not confidence-interval bounds. With perfect positive correlation,
the five-task SD is `5 × (4/3) = 6.67`, so relative uncertainty does not shrink.

## Task percentiles are not project percentiles

The additivity of expected values does not apply to quantiles. For a small exact example,
suppose each of two tasks takes 1 day with probability 0.8 or 10 days with probability 0.2.
These are invented model inputs, not team observations. Define P80 here as the smallest
duration whose cumulative completion probability is at least 0.8; each task's P80 is 1 day.

For independent sequential tasks, enumerate their joint outcomes:

| Total duration | Probability | Cumulative probability |
| -------------- | ----------- | ---------------------- |
| 2 days         | 0.64        | 0.64                   |
| 11 days        | 0.32        | 0.96                   |
| 20 days        | 0.04        | 1.00                   |

Adding the task P80s gives 2 days, with only 64% model completion probability. The project's
P80 is 11 days under this discrete convention; its coverage exceeds 80% because the CDF jumps.
If both tasks start together with sufficient separate capacity and both must finish, project
duration is their maximum: completion by 1 day still has probability 0.64, so project P80 is
10 days. Taking the largest individual P80 would again be wrong.

Change only dependence: one shared outcome makes both tasks fast with probability 0.8 or both
slow with probability 0.2. The same marginal task distributions now give sequential project
P80 of 2 days (parallel P80 of 1 day). The sequential expected total remains 5.6 days in both
models. This is a counterexample to percentile shortcuts, not a reason to choose a dependence
model that satisfies a target. Establish shared risk drivers from evidence; if dependence is
unknown, show conditional scenarios instead of claiming a uniquely determined project P80.

For empirical samples, record the tool's quantile/interpolation convention when it affects
the decision, especially for small or discrete samples. The exact CDF calculation above is
not an empirical percentile estimator and does not establish calibration on real deliveries.

## Where the independence assumption breaks

The sum-of-variances shortcut needs zero covariances. Shared uncertain factors can correlate
durations:

- One unfamiliar technology underlies six tasks — if it is harder than expected, all six slip.
- One person's uncertain productivity affects several pieces in the same direction.
- All the estimates were made by the same person on the same optimistic afternoon.

Sharing one person also imposes a capacity constraint: two otherwise independent tasks cannot
run concurrently if both require that person's full capacity. Reserve that capacity in the
schedule; do not substitute perfect duration correlation for scheduling. Model common uncertain
effects separately when supported. If sampled elapsed durations already include resource waits,
do not add those same waits again.

Represent each shared risk driver once, with its probability/scenario and effects on affected
tasks. In simulation, sample a common realization and propagate the relevant impacts; do not
draw independent copies of the same risk occurrence for each task. Count a common wait where it occurs in the
schedule, while retaining distinct additional work required in each affected task. Avoid adding
the same impact again as contingency; explicit mitigation work can be a task. An aggregate
impact across the plan is also usable when its scope is clear. For example:
"if the provider's API needs OAuth rather than an API key, add 3–5 days across the whole plan."
Here 3–5 days must cover the combined additional work, not silently omit separate integration
changes or repeat them in every line.

## Decomposition

Use decomposition to expose work and obtain useful comparisons. Retain an adequate whole-change
reference class; arithmetic and finer task boundaries do not resolve genuinely unfamiliar work.

Two effects, both valuable:

1. **Errors may partially cancel.** Shared bias or omitted scope will not cancel.
2. **Forgotten work becomes visible.** This is usually the larger effect. "Add an export
   endpoint" is one line until decomposition surfaces the authorisation check, the audit
   record, the rate limit, the timezone rendering and the integration test.

Stop when further detail would not change a decision or expose a material dependency/risk.
Do not split work solely to manufacture independent inputs or narrower intervals.

## Reference-class forecasting: use your own history

Use comparable historical work to challenge inside-view estimates: how long did similar
changes take under similar delivery conditions?

It can capture costs introspection omits — review latency, the
interruptions, the environment being down for a day, the rework after the first demo. Those
costs may change with staffing, queues, scope and delivery process; inspect comparability.
If someone says this change is simpler, identify the concrete difference and its expected
effect before adjusting the reference class; greater familiarity alone does not quantify it.

Build a small evidence set from existing project records; a short estimate need not create
a separate tracking system:

1. **Define the comparison.** State the forecast origin, horizon, start/end events, units and
   calendar. Select by relevant work content and delivery conditions: for example, ordinary
   changes with the same review and release process, rather than expedited incident fixes.
   Record the time window, data cutoff and selection rule; do not choose only fast outcomes
   or change the rule to make the target fit.
2. **Trace the actual events.** Inspect available issue state transitions, linked pull requests,
   release/deployment records and acceptance evidence as needed by the completion criterion.
   Issue creation need not mean work started; merge need not mean deployed or enabled for users.
   Join records by delivery identity so several PRs for one change do not become several
   whole-change observations. Commit timestamps alone do not measure active person-hours.
   If a source is inaccessible or a search fails, name that limit and the specific missing
   event; do not conclude that no history exists or substitute another event silently.
3. **Check the sample before calculating.** Retain source IDs/links and observed dates with
   each included duration. Reconcile conflicting dates and calendars; missing dates are not
   zero durations. Separate known unfinished work from missing completion records and report
   exclusions with reasons. Inspect unusually long cases before excluding them: legitimate
   waits or rework may be exactly what the forecast must cover. Use the remaining-time rules
   below for ongoing work; completed-only selection can bias forecasts.
4. **Check transfer to this change.** Compare scope, capacity, approval gates and release cadence.
   Separate materially different groups or show conditional scenarios when their differences
   affect the decision; pooling them merely to increase sample size does not resolve the mismatch.
   Support any adjustment with its mechanism and evidence. Do not add review/deployment waits
   already present in the selected elapsed-time observations.
5. **Report what the evidence supports.** Show sample count and observed spread, not automatically
   an 80% or 90% prediction interval. Three observations give little information about tails.
   A compact basis can be `source | start/end | duration/status | selection reason`.
   If the usable history is sparse or mismatched, state which bounds remain unsupported
   and use justified scenarios or elicitation; identify the next evidence needed for the decision.

Retain forecast snapshots and use the feedback procedure below. Revisions are useful evidence,
but nine forecasts for one delivery are not nine independent delivery outcomes. Group by
delivery and forecast origin when comparing methods.

For a hypothetical event-definition check, two changes start on June 3 and June 4, merge on
June 5 and June 7, and both become available to users on June 12. Using elapsed calendar days,
start-to-merge observations are 2 and 3 days; start-to-availability observations are 9 and 8.
If the requested milestone changes from merged code to user availability, change the endpoint
and basis accordingly. Do not relabel 2–3 days as delivery time or add the release wait twice
to 8–9 days. Neither two-point spread establishes future coverage; these are teaching inputs.

## Remaining time for unfinished work

For work already underway, forecast remaining time from its current state and elapsed age.
Use comparable remaining-work evidence or an explicitly conditional model; subtracting elapsed
time from a fresh-work mean or percentile ignores that this item is still unfinished. Sparse
history may support only scenarios or no numerical forecast; do not force a fitted model.

For an exact illustrative model, total duration `T` is 2 days with probability 0.5, 6 days
with probability 0.3, or 12 days with probability 0.2. Its fresh-work P80 is 6 days. If the
item is still unfinished after 5 days and that is the only new information, condition on
`T > 5`: remaining time is 1 day with probability 0.6 or 7 days with probability 0.4.
Its remaining P80 is 7 days, not `6 - 5 = 1`. The change follows from conditioning,
not a measured improvement in estimation. These probabilities are invented teaching inputs.

Elapsed age is not the whole state: an observed test failure, completed migration or new
approval gate can invalidate an age-only model. Use those facts when they change the remaining
work. At a fixed data cutoff, record ongoing items as unfinished at their observed age; do not
treat that age as a completed duration or discard them silently. Cancellation or scope changes
need explicit treatment; they need not be ordinary censoring independent of delivery difficulty.

## Learn from outcomes without rewriting history

For recurring estimates, keep a small record in the existing planning artifact; do not invent
past forecasts from current knowledge. Capture the delivery identifier, forecast timestamp,
scope/completion definition, units/calendar, forecast value and meaning (scenario, quantile or
interval), input/model version and material assumptions. Append the observed outcome or current
status with its date. Keep the original and each revision separately.

- **Match the check to the claim.** For a P80 deadline, record completion by that deadline.
  For a central interval, record early/inside/late outcomes and interval width. Report counts
  and eligible sample size, not only a percentage; one miss neither proves nor disproves
  calibration. Exact 80% coverage is not required of a small sample or a discrete quantile.
- **Keep unresolved cases visible.** Once a deadline passes with work unfinished, its deadline
  hit is already false even though exact duration is unknown. An unfinished item with a future
  deadline is still pending. Do not call pending items hits or exclude known misses as "not completed".
  For duration-error scoring, report unavailable outcomes separately rather than filling in ages.
- **Compare useful forecasts.** More coverage obtained only by widening intervals is not enough
  to show improvement. Compare width and miss severity at the same nominal coverage, scope and
  forecast horizon; quantile loss or an interval score can support repeated method comparisons.
  A deadline hit-rate comparison alone also needs to show how far dates moved.
- **Change a mechanism, then test it.** Check recorded evidence for omitted work, changed queues,
  scope or capacity before applying a multiplier. Treat explanations as hypotheses unless the
  record supports them. Evaluate a proposed correction on later comparable deliveries or replay
  historical forecast origins using only information available then, against the current method.
  Do not call an in-sample fit or one successful revision a proven improvement. If conditions
  have changed, report that old calibration may no longer transfer.

A scope change does not justify silently deleting a miss. Preserve it with the changed assumption
and state which forecasts remain comparable; do not fabricate a counterfactual completion date
for the original scope. A changed target or commitment is also not an observed delivery outcome.

## The cone of uncertainty

Early scope uncertainty cannot be repaired by arithmetic alone. The cone is a qualitative
reminder, not evidence that every project fits a factor-of-two range or narrows automatically.

Consequences worth stating out loud:

- Give a conditional scenario range when evidence permits; otherwise identify the scope
  decision or investigation needed before forecasting.
- Re-estimating incorporates new evidence; it may narrow, widen or move the range.
  Preserve earlier estimates to evaluate calibration rather than erasing misses.
- If precision is demanded before scope exists, timebox investigation and name the questions
  it will address. Do not promise that two days of investigation buys a particular accuracy.

## Monte Carlo, when it is worth it

Sample from the declared duration model and recalculate the resource-constrained dependency
network each time. Encode shared risks/correlation, calendars and availability; sampling durations alone
does not model them. Record input provenance, distribution choices, seed and sample count;
check percentile stability across seeds and increased sample counts at the resolution needed
for the decision, as well as sensitivity to uncertain assumptions. No fixed iteration count
establishes accuracy.

Use simulation when dependency structure or tail risk could change the decision, regardless
of plan length. More samples reduce simulation noise, not input/model error. With weak
inputs, report scenario sensitivity and improve the evidence rather than presenting precise
percentiles as calibrated facts.

## Common distortions

| Distortion                                   | Correction                                                 |
| -------------------------------------------- | ---------------------------------------------------------- |
| Estimating only the coding                   | Include review, rework, migration, deploy; use history     |
| Anchoring on the number the asker said first | Derive forecast from evidence; compare the supplied target |
| Estimating for the best possible day         | Pessimistic case must include realistic interruption       |
| One person estimating alone                  | Seek an independent view when it can change the decision   |
| Silent padding                               | Explicit buffer at plan level, visibly owned               |
| Treating a stale estimate as still valid     | Re-estimate on new evidence and say it changed             |

## Sources

- [GAO Schedule Assessment Guide, Best Practices 3, 4, 8 and 9](https://www.gao.gov/assets/gao-16-89g.pdf): resource-aware schedules, documented duration assumptions and historical basis, dependencies, correlation, schedule risk analysis and updating from actual progress. Its project examples are not software-team calibration data.
- [GAO Cost Estimating and Assessment Guide, chapter 9](https://www.gao.gov/assets/gao-20-195g.pdf): collecting, validating and comparing historical data. The project-record procedure above adapts its data-applicability principles; it does not transfer a cost model to software duration.
- [DORA software delivery performance metrics](https://dora.dev/guides/dora-metrics/): change lead time measures committed code through production deployment. That event pair is distinct from total feature development or user availability; choose the pair required by the forecast.
- [NIST prediction uncertainty](https://www.itl.nist.gov/div898/handbook/pmd/section5/pmd512.htm): prediction for a future observation differs from uncertainty in an estimated mean. The worked PERT arithmetic above remains a stated heuristic.
- [NIST percentiles](https://www.itl.nist.gov/div898/handbook/prc/section2/prc262.htm): empirical quantile conventions can differ, particularly for small samples. The two-task example is exact enumeration of a declared model; it is not a NIST dataset.
- [NIST censoring](https://www.itl.nist.gov/div898/handbook/apr/section1/apr131.htm): unfinished observations provide bounds, not completed durations. Its reliability examples do not establish a software delivery distribution; the remaining-time example above is exact conditional arithmetic.
- [Forecasting: Principles and Practice, sections 5.9–5.10](https://otexts.com/fpp3/toolbox.html): quantile/interval scores and forecast-origin evaluation without future-data leakage. The feedback procedure adapts these principles to delivery records; it does not assume software deliveries form a time series or prescribe a fitted model.
