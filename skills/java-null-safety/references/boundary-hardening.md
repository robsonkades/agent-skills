# Worked example: hardening a service boundary

An invoicing service accepts invoices over HTTP, stores them, and computes totals.
Production sees intermittent NPEs in `TotalsService`, three calls away from any input.

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
   Deserialisers populate whatever arrived; annotations would not have stopped this.
2. **Absence null, doubled.** `linesFor` returns null both for "unknown invoice" and for
   "invoice with a null lines field" — the caller cannot distinguish them and forgot to
   check either.
3. **Leaked nullable element.** `line.amount()` came from the wire unvalidated and is
   dereferenced in arithmetic far from the boundary.

The defect is not the missing `!= null` in `TotalsService` — adding it there would be a
fourth scattered check. The defect is that no boundary converts wire-shaped data into
contract-carrying data.

## After

One conversion at the adapter; `@NullMarked` domain types enforce their own contract:

```java
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
static <T> T required(@Nullable T value, String field) {
    if (value == null) throw new InvalidInvoicePayload(field, "required");
    return value;
}

static Invoice fromDto(InvoiceDto dto) {          // the only place wire-null exists
    if (dto == null) throw new InvalidInvoicePayload("body", "required");
    String id = required(dto.id(), "id");
    String customerId = required(dto.customerId(), "customerId");
    Instant issuedAt = required(dto.issuedAt(), "issuedAt");
    List<InvoiceLineDto> rawLines = required(dto.lines(), "lines");
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

## Trade-offs

- Invalid payloads now fail loudly at ingestion with a 4xx-shaped error instead of
  storing garbage — a behaviour change that must be flagged, not smuggled in. Clients
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

- Tests feeding a DTO with each required field null: rejected at `fromDto` with a message
  naming the payload problem — not an NPE from deeper in.
- A test for the unknown-invoice path asserting `Optional.empty`, distinct from an invoice whose
  line list is empty and total is zero.
- NullAway (or the IDE checker) over the `@NullMarked` domain package: zero findings;
  the DTO package deliberately stays unmarked — it is the one place null is legal.
- The production NPE's stack trace path re-run as a test: green.

## Authoritative references

- [Objects.requireNonNull API, Java SE 25](<https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Objects.html#requireNonNull(T,java.lang.String)>)
- [Optional API, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/Optional.html)
