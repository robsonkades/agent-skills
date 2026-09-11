# Worked example: a payment gateway's exception surface

A service takes payment orders, authorises them against a card gateway over HTTP, and
records the outcome. Three layers: HTTP adapter → domain service → REST boundary.

These are partial Java 21 snippets without preview. Supply imports, enclosing types, client,
request/parser helpers, ledger and decline types; public top-level types need separate files.
The provider contract in this illustration maps 402 to a decline; real gateways may use a
different status or body code. Authorization approval does not mean a payment was captured.

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

1. **Decline** — an expected business outcome (the requirements say declines are shown to
   the customer with a reason). Data makes that branch clear in this illustration; an existing
   exception contract can also represent a decline if supported callers handle it appropriately.
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

The domain service branches on data using an exhaustive switch. This variant-enumerating switch
needs another arm when recompiled with a new variant; a covering type pattern or default may
already cover it. Already-compiled clients can instead encounter `MatchException`
under separate evolution, so adding a permitted result remains an API compatibility event:

```java
return switch (gateway.authorise(order.paymentId(), order.amount())) {
    case Approved(String authCode) -> ledger.recordAuthorisation(order, authCode);
    case Declined(DeclineCode code, String advice) -> ledger.recordDecline(order, code, advice);
};
```

If `ledger.recordAuthorisation` fails after `Approved`, authorization remains known to have
been approved; local recording can fail or remain uncertain separately. Preserve that evidence
and use the existing recovery/reconciliation contract instead of blindly repeating authorization.
This example does not implement a durable recovery protocol; unresolved policy belongs with the
owners routed from `failure-atomicity.md`.

The retry policy considers `remoteOutcome`, a stable idempotency key, remaining deadline/attempt
budget and provider throttling. For `UNKNOWN`, it may query by idempotency key before deciding;
without deduplication it must not blindly repeat a charge. The REST boundary keeps one broad
handler, mapping `GatewayException` to its protocol response. Cancellation/interruption follows a
separate request-aborted policy rather than becoming 500 or a retry. A broad final catch can map
unexpected exceptions to 500, with one owning observability point.

## Trade-offs

- Two exception types plus a result type add API surface. Controlled callers can migrate
  together; published callers may need an invariant-preserving adapter/deprecation window.
  Mixed versions need compatible failure semantics, not an assumption that all clients upgrade at once.
- An exhaustive switch makes this caller account for decline, but Java also permits a default
  branch or an ignored result. Review actual handling; a sealed result alone cannot prevent
  a caller from treating decline as success.
- Typed transport facts add modelling surface and still do not make the decision automatically;
  that separation prevents a generic retry library from converting uncertainty into duplicate
  financial effects.

## Verification

- Inspect `getMessage()` feeding constructors for discarded causes, and text matching in retry
  paths for message-based policy. These are leads, not zero-occurrence gates: a constructor
  passing both a safe message and the original cause may be correct.
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
