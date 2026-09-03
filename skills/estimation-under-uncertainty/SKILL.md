---
name: estimation-under-uncertainty
description: >
  Producing a software estimate that carries its own uncertainty instead of hiding it: a range
  with a confidence level rather than a single number, decomposition, PERT and why summing
  most-likely cases understates and summing worst cases overstates, calibrating against what
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

An estimate is a claim about a distribution, and the single number everyone asks for is the one
form that cannot express it. The damage is not that estimates are wrong — they are always wrong
— but that a number stated without its uncertainty gets planned against as though it were
certain, and the first person to discover otherwise is the one who has already missed it.

The job is to give a number people can act on, with the uncertainty attached in a form they can
use, and to say what would reduce it.

## Workflow

1. **Do not hide requirement uncertainty inside a precise estimate.** When a decision still needs a
   number, give a deliberately broad conditional range and state what is missing; otherwise defer
   the forecast until the scope-changing questions are answered (requirements-and-acceptance).
2. **Decompose until the pieces are things you have done before.** A piece you can compare with
   something real is estimable; a piece that is still a category ("the reporting") is not. The
   decomposition is also the most reliable way to find work nobody had counted.
3. **For each piece give three calibrated quantiles** — for example P10, P50, and P90 — or use
   reference-class cycle-time samples directly. If using PERT's optimistic/most-likely/pessimistic
   inputs, document what probability each endpoint is intended to represent; “everything goes
   wrong” is not a reproducible quantile
   (`references/methods.md`).
4. **Combine them with their dependencies.** Expected values add, but variance adds only under an
   independence model. Shared people, platforms, approvals, and integration risks create
   correlation; model them explicitly or use Monte Carlo over historical throughput/cycle time.
5. **Calibrate against history.** What this team actually delivered in the last three
   comparable pieces of work beats introspection, every time.
6. **State the result as a range with a confidence and its assumptions**: "18–25 days, about
   80% confident, assuming the payments team's API is available in week two and the export runs
   synchronously."
7. **Re-estimate when evidence arrives**, and say so immediately. An estimate is a statement
   about what you knew when you made it, and the moment you know more, the old one is
   misinformation you are still allowing people to plan against.

## Rules

- Never give a bare single number for work over a day. If pressed, give the range and then the
  number you would plan against — but never let the range disappear silently, because it is the
  only part carrying information about risk.
- State the confidence with the range. "18–25 days" means nothing until you say whether that is
  50% or 90%; the two differ by a factor that decides whether a plan is sane.
- Estimate, target and commitment are three different things and must be named separately. An
  estimate is what you predict, a target is what someone wants, a commitment is what you have
  promised. Deriving an estimate from a target is how a project becomes late on day one.
- Do not pad silently. Hidden padding is consumed by the work (it always finds the space) and
  destroys your calibration, because you never learn what the task really cost. Put the buffer
  where it can be managed: at the plan level, visible, owned.
- The estimate covers the whole change, not the coding: tests, review, the review round trip,
  migration, deployment, the rework that follows from the first demo. Coding is frequently the
  smaller half, and estimates that omit the rest are wrong by a consistent, learnable factor —
  which is exactly why history beats intuition.
- Say what would narrow the range. "A day spiking the provider's API would take the top of this
  range from 25 to about 20" turns an estimate into a decision someone can make.
- Report a slip when you believe it, not when it becomes undeniable. The information is worth
  most while there is still time to change something, and its value falls to nothing on the due
  date (engineering-communication).
- Never resolve a schedule problem by silently lowering quality. If something must give, name
  it and let the trade be decided (technical-debt-decisions).

## References

- **Methods and arithmetic** — `references/methods.md`. Three-point estimation and PERT with
  worked numbers, why uncertainties add as a square root, decomposition, reference-class
  forecasting from your own history, the cone of uncertainty, and the failure modes of each
  method. Read when producing an estimate for anything larger than a day.
- **Estimates, targets and commitments** — `references/commitments.md`. Keeping the three
  apart, what to do when a target is presented as an estimate, negotiating scope rather than
  dates, communicating a slip, and the agent-specific version of the same discipline. Read when
  an estimate is about to become a promise, or a plan is slipping.
