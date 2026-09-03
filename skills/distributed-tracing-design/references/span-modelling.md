# Span Modelling

## Model card

For each span class:

```text
Name and instrumentation scope:
Logical operation and start/end:
Kind and semantic-convention version:
Parent selection:
Links and link attributes:
Required/optional attributes:
Status/error/outcome rules:
Events:
Sampling/cost/privacy constraints:
Owner and incident query:
```

## Parent versus link

Parent:

- exactly zero or one;
- gives the child the same trace ID;
- identifies the primary causal context;
- does not require temporal containment.

Link:

- zero or many;
- may point within or across traces;
- suits batches, additional causes and following-trace relationships;
- can affect head sampling only when present at span creation.

The choice is semantic, not a workaround for duration. Trace UIs/backend retention may
handle long gaps differently; evaluate those operational constraints separately.

## Retries

Distinguish logical call from attempts when both matter:

```text
logical client operation (optional encompassing span)
  attempt 0 -> timeout
  attempt 1 -> success
```

Follow the protocol semantic convention: some HTTP instrumentation emits each resend and
does not also emit an encompassing HTTP client span. Preserve resend count and final
logical outcome without double-counting service calls.

## Batch choices

| Model                             | Prefer when                                       | Cost/loss                 |
| --------------------------------- | ------------------------------------------------- | ------------------------- |
| one batch span, links per message | batch is unit of scheduling/commit                | per-record latency absent |
| one process span per record       | record outcomes/retries are operated individually | span volume               |
| receive batch plus process spans  | acquisition and record processing both actionable | more topology/volume      |

Cap link/event counts and define truncation attributes; giant batches can exceed SDK/backend
limits. Sampling a batch trace retains all or none of its linked record detail unless a
separate policy exists.

## Long-running workflows

One trace can technically contain long-lived asynchronous spans, but retention, tail
sampling decision windows and UI usability may favor one trace per step linked through a
workflow. Keep workflow ID governed and avoid putting it in span names or metric labels.
Document replay/duplicate semantics.

## Test cases

Assert at least:

- stable names for unknown routes and arbitrary IDs;
- success, expected rejection, server failure, cancel and timeout status;
- retry attempt versus logical outcome;
- batch with zero/one/many messages;
- redelivery;
- ambient context plus message creation context;
- async completion after method return;
- link/attribute truncation;
- automatic plus manual instrumentation duplication.
