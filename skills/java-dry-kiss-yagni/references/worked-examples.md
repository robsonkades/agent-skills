# Worked examples

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

**Analysis.** The knowledge test fails on every question. Dunning content is owned by the
finance team and changes with collection policy; shipment content changes with logistics.
`date` means "due date" for one caller and "delivery date" for the other — one parameter,
two meanings. Callers select behaviour through three booleans, so `finalNotice` is
meaningful for one caller and a trap for the other (`buildEmail(c, lines, amount, date,
false, true, true)` compiles and quietly ignores the last flag). What the copies actually
shared was shape — "build a greeting, a body, maybe a list" — not a rule.

**After.** One function per piece of knowledge; only the genuinely shared mechanics
(postal address formatting, owned by no business rule but by the postal format) stay
shared. Parameters become types that make wrong calls unrepresentable:

```java
record OverdueInvoice(Customer customer, BigDecimal amountDue, LocalDate dueDate, int reminderCount) {}

final class DunningEmails {
    static String reminder(OverdueInvoice invoice) {
        var tone = invoice.reminderCount() >= 3 ? "FINAL NOTICE: " : "Reminder: ";
        return "Dear " + invoice.customer().name() + ",\n"
                + tone + "payment of " + invoice.amountDue()
                + " was due " + invoice.dueDate() + ".\n"
                + PostalFormat.formatAddress(invoice.customer().address());
    }
}

final class ShipmentEmails {
    static String confirmation(Shipment shipment) {
        var sb = new StringBuilder("Dear " + shipment.customer().name() + ",\n");
        sb.append("Your order ships on ").append(shipment.expectedDelivery()).append(".\n");
        for (var line : shipment.lines()) {
            sb.append(line.quantity()).append(" x ").append(line.description()).append('\n');
        }
        return sb.append(PostalFormat.formatAddress(shipment.customer().address())).toString();
    }
}
```

**Trade-offs.** The salutation line now exists twice; a tone-of-voice change touches both
files. Total line count grew. Accepted: the two emails have never changed for the same
reason, and each method is now readable without simulating flag combinations.

**Verification.** No call site passes a boolean. Each method's tests describe one email
kind with no mention of the other. The next dunning requirement (a fourth reminder tier)
touched one file.

## Example 2: merge knowledge duplication

**Before.** `InvoiceService` and `RefundService` each compute VAT inline:

```java
// InvoiceService
line.amount().multiply(VAT_RATE).setScale(2, RoundingMode.HALF_UP);
// RefundService — same rule, re-implemented
refunded.multiply(new BigDecimal("0.19")).setScale(2, RoundingMode.HALF_UP);
```

A rate change was applied to `InvoiceService` and missed in `RefundService`; refunds
over-refunded for a week.

**Analysis.** The knowledge test passes: the rule is "VAT is computed per line, rounded
half-up to two decimal places, at the jurisdiction's rate" — a legal fact with one
authority, so every plausible change (rate, rounding regime, scale) must hit both copies
on the same day. This is also a monetary rule, so the rule of three does not apply: merge
at the second occurrence.

**After.**

```java
final class VatPolicy {
    private final BigDecimal rate;

    VatPolicy(BigDecimal rate) { this.rate = rate; }

    /** VAT per line, rounded half-up to 2 dp — the legal rule, stated once. */
    BigDecimal vatOf(BigDecimal netLineAmount) {
        return netLineAmount.multiply(rate).setScale(2, RoundingMode.HALF_UP);
    }
}
```

Both services take a `VatPolicy`; the literal `"0.19"` appears once, in configuration.

**Trade-offs.** Both services are now coupled to `VatPolicy`: a change there must be
assessed against both. Accepted — the law already couples them; the code now says so.
Note what was _not_ merged: the services' loops over lines stayed separate, because "loop
and sum" is shape, not knowledge.

**Verification.** One test pins the rounding behaviour (`10.05 × 0.19 → 1.91`) against
`VatPolicy` alone. A repository-wide search for `setScale(2, RoundingMode.HALF_UP)` next
to a VAT rate finds only the policy class.
