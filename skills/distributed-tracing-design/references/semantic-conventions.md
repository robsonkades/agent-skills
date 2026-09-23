# Semantic Conventions

## Version discipline

Record SDK/agent and semantic-convention versions. Check each domain's stability; do not
generalize HTTP stable attributes to messaging/database conventions that may be in
development. During migration, instrumentation can emit old, new or duplicate forms.
Version dashboards/queries and dual-read deliberately.

The rules below were reviewed against OpenTelemetry semantic conventions **1.44.0**.
Check the target instrumentation's emitted version before applying them; a newer online
specification does not authorize changing existing telemetry contracts.

## HTTP

The [HTTP conventions at this baseline](https://github.com/open-telemetry/semantic-conventions/blob/v1.44.0/docs/http/http-spans.md)
are stable unless a section says otherwise:

- prohibit defaulting span-name targets to raw URI paths;
- use SERVER for inbound and CLIENT for outbound HTTP spans;
- leave status unset for 1xx–3xx absent another error;
- normally leave 4xx unset on SERVER and set Error on CLIENT, with application context able
  to classify more precisely;
- set Error for relevant 5xx or transport failures;
- leave status unset and omit `error.type` for detected intentional caller cancellation;
- do not add redundant status descriptions inferable from status code.

Do not infer caller intent from a cancellation-shaped exception alone. A deadline or
transport failure may use cancellation internally; inspect the cause rather than exempting
every timeout from error reporting. If the cause is unknown, retain that uncertainty.

Consult the pinned document for required attributes and resend modeling.

## Messaging

The [messaging conventions at this baseline](https://github.com/open-telemetry/semantic-conventions/blob/v1.44.0/docs/messaging/messaging-spans.md)
are in development:

| Operation type | Kind                                                                         |
| -------------- | ---------------------------------------------------------------------------- |
| create         | PRODUCER                                                                     |
| send           | PRODUCER when its context becomes message creation context; otherwise CLIENT |
| receive        | CLIENT                                                                       |
| process        | CONSUMER                                                                     |
| settle         | CLIENT                                                                       |

Preserve custom message creation contexts and omit a new create span for those messages.
Link send to any separate create/custom context injected into its messages.

Receive models application-initiated pull; process models delivery to a handler and can also
model processing after pull. Library prefetch alone creates neither until messages reach
the caller.

Link receive/process to their messages' creation contexts. Single-message process may use
creation context as parent, but inside ambient context default to ambient parent plus
message link. If explicitly opting into message parentage there, retain links to both
message creation and ambient contexts. Document and assert this choice.

## Span names and cardinality

Use convention-prescribed templates and bounded destination/operation identifiers. Raw
paths, message keys, entity IDs and statements with literals produce unqueryable operation
groups and data exposure. Span names are not metric labels, but backends commonly aggregate
them and may derive metrics.

## Status and errors

Unset is not necessarily success; it is the default. Error classification is operation and
domain specific. Ok is an explicit final status and should not be mechanically set by
generic instrumentation. Record `error.type` and exception details only under applicable
conventions and sensitive-data policy.

For new instrumentation adopting this baseline, [record failed-operation exceptions as
logs](https://github.com/open-telemetry/semantic-conventions/blob/v1.44.0/docs/general/recording-errors.md#recording-exceptions)
while retaining the span's error status and `error.type`. Avoid recording a recovered
attempt as an error on its successful enclosing operation or capturing the same exception
repeatedly across layers.

The [exception span-event convention is deprecated at this baseline](https://github.com/open-telemetry/semantic-conventions/blob/v1.44.0/docs/exceptions/exceptions-spans.md),
but its migration policy preserves existing event output by default until an opt-in or a
later major-version change.
Verify whether the installed instrumentation supports `OTEL_SEMCONV_EXCEPTION_SIGNAL_OPT_IN`
before proposing it: `logs` selects logs, while `logs/dup` provides transitional dual output.
Check log export, trace correlation, retention and existing queries before switching.
Keep duplicate capture bounded to a documented migration; do not remove working events or
upgrade dependencies merely because the current specification prefers logs. Exception
messages and stack traces still require sensitive-data controls on either signal.

## Review checklist

- [ ] domain and convention version pinned
- [ ] stable versus development status recorded
- [ ] span name cannot contain instance data
- [ ] kind matches the protocol operation, not blocking versus asynchronous syntax
- [ ] start/end include the documented operation
- [ ] status/error rules cover cancellation and expected outcomes
- [ ] retry/resend/batch behavior follows domain convention
- [ ] migration handles mixed old/new schemas
- [ ] exception signal migration preserves findability and avoids unintended duplicates
