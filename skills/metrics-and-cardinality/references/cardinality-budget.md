# The cardinality budget

## The arithmetic

For one metric name:

```text
series = Π(cardinality of each label) × instances × per-instrument multiplier

per-instrument multiplier:
  counter, gauge      1
  classic histogram   buckets + 2      (one series per `le`, plus _sum and _count)
  summary             quantiles + 2    (and the quantiles do not aggregate)
```

Worked, for one HTTP request histogram on a 40-pod service:

```text
method   7   (GET POST PUT PATCH DELETE HEAD OPTIONS)
uri    120   (routes in the application)
status  12   (distinct codes actually returned)
outcome  5   (SUCCESS CLIENT_ERROR SERVER_ERROR REDIRECTION INFORMATIONAL)

label combinations = 7 × 120 × 12 × 5            = 50,400
× instances (40)                                 = 2,016,000
× (20 buckets + 2)                               = 44,352,000 series
```

Forty-four million series for one metric. The fixes are all multiplicative, so they compound:

- `status` and `outcome` are **derivable from each other** — carrying both multiplies by 12
  where 12 would do. Drop `outcome`: ÷5 → 8.9 M.
- Most routes never see most methods. Only emit the combinations that occur; the backend only
  stores observed combinations anyway, so the _realistic_ figure is closer to
  `routes × methods actually served`. Compute both: the product is the worst case you must
  survive, the observed count is the bill.
- Buckets are the cheapest lever and the most often ignored. Twenty generic buckets against
  eight chosen from the service's measured range: ÷2.
- Instances: this is why a per-pod `instance` label makes an autoscaled fleet's series count a
  function of traffic. Aggregate away the instance label in a recording rule if per-pod
  breakdown is not used in an investigation.

**Add one label of cardinality N and the whole metric multiplies by N.** That is the review
question for any change that adds a tag: what is N, and who enumerated it?

## Label catalogue

| Label                        | Verdict | Why                                                                                             |
| ---------------------------- | ------- | ----------------------------------------------------------------------------------------------- |
| `method`                     | Safe    | Fixed by the protocol                                                                           |
| `status` / `status_class`    | Safe    | Enumerated; prefer the class when per-code is never queried                                     |
| `uri` as a **route pattern** | Safe    | Bounded by the number of handler mappings                                                       |
| `outcome`, `result`          | Safe    | Your own enum — keep it an enum in code, not a string literal                                   |
| `region`, `az`, `cluster`    | Safe    | Bounded by infrastructure, changes at deploy speed                                              |
| `tenant_id`                  | Careful | Bounded today, unbounded as a business goal. Budget for the sales target, not the current count |
| `queue`, `topic`, `pool`     | Safe    | Named resources, enumerable from configuration                                                  |
| `version`, `build`           | Careful | Grows monotonically with deploys; series accumulate over retention                              |
| `hostname` / `pod`           | Careful | Unbounded in an autoscaled fleet — each new pod is a new value forever                          |
| `user_id`, `customer_id`     | Fatal   | Grows with the business                                                                         |
| `request_id`, `trace_id`     | Fatal   | One series per request; a new series on every single sample                                     |
| `email`, `phone`, `document` | Fatal   | Unbounded **and** personal data now in a system with no redaction                               |
| Raw `path` or full URL       | Fatal   | `/orders/12345` — cardinality equals the number of entities                                     |
| Exception `message`          | Fatal   | Contains ids, values, and eventually a whole payload                                            |
| SQL statement text           | Fatal   | Same, plus it changes with every literal                                                        |
| A timestamp in any form      | Fatal   | Cardinality equals the number of scrapes                                                        |

## Path templating

The route label must come from the framework's matched pattern, not from the request. Two
places this leaks:

- **A hand-written filter** that tags `request.getRequestURI()`. Spring Boot's own
  `http.server.requests` uses the matched handler pattern and collapses requests that matched
  no handler rather than emitting their path; a custom filter has to do the same or it is
  strictly worse than the default.
- **A client-side metric** tagging the resolved outbound URL. Tag the _template_ the client
  was given, and keep the resolved URL for the span attribute.

A 404 flood against random paths is the canonical trigger: no code change, no deploy, and the
series count goes vertical because every scanned path became a label value.

## Detecting an explosion

Before: put the budget in the change, and add a scrape-side ceiling so the failure is a
refused target rather than a dead backend. Prometheus scrape configs accept `sample_limit`,
`label_limit` and `label_value_length_limit`; a target that exceeds them fails its scrape and
alerts, which is a far better outcome than silent ingestion.

During: the backend's own metrics are the diagnostic — head series count, memory, and
ingestion rate. Find the offender by counting series per metric name, then per label:

```promql
topk(10, count by (__name__)({__name__=~".+"}))          # which metric
count(count by (tenant_id) (my_metric))                  # which label, one at a time
```

Two-step response, in this order: **stop the bleeding at the scrape layer** by dropping the
metric or the label with a `metric_relabel_configs` rule — no deploy required — and only then
fix the instrumentation. Series already ingested remain until retention expires, so recovery
of memory is not immediate; plan the incident timeline around that.

## Pre-ship worksheet

For each new or changed metric:

- [ ] Every label's complete value set is written down, or the label is removed
- [ ] The largest label's cardinality has an owner who can state its growth rate
- [ ] `Π(labels) × instances × multiplier` is computed and recorded in the change
- [ ] No label derives from a caller-controlled string
- [ ] Any route or URI label is a template, and unmatched requests collapse to a placeholder
- [ ] Histogram buckets come from the measured range, not from the client default set
- [ ] The metric is named by at least one dashboard panel or alert rule
- [ ] A scrape-side limit exists so the failure mode is a failed scrape, not a dead backend
