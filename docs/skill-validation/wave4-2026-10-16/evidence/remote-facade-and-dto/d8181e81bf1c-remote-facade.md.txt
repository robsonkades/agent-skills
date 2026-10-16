# Remote Facade

## The chatty interface, and the arithmetic

```java
// A local model exposed remotely, method for method.
CustomerDto customer = api.getCustomer(id);
AddressDto  address  = api.getAddress(customer.addressId());
List<OrderDto> orders = api.getOrders(customer.id());
for (OrderDto order : orders) {
    List<LineDto> lines = api.getOrderLines(order.id());   // ← one call per order
}
```

Rendering one customer page with 10 orders: 13 sequential round trips. A fixed 1 ms network
cost per call contributes 13 ms, before server work and payload transfer. If each independent
call has a 1% probability of exceeding 40 ms, at least one exceeds it with probability
`1 - 0.99^13 ≈ 12.25%`, not certainty. Dependence changes that probability; individual
percentiles do not determine the percentile of the sum. Measure the complete interaction
(`architecture-and-performance`).

```java
// Candidate Remote Facade for this sequential interaction; payload/work remain bounded.
CustomerOverview overview = api.customerOverview(id, RECENT_ORDERS);   // 1 round trip
```

## What belongs in a facade

```java
@RestController
@RequestMapping("/api/customers")
class CustomerFacade {
    // Partial Spring 6+ sketch: constructor injection and access checks omitted.

    private final CustomerOverviewQuery overviewQuery;
    private final PlaceOrder placeOrder;

    @GetMapping("/{id}/overview")
    CustomerOverview overview(@PathVariable UUID id,
                              @RequestParam(defaultValue = "10") int recentOrders) {
        if (recentOrders < 1 || recentOrders > 50) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "recentOrders must be 1..50");
        }
        return overviewQuery.forCustomer(new CustomerId(id), recentOrders);
    }

    @PostMapping("/{id}/orders")
    ResponseEntity<OrderCreated> place(@PathVariable UUID id,
                                       @RequestHeader("Idempotency-Key") String key,
                                       @Valid @RequestBody PlaceOrderRequest body) {
        OrderId orderId = placeOrder.place(body.toCommand(new CustomerId(id)), key);
        return ResponseEntity
            .created(URI.create("/api/orders/" + orderId.value()))
            .body(new OrderCreated(orderId.value()));
    }
}
```

Belongs here: coarse operations named after what the caller does; request validation;
translation to and from wire types; the idempotency key; coarse authorisation for the
operation; checking both lower and upper bounds of caller-supplied sizes. The query/use case
must enforce the authenticated tenant and object permissions; a path ID is not authorization.

Does **not** belong here: business rules; transaction demarcation (the use case owns it);
persistence access; anything another caller would also need.

## Coarsening without over-fetching

The tension is real: one call that returns everything transfers data nobody uses; many calls
cost round trips. Choose among these using the actual critical path, cacheability, payload,
freshness, consistency and failure contract; there is no fixed preference order:

1. **Design the operation around the interaction.** "Customer overview" is a real thing a
   caller does; it is not the union of every field.
2. **Let the caller state what it needs**, from a bounded set:
   `GET /customers/{id}?include=orders,addresses`. Bounded, documented, cacheable — unlike an
   unbounded query surface. An expressive query API can also be safe with explicit complexity,
   depth, cost and authorization controls; an include allowlist still needs these bounds.
3. **Separate endpoints per interaction.** `/overview` for the page, `/summary` for the
   list. A bounded mode or include parameter can also be adequate; compare cache keys,
   evolution and client complexity rather than requiring separate endpoints by convention.

Independent cacheable/parallel calls or bounded streaming may already meet the contract.
Coarsening is useful when it removes a demonstrated cost without losing those properties.

## Batch operations and partial failure

Choose where input validation belongs as well as whether execution is atomic. In Spring MVC,
`@Valid @RequestBody List<PlaceOrderRequest>` alone does not establish element validation.
Verify the configured Bean Validation provider and actual MVC/method-validation path on the
target Spring version; `@Valid` alone does not activate method validation.

