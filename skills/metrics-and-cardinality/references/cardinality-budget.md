# Cardinality Budget

## Budget dimensions

For each metric family estimate:

```text
logical label combinations:
target/replica series:
classic bucket / summary quantile multiplier:
active-series expectation and worst case:
new-series churn per hour/deploy/day:
samples per second:
bytes and retention/compaction assumptions:
query fan-out:
owner / limit / overflow action:
```

Simple upper bound:

\[
C_{upper}=\prod_i |L_i|
\]

This assumes every combination is possible. Build a constraint-aware estimate from routes
and supported methods/status/outcomes as well. Multiply by simultaneously active targets
only if target identity is not already represented in a counted label.

Classic histogram float-series multiplier is configured buckets plus sum and count (with
exporter-specific details such as +Inf). Native histograms are one time series containing
composite samples whose bucket density/resolution drives bytes and query cost. Verify the
actual exposition/backend.

## Label review

| Class                           | Examples                             | Treatment                                             |
| ------------------------------- | ------------------------------------ | ----------------------------------------------------- |
| fixed protocol/application enum | method, outcome, region set          | allowlist and initialize expected values where useful |
| controlled evolving             | version, node, tenant tier, topic    | growth/churn/retention budget                         |
| external bounded mapping        | gateway code, exception class        | normalize unknown to bounded class                    |
| entity identity                 | user, order, session, request, trace | log/span/exemplar, never ordinary label               |
| caller-controlled text          | raw path/URL, header, SQL/message    | template/classify before instrumenting                |
| sensitive                       | email, phone, document/token         | prohibit; treat telemetry as data exposure            |

Even fixed labels multiply. Redundant status and outcome dimensions can be useful only when
their joint queries justify cost; otherwise derive one at query/recording time.

## Churn and retention

Backends age stale series and compact/delete blocks according to implementation and
retention; deleting instrumentation does not guarantee immediate resource recovery.
Ephemeral pods and version labels can have modest active cardinality but high churn and
index/storage cost. Measure:

- active/head series;
- series created/removed;
- samples ingested/dropped;
- scrape size/duration/failures;
- label-name/value concentration;
- query memory/time and block/index growth.

## Containment hierarchy

1. allowlist/template/classify at the source;
2. cap or collapse unexpected values in the client library;
3. enforce target sample/label limits and relabel emergency drops;
4. apply ingestion quotas/routing;
5. alert before exhaustion and document reversible incident controls.

Choose overflow semantics:

- **OTHER:** preserves totals but loses offending distinction;
- **deny new meter:** can corrupt counts/denominators;
- **fail scrape:** loud but drops all target metrics;
- **sample/top-K:** useful for exploration, unsafe for exact SLI totals.

Track overflow attempts separately with a bounded metric.

## Incident path

```text
Backend/scrape pressure
  -> identify metric family and exploding label
  -> stop ingestion with scoped reversible relabel/quota
  -> preserve critical SLI/control metrics
  -> fix and cap source
  -> observe active/churn/storage recovery
  -> assess privacy exposure and rotate/delete under policy if needed
```
