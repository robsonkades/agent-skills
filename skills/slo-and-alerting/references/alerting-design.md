# Alerting design

## Symptom versus cause

A symptom is something a user is experiencing. A cause is a mechanism that sometimes produces
one. Pages are for symptoms, because causes are both false-positive-prone (present with no
impact) and false-negative-prone (absent during a real outage).

| Signal                                        | Kind    | Route                                                        |
| --------------------------------------------- | ------- | ------------------------------------------------------------ |
| SLI burning budget fast                       | Symptom | **Page**                                                     |
| Error ratio above the SLO for the fleet       | Symptom | **Page**                                                     |
| Latency SLI ratio falling                     | Symptom | **Page**                                                     |
| Business outcome rate collapsing (orders/min) | Symptom | **Page** — detects what health checks miss                   |
| CPU above 90%                                 | Cause   | Dashboard. A well-utilised service looks like this           |
| Heap above 80%                                | Cause   | Dashboard, unless it is the SLI's cause and is unrecoverable |
| Connection pool saturated                     | Cause   | Ticket if sustained; dashboard otherwise                     |
| Disk filling at the current rate              | Cause   | **Ticket** — predictable, slow, and fixable in hours         |
| Certificate expiring in 14 days               | Cause   | **Ticket** — deterministic deadline                          |
| One pod is unhealthy                          | Cause   | Neither. Replace it; that is the orchestrator's job          |
| A scrape target has disappeared               | Meta    | **Page** — no data reads as no errors                        |

The last row is the one most often missing. An error-ratio rule over a target that stopped
reporting evaluates to "no errors", and the alert that should have fired is exactly the one
that goes quiet.

## Multi-window, multi-burn-rate

**Burn rate** is how fast the budget is being consumed, relative to the rate that would exactly
exhaust it at the end of the period:

```text
burn_rate = observed error ratio / (1 − SLO target)

budget consumed over a window = burn_rate × window / period
time to exhaustion            = period / burn_rate      (at a constant rate)
```

Burn rate 1 exhausts the budget precisely at the period's end. Burn rate 10 exhausts it in a
tenth of the period.

The single-window versions both fail, in opposite ways:

- **One long window** (say, the full 30 days) detects a severe outage far too late — a total
  outage takes hours to move a 30-day ratio enough to trip a threshold.
- **One short window** is noisy, and worse, it does not _reset_: after a five-minute spike the
  window keeps the alert firing for its whole length, so the on-call sees a resolved incident
  still paging.

The technique combines two windows per condition and two conditions per SLO:

```text
Fast burn  → PAGE
    long window:  hours          high burn rate     "a lot of budget, right now"
    short window: ~1/12 of the long one, same rate  "and it is still happening"
Slow burn  → TICKET
    long window:  a day or more   low burn rate     "steady erosion"
    short window: ~1/12, same rate                  "and it has not stopped"
```

Both windows must hold for the alert to fire. The **long** window sets sensitivity and
false-positive rate; the **short** window is a reset condition — once the burn stops, the short
window clears within minutes and the alert resolves without waiting for the long one to
decay.

Choosing your own pairs is two decisions, and they trade against each other:

1. _How much budget am I willing to spend before someone is woken?_ That fixes
   `burn_rate × window` — the product, not either factor.
2. _How long am I willing to wait for detection?_ That fixes the window, and the burn rate
   falls out: `burn_rate = budget_fraction × period / window`.

Worked, for a 30-day period: to page after 2% of the budget is gone, with a one-hour detection
window, `burn_rate = 0.02 × (30 × 24) / 1 = 14.4`. A different budget fraction, period or
detection target gives a different number — which is why copying a factor from a document
written about someone else's SLO is a coincidence rather than a configuration. Compute it.

Two constraints on the fast-burn window: it must be at least a few multiples of the scrape
interval so the ratio is not one sample, and its detection time must be shorter than the
time the remaining budget would take to disappear.

## Every page needs a runbook

The runbook is part of the alert, not documentation about it. Minimum contents:

- **What the user is experiencing**, in one sentence — so the responder can judge severity
  without reconstructing it.
- **The first three checks**, each a link to a specific dashboard or query, in order.
- **The known mitigations** and their blast radius: roll back, fail over, shed, scale.
- **Escalation**: who, and after how long.
- **The last time this fired and what it turned out to be.** The cheapest debugging aid there
  is, and it accumulates for free if the alert links to its own incident history.

An alert with no runbook is a page that starts with the responder reading source code at
03:00. If nobody can write the three checks, the alert does not yet describe an actionable
condition, and shipping it means shipping the noise.

## Alert review checklist

Run this on a schedule — monthly is typical — over every rule that can page:

- [ ] It fired at least once in the review period. If never: is it still meaningful, or has
      the system changed underneath it? An alert that has never fired is an untested
      hypothesis
- [ ] Every firing produced a human action. Acknowledged-and-ignored is a deletion candidate
- [ ] It is a symptom, not a cause, or there is a written reason why the cause is paged
- [ ] It measures the fleet, not one instance
- [ ] It has a runbook, and someone followed it the last time
- [ ] Its threshold was derived (from a burn rate and a budget), not chosen by eye — a static
      threshold set against last year's traffic is now measuring something else
- [ ] It does not duplicate another rule that fires at the same time. During a real incident
      duplicates arrive together and bury the one that names the cause
- [ ] It cannot fire for a condition that resolves itself within the response time
- [ ] Its "no data" behaviour is defined and tested
- [ ] Someone has verified it by injecting the failure — latency, errors, a stopped scrape.
      An alert never triggered on purpose is a hypothesis about a query language