For a new envelope-shaped contract, this partial Spring 6+/Jakarta Validation sketch validates
structural bounds and null members. The maximum of 100 is illustrative; derive the actual limit
from the operation's budget. Item-field validation is deliberately left to the policy below:

```java
public record PlaceOrdersRequest(
    @NotNull @Size(min = 1, max = 100)
    List<@NotNull PlaceOrderRequest> items) { }

@PostMapping("/orders/batch")
BatchResult<OrderCreated> placeAll(@Valid @RequestBody PlaceOrdersRequest request) { ... }
```

An existing JSON array contract must not silently become an object with an `items` field.
Preserve its shape through verified method validation or explicit envelope/item checks when
compatibility requires it. After validation, copy mutable input values into application-owned
commands as needed; the record's list is not deeply immutable.

For reject-whole-request input semantics, add `@Valid` to the envelope's element type
(`List<@NotNull @Valid PlaceOrderRequest>`) so item constraints cascade before the handler.
For per-item outcomes, keep those constraints out of request-level cascading, validate each
item explicitly before its effects, and translate violations into that item's safe result.
Domain rules and authorization still belong to the use case. Test mixed valid/invalid items
through HTTP binding and assert both result indexes and which effects occurred; compilation
or a direct validator call alone does not prove MVC invokes the intended validation.

Separately, define execution semantics: **is the batch atomic?**
Successful input validation alone does not establish execution atomicity.

- **Atomic** — all or nothing. One bad item can roll back every item. Choose it when the
  caller's contract requires or deliberately accepts that outcome and an actual atomic
  resource/protocol boundary covers the effects. Items need not be one domain aggregate;
  account for contention, transaction duration and whole-batch retry cost.
- **Per item** — each succeeds or fails independently, and the response reports per-item
  outcomes with a stable index or key. Choose this only when partial success satisfies the business contract. Carry per-item
  outcomes, while retaining a request-level failure path for invalid envelopes or inability
  to establish any outcomes.

```java
// Wire-shape sketch: production construction must enforce exactly one outcome per item.
public record BatchResult<T>(List<ItemResult<T>> results) {
    public BatchResult { results = List.copyOf(results); }
    public record ItemResult<T>(int index, boolean succeeded, T value, ProblemDetail error) { }
}
```

The list copy is shallow; `ProblemDetail` and generic values may still be mutable. Validate
that success carries the defined value and no error, failure carries a safe error and no
success value, and each index/key occurs once. Define unknown/pending outcomes when completion
cannot be determined. One HTTP request does not make several services atomic: identify the
actual transaction coordinator/resource boundary or expose orchestration semantics.

Bound batch items, total bytes, work, concurrency and duration, and state the bounds in the contract. An unbounded batch is a request
that can take arbitrarily long, hold a transaction arbitrarily long, and time out after
doing most of the work (`enterprise-transactions`).
Collection-size validation runs after body deserialization; enforce request-byte limits at the
transport/parser boundary too. Exercise null, empty, oversized and null-element inputs and
confirm request-level failures occur before effects where that is the declared policy.

## Idempotency and conditional requests at the boundary

The facade parses the repeat-safety contract; durable deduplication and side-effect coordination
belong with the application operation and its transaction boundary, not only an HTTP wrapper.

```java
@PostMapping("/orders")
ResponseEntity<OrderCreated> place(@RequestHeader("Idempotency-Key") String key,
                                   @Valid @RequestBody PlaceOrderRequest body) {
    return idempotency.execute(key, body, () -> placeOrder.place(body.toCommand()));
    // Placeholder: replay only a completed equivalent request in the same authorized scope.
}
```

```java
// Optimistic concurrency, expressed in HTTP the way intermediaries understand.
@PutMapping("/orders/{id}/shipping")
ResponseEntity<Void> updateShipping(@PathVariable UUID id,
                                    @RequestHeader("If-Match") String etag,
                                    @RequestBody ShippingRequest body) { ... }
// A false precondition prevents this write; normally return 412 Precondition Failed.
```

