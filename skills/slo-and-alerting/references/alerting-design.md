# Alerting Design

## Routing decision

```text
Is harm or irreversible risk credible?
  no -> dashboard/investigation
  yes -> run applicable safe automation
         does urgent human action or verification remain?
           yes -> page while automation proceeds
           no  -> ticket if later human work is needed; otherwise observe automation
```

Severity depends on urgency, blast radius, confidence and available action—not whether a
signal is called a symptom or cause.

## Page contract

When defining or reviewing a page contract, ensure the following are available directly or
through maintained context. Reuse an adequate contract; a narrow rule or arithmetic review
needs only the fields relevant to its conclusion:

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

## Grouping and inhibition

Grouping bundles related alerts into notifications; inhibition suppresses a target's
notifications while a matching source is active. Neither establishes recovery or restores
error budget. Start with grouping when responders still need the distinct impacts. Inhibit
only when the source's response covers the target's action within the intended scope.
An outage page need not cover independent data-corruption containment, even in the same cluster.

For Alertmanager, inspect source/target matchers and the `equal` scope labels on actual emitted
alerts, after relabeling. Missing and empty label values compare equally: `equal: [cluster]`
can permit inhibition when both alerts lack `cluster`. Require the needed scope labels to
be present and nonempty, including through source/target matchers when appropriate; test the
configuration on the deployed version. A YAML syntax check alone does not establish this.

Exercise a same-scope duplicate, a different cluster/tenant, missing scope labels, an
independent urgent hazard, and the source clearing while its target remains active. Verify
which notifications are suppressed and subsequently eligible, plus the receiving route;
eligibility is not proof of immediate delivery. If Alertmanager cannot be exercised, report
the unverified notification path rather than claiming that a passing PromQL rule test covers it.

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
laws. Recompute for different periods/policies and check changed detection claims with
representative fixtures or replay.

Both windows above threshold means recent aggregate evidence, not proof the fault is still
occurring at this instant. Ingestion delay, scrapes, evaluation, any `for`, notification grouping
and delivery add response latency. A claim about delivered pages needs notification-path
evidence as well as expression firing; a local rule test alone cannot establish delivery.

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

## References

- [Alertmanager grouping and inhibition](https://prometheus.io/docs/alerting/latest/alertmanager/) — notification semantics.
- [Alertmanager inhibition configuration](https://prometheus.io/docs/alerting/latest/configuration/#inhibit_rule) — source/target matching and missing/empty equality labels.
