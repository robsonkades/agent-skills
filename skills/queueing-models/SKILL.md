---
name: queueing-models
description: >
  Choosing a queueing model and reading what it says: M/M/1 versus M/M/c versus M/G/1 versus
  M/D/1, the Erlang C and Erlang B formulas, Kingman's G/G/1 approximation, the service-time
  coefficient of variation, and what each model's assumptions cost when they are violated.
  Use when a predicted wait time disagrees with the measured one, when latency is far worse
  than utilisation suggests, when service times are bimodal or GC-spiked, when arrivals are
  retries or cron bursts rather than independent users, when Erlang C must be computed for a
  large number of servers, when a load balancer or partition layout turns one pool of c into
  c queues of one, or when deciding whether a measured p99 is even reachable by an
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
retry-correlated arrivals, a pool whose nominal size is not its number of servers —
producing a wait-time estimate that is optimistic by a factor of two to five exactly where
the SLO lives.

Every model here is one formula plus a set of assumptions. The formula is the cheap part.
Which parameters you feed it, and which assumption you have quietly broken, is the work.

## Workflow

1. **Write down the Kendall notation you are claiming** — `A/S/c` at minimum, plus `K` if
   the system rejects and `N` if the population is fixed. Naming the arrival distribution,
   the service distribution and the number of servers forces each assumption into the open
   before any number is produced.
2. **Decide open or closed, and one pool or `c` queues.** A fixed-VU load generator, or a
   worker that only accepts work when free, is closed and cannot show the `1/(1 - rho)`
   explosion. A fleet behind random or hash routing, or a set of Kafka partitions, is `c`
   independent queues and gets none of the pooling benefit an M/M/c would promise. See
   `references/production-behaviour.md`.
3. **Test the arrival assumption.** "M" means Poisson: independent, memoryless arrivals. HTTP
   traffic from independent users fits. Cascading retries, cron fan-out and batch jobs do not
   — they are temporally correlated, and any M/\* model will understate the queue. Count
   `lambda` at the server, retries included.
4. **Measure `c_s`, the coefficient of variation of service time**, from real samples —
   `std/mean` — instead of assuming it is 1. Below 0.5 the service is nearly deterministic;
   around 1.0 exponential; above 1.5 heavy-tailed, and the M/\* percentiles are badly
   optimistic.
5. **Choose the model from those answers**, not from familiarity. See
   `references/model-selection-and-formulas.md`.
6. **Parameterise it from measurements taken correctly**, especially the effective `c` and a
   `mu` measured at low utilisation. See `references/measuring-the-parameters.md`.
7. **Validate against a real measurement before acting.** Predicted versus measured `Wq`
   within 30% means the model applies as-is. Beyond that, read the direction of the miss —
   measured above prediction and measured below it name different failed assumptions — and
   take the matching row of the disagreement table rather than adjusting the answer by hand.
8. **Read percentiles, not just the mean.** For M/M/1 and M/M/c the wait distribution has a
   closed form, so p50/p95/p99 come out of the model directly — and the p50 is often below
   the mean, and exactly zero whenever `C(c, a) < 0.5`, which is the whole reason means
   mislead here.

## Rules

- State the model as `A/S/c` before quoting any number from it. A wait time with no declared
  model is not a prediction.
- Never assume `c_s = 1` because the formula for M/M/1 was convenient. Compute it from
  samples. The service-variance multiplier is `(1 + c_s²)/2` (P-K, or Kingman at
  `c_a = 1`), so `c_s = 2` is 2.5x the M/M/1 wait and `c_s = 3` is 5x — at identical
  utilisation.
- That variance multiplier is independent of rho. It applies at every utilisation level, so
  "we are only at 60%" is not a defence against high service variance. A 1% slow path at
  500 ms behind a 10 ms fast path puts the mean queue wait at 3.7x the fast path's service
  time while utilisation reads 30%.
- M/D/1 has exactly **half** the wait of M/M/1 at the same utilisation. Halving service
  variance without touching the mean halves queue latency — that is what removing long GC
  pauses, splitting heavy and light work into separate pools, and cutting the timeout tail
  actually buys.
- Use Erlang C for the probability of waiting in M/M/c. It is `C(c, a)` with `a = lambda/mu`
  in Erlangs — not an ad-hoc ratio, and not rho.
