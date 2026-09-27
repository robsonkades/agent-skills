# Fields, Levels and Schema

## Event schema template

```text
event.name / event.version:
producer and occurrence boundary:
purpose and consumers:
timestamp semantics:
severity:
required fields and types/units:
optional fields:
correlation fields and validity:
outcome/error classification:
sensitive/untrusted inputs:
redaction/length/encoding:
delivery/loss/order contract:
retention/access/integrity:
```

Use stable machine fields plus a concise human message. Do not force all services into
fields that are meaningless; establish a common envelope and event-specific schemas.

## Time and exact values

Define which clock and boundary each timestamp represents. Preserve source occurrence time
when known; keep observation/ingestion time separate when delay or replay affects the query.
If source time is unknown, label the available observation time rather than inventing an
occurrence time. Map existing fields to these meanings instead of requiring new names or
duplicate timestamps everywhere. OpenTelemetry's `Timestamp` and `ObservedTimestamp` are
one established distinction; source `Timestamp` may be absent.

A record created at 08:00 and collected at 08:10 did not necessarily occur during an 08:09
incident. Clock skew and untrusted caller timestamps also limit ordering and delay claims:
use correlation, recorded durations and clock evidence before treating timestamp subtraction
as latency or timestamps as causal order. Keep caller-supplied time separate from trusted
envelope time under the same collision policy as other caller fields.

For opaque IDs, prefer a string when precision, leading zeros or downstream numeric coercion
would change identity. JSON permits larger numbers, but binary64 consumers do not preserve
every integer beyond `2^53 - 1`: numeric `9007199254740993` can become `9007199254740992`.
Check exact values through the actual parser/index/query path at representative boundaries.
Keep genuine quantities numeric with explicit units/ranges when the consumer supports their
required precision; do not stringify every field to solve an identifier problem. Changing an
existing numeric ID to string is a schema migration, with the reader/rollback obligations below.

## Correlation

Possible identifiers:

- trace_id/span_id when a valid active trace exists;
- request/operation ID generated or validated at ingress;
- business entity/workflow ID under privacy/access policy;
- message destination/partition/offset or delivery ID;
- deployment/instance/region.

Do not trust caller-provided IDs without validation and length limits. Avoid credentials as
correlation values. If traces are sampled, valid trace IDs can still exist without stored
spans; runbooks need fallback business/request handles.

## Severity contract

Define levels by outcome, expectedness, recoverability and consumer—not exception class
alone. Include examples and counterexamples per service. Security severity may differ from
operational level; separate event category/risk fields rather than overloading ERROR.

Avoid logging the same expected validation/client error at stack-trace volume. Aggregate
common outcomes with metrics and retain sampled/diagnostic examples as policy allows.

## Schema evolution

Field names and types are APIs. For breaking changes:

1. add event schema version;
2. support old/new fields in readers or temporarily emit both fields in one event;
3. update parsing, dashboards, detections and retention rules;
4. test mixed-version deployment;
5. retire old writers after mixed-deployment/rollback requirements are satisfied, and retain
   old reader support while old records remain queryable or replayable, including archives
   and restored backups.

Consumer confirmation for live traffic does not prove historical queries still work. If
two event records must be emitted, preserve occurrence identity and define deduplication so
counts, alerts and audit consumers do not interpret them as two actions.

Avoid dynamic field names; put bounded keys in values or nested validated maps only when the
backend schema supports them.
Reserve envelope keys and define collision precedence explicitly. Do not flatten arbitrary
MDC or caller maps over trusted severity, timestamp, identity or event-name fields; use an
allowlisted namespace and reject collisions. Duplicate JSON member names are not portable:
readers may keep different values or reject the record.

## Data policy

Classify fields by public/internal/confidential/restricted and map each class to masking,
access, geography and retention. Test nested objects and exception chains. Record access to
sensitive logs and protect integrity for security/audit evidence.

See [RFC 8259 section 4](https://www.rfc-editor.org/rfc/rfc8259#section-4) for duplicate-member
interoperability; test the producer and actual downstream parser together.
See [RFC 8259 section 6](https://www.rfc-editor.org/rfc/rfc8259#section-6) for numeric precision
limits and the [OpenTelemetry log timestamp model](https://opentelemetry.io/docs/specs/otel/logs/data-model/#field-timestamp)
for occurrence versus observation semantics. These references do not prescribe a new logging stack.
