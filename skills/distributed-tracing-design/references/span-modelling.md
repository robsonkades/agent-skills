# Span modelling

## The span test, applied

> Would you ever act on this duration _separately_ from its parent's?

| Work                                                           | Span? | Why                                                         |
| -------------------------------------------------------------- | ----- | ----------------------------------------------------------- |
| Outbound HTTP / RPC call                                       | Yes   | Crosses a process; has its own timeout and failure mode     |
| JDBC statement, cache get                                      | Yes   | Crosses a process; the usual home of unexplained latency    |
| Broker publish, broker consume                                 | Yes   | Crosses a process **and** a trace boundary — see below      |
| A retry attempt                                                | Yes   | Its duration and its outcome differ from the call's overall |
| An expensive in-process stage (encode, render, evaluate rules) | Yes   | Real time, invisible in any I/O span                        |
| A validation method                                            | No    | Fixed fraction of the parent; attribute or nothing          |
| Each iteration of a loop over 500 items                        | No    | 500 spans nobody reads; one span with `batch.size=500`      |
| A getter, a mapper, a branch taken                             | No    | Never separately actionable — an attribute on the parent    |

The practical ceiling is human: a trace of a few dozen spans is read in an incident, one of
several hundred is scrolled past. A flow with hundreds of units of work should span the
_stages_ and carry per-item detail as attributes and span events.

## Naming and attributes

```java
// Name: bounded set, one per operation.        Attributes: the specifics.
span = tracer.spanBuilder("GET /orders/{id}")   // not "GET /orders/8811"
             .setSpanKind(SpanKind.SERVER)
             .startSpan();
span.setAttribute("order.id", orderId);         // high cardinality is fine here
span.setAttribute("tenant.id", tenantId);
span.setAttribute("http.route", "/orders/{id}");
```

- The name is what the backend groups by. An id in the name means the "slowest operations"
  and "error rate by operation" views have one row per request. This is the same discipline
  `metrics-and-cardinality` applies to labels, and the same failure — but the cost lands on
  _queryability_ rather than on the storage bill, because attributes are stored per span
  rather than as a series.
- The semantic conventions (`http.request.method`, `db.system.name`) are a versioned registry;
  `order.id` is not one of them and follows only your convention. Keep a written prefix list
  so two teams do not ship `orderId` and `order.id`.
- Attributes reach whoever runs the tracing backend. Personal data and credentials fall under
  the same rules as logs; `structured-logging` owns the redaction mechanism.

## Errors and root status

```java
catch (PaymentDeclinedException e) {
    span.recordException(e);
    span.setStatus(StatusCode.ERROR, "payment declined");
    throw e;
}
```

Two separate decisions, and only the second one makes traces findable:

1. **On the span where it happened** — record the exception and set the status, always.
2. **On the root span** — set ERROR only if the request failed for the caller. Most backends'
   "failed traces" filter is a predicate on the root. A call that failed, was retried and
   succeeded should leave the root OK with an ERROR child; marking the root ERROR turns a
   healthy retry into a fake incident, and never marking it hides a real one.

State the choice per operation: propagating every child's status upward turns each transient
blip into a failed trace.

## Links versus parent-child

Parent-child asserts something specific: **the parent is running while the child runs, and
the parent's duration encloses it.** Everything asynchronous violates that assertion.

```text
Producer                          Consumer (one hour later)
  |                                 |
  [publish span] ---- link -------> [new trace root: process order.created]
  |                                    attributes: messaging.destination,
  [root ends]                                      messaging.kafka.offset
```

If instead the consumer span is made a _child_ of the publish span:

- the root span lasts an hour, so every duration aggregate over that operation is dominated by
  broker residence time rather than by work;
- the backend assembles a trace from spans arriving within a bounded window, so the consumer
  span can arrive after the trace was assembled and — under tail-based sampling — decided;
- a message replayed hours later attaches to a trace long since reported complete.

Use a link. A link references a `SpanContext`: it says "caused by", carries no lifetime claim
and imposes no ordering or delivery guarantee. It exists only if the producer injected the
context into the message headers and the consumer extracted it — the propagation mechanics
are `opentelemetry-performance`'s.

## Batch consumption, worked through

One poll returns 500 records produced by 500 different requests, so they belong to 500
different traces. There is no single parent, and picking one is actively harmful: the batch's
work is attributed to whichever upstream request happened to be first, whose trace duration
then includes the other 499 records' processing.

Two correct models:

| Model                                                                     | Choose when                                                                                        | What you lose                                                      |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| One span per record, each its own trace root, each linked to its producer | per-record latency, per-record failure and per-record retry are questions you ask (the usual case) | span volume equals record volume — sample by record                |
| One batch span with 500 links                                             | the batch is the unit of work: a bulk upsert, a file write, an aggregate flush                     | per-record duration; failures become span events on the batch span |

A useful middle: a batch span for the poll and the commit — genuinely batch-scoped work — with
a per-record child for the handler. The child then belongs to the batch's trace, and its
_link_, not its parent, points at the producer.

## Long-running and fire-and-forget work

- **A request that schedules background work.** The request returns before the work starts.
  Link, do not parent, or the request's trace duration becomes the job's.
- **A scheduled job.** Root the trace at the tick, linking each item that carries upstream
  context.
- **A saga or long-lived workflow.** One trace per step, linked to the previous, with a shared
  correlation attribute (`saga.id`). A trace spanning days is unreadable and rarely survives
  retention.
- **A retry of an entire request.** New trace, linked to the failed attempt — the two attempts
  are sequential, not nested.
