# Alerting Design

## Routing decision

```text
Is harm or irreversible risk credible?
  no -> dashboard/investigation
  yes -> can automation safely contain it?
           yes -> automate and alert only on automation failure
           no  -> is action required before business-hours response?
                    yes -> page
                    no  -> ticket
```

Severity depends on urgency, blast radius, confidence and available action—not whether a
signal is called a symptom or cause.

## Page contract

Every page names:

- affected user journey and current evidence;
- SLO/hazard and population;
- owner and escalation;
- first discriminating checks with direct queries;
- safe mitigations, prerequisites and blast radius;
- stop/rollback conditions;
- related/dependent alerts and recent changes;
- missing-data behavior and incident timeline link.

Avoid static “first three steps” when topology varies; encode a short decision tree with
the highest-information checks.

## Multi-window burn alerts

For ratio SLOs, pair a longer window (budget significance) with a shorter window (condition
is still active). Both must exceed the same burn threshold. Multiple pairs cover fast and
slow burns.

Choose:

1. objective period \(T\);
2. budget fraction \(f\) worth action;
3. long window \(w_l\) satisfying detection needs;
4. under approximately stable event rate, burn \(b=fT/w_l\); otherwise derive the relevant
   budget share from valid-event counts and state any traffic forecast;
5. short window long enough for stable data and short enough to reset promptly.

Canonical Google Workbook values are tested starting points for a 30-day event SLO, not
laws. Recompute for different periods/policies and validate with replay.

Both windows above threshold means recent aggregate evidence, not proof the fault is still
occurring at this instant. Ingestion delay, scrapes, evaluation, any `for`, notification grouping
and delivery add response latency. Exercise end-to-end notification as well as expression firing.

## Low traffic

At small denominators, one event dominates a ratio. Options:

- measure a larger meaningful journey/population;
- use synthetic transactions where representative;
- lengthen windows or reduce paging sensitivity;
- use direct critical-event alerts;
- page only on consecutive/clustered user failures with explicit risk;
- review low-volume outcomes manually.

Do not hide actual user harm by adding fake denominator traffic solely to dilute failures.
Minimum-event gates also suppress detection of real sparse outages; keep a separate critical-event,
expected-demand or representative synthetic path when that risk is unacceptable.

## Missing data

Distinguish:

- scrape/telemetry pipeline failure;
- service or edge unavailable;
- upstream stopped sending traffic;
- legitimate scheduled quiet;
- query label/schema mismatch.

Use independent telemetry health and edge/synthetic demand where needed. An absent-series
alert itself can be noisy for ephemeral workloads; scope expected presence.

## Lifecycle metrics

Review:

- pages per shift and correlated storms;
- precision: pages requiring action;
- recall through incident/postmortem comparison;
- time to detect/acknowledge/mitigate;
- runbook correctness;
- automation opportunities;
- untested rules and routing;
- alerts whose source/query changed.

Never delete a rare safety alert merely because it did not fire; test it and reassess risk.
