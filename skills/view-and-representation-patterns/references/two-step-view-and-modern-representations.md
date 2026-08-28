# Two Step View and Modern Representations

## The pattern

Build a **logical** representation first; render it to the final form in a second step that
every response shares.

```text
model ──► logical representation ──► shared rendering step ──► output
          (what the response says)   (how everything looks)
```

The gain is that one change — a layout, an envelope, a link format, a locale rule — happens
in one place. The cost is that the final output is not visible in any single file.

## Where you already have it

| Shared second step                                   | What it is                                  |
| ---------------------------------------------------- | ------------------------------------------- |
| A layout template that fragments plug into           | Two Step View for HTML                      |
| A controller advice producing a response envelope    | Two Step View for JSON                      |
| A single exception handler producing `ProblemDetail` | Two Step View for errors                    |
| A hypermedia assembler adding links                  | Two Step View for HATEOAS                   |
| A per-tenant theme resolver                          | Two Step View with a selectable second step |

## Errors: the highest-value shared step

```java
@RestControllerAdvice
class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(BusinessRuleViolation.class)
    ProblemDetail onBusinessRule(BusinessRuleViolation e) {
        var problem = ProblemDetail.forStatus(HttpStatus.UNPROCESSABLE_ENTITY);
        problem.setType(URI.create("https://api.acme.com/problems/" + e.code()));
        problem.setTitle(e.title());
        problem.setProperty("code", e.code());       // stable, machine-readable
        problem.setProperty("traceId", currentTraceId());
        return problem;
    }

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(
            MethodArgumentNotValidException ex, HttpHeaders headers,
            HttpStatusCode status, WebRequest request) {
        var problem = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
        problem.setTitle("Validation failed");
        problem.setProperty("errors", ex.getBindingResult().getFieldErrors().stream()
            .map(f -> Map.of("field", f.getField(), "message", f.getDefaultMessage()))
            .toList());
        return handleExceptionInternal(ex, problem, headers, status, request);
    }
}
```

Overriding the framework's own error handling matters: without it, validation failures and
framework errors have a different shape from business errors, and clients need two parsers.
The `traceId` property is what connects a user's screenshot to a log search — cheap here,
impossible to add later per endpoint.

## Response envelopes: usually not worth it

```json
{ "data": { ... }, "meta": { "requestId": "..." }, "errors": [] }
```

A wrapper on every successful response duplicates what HTTP already provides (status,
headers) and complicates every client. Prefer the resource as the body, HTTP status for the
outcome, `ProblemDetail` for errors, and headers for metadata. Reach for an envelope only
when a real constraint requires it — a client that cannot read status codes, or a batch
endpoint with per-item outcomes (`rpc-and-api-contracts`).

## Per-tenant and per-locale rendering

```java
// One logical representation; the second step is selected at render time.
public interface OrderViewRenderer {
    String render(OrderDetailView view, Locale locale, TenantId tenant);
}
```

This is the case where Two Step View is clearly worth its indirection: N tenants × M screens
without it means N×M templates, and a change to a screen means N edits.

Keep the branch in the second step only. A logical representation that carries
tenant-specific fields has leaked the variation upstream, and every later change touches
both layers.

## Where the patterns land in modern architectures

| Architecture                      | View layer on the server                                                    |
| --------------------------------- | --------------------------------------------------------------------------- |
| Server-rendered pages             | Template View + a layout (Two Step). Classic and still correct.             |
| htmx / hypermedia fragments       | Template View per fragment, same layout discipline. The fragment is a view. |
| SPA or mobile client              | **None.** The server produces a Remote Facade returning DTOs                |
| BFF for one client                | Transform View shaped to that client's screens — legitimately view-driven   |
| Public API with several consumers | Transform View shaped to the domain, not to any consumer's screen           |

The BFF row is worth stating explicitly because it resolves a common argument. A
backend-for-frontend may legitimately shape responses around screens — that is what it is
for. A shared public API may not, because the next consumer's screens differ, and the shape
then encodes the first consumer's UI forever (`remote-facade-and-dto`).

## Streaming and large responses

A response that cannot fit comfortably in memory changes the view decision:

```java
@GetMapping(value = "/orders/export", produces = "text/csv")
void export(HttpServletResponse response) {
    response.setHeader("Content-Disposition", "attachment; filename=orders.csv");
    try (var writer = response.getWriter();
         var rows = orderProjections.streamAll()) {          // cursor-backed, closed
        rows.forEach(row -> writer.write(toCsvLine(row)));
    }
}
```

Points that matter: the stream must be closed and must run inside a read-only transaction;
the persistence context must not accumulate (`orm-behavioral-patterns`); and errors after
the first byte cannot change the status code, so a failure mid-export must be signalled in
the payload or by an abrupt close that the client detects. Decide that in advance rather
than discovering it.

## Content negotiation

Put it where the framework already has it — `produces` on the handler and an `Accept`
header — not in an `if` inside the handler. Two consequences follow: a new format is a new
method rather than a new branch, and the routing layer can report which formats an endpoint
supports.

Versioning is a different concern and does not belong in the view layer at all
(`rpc-and-api-contracts`).

## Reviewing a representation layer

1. Is any decision made in a template or a serialiser that is not purely presentational?
2. Does rendering touch a lazy association or issue a query?
3. Is the error shape identical for business errors, validation errors and framework
   errors?
4. Would changing the envelope, layout or link format require editing more than one file?
5. Does any response contain a field nobody deliberately exposed? (A snapshot test with a
   negative assertion catches this.)
6. Are formats added as new methods, or as branches inside one method?
7. For large responses: is anything streamed, and if so is the cursor closed and the context
   cleared?
