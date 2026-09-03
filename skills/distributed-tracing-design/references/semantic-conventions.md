# Semantic Conventions

## Version discipline

Record SDK/agent and semantic-convention versions. Check each domain's stability; do not
generalize HTTP stable attributes to messaging/database conventions that may be in
development. During migration, instrumentation can emit old, new or duplicate forms.
Version dashboards/queries and dual-read deliberately.

## HTTP

Current stable HTTP conventions:

- prohibit defaulting span-name targets to raw URI paths;
- use SERVER for inbound and CLIENT for outbound HTTP spans;
- leave status unset for 1xx–3xx absent another error;
- normally leave 4xx unset on SERVER and set Error on CLIENT, with application context able
  to classify more precisely;
- set Error for relevant 5xx or transport failures;
- do not add redundant status descriptions inferable from status code.

Consult the pinned document for required attributes and resend modeling.

## Messaging

Current messaging conventions are development and distinguish:

| Operation type | Typical kind                                       |
| -------------- | -------------------------------------------------- |
| create         | PRODUCER                                           |
| send           | PRODUCER or CLIENT under defined context semantics |
| receive        | CLIENT                                             |
| process        | CONSUMER                                           |
| settle         | CLIENT                                             |

Links to message creation contexts are the consistent default for receive/process batches.
For one message, process may use creation context as parent. When processing occurs inside
another ambient context, preserve that relationship according to the convention rather
than overwriting it silently.

## Span names and cardinality

Use convention-prescribed templates and bounded destination/operation identifiers. Raw
paths, message keys, entity IDs and statements with literals produce unqueryable operation
groups and data exposure. Span names are not metric labels, but backends commonly aggregate
them and may derive metrics.

## Status and errors

Unset is not necessarily success; it is the default. Error classification is operation and
domain specific. Ok is an explicit final status and should not be mechanically set by
generic instrumentation. Record error.type and exception events only under applicable
conventions and sensitive-data policy.

## Review checklist

- [ ] domain and convention version pinned
- [ ] stable versus development status recorded
- [ ] span name cannot contain instance data
- [ ] kind matches remote direction and sync/deferred form
- [ ] start/end include the documented operation
- [ ] status/error rules cover cancellation and expected outcomes
- [ ] retry/resend/batch behavior follows domain convention
- [ ] migration handles mixed old/new schemas
