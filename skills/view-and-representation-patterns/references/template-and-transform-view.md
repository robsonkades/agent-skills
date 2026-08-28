# Template View and Transform View

## Template View, and its one weakness

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
<!-- Bad: the template decides. Untestable, uncompiled, invisible to review. -->
<td th:text="${line.quantity * line.unitPrice * (customer.tier == 'PREMIUM' ? 0.9 : 1.0)}"></td>
<p th:if="${order.total > 1000 and customer.country != 'BR' and order.status != 'DRAFT'}">…</p>
```

The second version contains a pricing rule and an eligibility rule. Neither is unit tested,
neither is found by a search for "discount" in the Java sources, and both will diverge from
the same rules elsewhere.

**The discipline:** everything the template needs is already decided.

```java
public record OrderView(
        String reference,
        String formattedTotal,          // already formatted, with currency
        List<LineView> lines,
        boolean showsDiscountNotice,    // already decided
        boolean canBeCancelled) {       // already authorised
}
```

A template may loop, may check for null or empty, and may choose between two labels. It may
not compute, compare domain values, or reach through an object graph.

## Rendering must not query

```html
<!-- order is a JPA entity; lines is lazy. One query per render, plus N for the lines. -->
<tr th:each="line : ${order.lines}"></tr>
```

If this works at all, it is because the persistence context is still open during rendering
(Open Session In View), which means the transaction spans serialisation and a connection is
held for the whole request (`architecture-and-performance`). If it is off, it fails with a
lazy initialisation error.

Either way the fix is the same: build the view model inside the application layer, from a
projection, and hand the template data with no behaviour
(`query-objects-and-specifications`).

## Escaping is a security boundary

Template engines escape by default. The failures come from turning it off:

```html
<div th:utext="${userSuppliedHtml}">
  <!-- unescaped: XSS unless sanitised first -->
</div>
```

- Use unescaped output only for content that has been sanitised by an allowlist sanitiser,
  and do the sanitising when the content is **stored**, not when it is rendered.
- Never build a URL or a script literal by string concatenation in a template; the escaping
  rules differ per context (HTML body, attribute, URL, JavaScript) and an HTML escape is
  wrong in the other three.
- JSON embedded into a page needs JavaScript-context escaping, not HTML escaping.

## Transform View

Code produces the output. In practice: a presentation type plus a serialiser.

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

The structure is in code: refactorable, compile-checked, and testable without rendering. It
is less immediately visible than a template — you cannot see the output's shape at a glance
— which is why an explicit snapshot test of the serialised form is worth having:

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

The last assertion is the valuable one: it fails when someone adds a field to the view type
that should not be public (`rpc-and-api-contracts`).

## One model, several formats

The reason to prefer Transform View when output must vary:

```java
// One presentation model, built once, in the application layer.
OrderDetailView view = orderQueries.detail(id).orElseThrow();

// Three transforms.
@GetMapping(value = "/orders/{id}", produces = APPLICATION_JSON_VALUE)
OrderDetailView json(@PathVariable UUID id) { return view(id); }

@GetMapping(value = "/orders/{id}", produces = "text/csv")
void csv(@PathVariable UUID id, HttpServletResponse response) { csvWriter.write(view(id), response); }

@GetMapping(value = "/orders/{id}", produces = APPLICATION_PDF_VALUE)
byte[] pdf(@PathVariable UUID id) { return pdfRenderer.render(view(id)); }
```

The failure to avoid is a separate query and a separate model per format, which diverge:
the PDF shows a total the JSON does not, because two pieces of code computed it.

## Choosing between them

| Condition                                        | Pattern                                        |
| ------------------------------------------------ | ---------------------------------------------- |
| HTML for a browser                               | Template View                                  |
| JSON/XML for a program                           | Transform View                                 |
| Several formats from the same data               | Transform View over one model                  |
| Output structure changes frequently by designers | Template View — a designer can edit a template |
| Output must be diffable and reviewable           | Template View — the shape is in one file       |
| Output is assembled conditionally from parts     | Transform View — conditionals belong in code   |

## Presentation model construction

The presentation model is built in the application layer, from a projection, inside the
transaction:

```java
@Transactional(readOnly = true)
public Optional<OrderDetailView> detail(OrderId id) {
    return orderProjections.detail(id.value())        // one query, flat rows
        .map(row -> new OrderDetailView(
            row.id(),
            statusLabel(row.status()),                 // presentation decision
            money(row.totalAmount(), row.currency()),
            lineViews(row.lines()),
            row.cancellationReason()));
}
```

Nothing lazy escapes, nothing managed escapes, the shape is explicit, and the query count is
one. This is the pattern that removes most of the failure modes above at the same time
(`repository-pattern`).
