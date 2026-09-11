# Two Step View and Modern Representations

## The pattern

Build a **logical** representation first; render it to the final form in a reusable second
step. Fowler's original pattern concerns HTML; the JSON/error examples below are analogous
separations, not proof that every shared handler implements the classical pattern.

```text
model ──► logical representation ──► shared rendering step ──► output
          (what the response says)   (how everything looks)
```

The gain is that one change — a layout, an envelope, a link format, a locale rule — happens
in one place. The cost is that the final output is not visible in any single file.

## Candidate shared rendering seams

The labels below assume a logical first stage; ordinary helper reuse alone is not sufficient.
Retain a simpler existing seam when it already supplies the required consistency.

| Shared second step                                   | What it is                                  |
| ---------------------------------------------------- | ------------------------------------------- |
| A layout template that fragments plug into           | Two Step View for HTML                      |
| A controller advice producing a response envelope    | Two Step View for JSON                      |
| A single exception handler producing `ProblemDetail` | Two Step View for errors                    |
| A hypermedia assembler adding links                  | Two Step View for HATEOAS                   |
| A per-tenant theme resolver                          | Two Step View with a selectable second step |

## Errors: a useful shared step

Partial Spring Framework 6+/Java 17+ example; project exception types and trace lookup are
omitted. Inspect existing MVC/Boot problem-details configuration first. Business codes,
titles, field names and messages must be deliberately public; do not expose raw exception
messages, rejected values or secrets through interpolation. Map codes to trusted problem
URIs rather than appending arbitrary input.

```java
@RestControllerAdvice
class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(BusinessRuleViolation.class)
    ProblemDetail onBusinessRule(BusinessRuleViolation e) {
        var problem = ProblemDetail.forStatus(HttpStatus.UNPROCESSABLE_ENTITY);
        problem.setType(publicProblemType(e.code())); // trusted code-to-URI mapping
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
            .map(f -> Map.of("field", publicFieldName(f), "message", publicValidationMessage(f)))
            .toList());
        return handleExceptionInternal(ex, problem, headers, status, request);
    }
}
```

The public-field/message helpers must return non-null, allowlisted values (`Map.of` rejects
null); do not copy arbitrary validation arguments. Existing framework handling can already
produce Problem Details; override only the differences the contract requires. Test failures
from filters/security/container layers too: controller advice does not cover every source.
A trace ID helps correlate diagnostics when present; its absence is not proof that a request
was untraced, and correlation identifiers need a deliberate exposure policy.

## Response envelopes and the consumer contract

```json
{ "data": { ... }, "meta": { "requestId": "..." }, "errors": [] }
```

A wrapper used solely to repeat status/headers adds client work. Prefer the resource as the body, HTTP status for the
outcome, `ProblemDetail` for errors, and headers for metadata. Use an envelope when the existing contract or consumer needs justify it, such as pagination
metadata or batch per-item outcomes. Do not remove an established wrapper as a view cleanup (`rpc-and-api-contracts`).

## Per-tenant and per-locale rendering

```java
// One logical representation; the second step is selected at render time.
public interface OrderViewRenderer {
    String render(OrderDetailView view, Locale locale, TenantId tenant);
}
```

Shared rendering can reduce duplicated branding, but themes/layout composition may already
solve it without another model. Keep visual variation in rendering; tenant-specific business
rules, authorization and available fields belong upstream. Never build an unauthorized
superset and rely on a theme to hide fields. Shared response caches must distinguish all
relevant tenant, role, locale and representation variants, or avoid caching sensitive output.

## Where the patterns land in modern architectures

| Architecture                      | View layer on the server                                                     |
| --------------------------------- | ---------------------------------------------------------------------------- |
| Server-rendered pages             | Template View or explicit transform; layout composition need not be Two Step |
| htmx / hypermedia fragments       | Template View per fragment, same layout discipline. The fragment is a view.  |
| SPA or mobile client              | Transform-style response shaping remains; UI rendering is client-side        |
| BFF for one client                | Transform View shaped to that client's screens — legitimately view-driven    |
| Public API with several consumers | Transform View shaped to its declared consumer contract                      |

