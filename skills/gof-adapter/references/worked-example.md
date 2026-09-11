# Worked example: a vendor payment SDK behind a domain port

All SDK names and builder methods below are fictional Stripe-like teaching types, not a recipe
for any published Stripe SDK. These are partial Java 17 snippets with domain types/imports omitted.
For real integration inspect the resolved SDK, API version and authorization-versus-capture contract;
do not map a successful charge to an authorization without establishing those semantics.

## The port the application wants

```java
public interface PaymentGateway {
    /**
     * @throws PaymentDeclined                  the instrument was refused; do not retry
     * @throws PaymentTemporarilyUnavailable    unavailable/unknown outcome; see retry contract
     * @throws PaymentGatewayFailure            unclassified
     * @throws UnknownGatewayStatus             protocol/mapping failure; outcome may be unknown
     */
    Authorisation authorise(Payment payment, IdempotencyKey key);
}
```

The port is written from the caller's needs: failure categories the domain can act on, an
idempotency key because retries are expected, and no mention of HTTP, JSON or the vendor.
Retry requires the same canonical request/key within provider scope and retention, an allowed error
and remaining deadline. A timeout does not prove no authorization happened; reconcile ambiguous
outcomes. Changed parameters with a reused key are a conflict, not a replay of the original request.

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

    public StripePaymentGateway(StripeClient stripe, Duration timeout) {
        this.stripe = java.util.Objects.requireNonNull(stripe);
        this.timeout = java.util.Objects.requireNonNull(timeout);
        if (timeout.isZero() || timeout.isNegative()) throw new IllegalArgumentException("timeout");
    }

    @Override
    public Authorisation authorise(Payment payment, IdempotencyKey key) {
        var request = ChargeRequest.builder()
                .amountInMinorUnits(payment.amount().minorUnits())
                .currency(payment.amount().currency().getCurrencyCode())
                .source(payment.instrument().token())
                .idempotencyKey(key.value())
                .timeout(timeout)                       // fictional request-timeout setting
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
        if (raw == null) throw new UnknownGatewayStatus("missing status");
        return switch (raw) {
            case "authorised" -> AuthorisationStatus.AUTHORISED;
            case "pending" -> AuthorisationStatus.PENDING;
            case "failed" -> AuthorisationStatus.FAILED;
            default -> throw new UnknownGatewayStatus("unrecognized status");
        };
    }
}
```

Four things this adapter does that a naive wrapper does not.

**It names timeout ownership.** This fictional client accepts a request timeout; a real SDK may
configure transport timeouts elsewhere. Bound the call by the caller's remaining deadline and
account for client retries; one socket timeout is not necessarily a total-call bound.

**It classifies failures.** `PaymentDeclined` and `PaymentTemporarilyUnavailable` differ in
the available evidence, not unconditional retry permission. Apply the port's retry contract and
preserve unknown outcome; mapping failure after remote success also requires reconciliation.

**It refuses to guess.** An unrecognised status throws rather than defaulting to `PENDING`. A
default invents state and may misdirect reconciliation. Keep safe diagnostic context and define
how to reconcile null responses, missing identifiers, invalid currencies or timestamps too;
those mapping failures do not undo a successful remote side effect.

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
above. The retry policy can live in a decorator or client-level configuration. Embedding it here
couples policy changes to the mapping and can conceal retries already performed by the client;
it does not make testing or observability impossible. Name and verify the actual retry owner
(`gof-decorator`, `circuit-breakers`).

## Testing: two different tests, two different purposes

```java
// 1. For the application: a fake port. No vendor, no HTTP, no mocking framework.
final class InMemoryPaymentGateway implements PaymentGateway {
    // Thread-confined fake; Payment equality must cover the canonical request fields.
    private final Map<IdempotencyKey, Authorisation> issued = new HashMap<>();
    private final Map<IdempotencyKey, Payment> requests = new HashMap<>();

    @Override public Authorisation authorise(Payment payment, IdempotencyKey key) {
        java.util.Objects.requireNonNull(payment);
        java.util.Objects.requireNonNull(key);
        Payment previous = requests.putIfAbsent(key, payment);
        if (previous != null && !previous.equals(payment)) {
            throw new IllegalArgumentException("idempotency key reused with different request");
        }
        return issued.computeIfAbsent(key, k ->
            new Authorisation(AuthorisationId.newId(), payment.amount(),
                              AuthorisationStatus.AUTHORISED, Instant.EPOCH));
    }
}
```

The fake models replay and changed-request rejection for thread-confined application tests. It does
not model provider retention, concurrent requests, failures or uncertain outcomes; test those
separately. Production domain types should expose the port's named conflict exception if required.

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
Below the adapter:  ChargeRequest, long minor units, "authorised", StripeException

Replacing the provider:   bounded when the new provider can satisfy the same contract
Adding a second provider: validate semantics, not just matching signatures
Provider adds a status:   one switch fails loudly, in one place
```

That is the payoff when the port preserves an actual contract boundary. Implementation count
alone neither justifies nor invalidates that boundary (`gof-pattern-thinking`).

Real-provider contrast: [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests)
requires matching parameters and documents retention limits; a same-key retry is not a universal
forever guarantee. No real provider interaction was performed for this illustrative example.
