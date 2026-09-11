# Template View and Transform View

## Template View and domain policy

```html
<!-- Good: the template renders decisions someone else made. -->
<table>
  <tr th:each="line : ${order.lines}">
    <td th:text="${line.productName}">—</td>
    <td th:text="${line.quantity}">0</td>
    <td th:text="${line.formattedTotal}">0,00</td>
  </tr>
</table>
<p th:if="${order.showsDiscountNotice}" th:text="#{order.discount.notice}">…</p>
```

```html
<!-- Bad: the template duplicates pricing and eligibility policy. -->
<td th:text="${line.quantity * line.unitPrice * (customer.tier == 'PREMIUM' ? 0.9 : 1.0)}"></td>
<p th:if="${order.total > 1000 and customer.country != 'BR' and order.status != 'DRAFT'}">…</p>
```

The second version assumes these expressions calculate authoritative pricing and eligibility;
that duplicates policy in rendering. A threshold used only to emphasize an already decided display
value can instead be presentation. Identify its meaning and owner before moving a condition.

**The discipline:** business decisions are resolved before rendering; presentation choices remain.

```java
public record OrderView(
        String reference,
        String formattedTotal,          // already formatted, with currency
        List<LineView> lines,
        boolean showsDiscountNotice,    // already decided
        boolean canBeCancelled) {       // already authorised
}
```

A template may loop, compare presentation values and select labels. Avoid recalculating
business policy or traversing managed lazy data. Record components are shallowly final:
copy mutable collections when ownership requires a stable snapshot. `canBeCancelled` is a
UI hint; recheck authorization and current business state when cancellation is requested.

## Deliberate data access during rendering

```html
<!-- Lazy lines may trigger SQL; nested access can add queries depending on fetch state. -->
<tr th:each="line : ${order.lines}"></tr>
```

Access may work because data is already initialized or because a persistence context is
open. Open Session In View does not itself keep the original service transaction or a JDBC
connection open for the whole request. Uninitialized detached access can fail; an open
context may issue additional SQL outside that transaction. Measure full-request query count
and connection occupancy instead of inferring either from the annotation or template.

When rendering performs unintended data access, materialize the required view data before
rendering, using a projection or an explicit mapper within its resource scope
(`query-objects-and-specifications`).

Thymeleaf 3.1 also supports application-supplied `ILazyContextVariable` values, commonly through
`LazyContextVariable`, resolved when the template needs them. A bounded optional panel can use this
deliberately: the application owns authorization, loading, consistency and cleanup; rendering only
consumes the value. Verify whole-request work and resource limits, including failure or skipped
rendering. A lazy value is not a query-budget or transaction guarantee. Scope its instance to the
intended request/render; a cached value must not be reused across users or tenants accidentally.
Successful-value caching does not imply one load attempt per render after failures; inspect the
actual expression engine's retry behavior and enforce the application's work/failure bounds.

## Escaping is a security boundary

Verify the engine, template mode and output context. Thymeleaf `th:text` escapes text;
`th:utext` deliberately emits markup:

```html
<div th:utext="${userSuppliedHtml}">
  <!-- unescaped: XSS unless sanitised first -->
</div>
```

- Emit rich HTML only after a maintained allowlist sanitizer suitable for that sink. Stored
  sanitization requires provenance and reprocessing when policy changes; render-time
  sanitization is also valid. Do not mutate sanitized markup with unsafe content afterwards.
- Use context-aware encoders/builders: quoted ordinary HTML attributes need attribute
  encoding; URLs additionally need scheme validation and component encoding. HTML encoding
  alone does not make JavaScript, event-handler attributes or dangerous URLs safe.
- Prefer separate JSON responses. Embedded JSON needs a serializer safe for its exact HTML/
  script context, including `</script>` breakout; ordinary JSON validity is insufficient.

## Transform View

The classical Transform View walks model data to produce HTML. A presentation type plus a
serializer is a useful analogous separation for JSON; inspect actual output construction instead
of identifying the pattern solely from a DTO return type.

```java
public record OrderDetailView(
        UUID id,
        String status,
        MoneyView total,
        List<LineView> lines,
        @JsonInclude(NON_NULL) String cancellationReason) {

    public record LineView(String product, int quantity, MoneyView lineTotal) { }
    public record MoneyView(BigDecimal amount, String currency) { }
}
```