The BFF row is worth stating explicitly because it resolves a common argument. A
backend-for-frontend may legitimately shape responses around screens — that is what it is
for. A shared public API should account for its intended consumers; a screen-oriented resource
can be deliberate, but may couple later consumers to the first UI's needs (`remote-facade-and-dto`).

## Streaming and large responses

A response that cannot fit comfortably in memory changes the view decision:

This lifecycle is pseudocode; the adapter must implement its persistence and Servlet APIs:

```text
authorize tenant + export scope; validate row/byte/time limits
set media type, charset and disposition before obtaining the writer
within a transaction scope that cleans up even when cursor acquisition fails:
    open cursor in a resource scope; acquire response writer inside that scope
    while rows remain:
        fail explicitly if row/byte/time budget is exhausted
        encode next row with CSV quoting and the agreed spreadsheet-formula policy
        write bounded output; account for slow clients and disconnects
    flush and check writer error state before recording completion
    close cursor on success, acquisition/write failure or disconnect
end transaction; let the HTTP adapter own response-writer completion
```

A cursor does not by itself prove bounded driver buffering or persistence-context growth.
Some data sources do not require a transaction; JDBC/JPA streams that do need one must be
consumed before that transaction ends, including asynchronous execution boundaries. Do not
return an open stream from an already completed transactional method. Long exports can hold
connections/snapshots while clients stall; consider bounded pages or an asynchronous artifact
with explicit snapshot/version semantics.
Servlet `getWriter()` returns a `PrintWriter`, which can suppress I/O exceptions; inspect
`checkError()` or use an adapter that exposes write failure. A time check between rows alone
does not bound a blocked write; configure transport limits and cancellation behavior.

HTTP status/headers become fixed when the response is **committed**, for example after a
flush or buffer overflow, not necessarily on the first application write. Before commitment,
the adapter may reset and return an error; afterwards, specify a detectable failure contract.
An abrupt close is not reliably distinguishable from a shorter valid CSV under every client/
transport. For all-or-nothing completeness, use an artifact with verified length/checksum or
a protocol with a required completion marker. Never append a JSON error to committed CSV.

## Content negotiation

Use framework negotiation (`Accept`, declared media types and configured converters/view
resolvers). Separate handler methods are one option; a single handler with negotiated
converters is also valid. Verify unsupported types, actual Content-Type, and cache variation
(e.g. `Vary: Accept` when appropriate). Do not manually branch while bypassing this contract.

Compatibility/version policy belongs to the API contract (`rpc-and-api-contracts`). A renderer or
representation adapter may implement approved version-specific shapes or media types; it must not
invent that policy independently. Preserve each selected version's field, error and cache contracts.

## Reviewing a representation layer

Use the questions relevant to the requested change or uncertainty, and reuse adequate existing
evidence. A narrow API/pattern explanation needs no fabricated endpoint or streaming campaign.

1. Is any decision made in a template or a serialiser that is not purely presentational?
2. Is any rendering-time loading unintended or outside its authorization, work or resource bounds?
3. Do business, validation and framework errors satisfy the intended public contract,
   including permitted differences and failures outside controller advice?
4. Is there actual inconsistency or change coordination that existing layout/helper reuse does not solve?
5. Does any response contain a field nobody deliberately exposed? (A snapshot test with a
   complete field allowlist or reviewed schema helps catch this; one negative assertion
   protects only one name.)
6. Does framework negotiation select supported representations correctly?
7. For large responses: are buffering, cursor/context lifetime, slow clients, disconnects
   and partial-output detection covered?

Sources: [Fowler Two Step View](https://martinfowler.com/eaaCatalog/twoStepView.html),
[Spring 6.1.14 response exception handling](https://docs.spring.io/spring-framework/docs/6.1.14/javadoc-api/org/springframework/web/servlet/mvc/method/annotation/ResponseEntityExceptionHandler.html),
[Spring 6.1.14 ProblemDetail](https://docs.spring.io/spring-framework/docs/6.1.14/javadoc-api/org/springframework/http/ProblemDetail.html),
[Servlet 6 response buffering and commitment](https://jakarta.ee/specifications/servlet/6.0/apidocs/jakarta.servlet/jakarta/servlet/servletresponse).