- For large `c`, compute Erlang C through the Erlang B recursion rather than the direct sum;
  `c!` overflows a double at `c = 171` and the running sum overflows past `a ≈ 700` even with
  the term recurrence. Cross-check any published number by both methods where both run.
- `C(c, a) <= rho` always, with equality only at `c = 1`. Pooling `c` servers beats `c`
  separate queues by more than a factor of `c`: at rho = 0.8, one pool of 8 waits 29 ms where
  8 queues of 1 wait 400 ms. What the split buys is isolation and ordering; know which of the
  two you are paying for.
- The 70–80% utilisation rule is an M/M/1 fact. With a shared queue the knee moves right
  with `c`: a 100-server pool at rho = 0.95 queues for 0.1 service times, a single server
  for 19. Set the utilisation target from `c` (square-root staffing), not from a fleet-wide
  constant.
- Do not confuse Kingman (G/G/1, carries `c_a`) with Pollaczek-Khinchine (M/G/1, which
  assumes `c_a = 1` and has no such term). Setting `c_a = 1` in Kingman reproduces P-K. For a
  pool with `c_s ≠ 1` use Allen–Cunneen — Kingman's factor on the Erlang C wait.
- Kingman is a heavy-traffic mean. Below rho ≈ 0.5, or with `c_a < 1`, treat it as an upper
  bound; and no `c_s` turns the exponential percentile formula into a heavy-tailed one —
  measure the p99 under non-exponential service.
- Reject a model whose predicted `Wq` misses the measured one by more than 30%. That is the
  practical threshold; past it the assumptions are wrong, not the arithmetic.
- Retries are arrivals. Count `lambda` at the server: a 20% retry share at rho = 0.7 is
  rho = 0.88 and 3x the wait, and the retries land exactly when the queue is longest.
- Queues in series **add**: `Wq_total ≈ Wq_app + Wq_db`. Modelling only the application's own
  queue and ignoring the downstream connection pool systematically understates total wait.
- Applying any model to a _mean_ utilisation understates tail latency, because `Wq` is convex
  in rho. A service at rho = 0.4 for 90% of the time and 0.95 for 10% averages rho = 0.455,
  where M/M/1 predicts 0.84 S; the requests actually experience 4.5 S. Fit per load regime
  and weight by arrivals, or at minimum feed the model the p95 of rho — and check a short
  burst against the relaxation time before applying a steady-state number to it.
- A bounded queue is M/M/c/K: it trades a known rejection fraction for a bounded wait and
  stays stable at rho >= 1. Rejected work leaves the latency metric, so `Wq` measured on
  completions improves _because_ the system is shedding — read the rejection counter next
  to it.
- A priority lane moves wait, it does not remove it: `sum rho_i·Wq_i` is conserved, and the
  low class's wait carries a `1/(1 - rho)` denominator that starves first.
- M/D/1 and bimodal service distributions have **no** simple closed-form wait CDF. The
  exponential service case is the only one here with one; measure the percentiles empirically
  for the others.

## References

- [Model selection and formulas](references/model-selection-and-formulas.md) — the symbol
  table, the selection table keyed on arrival, service and server count, the closed-form
  metrics for each model including M/M/c/K and Erlang B as a loss system, Erlang C by both
  the direct sum and the numerically stable Erlang B recursion, Allen–Cunneen for G/G/c, the
  pooled-versus-split and large-`c` tables, bulk arrivals, Cobham's priority formulas, the
  wait percentile formula, and the `c_s` multiplier table with the bimodal worked example.
  Read when choosing a model or when a formula has to be evaluated.
- [Measuring the parameters](references/measuring-the-parameters.md) — how to obtain lambda,
  mu, the effective c, `c_a` and `c_s` without contaminating them, including the JFR event
  mapping for queue wait and its threshold trap. Read before feeding any real system's
  numbers into a model.
- [Production behaviour](references/production-behaviour.md) — which model each real
  system is (thread pools, connection pools, bulkheads, Kafka partitions, load-balancer
  policies, HPA, closed load generators), open versus closed bounds, retries as arrivals,
  bursts against the relaxation time, autoscaling lag arithmetic, the two-direction
  "prediction disagrees with measurement" table, and when no model applies. Read at step 2
  and whenever a validation fails.
