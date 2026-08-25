# Worked example: three chains, three outcomes

An orders module. `Order` has a `Customer`; `Customer` has a `Membership` and a
`ContactDetails`. Three call sites navigate the graph; each wants a different fix.

## Chain 1 — fixed by moving the behaviour

```java
// CheckoutService — and near-duplicated in QuoteService
Membership m = order.customer().membership();
BigDecimal rate = BigDecimal.ZERO;
if (m.tier() == Tier.GOLD && m.points() >= 1_000) {
    rate = new BigDecimal("0.10");
} else if (m.tier() == Tier.SILVER) {
    rate = new BigDecimal("0.05");
}
```

**Analysis.** The caller navigates to `Membership` and then decides _using only membership
data_. Two services now encode the tier table; when the SILVER rule gained a points
threshold, only one of them was updated. The chain is a symptom; the displaced decision is
the disease (java-tell-dont-ask). Both go away by moving the rule to its data:

```java
public record Membership(Tier tier, int points) {
    public BigDecimal discountRate() {
        return switch (tier) {
            case GOLD -> points >= 1_000 ? new BigDecimal("0.10") : BigDecimal.ZERO;
            case SILVER -> new BigDecimal("0.05");
            case NONE -> BigDecimal.ZERO;
        };
    }
}

public final class Customer {
    private final Membership membership;
    // ...
    public BigDecimal discountRate() { return membership.discountRate(); }
}
```

Call site: `order.customer().discountRate()`. One navigation remains — to the customer,
the collaborator `Order` legitimately hands out — but the caller no longer branches on
membership internals, and `Membership`'s shape can change without reaching it.

**The judgement call.** `Customer.discountRate()` is delegation, and delegation added
mechanically is the Middle Man smell. It is justified here because "a customer's discount
rate" is a concept `Customer` genuinely owns — callers ask the customer, and whether the
answer comes from a membership, a promotion or a contract is `Customer`'s private business.
A `Customer.membershipPoints()` forwarder, by contrast, would be structure with a longer
name. **Trade-off:** the rate table is now harder to see from the checkout code; the test
for it moves from a service test to a `Membership` test, which is where it becomes cheap.

## Chain 2 — fixed by narrowing what is passed

```java
public void send(Order order) {
    var email = order.customer().contact().email();
    var name  = order.customer().contact().displayName();
    mailer.deliver(email, receiptBody(name, order.lines(), order.total()));
}
```

**Analysis.** `ReceiptSender` decides nothing on the navigated data — it only reads two
values. Moving behaviour would mean teaching `Customer` about receipts; wrong direction.
The fix is to stop passing the container:

```java
public void send(EmailAddress to, String recipientName,
                 List<OrderLine> lines, Money total) {
    mailer.deliver(to, receiptBody(recipientName, lines, total));
}
```

The caller — which already holds the `Order` legitimately — performs the navigation once
and hands over values. `ReceiptSender` no longer imports `Order`, `Customer` or
`ContactDetails`, and restructuring `ContactDetails` now touches one assembly point instead
of every consumer. **Trade-off:** the parameter list grew from one to four; if it keeps
growing, group the values into a small record (`ReceiptRecipient`) — a parameter object,
not a wrapper around `Order`.

## Chain 3 — correctly left alone

```java
public OrderSummaryDto toSummary(Order order) {
    return new OrderSummaryDto(
        order.id().value(),
        order.customer().contact().displayName(),
        order.customer().membership().tier().name(),
        order.total().amount(),
        order.total().currency().getCurrencyCode());
}
```

**Analysis.** A mapper at the API boundary. Its entire purpose is projecting one structure
into another; the navigation _is_ the specification. "Fixing" it would either move
DTO-shaping into the domain types (the domain now knows its own presentations) or add a
forwarding method per DTO field (a Middle Man layer as wide as the DTO). When the domain
shape changes, this file is supposed to break — it is the one place absorbing the change on
behalf of the API contract. Leave it.

## Verification

- `ReceiptSender` and the discount call sites compile without importing `ContactDetails`
  or `Membership`; check the imports, not just the call sites.
- The tier table exists exactly once (search for `"0.05"` / `SILVER` comparisons outside
  `Membership`).
- Rename a field on `ContactDetails`: only `Customer`, the mapper and the one assembly
  point should need edits. If a service breaks, a chain survived.
- Tests: `Membership.discountRate()` covered directly, including the GOLD-under-threshold
  case both services used to disagree on.
