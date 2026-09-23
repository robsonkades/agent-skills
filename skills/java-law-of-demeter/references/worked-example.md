# Worked example: three chains, three outcomes

An orders module. `Order` has a `Customer`; `Customer` has a `Membership` and a
`ContactDetails`. Three call sites navigate the graph; each wants a different fix.

These are illustrative partial Java 17 snippets. Imports, enclosing service classes and
domain collaborators are omitted; `Tier` has `GOLD`, `SILVER` and `NONE`. Validate actual
contracts before applying the moves, including nullable data and caller-visible failures.

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

**Analysis.** The caller navigates to `Membership` and then decides from membership data. Two
services now encode the tier table; a future SILVER threshold change could drift between them.
The move below preserves the shown table rather than introducing a new threshold. It is correct only
if membership owns this rate table as part of its contract:

```java
public record Membership(Tier tier, int points) {
    public BigDecimal discountRate() {
        if (tier == null) return BigDecimal.ZERO; // preserves the original == checks' fallback
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

If null tiers should instead be rejected, introduce and test that contract change separately.
A null `Membership` still fails at the old dereference; the guard does not invent a missing-member
default. The [Java 17 switch rules](https://docs.oracle.com/javase/specs/jls/se17/html/jls-14.html#jls-14.11)
explain why switching on a null enum without this guard would change behavior.

Call site: `order.customer().discountRate()`. The strict formal rule still sees a call on an
object returned by another call; pragmatically this is acceptable only if `Customer` is a stable
published collaborator of `Order`. If customer is an aggregate-internal part, ask the root for
the owned concept instead. Either way the caller no longer branches on membership internals, and
`Membership`'s shape can change without reaching it.

**The judgement call.** `Customer.discountRate()` is delegation, and delegation added
mechanically is the Middle Man smell. It is justified here because "a customer's discount
rate" is a concept `Customer` genuinely owns — callers ask the customer, and whether the
answer comes from a membership, a promotion or a contract is `Customer`'s private business.
A `Customer.membershipPoints()` forwarder that merely exposes private representation would be
structure with a longer name; its name alone does not settle whether it is a supported owned query.
**Trade-off:** the rate table is now harder to see from the checkout code; the test
for it moves from a service test to a `Membership` test, which is where it becomes cheap.

If pricing owns the table and membership is only input, moving it into `Membership` would create
Feature Envy in reverse and couple customer data to pricing releases. In that model use one
`DiscountPolicy.rateFor(MembershipSnapshot)` and let an orchestration boundary obtain the
snapshot. "Put behavior with data" never outranks authority and change ownership.

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
When the sender's contract needs only these values, narrow what is passed:

```java
public void send(EmailAddress to, String recipientName,
                 List<OrderLine> lines, Money total) {
    mailer.deliver(to, receiptBody(recipientName, lines, total));
}
```

Changing the public `send(Order)` signature is a separate compatibility decision. Retain a
delegating entry point while supported callers require it, preserving validation/failure timing
and the existing snapshot protocol, or use an explicitly authorized migration. The four-argument
form alone does not establish source, binary or behavioral compatibility.

The caller — which already holds the `Order` legitimately — performs the navigation once
and obtains a consistent set of values using the owning aggregate's snapshot/locking or
transaction protocol, then hands them over. A mere sequence of getters proves no consistency.
The narrowed sending code no longer navigates `Order`, `Customer` or `ContactDetails`;
a retained compatibility entry point still depends on `Order`. Restructuring `ContactDetails`
now touches the assembly point instead of every consumer. **Trade-off:** the parameter list grew from one to four; if it keeps
growing, group them into an immutable purpose-specific `ReceiptData` snapshot and defensively
copy lines. If `OrderLine` is mutable, copying the list still shares the line objects: project
the required line values into immutable receipt values under the same capture protocol. Already
immutable elements may be shared. A [record is only shallowly immutable](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/Record.html),
and [List.copyOf](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/List.html#unmodifiable)
does not freeze its elements and rejects null elements; preserve the existing null contract
when choosing the copy strategy. Neither mechanism makes several reads atomic. Four values read
at different times from mutable/ORM state can be less correct than one container, so narrowing
must preserve observation consistency.

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
  or directly navigating `Membership`; inspect resolved calls/compiled dependencies, not just
  imports. `var` can still carry a forbidden intermediate type without an import.
- The two callers use the same owned membership policy. Searches for `"0.05"` / `SILVER`
  find candidates, not proof of duplication; inspect meaning and authority before merging a
  separate policy or removing required checks.
- In a temporary branch/fixture, change the published shape used by the assembly point
  (renaming only a private field proves little). Keep `ReceiptSender.send`'s contract stable;
  its code and tests should remain unchanged. Identify expected mapper/assembly edits explicitly.
- For a receipt snapshot, mutate the original list and a mutable line after capture; receipt
  values should remain unchanged. Check the established null contract too. This checks isolation
  after capture, not whether concurrent reads during capture formed one consistent observation;
  verify the owner's capture protocol separately.
- Tests: `Membership.discountRate()` covered directly, including the GOLD-under-threshold
  and exact-threshold cases, SILVER, NONE and null tier. Retain service tests proving both
  callers obtain the owned rate; a unit test of the moved method does not prove caller wiring.
