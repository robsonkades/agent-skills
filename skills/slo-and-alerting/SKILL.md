---
name: slo-and-alerting
description: >
  Turning measurements into an on-call contract: SLI, SLO and SLA, choosing an indicator
  that reflects the user's experience and where it is measured, the availability definition
  (window, which status classes count, shed traffic), error budgets as a change-velocity
  decision, and multi-window burn-rate alerting on symptoms not causes. Use when an SLO is
  quoted with no window or definition of a good event, when the target equals or is looser
  than the SLA, when 100% is proposed as a target, when high CPU or heap pages someone, when
  a page fires for one instance in a replicated fleet, when an alert is routinely
  acknowledged and ignored, when shed 429s are counted as errors, or when anomaly detection
  is proposed for paging. Does not cover the metrics themselves (metrics-and-cardinality),
  percentile correctness (latency-statistics), tail decomposition (tail-latency-analysis),
  the log event (structured-logging), the shedding mechanism
  (rate-limiting-and-load-shedding), or the fault model detected (failure-models).
---

# SLO And Alerting

## Purpose

Decide what the team promises, how it is measured, and what wakes a human. An SLO is not a
dashboard number: it is a **change-velocity decision**. A target of 99.9% over 30 days buys
roughly 43 minutes of budget to spend on releases, migrations and experiments; a target of
100% buys none, which is a demand to stop shipping stated in percentages.

The failure this prevents is the alerting system that trains the response it needs. A page
firing on a cause nobody acts on, or on a single replica the orchestrator was about to replace
anyway, teaches the on-call that pages are noise — and that training holds during the incident
that was real. Every rule below keeps the number of pages small, each one actionable, each one
corresponding to something a user is feeling.

## Workflow

1. **Separate the three terms before writing anything.** SLI is the measurement, SLO is the
   internal target, SLA is the external contract with financial or contractual consequence.
   The SLO must be **strictly stricter** than the SLA, or the first alert arrives after the
   penalty.
2. **Choose an SLI the user would recognise, and name its measurement point** — the boundary
   the user actually crosses. A request that never reached the application is invisible to
   the application's own counter.
3. **Write the availability definition down as arithmetic**: good events over valid events,
   over a stated window, with an explicit list of which outcomes are good, bad, or excluded.
   See `references/sli-and-error-budgets.md`.
4. **Compute the error budget and agree the policy before you need it.** What happens when
   the budget is exhausted — and who decides — is a written agreement, not an improvisation
   during the week it runs out.
5. **Alert on symptoms, from the budget burn rate.** Fast burn over a short window pages;
   slow burn over a long window raises a ticket. Everything else is a dashboard. See
   `references/alerting-design.md`.
6. **Give every page a runbook and an owner**, then review the alert set on a schedule and
   retire anything that fired without producing an action.

## Decision block

```text
Define an SLO for a service when:
- it has identifiable users (human or another team) whose experience changes when it
  degrades, and a boundary where that experience is measurable
- someone would make a different engineering decision if the number moved
Do not define an SLO when:
- nothing changes at any value of it — an unactionable target becomes a number people
  learn to explain away
Page when all four hold:
- a user-visible symptom is occurring or the error budget is burning fast enough to be
  exhausted well before the period ends
- a human can do something about it now
- that something cannot be automated instead
- there is a runbook naming the first three steps
Raise a ticket instead when:
- the burn is slow: real, but it will still be there in the morning
- the condition is a cause (a saturating resource, a growing queue) that has not yet
  produced a symptom
Leave it on a dashboard when:
- the signal is diagnostic — it explains an incident but does not detect one
Automate instead of paging when:
- the same page fires repeatedly with the same runbook step: that is an unwritten script
```

## Rules

- An SLI is a **ratio of good events to valid events over a window**, and all three parts must
  be written down. "99.9% available" without the window, the status classes and the
  exclusions is not falsifiable.
- The SLO must be tighter than the SLA. Equal targets exhaust the budget at exactly the moment
  the contract is breached, leaving the alert no lead time.
- **Prefer a latency SLI expressed as a ratio, not as a percentile**: "proportion of requests
  faster than 300 ms". That form is a counter ratio, so it aggregates correctly across
  instances and windows — a percentile does not, and `latency-statistics` owns why.
- Measure availability at the boundary the user crosses (edge, gateway, load balancer): the
  application's own counter cannot see a request that never arrived, which is exactly what a
  total outage looks like. Business correctness is a different SLI, measured inside.
- Decide **explicitly** whether 4xx counts against the budget. Usually not — counting a
  malformed request lets a client breach your SLO on your behalf — but a 400 from your own
  broken validation is then invisible, which is why business outcomes need their own SLI.
- **Traffic you deliberately shed is not the same failure as a 500.** A 429 or 503 from a
  limiter or shedder is the system working as designed (`rate-limiting-and-load-shedding`).
  Counting it as good hides overload; counting it as an error makes self-protection look like
  breakage. Track it as its own SLI against goodput, and state which side it falls on.
- 100% is not a target, it is a shipping freeze. Choosing 99.9 over 99.99 chooses a change
  velocity; whoever owns release cadence must be in the room for it.
- **Error budget on a 30-day window (43,200 min):** 99% is 432 min, 99.9% is 43.2 min, 99.95%
  is 21.6 min, 99.99% is 4.32 min. One 20-minute incident spends a 99.9% monthly budget almost
  entirely, and that is the number that makes the target real.
- **Alert on symptoms, not causes.** High CPU, high heap, a full queue and a slow query may
  all be present with no user impact, and absent during a real one. Page on the SLI; causes
  belong on the dashboard the runbook opens.
- Use **multi-window, multi-burn-rate**: high burn over a short window pages, low burn over a
  long window tickets, and each condition is paired with a shorter window so the alert clears
  promptly once the burn stops. Derive thresholds from `budget consumed = burn_rate × window
/ period`; a factor copied from a document about a different SLO is a coincidence.
- **Never page on a single instance in a replicated fleet.** The correct response is to
  replace the instance, which is automation's job. Page when the fleet's aggregate SLI moves.
- Alert on **missing data**: a target that stopped being scraped reports no errors, and an
  error-rate rule reads that as health.
- A page routinely acknowledged without action must be deleted or downgraded. It is not
  neutral — it degrades the response time to the real ones.
- Treat anomaly detection sceptically for paging. It answers "this is unusual", not "this is
  bad"; seasonality (weekday, month-end, marketing events) makes naive models noisy; and the
  page has no runbook because nobody knows what the anomaly is. A well-chosen SLI with
  burn-rate alerting beats it for paging. Its real place is **investigation** — surfacing the
  one series that moved — not waking someone.
- A fast-burn page says the budget is disappearing, never why. Route from the page to the
  diagnosis: `distributed-failure-catalogue` to name the pattern from the symptom, and
  `cascading-failures` when error rate and latency are climbing together across several
  services — that one is time-critical, because the interventions that work during a cascade
  are the opposite of the instinctive ones.

## References

- [SLIs and error budgets](references/sli-and-error-budgets.md) — choosing the indicator and
  its measurement point, the availability-definition decisions (window, status classes, shed
  traffic, valid events), the error-budget table worked through for common targets, budget
  policy, and the SLO-to-SLA relationship. Read when defining or reviewing an SLO.
- [Alerting design](references/alerting-design.md) — symptom versus cause with examples, the
  multi-window burn-rate mechanism explained so a reader can configure it, the
  page/ticket/dashboard routing decision, runbook requirements, and an alert-review checklist
  for retiring noisy alerts. Read when writing an alert rule, or when the on-call is drowning.
