# Worked refactoring: a refund processor with three masters

This is an illustrative scenario, including its commit counts. Java blocks are partial
Java 21 snippets: `BigDecimal` imports, domain types, ports and adapters are omitted; public
types need separate files. They are not a complete payment workflow or evidence of production
validation. Use actual requirements/history in a real review.

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

A separate accepted requirement in this scenario is to expose rejection reasons to callers;
`false` cannot carry them. Returning business decisions while throwing operational failures
is a coherent design, not inherently a defect. Do not change a public return type merely to
make all outcomes look alike.

What is **not** wrong: the class's size (modest) and its two constructor
dependencies. Without the divergent history, this shape alone would not justify a
finding.

The after sketch also replaces raw `method()` with `PaymentMethod`. Preserve known mappings,
and explicitly decide unknown/null/case-sensitive inputs before calling that migration
behavior-preserving. Land or characterize it independently of the SRP split.

## After

The example intentionally includes three contract changes: structured rejection results,
negative purchase-age rejection and nonpositive-amount rejection. The old code can accept some
of those inputs. Authorize and test them separately; for a mechanical split, retain the old
return/error behavior behind a compatibility facade until callers migrate. Rule ordering also
matters when several rejection conditions hold.

Eligibility becomes a pure policy returning a sealed decision — data in, decision
out, no I/O:

```java
public sealed interface RefundDecision {
    record Approve(BigDecimal amount) implements RefundDecision {}
    record Reject(RefundRejection reason) implements RefundDecision {}
}

public enum RefundRejection { WINDOW_EXPIRED, EXCEEDS_CHARGE, CARD_WINDOW_EXPIRED }

public final class RefundPolicy {

    public RefundDecision decide(Payment payment, BigDecimal amount, int daysSincePurchase) {
        if (daysSincePurchase < 0) throw new IllegalArgumentException("purchase is in the future");
        if (amount.signum() <= 0) throw new IllegalArgumentException("amount must be positive");
        if (daysSincePurchase > 90)
            return new RefundDecision.Reject(RefundRejection.WINDOW_EXPIRED);
        if (amount.compareTo(payment.amount()) > 0)
            return new RefundDecision.Reject(RefundRejection.EXCEEDS_CHARGE);
        if (payment.method() == PaymentMethod.CARD && daysSincePurchase > 30)
            return new RefundDecision.Reject(RefundRejection.CARD_WINDOW_EXPIRED);
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
            case RefundDecision.Reject ignored -> { /* nothing to execute */ }
        }
        return decision;
    }
}
```

`RefundNotifier` is a port with the mail adapter behind it — the seam is real
(CX's change stream, plus a transport); the reasoning for when such an interface
is justified is the java-dependency-inversion skill.

The snippets use Java 21-final pattern matching (no unnamed `_` pattern, which became final in
Java 22). They still abbreviate a production workflow: use a caller-stable refund idempotency key,
model currency and remaining refundable amount, and do not assume `@Transactional` makes the
gateway call and database/event write atomic. Persist intent/result and publish via an outbox or
reconcile ambiguous gateway outcomes before retrying; notification failure must not repeat a
completed refund.

## Trade-offs

- Policy, decision types and notifier roles add navigation; a reader following a refund visits policy, then
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

- `RefundPolicy` tests cover day 30/31 and 90/91, exact/excess charged amounts, each method,
  overlapping rejection precedence and the deliberately new invalid-input failures.
- Processor tests assert no gateway/notifier call on rejection, one refund then notification
  on approval, gateway failure preventing notification, and notification failure not causing
  an internal refund retry. This last check does not establish safe caller retries: the
  production idempotency/reconciliation path still needs its own tests.
- Re-run the history check after a quarter: CX commits should now touch only the
  notifier adapter, payments commits only `RefundPolicy`.
- Delete a `case` arm and compile: the build must fail. That failure is the
  regression guard the `boolean` version never had.
