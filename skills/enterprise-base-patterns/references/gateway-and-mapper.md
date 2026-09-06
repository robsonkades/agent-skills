# Gateway and Mapper

## Gateway

An object that encapsulates access to an external system and presents it in **your** terms.

```java
// The port: declared where it is used (Separated Interface), in your language.
public interface CreditBureau {
    CreditAssessment assess(TaxId taxId, Money requestedLimit);
}

public sealed interface CreditAssessment {
    record Approved(Money limit, Instant validUntil) implements CreditAssessment { }
    record Declined(DeclineReason reason)            implements CreditAssessment { }
    record Unavailable(Optional<Duration> retryAfter) implements CreditAssessment { }
}
```

```java
// The gateway: the only place that knows the vendor exists.
@Component
class HttpCreditBureau implements CreditBureau {

    private final RestClient client;

    HttpCreditBureau(RestClient client) { this.client = Objects.requireNonNull(client); }

    @Override
    public CreditAssessment assess(TaxId taxId, Money requestedLimit) {
        try {
            var response = client.post()
                .uri("/v3/assessments")
                .body(new BureauRequest(taxId.digits(), requestedLimit.amount()))
                .retrieve()
                .body(BureauResponse.class);

            if (response == null || response.decision() == null) {
                throw new UnexpectedBureauResponse("missing decision");
            }

            return switch (response.decision()) {                  // their vocabulary…
                case "APPROVE" -> new Approved(                     // …becomes yours
                    Money.of(response.limit(), "BRL"), response.validUntil());
                case "DECLINE" -> new Declined(reasonFrom(response.code()));
                default -> throw new UnexpectedBureauResponse(response.decision());
            };
        } catch (HttpServerErrorException | ResourceAccessException e) {
            return new Unavailable(Optional.empty()); // retry delay not known
        } catch (RestClientException e) {
            throw new BureauIntegrationFailure("assessment failed", e);
        }
    }
}
```

The partial adapter assumes static imports of CreditAssessment's nested outcomes, configured
RestClient base URL/timeouts, domain-owned exceptions and vendor DTO/mapping helpers. It assumes
a BRL-only contract; validate requested currency and every required response field in those
helpers. Unknown retry delay is not permission to retry. Classify 429/Retry-After and permanent
4xx/authentication failures from the actual vendor contract rather than calling every error a
business decline. Keep exception causes for restricted diagnostics, not client payloads.

Three things this does that a thin wrapper does not:

1. **Translates the vocabulary.** Callers never see `"APPROVE"`, a bureau status code, or a
   `BureauResponse`.
2. **Translates the failures.** An HTTP 503 becomes `Unavailable`, a domain-meaningful
   outcome the caller can handle without importing an HTTP library
   (`layering-and-boundaries`).
3. **Contains the vendor.** Replacement is local if the new provider satisfies the port's
   semantics; otherwise the contract and its callers also need review.

**Where resilience belongs:** timeouts and connection pooling on the client; retry and
circuit breaking around the gateway call, not inside the domain
(`timeouts-and-deadlines`, `retries-and-backoff`, `concurrency-limiting-and-bulkheads`).
Retrying inside a transaction is the failure to avoid — the transaction holds a connection
for the whole retry budget (`enterprise-transactions`).
Before retrying a POST, establish idempotency/deduplication or reconciliation for an ambiguous
outcome. A transport failure does not prove that the provider did no work.

**What a bad gateway looks like:** it returns `BureauResponse`, throws
`HttpClientErrorException`, and takes the vendor's request type as a parameter. The
dependency is now in every caller, and the class provides only a base URL.

## Gateways for time, identity and files

The same pattern removes the three commonest sources of untestable code:

```java
// Time: inject a Clock. Never call Instant.now() inside a business rule.
public Order cancel(Clock clock) { this.cancelledAt = Instant.now(clock); ... }

// Identity: an interface, so tests are deterministic.
public interface IdGenerator { OrderId nextOrderId(); }

// Files and object storage: your terms, not the SDK's.
public interface DocumentStore {
    DocumentRef store(DocumentContent content);
    Optional<DocumentContent> fetch(DocumentRef ref);
}
```

