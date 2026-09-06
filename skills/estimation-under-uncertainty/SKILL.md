---
name: estimation-under-uncertainty
description: >
  Producing a software estimate that carries its own uncertainty instead of hiding it: a range
  with explicit probability assumptions when supported, decomposition, PERT and the limits
  of summing task estimates, calibrating against what
  this team has actually done, and keeping estimate, target and commitment as three separate
  things. Use when asked how long something will take, when a single date is being requested
  for work that has not been broken down, when an estimate is being treated as a promise, when
  padding is being added silently, when a plan is slipping and the message has not gone out
  yet, or when someone asks for a number before the requirement is clear. Does not cover
  clarifying the requirement itself (requirements-and-acceptance), how to deliver bad news
  (engineering-communication), or trading quality for time (technical-debt-decisions).
---

# Estimation Under Uncertainty

## Purpose

An estimate predicts work or completion under assumptions. A single number without its
uncertainty can be planned against as certainty. Even a numerical range can mislead when
its coverage, scope or calendar assumptions are invented.

The job is to give a number people can act on, with the uncertainty attached in a form they can
use, and to say what would reduce it.

## Workflow

1. **Do not hide requirement uncertainty inside a precise estimate.** When a decision still needs a
   number, give a deliberately broad conditional range and state what is missing; otherwise defer
   the forecast until the scope-changing questions are answered (requirements-and-acceptance).
   Define effort versus elapsed time, working versus calendar days, start point, definition
   of done, available capacity and dependency dates before converting work into a delivery date.
2. **Decompose until the pieces are things you have done before.** A piece you can compare with
   something real is estimable; a piece that is still a category ("the reporting") is not. The
   decomposition is also the most reliable way to find work nobody had counted.
3. **Choose inputs supported by evidence**: comparable cycle-time samples or elicited
   quantiles with explicit assumptions. If using PERT, distinguish bounds and modal inputs
   from P10/P50/P90; they are not interchangeable. Without calibration, label the range
   provisional and do not fabricate a coverage percentage
   (`references/methods.md`).
4. **Combine them with their dependencies.** For a sum, expected values add; variances add
   when covariances are zero, as under independence. Shared people, platforms, approvals and integration risks create
   correlation; model them explicitly. Simulation does not infer missing dependencies or
   capacity constraints. A sum of effort is not automatically elapsed project duration.
5. **Calibrate against comparable history.** Record sample count, start/end definitions,
   changed team conditions and omissions. Three examples can anchor discussion, not establish
   reliable tail percentiles. Compare forecasts with later outcomes without replacing old estimates.
6. **State the forecast event and assumptions**: a central P10–P90 interval describes 80%
   predicted coverage, while "by P80" describes 80% predicted completion by one deadline.
   Both require a stated model/basis. Otherwise report an uncalibrated scenario range.
7. **Re-estimate when evidence arrives**, and say so immediately. An estimate is a statement
   about what you knew when you made it. Update when new evidence changes the decision or
   risk materially; retain the original forecast and explain the change.

Deliver scope and completion criteria, estimate units/range and its basis, key assumptions,
target versus commitment if supplied, and the next evidence/re-estimation trigger. Scale
detail to the decision; do not invent a date, owner or probability merely to fill this shape.

## Rules

- Avoid a bare single number when uncertainty affects the decision. If pressed, give the range and then the
  number you would plan against — but never let the range disappear silently, because it is the
  only part carrying information about risk.
- State whether the range is a scenario span or a calibrated prediction interval, and whether
  a quoted percentile is a deadline or interval endpoint. A confidence interval for a mean
  does not describe the uncertainty of one future delivery.
- Estimate, target and commitment are three different things and must be named separately. An
  estimate is what you predict, a target is what someone wants, a commitment is what you have
  promised. Deriving an estimate from a target is how a project becomes late on day one.
- Do not pad silently. Hidden padding obscures assumptions and calibration. Put contingency
  where it can be managed: at the plan level, visible, owned.
- The estimate covers the whole change, not the coding: tests, review, the review round trip,
  migration, deployment and anticipated rework. Avoid counting these twice if historical
  elapsed-time samples already include them.
- Name the uncertainty an investigation could resolve and its timebox. A spike can reveal
  more work and widen a range; do not promise a specific reduction without evidence.
- Report a slip when you believe it, not when it becomes undeniable. The information is worth
  most while there is still time to change something; overdue updates still matter for
  downstream plans (engineering-communication).
- Never resolve a schedule problem by silently lowering quality. If something must give, name
  it and let the trade be decided (technical-debt-decisions).

## References

- **Methods and arithmetic** — `references/methods.md`. Three-point estimation and PERT with
  worked numbers, when variances add, decomposition, reference-class
  forecasting from your own history, the cone of uncertainty, and the failure modes of each
  method. Read when producing an estimate for anything larger than a day.
- **Estimates, targets and commitments** — `references/commitments.md`. Keeping the three
  apart, what to do when a target is presented as an estimate, negotiating scope rather than
  dates, communicating a slip, and the agent-specific version of the same discipline. Read when
  an estimate is about to become a promise, or a plan is slipping.
