# Worked examples

These are illustrative scenarios, not reported production incidents. Java blocks are partial
snippets: imports from `java.math`, `java.time` and `java.util`, enclosing class for the old
static method, and domain fixtures are omitted. Records use Java 16+; validate with the
project's target (Java 17 is sufficient here), without preview or extra dependencies.

## Example 1: inline the wrong abstraction

**Before.** One helper serves both dunning reminders and shipment confirmations. It began
as two near-identical methods, merged "to remove duplication"; every requirement since has
added a flag.

```java
static String buildEmail(Customer customer, List<OrderLine> lines, BigDecimal amount,
        LocalDate date, boolean reminder, boolean includeLines, boolean finalNotice) {
    var sb = new StringBuilder();
    sb.append("Dear ").append(customer.name()).append(",\n");
    if (reminder) {
        sb.append(finalNotice ? "FINAL NOTICE: " : "Reminder: ")
                .append("payment of ").append(amount).append(" was due ").append(date).append(".\n");
    } else {
        sb.append("Your order ships on ").append(date).append(".\n");
    }
    if (includeLines) {
        for (var line : lines) {
            sb.append(line.quantity()).append(" x ").append(line.description()).append('\n');
        }
    }
    return sb.toString();
}
```

**Analysis.** The body policies fail the knowledge test. Dunning content is owned by the
finance team and changes with collection policy; shipment content changes with logistics.
`date` means "due date" for one caller and "ship date" for the other — one parameter,
two meanings. Callers select behaviour through three booleans, so `finalNotice` is
meaningful for one caller and a trap for the other (`buildEmail(c, lines, amount, date,
false, true, true)` compiles and quietly ignores the last flag). What the copies actually
shared was shape — "build a greeting, a body, maybe a list". That alone is not a shared
rule; separately check whether, for example, one brand authority owns the salutation.

**After.** Assume caller inspection proves reminders use `includeLines=false` and shipment
confirmations use `includeLines=true`. The split below preserves those paths, including the
caller's existing final-notice decision. If reminders also contain lines or shipments omit
them, preserve those real cases explicitly before deleting the helper. The input types make
the email kind explicit; they do not enforce nullability or every domain invariant.

```java
record OverdueInvoice(Customer customer, BigDecimal amountDue, LocalDate dueDate, boolean finalNotice) {}

final class DunningEmails {
    static String reminder(OverdueInvoice invoice) {
        var tone = invoice.finalNotice() ? "FINAL NOTICE: " : "Reminder: ";
        return "Dear " + invoice.customer().name() + ",\n"
                + tone + "payment of " + invoice.amountDue()
                + " was due " + invoice.dueDate() + ".\n";
    }
}

final class ShipmentEmails {
    static String confirmation(Shipment shipment) {
        var sb = new StringBuilder("Dear " + shipment.customer().name() + ",\n");
        sb.append("Your order ships on ").append(shipment.shipDate()).append(".\n");
        for (var line : shipment.lines()) {
            sb.append(line.quantity()).append(" x ").append(line.description()).append('\n');
        }
        return sb.toString();
    }
}
```

**Trade-offs.** The salutation line now exists twice and total line count grew. Accept this
when the greeting is incidental and the body policies change independently. If a confirmed
brand rule must change both greetings together, share that small nucleus without recombining
the bodies. Each method remains readable without simulating caller-identity flags.

**Verification.** Compare exact output for regular/final reminders and empty/non-empty
shipment lines against the mapped old calls, including newline layout. No call site chooses
the email kind with a flag; `finalNotice` remains a legitimate dunning input. A new reminder
tier should affect dunning only, but that change must be tested before claiming isolation.

## Example 2: merge knowledge duplication

**Before.** `InvoiceService` and `RefundService` each compute VAT inline:

```java
// InvoiceService
line.amount().multiply(VAT_RATE).setScale(2, RoundingMode.HALF_UP);
// RefundService — same rule, re-implemented
refunded.multiply(new BigDecimal("0.19")).setScale(2, RoundingMode.HALF_UP);
```

Assume a confirmed defect: these particular invoice/refund calculations were required to use
the same rule version, but only one copy was updated. Do not infer that every refund should
use today's rate: it may need the rate/rule recorded on the original transaction.

**Analysis.** For this fictional exercise only, the agreed rule is per-line multiplication
rounded half-up to two decimal places. It is not a statement of any jurisdiction's tax law.
The authority and computation are shared, while selecting the applicable rule version/date
remains a caller responsibility. If that authority is confirmed, extracting this nucleus
can prevent drift without waiting for a third copy.

**After.**

```java
final class VatPolicy {
    private final BigDecimal rate;

    VatPolicy(BigDecimal rate) { this.rate = rate; }

    /** Illustrative agreed policy: per-line multiplication, half-up to 2 dp. */
    BigDecimal vatOf(BigDecimal netLineAmount) {
        return netLineAmount.multiply(rate).setScale(2, RoundingMode.HALF_UP);
    }
}
```

Both services take the appropriate `VatPolicy`; the illustrative `"0.19"` comes from
authoritative rate data. Historical versions may coexist. Real implementation additionally
needs agreed currency/scale, valid input and refund allocation rules; these are not inferred here.

**Trade-offs.** Both services are now coupled to `VatPolicy`: a change there must be
assessed against both. Accepted — the confirmed authority already couples the computation.
Note what was _not_ merged: the services' loops over lines stayed separate, because "loop
and sum" is shape, not knowledge.

**Verification.** Check a regular value (`10.05 × 0.19 → 1.91`) and a true tie
(`1.50 × 0.19 → 0.29`, whereas HALF_EVEN yields `0.28`). If signed amounts are supported,
also test the negative tie (`-0.29`). Consumer tests must prove the invoice/refund choose
the required current or historical policy; a policy unit test cannot prove that wiring.
Search for remaining implementations as a coverage aid, not proof of semantic equivalence.
The arithmetic follows [BigDecimal](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/math/BigDecimal.html)
and [RoundingMode](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/math/RoundingMode.html)
contracts; tax-policy selection requires project evidence.
