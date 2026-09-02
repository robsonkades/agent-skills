# Semantic conventions as design constraints

The OpenTelemetry semantic conventions are not a naming style guide; they are the contract
the backend's aggregate views, service map and error filters are built on. A span that
ignores them is stored and never found. Stability differs by domain, and that changes how
hard you may pin a name:

| Domain    | Status (semconv registry) | Consequence                                                                                                                            |
| --------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP      | Stable                    | `http.request.method`, `http.route`, `url.path` are safe to query and alert on                                                         |
| Database  | Stable                    | `db.system.name`, `db.namespace`, `db.query.summary`, `db.operation.name` — the old `db.system`/`db.statement` names are the migration |
| Messaging | Development               | Attribute names can still change between releases; dashboards over `messaging.*` need a version pin                                    |

## Span name by kind

The API spec's rule: the most general string that identifies a _statistically
interesting class_ of spans. The per-domain forms:

| Kind of work     | Name form                                                                                                             | Never                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| HTTP server      | `{method} {http.route}` — `GET /orders/{id}`; `{method}` alone when there is no route                                 | The raw path. The spec says instrumentation "MUST NOT default to using URI path" |
| HTTP client      | `{method} {url.template}` or `{method}`                                                                               | `GET https://host/orders/8811`                                                   |
| Database         | `{db.query.summary}` (`SELECT orders`), else `{db.operation.name} {target}`, else `{target}`, else `{db.system.name}` | The full query text — one row per bind value                                     |
| Messaging        | `{messaging.operation.name} {destination}` — `send orders`, `process orders`                                          | The message key or id                                                            |
| In-process stage | A verb phrase for the stage: `price cart`, `render invoice`                                                           | The class and method name                                                        |

The unmatched route is the trap in HTTP: a framework that falls back to the path when no
handler matched (404s, static resources) will produce one name per URL. Check what your
server instrumentation emits for a 404.

## SpanKind decides what the backend can compute

| Kind       | Direction / style          | What is computed from it                                              |
| ---------- | -------------------------- | --------------------------------------------------------------------- |
| `SERVER`   | incoming, request/response | Service-level RED metrics (rate, errors, duration) for this service   |
| `CLIENT`   | outgoing, request/response | The service-map edge to the callee; dependency latency and error rate |
| `PRODUCER` | outgoing, deferred         | Edge to the broker/destination                                        |
| `CONSUMER` | incoming, deferred         | RED metrics for the consumer; the receiving end of a messaging edge   |
| `INTERNAL` | neither (default)          | Nothing aggregate — it is a detail inside the parent                  |

Consequences: an outbound call spanned as `INTERNAL` leaves a hole in the service map; a
`SERVER` span wrapped around an in-process stage doubles the request count for the
service; a consumer spanned as `SERVER` shows as a synchronous callee of a broker. The
kind is set at creation and most backends do not repair it.

## Status: who sets what

From the Trace API: `Unset` is the default and means "no error known"; `Error` is set on
failure; `Ok` "SHOULD NOT" be set by instrumentation libraries — only by application
code or operators, and once set it is final. Do not set `Ok` on every success: it removes
the distinction between "checked and fine" and "nothing happened".

| Span                | Leaves `Unset`                        | Sets `Error`                                              |
| ------------------- | ------------------------------------- | --------------------------------------------------------- |
| HTTP `SERVER`       | 1xx–4xx                               | 5xx, or a request that failed before a response           |
| HTTP `CLIENT`       | 1xx–3xx                               | 4xx and 5xx — from the caller's side a 404 _is_ a failure |
| Messaging consumer  | successful processing                 | processing threw; delivery failed                         |
| Cancelled operation | deliberate cancellation by the caller | —                                                         |

The asymmetry is deliberate and is the source of "the client says error, the server says
fine" on the same request. It also means a `SERVER` span for a 400 does not appear under a
"failed traces" filter unless the application sets it; a validation failure you need to
find has to be an attribute, or an explicit `Error` you have chosen to set.

## Messaging operations and the batch model

The messaging conventions name five operation types and a kind for each:

| `messaging.operation.type` | Meaning                                    | Kind                                                 |
| -------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| `create`                   | message created, not yet sent (batch send) | `PRODUCER`                                           |
| `send`                     | message(s) handed to the intermediary      | `PRODUCER` (or `CLIENT` when a `create` span exists) |
| `receive`                  | consumer polled and got message(s)         | `CLIENT`                                             |
| `process`                  | consumer handled message(s)                | `CONSUMER`                                           |
| `settle`                   | ack / nack / commit                        | `CLIENT`                                             |

A `receive` or `process` span may cover one message, a batch, or none, and for a batch
"each message within should have a span link to its creation context". That is the
convention's statement of the model in `span-modelling.md`: a batch span with N links, or
one `process` span per record, each linked. `messaging.batch.message_count` carries N.

The one place the conventions are more permissive than this skill's rule: for a **single**
message, the `process` span "may use the message's creation context as its parent". Take
that only when consumption is immediate — request-reply over a queue, a work item picked
up within the backend's trace-assembly window. When broker residence is unbounded relative
to that window, the parent-child form produces the hour-long root and the late-arriving
span the body describes, and the link form is still correct.

## Links and head sampling

The API notes that adding links at span creation "is preferred … because head sampling
decisions can only consider information present during span creation". A consumer that
starts its span and then calls `addLink()` after decoding the record has already been
sampled without the link — a sampler configured to keep traces linked to an error, or to a
tenant, never sees it. Extract the context first, create the span with the link.

## Symptom to cause

| Symptom in the backend                                  | Cause                                                                      | Fix                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| "Slowest operations" has one row per request            | Id or raw path in the span name                                            | Route template in the name, id in an attribute                    |
| One operation dominates with the name `GET` or `HTTP`   | No route matched (404s, static files, proxies) — the fallback name         | Give those handlers a route, or drop them at the collector        |
| Service map lacks an edge you know exists               | Outbound call spanned `INTERNAL`, or not spanned at all                    | `CLIENT` kind on the outbound span                                |
| Request rate on the dashboard is twice the real rate    | An in-process stage spanned as `SERVER`                                    | `INTERNAL` for in-process work                                    |
| "Failed traces" filter is empty though users see errors | Root left `Unset` (4xx on server, or recovered error), or `Ok` set blindly | Set `Error` on the root for what the caller received as failure   |
| Consumer trace has an hour-long root                    | Consumer parented to the producer span                                     | New trace with a link                                             |
| Batch handled as one unrelated request's child          | Batch parented to the first record's context                               | Batch span with N links, or one span per record                   |
| Linked traces missing under a link-aware sampler        | `addLink()` after creation; head sampler never saw it                      | Extract, then create with the link                                |
| `db.system` and `db.system.name` both present           | Mixed instrumentation versions during the DB semconv migration             | Pin one semconv version across services; query on the stable name |