Scope keys by tenant/principal and operation, compare a canonical request fingerprint, define
retention and concurrent in-progress behavior, and reject reuse with a different request
according to the contract (which may use 409). A timeout after commit leaves an ambiguous
client outcome; replay storage and the effect need an atomic protocol or reconciliation.
For batches, state whether retry keys cover the whole batch or stable individual items.

Parse `If-Match` using HTTP strong-comparison rules and perform the version check atomically
with the write; an earlier read/check is insufficient. RFC 9110 permits a successful response
for a state change that appears already applied, without executing the rejected write again;
do not use that exception to suppress a real conflict. Authenticate and authorize before
revealing stored results. Protocol translation is a boundary concern; durable enforcement
must cover every caller of the use case
(`idempotency`, `offline-concurrency-control`).

## Errors: domain failures become protocol errors here

```java
@ExceptionHandler(CreditLimitExceeded.class)
ProblemDetail onCreditLimit(CreditLimitExceeded e) {
    var problem = ProblemDetail.forStatus(HttpStatus.UNPROCESSABLE_ENTITY);
    problem.setTitle("Credit limit exceeded");
    problem.setProperty("code", "CREDIT_LIMIT_EXCEEDED");   // stable; clients branch on it
    problem.setProperty("limit", e.limit().amount());
    problem.setProperty("attempted", e.attempted().amount());
    return problem;
}
```

Review `limit` and `attempted` against this caller's permissions before exposing financial
values; do not put raw exception properties into errors by default.

Three requirements: a stable machine-readable code (never a message string); enough
structured detail for the caller to act; and no infrastructure detail — a `SQLException`
message or a stack trace in a response body is both a leak and useless to the caller
(`rpc-and-api-contracts`).

## Facade granularity per consumer

A shared API can expose several representations. When consumer needs and evolution justify
separate ownership, a BFF is an option:

```text
mobile client ──► mobile BFF ──┐
web client ────► web BFF ──────┼──► application services ──► domain
partner ───────► public API ───┘
```

Each facade is thin and owns its own representations; the application services are shared.
Account for the extra boundary, ownership and possible network hop; separate BFFs are not
mandatory per consumer (`view-and-representation-patterns`).

## Reviewing a remote API

Apply the questions relevant to the requested operation or concern, using supplied evidence.
An adequate boundary can receive a no-change verdict; method names or persistence-backed
source types alone do not establish a defect.

1. How many calls does the client make, and are they sequential, costly or redundant?
   Multiple useful, cacheable or parallel calls alone are not a defect.
2. Is any operation named after a domain method rather than a caller's task?
3. Does any operation contain a business rule?
4. Is any caller-supplied size, depth or page unbounded?
5. Which writes need retry protection? Are scope, fingerprint, concurrency, retention and
   ambiguous completion handled, including valid conflict responses?
6. Is there one error shape with stable codes?
7. For persistence-backed payloads, does the actual encoding path control field exposure,
   lazy access, nested state and independent wire evolution?
8. Does shared contract code force upgrades, or can consumers independently pin compatible versions?

## Sources

- [Fowler: Remote Facade](https://martinfowler.com/eaaCatalog/remoteFacade.html) — coarse remote translation without domain logic.
- [RFC 9110: If-Match](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1) — strong comparison and precondition semantics.
- [Spring Framework 6.0 release](https://spring.io/blog/2022/11/16/spring-framework-6-0-goes-ga) — Java 17 baseline; examples remain partial sketches.
- [Spring MVC validation](https://docs.spring.io/spring-framework/reference/6.2/web/webmvc/mvc-controller/ann-validation.html) — argument versus method validation, root-container limitations and version-sensitive integration.
- [Jakarta Bean Validation 3.0](https://jakarta.ee/specifications/bean-validation/3.0/jakarta-bean-validation-spec-3.0) — container-element constraints, cascaded validation and explicit Validator APIs.
