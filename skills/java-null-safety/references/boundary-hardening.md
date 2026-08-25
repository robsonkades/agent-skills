# Worked example: hardening a service boundary

An invoicing service accepts invoices over HTTP, stores them, and computes totals.
Production sees intermittent NPEs in `TotalsService`, three calls away from any input.

## Before

```java
public record InvoiceDto(String id, String customerId,
                         List<InvoiceLine> lines, Instant issuedAt) {}

public class InvoiceService {
    public void register(InvoiceDto dto) {
        store.put(dto.id(), dto);                    // dto.id() may be null
    }
    public List<InvoiceLine> linesFor(String invoiceId) {
        InvoiceDto invoice = store.get(invoiceId);
        return invoice != null ? invoice.lines() : null;   // null for two reasons
    }
}

public class TotalsService {
    public BigDecimal total(String invoiceId) {
        BigDecimal sum = BigDecimal.ZERO;
        for (InvoiceLine line : invoiceService.linesFor(invoiceId)) {  // NPE here
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
public record Invoice(String id, String customerId,
                      List<InvoiceLine> lines, Instant issuedAt) {
    public Invoice {
        Objects.requireNonNull(id, "id");
        Objects.requireNonNull(customerId, "customerId");
        Objects.requireNonNull(issuedAt, "issuedAt");
        lines = List.copyOf(lines);       // rejects null list and null elements
    }
}

static Invoice fromDto(InvoiceDto dto) {          // the only place wire-null exists
    if (dto.id() == null || dto.customerId() == null || dto.issuedAt() == null) {
        throw new IllegalArgumentException("invoice payload missing required fields");
    }
    return new Invoice(dto.id(), dto.customerId(),
            dto.lines() == null ? List.of() : dto.lines(), dto.issuedAt());
}

public List<InvoiceLine> linesFor(String invoiceId) {
    Invoice invoice = store.get(invoiceId);
    return invoice == null ? List.of() : invoice.lines();   // empty, never null
}
```

`TotalsService` is now correct **unchanged**: it iterates a list that exists and adds
amounts that exist. The nulls did not get handled better; they stopped existing past the
adapter. An unknown invoice now totals to zero — if "unknown" must be distinguishable
from "empty", that is an absence the API should state, with an Optional return or a
domain exception (the choice is java-optional's territory).

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
- A test for the unknown-invoice path asserting an empty total, pinning the chosen
  semantics.
- NullAway (or the IDE checker) over the `@NullMarked` domain package: zero findings;
  the DTO package deliberately stays unmarked — it is the one place null is legal.
- The production NPE's stack trace path re-run as a test: green.
