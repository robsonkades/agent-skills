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
Here `Unavailable` means no usable assessment was obtained, not that the POST had no effect.

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
Avoid waiting through remote retries while holding an unrelated database transaction: it can
retain connections or locks throughout that budget. Inspect the actual transaction scope and
resource acquisition (`enterprise-transactions`). Before retrying a POST, establish applicable
deduplication or reconciliation for all attempts and effects (`idempotency`). A transport failure
does not prove that the provider did no work; a later refusal does not resolve an earlier attempt.

**What a bad gateway looks like:** it returns `BureauResponse`, throws
`HttpClientErrorException`, and takes the vendor's request type as a parameter. The
dependency remains in every caller. That fails a promised domain-isolation boundary; retain a
thin wrapper only if another concrete responsibility, such as policy or resource ownership,
justifies it.

## Gateways for time, identity and files

Use controllable boundaries for business-relevant time, identity and storage:

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

These let tests control the corresponding inputs or effects. Other concurrent work and real
adapters still need their own evidence (`architecture-testing`).

## Service Stub

The gateway's interface lets a stub supply the outcomes a caller test needs:

```java
final class StubCreditBureau implements CreditBureau {

    private record Request(TaxId taxId, Money requested) { }
    private final Map<Request, CreditAssessment> canned = new HashMap<>();

    @Override public CreditAssessment assess(TaxId taxId, Money requested) {
        var response = canned.get(new Request(taxId, requested));
        if (response == null) throw new IllegalStateException("Unconfigured bureau request");
        return response;
    }

    void answers(TaxId taxId, Money requested, CreditAssessment response) {
        canned.put(new Request(taxId, requested), Objects.requireNonNull(response));
    }
}
```

Configure `Approved`, `Declined` or `Unavailable` for each expected request. This input-sensitive
stub rejects an unknown request instead of inventing a business decline, exposing wrong caller
arguments or missing setup. Its request keys rely on stable value equality for `TaxId` and `Money`.
A deliberate answer for all inputs can serve a different test; it does not verify argument forwarding.

A successful stub can serve a focused test. Across the relevant tests, exercise the declared
failure outcomes as well; passing caller tests do not establish provider or transport behavior.

This mutable stub is test-instance scoped and not thread-safe. It tests caller reactions to
port outcomes; it cannot test HTTP decoding or error translation. Exercise the adapter separately
with controlled HTTP responses (empty/malformed payload, 429, 4xx, 5xx and transport failure).

**Check for contract drift** using existing provider verification and applicable integration
tests. Run real-service checks only in an authorized environment with bounded effects and
appropriate credentials; choose cadence from the provider/change contract. If access is
restricted, use available contract evidence and record what remains unverified
(`architecture-testing`).

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

**Use a Mapper to preserve subsystem independence.** If one side may depend on the other
and you own its source, compare a constructor or static factory with a separate translation
class. Generated or third-party types may not be editable, even when dependency direction
allows it. A separate translator can also centralise shared conversion or generated mapping;
name that responsibility rather than asserting that every class called a mapper isolates
two independent models (`data-source-patterns`).

**A mapper must not invent business policy.** Faithful parsing, units and representation
conversion still require logic, including rejection of malformed or lossy inputs. Keep those
rules with the boundary contract; separate decisions such as eligibility or pricing.

```java
// Wrong: a business rule inside a translation.
OrderView toView(Order order) {
    return new OrderView(order.id(),
        order.total().isGreaterThan(THRESHOLD) ? "PRIORITY" : "STANDARD",   // ← a rule
        order.lines().size());
}
```

`PRIORITY` is a business classification in this example. Hiding it in a mapper can obscure
ownership and duplicate the rule in another representation. Compute it in the agreed domain
or use-case policy and map the result; inspect existing tests rather than assuming it is untested.

## Where mappers accumulate

A codebase with entity → domain → DTO → response has three mappers and two of them are
frequently identity functions. Compare ownership, compatibility and trust boundaries before
collapsing identical shapes: independently evolving contracts can justify an identity mapping.
Remove a layer only when it has no such responsibility (`remote-facade-and-dto`).

## Sources

- [Gateway](https://martinfowler.com/articles/gateway-pattern.html) and [Mapper](https://martinfowler.com/eaaCatalog/mapper.html): external-resource encapsulation and independent subsystem boundaries.
- [Spring REST clients](https://docs.spring.io/spring-framework/reference/integration/rest-clients.html): RestClient response conversion and default error handling; consult the target release.
