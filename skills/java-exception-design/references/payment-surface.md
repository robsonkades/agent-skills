# Worked example: a payment gateway's exception surface

A service takes payment orders, authorises them against a card gateway over HTTP, and
records the outcome. Three layers: HTTP adapter → domain service → REST boundary.

## Before

```java
public class CardGatewayClient {
    public String authorise(String paymentId, BigDecimal amount) {
        try {
            HttpResponse<String> rsp = http.send(request(paymentId, amount), ofString());
            if (rsp.statusCode() == 402) throw new RuntimeException("declined: " + rsp.body());
            return parseAuthCode(rsp.body());
        } catch (Exception e) {
            throw new RuntimeException(e.getMessage());
        }
    }
}

// elsewhere, in the retry wrapper:
} catch (RuntimeException e) {
    if (e.getMessage() != null && e.getMessage().contains("timed out")) {
        return retry(op);
    }
    throw e;
}
```

## Analysis

Four distinct failure modes are collapsed into one `RuntimeException`:

1. **Decline** — an expected outcome (the requirements say declines are shown to the
   customer with a reason). It is not a failure at all; modelling it as an exception
   forces every caller into catch-based control flow.
2. **Gateway unreachable / timed out** — operational, retryable.
3. **Gateway answered garbage** (unparseable body, unexpected status) — operational,
   _not_ retryable: the same request will fail the same way, and retrying a possibly
   half-processed authorisation risks a double charge.
4. **Interruption** — swallowed by `catch (Exception)`, losing the interrupt flag.

`new RuntimeException(e.getMessage())` destroys the stack trace and cause chain, and the
retry wrapper's `contains("timed out")` breaks the day the JDK or a locale changes the
message text. Mode 3 currently matches nothing and is retried or not by accident.

## After

The expected outcome becomes data; the operational failures become a two-deep hierarchy
with retryability fixed at the throw site.

```java
public sealed interface AuthorisationResult {
    record Approved(String authCode) implements AuthorisationResult {}
    record Declined(DeclineCode code, String advice) implements AuthorisationResult {}
}

public abstract class GatewayException extends RuntimeException {
    private final boolean retryable;

    protected GatewayException(String message, Throwable cause, boolean retryable) {
        super(message, cause);
        this.retryable = retryable;
    }

    public final boolean retryable() { return retryable; }
}

public final class GatewayUnavailableException extends GatewayException {
    public GatewayUnavailableException(String message, Throwable cause) {
        super(message, cause, true);
    }
}

public final class GatewayContractException extends GatewayException {
    public GatewayContractException(String message, Throwable cause) {
        super(message, cause, false);
    }
}
```

Translation happens once, in the adapter, preserving cause and interrupt status:

```java
public AuthorisationResult authorise(String paymentId, BigDecimal amount) {
    try {
        HttpResponse<String> rsp = http.send(request(paymentId, amount), ofString());
        return parse(rsp); // 402 → Declined; unparseable → GatewayContractException
    } catch (IOException e) {
        throw new GatewayUnavailableException(
                "authorisation call for payment %s failed".formatted(paymentId), e);
    } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        throw new GatewayUnavailableException(
                "interrupted while authorising payment " + paymentId, e);
    }
}
```

The domain service branches on data, and the compiler enforces totality — a new result
variant fails compilation at every switch instead of falling through a `default`:

```java
return switch (gateway.authorise(order.paymentId(), order.amount())) {
    case Approved(String authCode) -> ledger.recordCapture(order, authCode);
    case Declined(DeclineCode code, String advice) -> ledger.recordDecline(order, code, advice);
};
```

The retry wrapper reads the property: `catch (GatewayException e) { if (e.retryable())
… }`. The REST boundary keeps exactly one broad handler, mapping `GatewayException` to
502/504 and anything else to 500 — broad catch is correct there and only there.

## Trade-offs

- Two exception types plus a result type replace one `RuntimeException` — more API
  surface, and every existing caller must be migrated in the same change; half-migrated
  is worse than unmigrated.
- The sealed result forces even callers that only care about approval to write a
  `Declined` arm. That ceremony is the mechanism working; if it feels wrong, the outcome
  was not really expected and belonged as an exception.
- `retryable` as a boolean on the base type means a generic retry component; had retry
  been decided in one catch clause, two catch clauses on the two types would need no
  field at all.

## Verification

- Grep the module: `getMessage()` feeding a constructor — zero occurrences; `contains(`
  in any catch or retry path — zero.
- Every catch of `GatewayException` either handles it or rethrows; `catch (Exception)`
  survives only in the REST boundary handler.
- Tests: a stubbed gateway returning 402 produces a recorded decline and no exception; a
  stubbed `IOException` produces `GatewayUnavailableException` whose `getCause()` is that
  `IOException`; the retry test asserts `GatewayContractException` is attempted exactly
  once.
