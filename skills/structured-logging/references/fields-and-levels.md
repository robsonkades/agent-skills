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
2. dual-emit or dual-read old/new fields;
3. update parsing, dashboards, detections and retention rules;
4. test mixed-version deployment;
5. remove old form after consumer confirmation.

Avoid dynamic field names; put bounded keys in values or nested validated maps only when the
backend schema supports them.

## Data policy

Classify fields by public/internal/confidential/restricted and map each class to masking,
access, geography and retention. Test nested objects and exception chains. Record access to
sensitive logs and protect integrity for security/audit evidence.
