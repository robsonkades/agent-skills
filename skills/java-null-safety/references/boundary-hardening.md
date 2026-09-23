# Worked example: hardening a service boundary

An invoicing service accepts invoices over HTTP, stores them, and computes totals.
Production sees intermittent NPEs in `TotalsService`, three calls away from any input.

These are partial Java 16+ sketches with omitted imports (`java.math`, `java.time`,
`java.util`, `IntStream`, JSpecify annotations), enclosing adapter/service declarations and
store wiring. Each public type belongs in its own file. The before sketch assumes a map
that accepts null keys; other stores may reject earlier. Domain constructors provide runtime
checks; annotations describe the static contract, not enforcement by themselves.

## Before

```java
public record InvoiceLineDto(String sku, BigDecimal amount) {}
public record InvoiceDto(String id, String customerId,
                         List<InvoiceLineDto> lines, Instant issuedAt) {}

public class InvoiceService {
    public void register(InvoiceDto dto) {
        store.put(dto.id(), dto);                    // dto.id() may be null
    }
    public List<InvoiceLineDto> linesFor(String invoiceId) {
        InvoiceDto invoice = store.get(invoiceId);
        return invoice != null ? invoice.lines() : null;   // null for two reasons
    }
}

public class TotalsService {
    public BigDecimal total(String invoiceId) {
        BigDecimal sum = BigDecimal.ZERO;
        for (InvoiceLineDto line : invoiceService.linesFor(invoiceId)) {  // NPE here
            sum = sum.add(line.amount());            // line.amount() may also be null
        }
        return sum;
    }
}
```

## Analysis

Three distinct nulls are conflated, and none has a stated meaning:

1. **Error null.** `dto.id()` null means the payload was invalid — but it is accepted,
   stored under a null key, and the failure surfaces later as a lookup miss or an NPE.
   The assumed binder/store path permits this; actual missing/null handling depends on mapper
   configuration. JSpecify annotations alone would not have stopped it.
2. **Absence null, doubled.** `linesFor` returns null both for "unknown invoice" and for
   "invoice with a null lines field" — the caller cannot distinguish them and forgot to
   check either.
3. **Leaked nullable element.** `line.amount()` came from the wire unvalidated and is
   dereferenced in arithmetic far from the boundary.

The defect is not the missing `!= null` in `TotalsService` — adding it there would be a
fourth scattered check. The defect is that no boundary converts wire-shaped data into
contract-carrying data.

## After

Model the raw DTOs explicitly, then convert at the adapter. Domain constructors enforce their
own runtime contract:

```java
@NullMarked
public record InvoiceLineDto(@Nullable String sku, @Nullable BigDecimal amount) {}

@NullMarked
public record InvoiceDto(@Nullable String id, @Nullable String customerId,
                         @Nullable List<@Nullable InvoiceLineDto> lines,
                         @Nullable Instant issuedAt) {}

@NullMarked
public record InvoiceLine(String sku, BigDecimal amount) {
    public InvoiceLine {
        Objects.requireNonNull(sku, "sku");
        Objects.requireNonNull(amount, "amount");
    }
}

@NullMarked
public record Invoice(String id, String customerId,
                      List<InvoiceLine> lines, Instant issuedAt) {
    public Invoice {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(customerId, "customerId");
        Objects.requireNonNull(issuedAt, "issuedAt");
        lines = List.copyOf(lines);       // rejects null list and null elements
    }
}

final class InvalidInvoicePayload extends IllegalArgumentException {
    private final String field;
    private final String code;

    InvalidInvoicePayload(String field, String code) {
        super(field + ": " + code);
        this.field = field;
        this.code = code;
    }

    String field() { return field; }
    String code() { return code; }
}

// The following mapper methods live in the inbound adapter.
@NullMarked
static <T> T required(@Nullable T value, String field) {
    if (value == null) throw new InvalidInvoicePayload(field, "required");
    return value;
}

@NullMarked
static Invoice fromDto(@Nullable InvoiceDto dto) { // nullable body is rejected explicitly
    if (dto == null) throw new InvalidInvoicePayload("body", "required");
    String id = required(dto.id(), "id");
    String customerId = required(dto.customerId(), "customerId");
    Instant issuedAt = required(dto.issuedAt(), "issuedAt");
    List<@Nullable InvoiceLineDto> rawLines = required(dto.lines(), "lines");
    List<InvoiceLine> lines = IntStream.range(0, rawLines.size())
        .mapToObj(i -> {
            InvoiceLineDto line = required(rawLines.get(i), "lines[" + i + "]");
            return new InvoiceLine(
                required(line.sku(), "lines[" + i + "].sku"),
                required(line.amount(), "lines[" + i + "].amount"));
        })
        .toList();
    return new Invoice(id, customerId, lines, issuedAt);
}

public Optional<Invoice> findInvoice(String invoiceId) {
    return Optional.ofNullable(store.get(Objects.requireNonNull(invoiceId, "invoiceId")));
}
```

