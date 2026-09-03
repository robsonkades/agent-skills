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
2. **Gateway unreachable / timed out**—operational, but timeout may mean the authorization was
   applied and its response was lost. Retry safety is not known from the exception alone.
3. **Gateway answered garbage** (unparseable body, unexpected status)—a contract/protocol
   failure. Blind immediate retry is unlikely to help, but policy may query status or recover
   after configuration/operator action.
4. **Interruption** — swallowed by `catch (Exception)`, losing the interrupt flag.

`new RuntimeException(e.getMessage())` destroys the stack trace and cause chain, and the
retry wrapper's `contains("timed out")` breaks the day the JDK or a locale changes the
message text. Mode 3 currently matches nothing and is retried or not by accident.

## After

The expected outcome becomes data; the operational failures become a two-deep hierarchy
with transport facts fixed at the throw site and retry policy kept outside the exception.

```java
public sealed interface AuthorisationResult {
    record Approved(String authCode) implements AuthorisationResult {}
    record Declined(DeclineCode code, String advice) implements AuthorisationResult {}
}

public abstract class GatewayException extends RuntimeException {
    protected GatewayException(String message, Throwable cause) {
        super(message, cause);
    }
}

public enum RemoteOutcome { NOT_APPLIED, UNKNOWN }

public final class GatewayTransportException extends GatewayException {
    private final RemoteOutcome remoteOutcome;

    public GatewayTransportException(
            String message, Throwable cause, RemoteOutcome remoteOutcome) {
        super(message, cause);
        this.remoteOutcome = remoteOutcome;
    }

    public RemoteOutcome remoteOutcome() { return remoteOutcome; }
}

public final class GatewayContractException extends GatewayException {
    public GatewayContractException(String message, Throwable cause) {
        super(message, cause);
    }
}
```

Translation happens once in the adapter. A general `IOException` is conservatively an unknown
remote outcome; interruption stops the operation's retry flow:

```java
public AuthorisationResult authorise(String paymentId, BigDecimal amount) {
    try {
        HttpResponse<String> rsp = http.send(request(paymentId, amount), ofString());
        return parse(rsp); // 402 → Declined; unparseable → GatewayContractException
    } catch (IOException e) {
        throw new GatewayTransportException(
                "authorisation call for payment %s failed".formatted(paymentId),
                e,
                RemoteOutcome.UNKNOWN);
    } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        var cancelled = new CancellationException(
                "interrupted while authorising payment " + paymentId);
        cancelled.initCause(e);
        throw cancelled;
    }
}
```

The domain service branches on data using an exhaustive switch. Recompiled switches without a
default must cover a new variant; already-compiled clients can instead encounter `MatchException`
under separate evolution, so adding a permitted result remains an API compatibility event:

```java
return switch (gateway.authorise(order.paymentId(), order.amount())) {
    case Approved(String authCode) -> ledger.recordCapture(order, authCode);
    case Declined(DeclineCode code, String advice) -> ledger.recordDecline(order, code, advice);
};
```

The retry policy considers `remoteOutcome`, a stable idempotency key, remaining deadline/attempt
budget and provider throttling. For `UNKNOWN`, it may query by idempotency key before deciding;
without deduplication it must not blindly repeat a charge. The REST boundary keeps one broad
handler, mapping `GatewayException` to its protocol response. Cancellation/interruption follows a
separate request-aborted policy rather than becoming 500 or a retry. A broad final catch can map
unexpected exceptions to 500, with one owning observability point.

## Trade-offs

- Two exception types plus a result type replace one `RuntimeException` — more API
  surface, and every existing caller must be migrated in the same change; half-migrated
  is worse than unmigrated.
- The sealed result forces even callers that only care about approval to write a
  `Declined` arm. That ceremony is the mechanism working; if it feels wrong, the outcome
  was not really expected and belonged as an exception.
- Typed transport facts add modelling surface and still do not make the decision automatically;
  that separation prevents a generic retry library from converting uncertainty into duplicate
  financial effects.

## Verification

- Grep the module: `getMessage()` feeding a constructor — zero occurrences; `contains(`
  in any catch or retry path — zero.
- Every catch of `GatewayException` either handles it or rethrows; `catch (Exception)`
  survives only in the REST boundary handler.
- Tests: a stubbed gateway returning 402 produces a recorded decline and no exception; a
  stubbed `IOException` produces `GatewayTransportException` with `UNKNOWN` outcome and preserves
  that cause; interruption restores the flag and produces cancellation; contract failures are
  not blindly retried; an unknown transport outcome is retried only with the configured stable
  idempotency key/status-reconciliation policy.

## Authoritative references

- [HttpClient.send interruption contract, Java SE 25](<https://docs.oracle.com/en/java/javase/25/docs/api/java.net.http/java/net/http/HttpClient.html#send(java.net.http.HttpRequest,java.net.http.HttpResponse.BodyHandler)>)
- [CancellationException API, Java SE 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/CancellationException.html)
