# Worked refactoring: a refund processor with three masters

## Before

```java
public final class RefundProcessor {

    private final GatewayClient gateway;
    private final MailClient mail;

    public RefundProcessor(GatewayClient gateway, MailClient mail) {
        this.gateway = gateway;
        this.mail = mail;
    }

    public boolean refund(Payment payment, BigDecimal amount, int daysSincePurchase) {
        if (daysSincePurchase > 90) return false;
        if (amount.compareTo(payment.amount()) > 0) return false;
        if (payment.method().equals("CARD") && daysSincePurchase > 30) return false;

        GatewayResult result = gateway.refund(payment.gatewayRef(), amount);
        if (!result.ok()) throw new RefundFailedException(result.errorCode());

        mail.send(payment.customerEmail(),
                "Refund of " + amount + " for order " + payment.orderId() + " approved");
        return true;
    }
}
```

## Analysis — evidence first

The history, not the line count, makes the case. `git log --follow` on this class
over eight months: eligibility rules edited in 7 commits by the payments team, the
email copy edited in 4 commits by CX, gateway error handling edited in 3 commits by
platform. Three independent change streams, three requesters — three reasons to
change in one class. Each CX copy tweak forced re-review and redeploy of refund
policy.

A second, separate defect: the return type. `false` means "not eligible" with the
reason discarded, while gateway failure becomes an exception — so callers cannot
tell the customer _why_ nothing happened, and one outcome travels a different
control path than the others.

What is **not** wrong: the class's size (modest) and its two constructor
dependencies. Without the divergent history, this shape alone would not justify a
finding.

The After also upgrades `method()` from a raw String to a `PaymentMethod` enum along
the way — Replace Type Code, java-refactoring's move, riding along rather than part of
the SRP case.

## After

Eligibility becomes a pure policy returning a sealed decision — data in, decision
out, no I/O:

```java
public sealed interface RefundDecision {
    record Approve(BigDecimal amount) implements RefundDecision {}
    record Reject(String reason) implements RefundDecision {}
}

public final class RefundPolicy {

    public RefundDecision decide(Payment payment, BigDecimal amount, int daysSincePurchase) {
        if (daysSincePurchase > 90) return new RefundDecision.Reject("window expired");
        if (amount.compareTo(payment.amount()) > 0)
            return new RefundDecision.Reject("exceeds original charge");
        if (payment.method() == PaymentMethod.CARD && daysSincePurchase > 30)
            return new RefundDecision.Reject("card scheme window expired");
        return new RefundDecision.Approve(amount);
    }
}
```

The processor orchestrates and switches exhaustively — no `default`, so a new
decision variant is a compile error at every switch, which is the point:

```java
public final class RefundProcessor {

    private final RefundPolicy policy;
    private final GatewayClient gateway;
    private final RefundNotifier notifier;   // port; wording lives with CX's adapter

    public RefundProcessor(RefundPolicy policy, GatewayClient gateway, RefundNotifier notifier) {
        this.policy = policy;
        this.gateway = gateway;
        this.notifier = notifier;
    }

    public RefundDecision refund(Payment payment, BigDecimal amount, int daysSincePurchase) {
        RefundDecision decision = policy.decide(payment, amount, daysSincePurchase);
        switch (decision) {
            case RefundDecision.Approve(BigDecimal approved) -> {
                GatewayResult result = gateway.refund(payment.gatewayRef(), approved);
                if (!result.ok()) throw new RefundFailedException(result.errorCode());
                notifier.refundApproved(payment, approved);
            }
            case RefundDecision.Reject _ -> { /* nothing to execute */ }
        }
        return decision;
    }
}
```

`RefundNotifier` is a port with the mail adapter behind it — the seam is real
(CX's change stream, plus a transport); the reasoning for when such an interface
is justified is the java-dependency-inversion skill.

## Trade-offs

- Three types replace one; a reader following a refund now visits policy, then
  processor. The navigation cost is paid for by the three change streams landing
  in three files.
- Sealing `RefundDecision` closes the variant set deliberately: a new variant
  breaks every switch at compile time instead of slotting in silently. That is
  OCP traded away for exhaustiveness — the correct trade here because the variant
  set is owned by this module.
- Gateway failure stayed an exception rather than a `Reject` variant: rejection is
  a business answer, gateway failure is an operational fault with retry semantics.
  Merging them would hide that difference from callers.

## Verification

- `RefundPolicy` tests are pure: construct, call `decide`, assert on the variant —
  no doubles at all.
- Re-run the history check after a quarter: CX commits should now touch only the
  notifier adapter, payments commits only `RefundPolicy`.
- Delete a `case` arm and compile: the build must fail. That failure is the
  regression guard the `boolean` version never had.