`InvalidInvoicePayload` and `required` are boundary helpers that expose stable field/code data and
do not echo sensitive values. `TotalsService.total(Invoice)` now receives a proven domain object;
its caller handles `findInvoice` absence explicitly. An existing invoice with no lines legitimately
totals zero, while an unknown invoice does not silently become one. Optional mechanics belong to
java-optional.

`required(dto.lines(), "lines")` establishes that the list reference is non-null; it does not
validate its elements. Keep `rawLines` as `List<@Nullable InvoiceLineDto>` until each element
passes its own `required` check. The mapper methods are null-marked here; an enclosing
null-marked adapter is another option. Leaving DTOs unmarked instead creates an
unspecified/unchecked boundary. Test the actual
mapper's missing-field/null behavior and map `InvalidInvoicePayload` to the intended HTTP
response; a Java exception alone does not establish a 4xx response. A non-null `Invoice`
reference is still a separate precondition of the downstream total method.

## Trade-offs

- Invalid payloads now fail at ingestion with a stable field/code exception; an exercised HTTP
  exception mapping is still needed to establish a 4xx response. Rejection instead of storing
  invalid data is a behaviour change that must be flagged, not smuggled in. Clients
  that depended on lenient acceptance will notice.
- A DTO-to-domain conversion layer is real code: one more type per aggregate, one mapping
  function, kept in sync. For a two-endpoint service this can be ceremony; the trade pays
  off when multiple call paths consume the same data, which is exactly when scattered
  checks fail.
- `requireNonNull` inside the record re-checks what `fromDto` established. Constructors
  keep their checks anyway — the record is also constructible without the adapter, and
  its contract must not depend on one caller's diligence. This is the one place
  double-checking is by design.

## Verification

Acceptance checks to execute in the target build; no checker or HTTP result is implied by these sketches:

- Tests feeding a DTO with each required field null: rejected at `fromDto` with a message
  naming the payload problem — not an NPE from deeper in.
- A test for the unknown-invoice path asserting `Optional.empty`, distinct from an invoice whose
  line list is empty and total is zero.
- Run the configured checker over the marked domain and adapter, with compile fixtures for
  null DTO fields, null line elements and invalid overrides. Include a negative fixture that
  assigns the validated list reference to `List<InvoiceLineDto>` before validating its elements;
  checking the outer reference must not erase nested nullability. Record warnings and unchecked
  scopes; do not report success merely because the domain is marked or DTOs are unmarked.
- Re-run the production NPE path as a regression; assert stable field/code and no store write
  for invalid input, plus direct constructor rejection when the adapter is bypassed.

## Authoritative references

- [Objects.requireNonNull API, Java SE 25](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Objects.html#requireNonNull(T,java.lang.String)>)
- [Optional API, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Optional.html)
- [JSpecify generic element and container nullness](https://jspecify.dev/docs/user-guide/#generics)
- [List.copyOf null rejection, Java SE 25](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/List.html#copyOf(java.util.Collection)>)
