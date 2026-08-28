# Worked example: a vendor payment SDK behind a domain port

## The port the application wants

```java
public interface PaymentGateway {
    /**
     * @throws PaymentDeclined                  the instrument was refused; do not retry
     * @throws PaymentTemporarilyUnavailable    transient; safe to retry with the same key
     * @throws PaymentGatewayFailure            unclassified
     */
    Authorisation authorise(Payment payment, IdempotencyKey key);
}
```

The port is written from the caller's needs: three outcomes the domain can act on, an
idempotency key because retries are expected, and no mention of HTTP, JSON or the vendor.

## What the SDK offers

```java
ChargeResponse charge = stripe.charges().create(ChargeRequest.builder()
        .amountInMinorUnits(long)
        .currency(String)
        .source(String)
        .idempotencyKey(String)
        .build());       // throws StripeCardException, StripeRateLimitException,
                         // StripeConnectionException, StripeException
```

Four mismatches: money as a `long` plus a `String`, an untyped source token, a foreign exception
hierarchy, and a status field that is an open string.

## The adapter

```java
public final class StripePaymentGateway implements PaymentGateway {

    private final StripeClient stripe;
    private final Duration timeout;

    @Override
    public Authorisation authorise(Payment payment, IdempotencyKey key) {
        var request = ChargeRequest.builder()
                .amountInMinorUnits(payment.amount().minorUnits())
                .currency(payment.amount().currency().getCurrencyCode())
                .source(payment.instrument().token())
                .idempotencyKey(key.value())
                .timeout(timeout)                       // the port cannot express "may hang"
                .build();
        try {
            return toAuthorisation(stripe.charges().create(request));
        } catch (StripeCardException e) {
            throw new PaymentDeclined(payment.id(), declineReason(e.getDeclineCode()), e);
        } catch (StripeRateLimitException | StripeConnectionException e) {
            throw new PaymentTemporarilyUnavailable(payment.id(), e);
        } catch (StripeException e) {
            throw new PaymentGatewayFailure(payment.id(), e);
        }
    }

    private Authorisation toAuthorisation(ChargeResponse response) {
        return new Authorisation(
                new AuthorisationId(response.id()),
                Money.ofMinorUnits(response.amount(), Currency.getInstance(response.currency())),
                status(response.status()),
                Instant.ofEpochSecond(response.created()));
    }

    private AuthorisationStatus status(String raw) {
        return switch (raw) {
            case "succeeded" -> AuthorisationStatus.AUTHORISED;
            case "pending" -> AuthorisationStatus.PENDING;
            case "failed" -> AuthorisationStatus.FAILED;
            default -> throw new UnknownGatewayStatus(raw);   // never invent a status
        };
    }
}
```

Four things this adapter does that a naive wrapper does not.

**It owns the timeout.** `PaymentGateway` cannot express "this may block indefinitely", so the
adapter must bound it. A missing timeout here is the failure that takes down the caller's thread
pool during a provider incident (`timeouts-and-deadlines`).

**It classifies failures.** `PaymentDeclined` and `PaymentTemporarilyUnavailable` differ in
whether a retry is correct. That classification exists only here, because only here is the
vendor's taxonomy known (`retries-and-backoff`).

**It refuses to guess.** An unrecognised status throws rather than defaulting to `PENDING`. A
default would let a failed payment be recorded as in-flight, and the reconciliation job would
never resolve it.

**It converts money once.** `Money.ofMinorUnits` is the only place minor-unit arithmetic happens;
above the adapter, amounts are `Money` with a currency attached, and minor-unit arithmetic never
appears again.

## What must not be in it

```java
// wrong — a business rule in the boundary
if (payment.amount().isGreaterThan(Money.of("10000", EUR))) {
    request = request.withManualReview(true);
}

// wrong — a retry policy in the adapter's body
for (int attempt = 0; attempt < 3; attempt++) { ... }
```

The approval threshold is a domain rule and stays true if the provider is replaced, so it belongs
above. The retry policy is a decorator or a client-level configuration; embedding it here means
it cannot be tested, observed or changed without touching the mapping
(`gof-decorator`, `circuit-breakers`).

## Testing: two different tests, two different purposes

```java
// 1. For the application: a fake port. No vendor, no HTTP, no mocking framework.
final class InMemoryPaymentGateway implements PaymentGateway {
    private final Map<IdempotencyKey, Authorisation> issued = new HashMap<>();

    @Override public Authorisation authorise(Payment payment, IdempotencyKey key) {
        return issued.computeIfAbsent(key, k ->
            new Authorisation(AuthorisationId.newId(), payment.amount(),
                              AuthorisationStatus.AUTHORISED, Instant.EPOCH));
    }
}
```

The fake honours the port's contract, including idempotency — a fake that ignores the key lets
the application ship a bug the real gateway would have caught.

```java
// 2. For the adapter: exercise the real SDK against a recorded or sandbox endpoint.
@Test
void translates_a_card_decline_into_PaymentDeclined() {
    var gateway = new StripePaymentGateway(sandboxClient, Duration.ofSeconds(2));
    assertThatThrownBy(() -> gateway.authorise(paymentWith(DECLINED_TEST_CARD), aKey()))
            .isInstanceOf(PaymentDeclined.class)
            .hasCauseInstanceOf(StripeCardException.class);
}
```

A unit test that mocks `StripeClient` to throw `StripeCardException` proves only that your
`catch` block matches your own mock — it cannot detect that the SDK actually throws
`StripeInvalidRequestException` for that case. The adapter's content is assumptions about a
foreign system, so its test must involve that system: a sandbox, a recorded interaction, or a
contract test the provider publishes.

## What the adapter bought

```text
Above the adapter:  Payment, Money, Authorisation, PaymentDeclined
Below the adapter:  ChargeRequest, long minor units, "succeeded", StripeException

Replacing the provider:   one class, one test file
Adding a second provider: a second adapter; the domain does not change
Provider adds a status:   one switch fails loudly, in one place
```

That is the payoff, and it is why a port with one implementation is still justified when the
implementation is somebody else's code — which is the exception to the usual rule against
single-implementation interfaces (`gof-pattern-thinking`).
