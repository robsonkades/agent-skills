# Fields, levels and volume

## The standard field set

Every event, from every service, carries these. A field that is present on only some events
cannot be used as a filter, because "absent" and "not applicable" are indistinguishable.

| Field                       | Source                         | Why it is mandatory                                       |
| --------------------------- | ------------------------------ | --------------------------------------------------------- |
| `timestamp`                 | Appender, ISO-8601 with offset | Local time without an offset is unsortable across regions |
| `level`                     | Logger                         | The routing key for alerting                              |
| `logger` / `thread`         | Logger                         | Locates the emitting code; thread names the pool          |
| `service`, `version`, `env` | Resource / deployment config   | Answers "which build" without a deploy timeline lookup    |
| `trace_id`, `span_id`       | Tracing context                | The join to `distributed-tracing-design`                  |
| `request_id`                | Ingress filter                 | Survives when the trace was sampled away                  |
| `message`                   | Call site, **constant**        | The event type; a variable message cannot be counted      |
| `error.type`, `error.stack` | Encoder, from the throwable    | Grouping failures by type rather than by message wording  |

Then per-domain keys — `order_id`, `tenant_id`, `payment_id`. Two rules make them usable:

- **One name per concept, everywhere.** `tenant_id` in one service and `tenantId` in another
  means no query spans both. Pick one case style and write it down; a shared logging module
  that builds the event is how it is actually enforced.
- **A field name is a public interface.** Once a dashboard, a saved query or an alert filters
  on it, renaming it breaks them with an empty result rather than an error. Rename by
  emitting both for one retention period, then dropping the old one.

## Levels as a contract with the on-call

| Level | The contract                                                      | Typical wrong usage                                   |
| ----- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| ERROR | A human should look. Work was lost or a guarantee was broken      | A failure that was caught, retried and then succeeded |
| WARN  | Degraded but handled; worth a trend, not a page                   | Expected business outcomes (a declined card is INFO)  |
| INFO  | A state change someone outside the team would recognise           | One line per request, per layer, at full traffic      |
| DEBUG | Detail for someone reading the code, off in production by default | Left on "temporarily" and never removed               |
| TRACE | Per-item detail inside a loop or a protocol                       | Anything shipped enabled                              |

The single most damaging defect is ERROR inflation. Once the ERROR rate is dominated by
handled failures, three things follow: the on-call stops reading it, an alert built on the
ERROR count needs a threshold chosen from noise rather than from meaning, and the real
failure arrives as a small percentage change in a large number.

The audit: list ERROR call sites, and for each ask _what would a human do about this right
now?_ "Nothing, it retried" is a demotion to WARN. "Nothing, it is the client's fault" is a
demotion to INFO, and the count belongs in a metric.

## What must never be logged

Credentials and tokens (`Authorization` headers, API keys, session ids, refresh tokens);
personal identifiers beyond an opaque internal id; payment data; and **full request or
response bodies**, which are the vehicle for all three. Also: anything whose size is
unbounded — a stack of a downstream error body, a serialised collection, an uploaded
document.

The rule that makes this enforceable is that redaction is applied by the encoder, to field
names and to a marker type, never by the call site. See
`references/java-logging-mechanics.md`.

Beyond the compliance argument there is an operational one: a log store containing personal
data acquires an access-control and retention regime, which usually ends with the on-call
losing direct query access to it.

## Volume and sampling

The bill and the ingestion limit are both:

```text
events/s = requests/s × events per request
bytes/s  = events/s × average event bytes
```

At 2,000 req/s, three INFO events per request at 600 bytes is ~3.6 MB/s, ~300 GB/day. That
is usually the largest line item in an observability budget, and hitting a collector's
ingestion rate limit drops events indiscriminately — the errors included.

Sampling rules:

- **Sample by request, not by event.** Decide once at the edge (reusing the trace sampling
  decision keeps logs and traces aligned) and propagate the decision. Independently sampled
  events give a third of a story with no marker that the rest existed.
- **Never sample WARN, ERROR, audit or security events.** Their volume is bounded by
  failures rather than by traffic, which is exactly why they are affordable.
- Record the sampling rate as a field on the retained events, or any count derived from logs
  is wrong by an unknown factor.
- Aggregate counting is `metrics-and-cardinality`'s job. Deriving a request rate by counting
  log lines is a metric implemented at 600 bytes per data point.

## Review checklist

- [ ] Every event carries `trace_id` and `request_id`, including on async paths
- [ ] Messages are constants; all variability is in fields
- [ ] Field names use one case style and one name per concept across services
- [ ] No ERROR call site describes a failure that was handled and recovered
- [ ] Every exception is logged as the throwable, never as `getMessage()` text
- [ ] Each failure is logged exactly once, at the layer that handles it
- [ ] Redaction and field-length limits are enforced at the encoder
- [ ] No call site logs a whole request or response body
- [ ] INFO volume per request is known, and the resulting bytes/s is written down
- [ ] Sampling is per-request, and WARN/ERROR/audit are exempt
- [ ] A test asserts the required fields on every event emitted at one boundary
