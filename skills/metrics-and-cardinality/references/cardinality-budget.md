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

For a classic histogram with `B` finite bucket boundaries, budget `B + 3` base float series:
`B` finite buckets, mandatory `+Inf`, `_sum` and `_count`. If a bucket count already includes
`+Inf`, add only two. Count exporter extras such as `_max`/`_created` from actual exposition.
Native histograms are one time series containing
composite samples whose bucket density/resolution drives bytes and query cost. One composite
sample is not a bound on its bucket payload; a series-count ratio is not a byte-saving ratio.
Verify the actual exposition/backend, including simultaneous classic/native publication.

## Label review

| Class                           | Examples                             | Treatment                                                                            |
| ------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| fixed protocol/application enum | method, outcome, region set          | allowlist and initialize expected values where useful                                |
| controlled evolving             | version, node, tenant tier, topic    | growth/churn/retention budget                                                        |
| external bounded mapping        | gateway code, exception class        | normalize unknown to bounded class                                                   |
| controlled operational identity | approved logical queue/tenant alias  | retain only for a required cohort within population/churn and privacy/access budgets |
| per-occurrence/raw identity     | user, order, session, request, trace | log/span/exemplar under data policy; do not copy raw caller IDs into metrics         |
| caller-controlled text          | raw path/URL, header, SQL/message    | template/classify before instrumenting                                               |
| sensitive                       | email, phone, document/token         | prohibit; treat telemetry as data exposure                                           |

Even fixed labels multiply. Redundant status and outcome dimensions can be useful only when
their joint queries justify cost; otherwise derive one at query/recording time.
An alias is not automatically anonymous or bounded: verify its source, ownership and lifetime.
Hashing a large or sensitive identity domain does not solve cardinality or privacy.

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

Select layers for the actual exposure and resource boundary; reuse adequate controls and
their evidence. A narrow label/query review does not require adding every layer below.

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

OTHER preserves counts only when observations are recorded into the same aggregate before
export, with reset/lifecycle semantics intact. Metric relabeling is not aggregation: removing
or replacing a distinguishing label can create duplicate identities and ingestion errors or
lost measurements. Verify resulting uniqueness. Recording rules reduce query fan-out but
do not remove the original ingestion cost.

Prometheus `sample_limit` and label limits apply after metric relabeling; exceeding them fails
the entire scrape, not just the offending metric. A backend drop cannot contain application
registry growth or the cost of generating/transporting the original scrape. Cap/normalize at
the source when that resource is at risk.

For native histograms, inspect separate bucket/resolution limits on the deployed version.
For example, the cited Prometheus 3.5 configuration provides `native_histogram_bucket_limit`:
it reduces resolution to fit and fails the scrape if it cannot. A sample limit is not a
per-histogram bucket limit, and reduced resolution can change the query's accuracy contract.

## Sources

- [Prometheus relabeling and scrape limits](https://prometheus.io/docs/prometheus/latest/configuration/configuration/)
- [Prometheus histogram exposition](https://prometheus.io/docs/instrumenting/exposition_formats/)
- [Prometheus 3.5 scrape configuration](https://github.com/prometheus/prometheus/blob/v3.5.0/docs/configuration/configuration.md) — separate sample and native bucket/resolution controls; verify the deployed version.

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
