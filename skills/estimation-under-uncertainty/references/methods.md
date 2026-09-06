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
parameterization. State which distribution or heuristic you use; calibrate before making
a probability claim. All numbers below are illustrative, not observed delivery data.

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

## Where the independence assumption breaks

The sum-of-variances shortcut needs zero covariances. Shared risk can defeat it, and correlation
is the norm in the cases that hurt:

- One unfamiliar technology underlies six tasks — if it is harder than expected, all six slip.
- One person is the only one who can do four of the pieces.
- All the estimates were made by the same person on the same optimistic afternoon.

Represent a shared risk once, with its probability/scenario and effect on affected tasks;
explicit mitigation work can be a task. Avoid counting the same delay in several independent
inputs and then again as contingency. For example:
"if the provider's API needs OAuth rather than an API key, add 3–5 days across the whole plan."
That is more useful than smearing the same contingency into every line.

## Decomposition

Decompose until each piece is comparable to something you have actually done. The comparison —
not the arithmetic — is where accuracy comes from.

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

It works because it captures everything your introspection omits — review latency, the
interruptions, the environment being down for a day, the rework after the first demo. Those
costs may change with staffing, queues, scope and delivery process; inspect comparability.

Practical version, needing no process change:

1. Collect comparable changes and report sample size, selection criteria and time window.
2. Take their actual elapsed time, from start to merged-and-deployed.
3. Use the observed spread as evidence, not automatically an 80% or 90% prediction interval.
   Three observations give little information about tails. Record named differences and
   unfinished work excluded from the sample; completed-only selection can bias forecasts.
4. Preserve the forecast made at each decision point. Check later deadline hit rates or
   interval coverage across comparable outcomes, as well as interval width; distinguish
   scope changes from estimation errors. Avoid tuning and evaluating on the same examples.

When someone says "but this one is simpler", ask what specifically is simpler and by how much.
The answer is often "we understand it better now", which is what the previous team also said.

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

For a plan with many tasks and real dependencies, sample each task's distribution a few
thousand times and recalculate the resource-constrained dependency network each time. Encode
shared risks/correlation, calendars and availability; sampling individual durations alone
does not model them. Record input provenance, distribution choices, seed and sample count;
check percentile stability across runs and sensitivity to uncertain assumptions.

Use simulation when dependency structure or tail risk could change the decision, regardless
of plan length. More samples reduce simulation noise, not input/model error. With weak
inputs, report scenario sensitivity and improve the evidence rather than presenting precise
percentiles as calibrated facts.

## Common distortions

| Distortion                                   | Correction                                                |
| -------------------------------------------- | --------------------------------------------------------- |
| Estimating only the coding                   | Include review, rework, migration, deploy; use history    |
| Anchoring on the number the asker said first | Estimate before hearing their date; then compare          |
| Estimating for the best possible day         | Pessimistic case must include realistic interruption      |
| One person estimating alone                  | Two independent estimates; discuss only where they differ |
| Silent padding                               | Explicit buffer at plan level, visibly owned              |
| Treating a stale estimate as still valid     | Re-estimate on new evidence and say it changed            |

## Sources

- [GAO Schedule Assessment Guide, Best Practices 3 and 8](https://www.gao.gov/assets/gao-16-89g.pdf): resource-aware schedules, dependencies, correlation and schedule risk analysis. Its project examples are not software-team calibration data.
- [NIST prediction uncertainty](https://www.itl.nist.gov/div898/handbook/pmd/section5/pmd512.htm): prediction for a future observation differs from uncertainty in an estimated mean. The worked PERT arithmetic above remains a stated heuristic.
