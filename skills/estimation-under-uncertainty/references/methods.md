# Methods and arithmetic

## Three-point estimation and PERT

For each piece, three numbers:

- **O** — optimistic: everything you can foresee goes right.
- **M** — most likely: the value you would have given as a single number.
- **P** — pessimistic: everything you can _name_ goes wrong. Not the meteor; the integration
  that turns out to need a second round trip, the reviewer who is on leave, the migration that
  has to be rewritten.

PERT approximates the distribution with:

```
E  = (O + 4M + P) / 6          expected value
SD = (P − O) / 6               standard deviation
```

Worked, with O = 2, M = 3, P = 10 days:

```
E  = (2 + 12 + 10) / 6 = 4.00 days
SD = (10 − 2) / 6      = 1.33 days
```

**The expected value is 4 days, but the most likely value is 3.** That gap is the whole point.
Software estimates are right-skewed — there are far more ways for a task to take longer than to
take less — so the number that first comes to mind is systematically optimistic. Not because
the estimator is careless; because the mode of a skewed distribution is below its mean.

## Combining pieces

Expected values add. Standard deviations do **not** — variances add, so the combined SD grows
with the square root of the number of independent pieces:

```
E_total  = Σ Eᵢ
SD_total = √( Σ SDᵢ² )
```

Five tasks each with E = 4.00 and SD = 1.33:

```
E_total  = 20.0 days
SD_total = √5 × 1.33 = 2.98 days

50% confident:  20.0 days
80% confident:  22.5 days
90% confident:  23.8 days
95% confident:  24.9 days
```

Compare the two shortcuts people actually use:

| Approach                  | Result    | What it means                                   |
| ------------------------- | --------- | ----------------------------------------------- |
| Sum of most-likely values | 15 days   | You will beat this roughly never                |
| PERT expected value       | 20 days   | Coin flip                                       |
| PERT at 80%               | 22.5 days | A number you can plan against                   |
| Sum of pessimistic values | 50 days   | Assumes every task's worst case, simultaneously |

Both shortcuts are wrong in opposite directions, and both destroy trust — the first by being
late every time, the second by being so padded that nobody believes any estimate you give.

Note the good news buried in the square root: aggregating **reduces** relative uncertainty.
±33% on one task becomes ±15% across five, provided the risks are genuinely independent.

## Where the independence assumption breaks

The square root only holds for independent pieces. Correlated risk defeats it, and correlation
is the norm in the cases that hurt:

- One unfamiliar technology underlies six tasks — if it is harder than expected, all six slip.
- One person is the only one who can do four of the pieces.
- All the estimates were made by the same person on the same optimistic afternoon.

When you spot a shared risk, do not model it as a task. Name it as a risk with its own impact:
"if the provider's API needs OAuth rather than an API key, add 3–5 days across the whole plan."
That is more useful than smearing the same contingency into every line.

## Decomposition

Decompose until each piece is comparable to something you have actually done. The comparison —
not the arithmetic — is where accuracy comes from.

Two effects, both valuable:

1. **Errors partially cancel.** Some pieces are over-estimated, some under.
2. **Forgotten work becomes visible.** This is usually the larger effect. "Add an export
   endpoint" is one line until decomposition surfaces the authorisation check, the audit
   record, the rate limit, the timezone rendering and the integration test.

Stop decomposing when a piece is under about a day. Below that the estimation overhead exceeds
the accuracy gained, and the pieces stop being independently comparable to anything.

## Reference-class forecasting: use your own history

The strongest available method, and the least used: instead of asking "how long will this
take?", ask "how long did the last three comparable things take?"

It works because it captures everything your introspection omits — review latency, the
interruptions, the environment being down for a day, the rework after the first demo. Those
costs are stable per team and invisible per task.

Practical version, needing no process change:

1. Find three past changes of similar shape. Not similar _size as estimated_ — similar shape.
2. Take their actual elapsed time, from start to merged-and-deployed.
3. Use that spread as the starting range, and adjust only for named, specific differences.

When someone says "but this one is simpler", ask what specifically is simpler and by how much.
The answer is often "we understand it better now", which is what the previous team also said.

## The cone of uncertainty

Estimate accuracy is bounded by what is knowable at the time. Very early — before the
requirement is pinned down — being out by a factor of two in either direction is normal, and no
amount of care in the arithmetic fixes it, because the variance is in the scope, not in the
estimation.

Consequences worth stating out loud:

- An early estimate should be given as a factor-of-two range, or as "we can tell you within a
  week after a two-day spike". Both are honest; a single number is not.
- Re-estimating is not a failure. It is the mechanism by which the cone narrows, and a plan
  that never re-estimates is one that has stopped taking in information.
- If precision is demanded before scope exists, the productive answer names the trade:
  "I can give you ±50% today, or ±20% after two days of investigation."

## Monte Carlo, when it is worth it

For a plan with many tasks and real dependencies, sample each task's distribution a few
thousand times and read the completion percentiles off the result. It handles dependency chains
and asymmetric distributions that PERT's closed form does not.

Worth it for a quarter-scale plan; overkill for a two-week feature, where PERT's arithmetic
gets you to the same decision. If you are running Monte Carlo on inputs that are themselves
guesses, the precision is theatre — spend the effort on decomposition and history instead.

## Common distortions

| Distortion                                   | Correction                                                |
| -------------------------------------------- | --------------------------------------------------------- |
| Estimating only the coding                   | Include review, rework, migration, deploy; use history    |
| Anchoring on the number the asker said first | Estimate before hearing their date; then compare          |
| Estimating for the best possible day         | Pessimistic case must include realistic interruption      |
| One person estimating alone                  | Two independent estimates; discuss only where they differ |
| Silent padding                               | Explicit buffer at plan level, visibly owned              |
| Treating a stale estimate as still valid     | Re-estimate on new evidence and say it changed            |
