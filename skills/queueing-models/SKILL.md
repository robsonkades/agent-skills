---
name: queueing-models
description: >
  Choosing a queueing model and reading what it says: M/M/1 versus M/M/c versus M/G/1 versus
  M/D/1, the Erlang C and Erlang B formulas, Kingman's G/G/1 approximation, the service-time
  coefficient of variation, and what each model's assumptions cost when they are violated.
  Use when a predicted wait time disagrees with the measured one, when latency is far worse
  than utilisation suggests, when service times are bimodal or GC-spiked, when arrivals are
  retries or cron bursts rather than independent users, when Erlang C must be computed for a
  large number of servers, or when deciding whether a measured p99 is even reachable by an
  M/* model. Does not cover the N = lambda x R law, the utilisation cliff as a rule of
  thumb, or thread and connection pool sizing (littles-law-and-queueing), the alpha/beta
  scalability model (universal-scalability-law), or the statistics of the measured numbers
  themselves (latency-statistics).
---

# Queueing Models

## Purpose

Pick the model whose assumptions the system actually satisfies, and know in which direction
it lies when they do not. The failure this skill prevents is the confident M/M/c prediction
applied to a service whose real behaviour breaks its premises — bimodal query times,
retry-correlated arrivals, a pool whose nominal size is not its number of servers — producing
a wait-time estimate that is optimistic by a factor of two to five exactly where the SLO
lives.

Every model here is one formula plus a set of assumptions. The formula is the cheap part.
Which parameters you feed it, and which assumption you have quietly broken, is the work.

## Workflow

1. **Write down the Kendall notation you are claiming** — `A/S/c` at minimum. Naming the
   arrival distribution, the service distribution and the number of servers forces each
   assumption into the open before any number is produced.
2. **Test the arrival assumption.** "M" means Poisson: independent, memoryless arrivals. HTTP
   traffic from independent users fits. Cascading retries, cron fan-out and batch jobs do not
   — they are temporally correlated, and any M/* model will understate the queue.
3. **Measure `c_s`, the coefficient of variation of service time**, from real samples —
   `std/mean` — instead of assuming it is 1. Below 0.5 the service is nearly deterministic;
   around 1.0 exponential; above 1.5 heavy-tailed, and the M/* percentiles are badly
   optimistic.
4. **Choose the model from those two answers**, not from familiarity. See
   `references/model-selection-and-formulas.md`.
5. **Parameterise it from measurements taken correctly**, especially the effective `c` and a
   `mu` measured at low utilisation. See `references/measuring-the-parameters.md`.
6. **Validate against a real measurement before acting.** Predicted versus measured `Wq`
   within 30% means the model applies as-is. Beyond that, re-fit with Kingman using the
   measured `c_a` and `c_s` rather than adjusting the answer by hand.
7. **Read percentiles, not just the mean.** For M/M/1 and M/M/c the wait distribution has a
   closed form, so p50/p95/p99 come out of the model directly — and the p50 is often below
   the mean, which is the whole reason means mislead here.

## Rules

- State the model as `A/S/c` before quoting any number from it. A wait time with no declared
  model is not a prediction.
- Never assume `c_s = 1` because the formula for M/M/1 was convenient. Compute it from
  samples. Kingman's multiplier is `(1 + c_s²)/2`, so `c_s = 2` is 2.5x the M/M/1 wait and
  `c_s = 3` is 5x — at identical utilisation.
- That variance multiplier is independent of rho. It applies at every utilisation level, so
  "we are only at 60%" is not a defence against high service variance.
- M/D/1 has exactly **half** the wait of M/M/1 at the same utilisation. Halving service
  variance without touching the mean halves queue latency — that is what removing long GC
  pauses, splitting heavy and light work into separate pools, and cutting the timeout tail
  actually buys.
- Use Erlang C for the probability of waiting in M/M/c. It is `C(c,a)` with `a = lambda/mu`
  in Erlangs — not an ad-hoc ratio, and not rho.
- For large `c`, compute Erlang C through the Erlang B recursion rather than the direct sum;
  `a^c` and `c!` overflow. Cross-check any published number by both methods.
- `C(c, rho)` is always <= the equivalent M/M/1 utilisation. Pooling `c` servers beats `c`
  separate queues, and by more than a factor of `c` — two servers at rho = 0.8 wait 178 ms
  where one at rho = 0.8 waits 400 ms.
- Do not confuse Kingman (G/G/1, carries `c_a`) with Pollaczek-Khinchine (M/G/1, which
  assumes `c_a = 1` and has no such term). Setting `c_a = 1` in Kingman reproduces P-K.
- Reject a model whose predicted `Wq` misses the measured one by more than 30%. That is the
  practical threshold; past it the assumptions are wrong, not the arithmetic.
- Queues in series **add**: `Wq_total ≈ Wq_app + Wq_db`. Modelling only the application's own
  queue and ignoring the downstream connection pool systematically understates total wait.
- Applying any model to a _mean_ utilisation understates tail latency. A service averaging
  rho = 0.4 can spend 10% of its time at rho = 0.95, and that is where the SLO breaks. Feed
  the model the p95 of load.
- M/D/1 and bimodal service distributions have **no** simple closed-form wait CDF. The
  exponential service case is the only one here with one; measure the percentiles empirically
  for the others.

## References

- [Model selection and formulas](references/model-selection-and-formulas.md) — the selection
  table keyed on arrival and service behaviour, the closed-form metrics for each model,
  Erlang C by both the direct sum and the numerically stable Erlang B recursion, the wait
  percentile formula, and the `c_s` multiplier table. Read when choosing a model or when a
  formula has to be evaluated.
- [Measuring the parameters](references/measuring-the-parameters.md) — how to obtain lambda,
  mu, the effective c and `c_s` without contaminating them, including the JFR event mapping
  for queue wait and its threshold trap. Read before feeding any real system's numbers into a
  model.