Each is a few lines and each converts a class of flaky, environment-dependent tests into
deterministic ones (`architecture-testing`).

## Service Stub

The gateway's interface makes the stub trivial — and the stub must include the failures:

```java
final class StubCreditBureau implements CreditBureau {

    private final Map<TaxId, CreditAssessment> canned = new HashMap<>();
    private boolean unavailable = false;

    @Override public CreditAssessment assess(TaxId taxId, Money requested) {
        if (unavailable) return new Unavailable(Optional.empty());
        return canned.getOrDefault(taxId, new Declined(DeclineReason.NO_HISTORY));
    }

    void willBeUnavailable() { this.unavailable = true; }
    void approves(TaxId taxId, Money limit, Instant validUntil) {
        canned.put(taxId, new Approved(limit, validUntil));
    }
}
```

A stub that only succeeds certifies the happy path and nothing else. The failure paths — the
timeout, the 500, the malformed response, the rate limit — are exactly the ones production
exercises and tests usually do not.

This mutable stub is test-instance scoped and not thread-safe. It tests caller reactions to
port outcomes; it cannot test HTTP decoding or error translation. Exercise the adapter separately
with controlled HTTP responses (empty/malformed payload, 429, 4xx, 5xx and transport failure).

**Pair it with a contract test** against the real service, run on a schedule rather than on
every build, asserting that the vendor still behaves as the stub claims. A stub that has
drifted from reality is worse than no stub (`architecture-testing`).

## Gateway versus adapter

The words are used interchangeably and the distinction is still useful:

```text
Gateway    a class that encapsulates an external resource. The term
           describes what it wraps.

Adapter    (hexagonal sense) the implementation of a port, living
           outside the application core. The term describes where it
           sits in the architecture.
```

A gateway implementing a port declared by the domain **is** a driven adapter. Use whichever
vocabulary your codebase already uses, and do not run both
(`layering-and-boundaries`).

## Mapper

An object that moves data between two subsystems while keeping them ignorant of each other.

```java
// Neither Order nor OrderRow knows the other exists; the mapper knows both.
@Component
final class OrderMapper {

    Order toDomain(OrderRow row, List<OrderLineRow> lines) {
        return Order.reconstitute(
            new OrderId(row.id()),
            new CustomerId(row.customerId()),
            OrderStatus.valueOf(row.status()),
            lines.stream().map(this::toLine).toList(),
            row.version());
    }

    OrderRow toRow(Order order) { ... }
}
```

### Two rules

**Use a mapper only when neither side may know the other.** If the persistence model is
allowed to know the domain (the usual case in a Spring application), a constructor or a
static factory on one side is simpler and one indirection cheaper. The mapper's justification
is mutual ignorance, and that is a real requirement only sometimes
(`data-source-patterns`).

**A mapper must not decide.**

```java
// Wrong: a business rule inside a translation.
OrderView toView(Order order) {
    return new OrderView(order.id(),
        order.total().isGreaterThan(THRESHOLD) ? "PRIORITY" : "STANDARD",   // ← a rule
        order.lines().size());
}
```

`PRIORITY` is a business classification. It now lives in a mapper: not unit tested as a
rule, not discoverable by anyone searching the domain, and certain to be re-implemented
differently in the next mapper. Compute it in the domain and map the result.

## Where mappers accumulate

A codebase with entity → domain → DTO → response has three mappers and two of them are
frequently identity functions. Compare ownership, compatibility and trust boundaries before
collapsing identical shapes: independently evolving contracts can justify an identity mapping.
Remove a layer only when it has no such responsibility (`remote-facade-and-dto`).

## Sources

- [Spring REST clients](https://docs.spring.io/spring-framework/reference/integration/rest-clients.html): RestClient response conversion and default error handling; consult the target release.