The declared type is refactorable and compile-checked, but serializer annotations, modules and
configuration also determine the wire shape. For a changed or uncertain output contract, test the
serialized form; reuse adequate existing contract tests. For example:

```java
@Test
void order_detail_json_shape() throws Exception {
    mockMvc.perform(get("/orders/{id}", id))
        .andExpect(jsonPath("$.id").value(id.toString()))
        .andExpect(jsonPath("$.total.currency").value("BRL"))
        .andExpect(jsonPath("$.lines[0].product").exists())
        .andExpect(jsonPath("$.customerInternalScore").doesNotExist());  // guards leakage
}
```

The negative assertion protects only that named field. Validate an explicit allowed field
set (including nested objects) or a reviewed complete schema/snapshot, plus tenant and role
variants, to detect other unintended exposure (`rpc-and-api-contracts`). These assertions
are a focused integration-test fragment, not a complete snapshot test.

## One model, several formats

One option when output semantics can share construction logic:

```java
// Shared construction logic, invoked per request; not a cached cross-user instance.
OrderDetailView view = orderQueries.detail(id).orElseThrow();

// Three transforms.
@GetMapping(value = "/orders/{id}", produces = APPLICATION_JSON_VALUE)
OrderDetailView json(@PathVariable UUID id) { return view(id); }

@GetMapping(value = "/orders/{id}", produces = "text/csv")
void csv(@PathVariable UUID id, HttpServletResponse response) { csvWriter.write(view(id), response); }

@GetMapping(value = "/orders/{id}", produces = APPLICATION_PDF_VALUE)
byte[] pdf(@PathVariable UUID id) { return pdfRenderer.render(view(id)); }
```

Separate queries/models can be correct when format needs, authorization or data volumes
vary. Share authoritative calculations, and define whether independently requested outputs
must refer to the same version/snapshot. Reusing a Java type does not give snapshot consistency.

## Choosing between them

| Condition                                        | Pattern                                                        |
| ------------------------------------------------ | -------------------------------------------------------------- |
| HTML for a browser                               | Template View or an adequate explicit transform                |
| JSON/XML for a program                           | Deliberate mapping/serialization; transform analogy            |
| Several formats from the same data               | Shared model when semantics match; separate shapes when needed |
| Output structure changes frequently by designers | Template View may suit the team's editing tools                |
| Output must be diffable and reviewable           | Either; test the rendered contract                             |
| Output is assembled conditionally from parts     | Either; keep domain policy outside rendering                   |

## Presentation model construction

When projection materialization needs a transaction, construct the model within its actual
scope. This partial example assumes an effective transaction interceptor and projection
implementation; `readOnly` is not an authorization or universal write-prevention boundary:

```java
@Transactional(readOnly = true)
public Optional<OrderDetailView> detail(OrderId id) {
    return orderProjections.detail(id.value())        // verify fetch plan and query budget
        .map(row -> new OrderDetailView(
            row.id(),
            statusLabel(row.status()),                 // presentation decision
            money(row.totalAmount(), row.currency()),
            lineViews(row.lines()),
            row.cancellationReason()));
}
```

Verify that `row.lines()` is materialized, all required fields are detached, and the actual
projection meets the query/row/byte budget. Neither a projection return type nor this
annotation proves one query or a consistent snapshot (`repository-pattern`).

Sources: [Fowler Transform View](https://martinfowler.com/eaaCatalog/transformView.html),
[Thymeleaf 3.1 text, layouts, lazy values and inlining](https://www.thymeleaf.org/doc/tutorials/3.1/usingthymeleaf.html),
[Thymeleaf 3.1.2 lazy-value implementation](https://github.com/thymeleaf/thymeleaf/blob/thymeleaf-3.1.2.RELEASE/lib/thymeleaf/src/main/java/org/thymeleaf/context/LazyContextVariable.java),
[Spring 6.1.14 expression property access](https://github.com/spring-projects/spring-framework/blob/v6.1.14/spring-expression/src/main/java/org/springframework/expression/spel/ast/PropertyOrFieldReference.java),
[OWASP context encoding and HTML sanitization](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html),
[Spring 6.1.14 Open EntityManager in View](https://docs.spring.io/spring-framework/docs/6.1.14/javadoc-api/org/springframework/orm/jpa/support/OpenEntityManagerInViewFilter.html).
