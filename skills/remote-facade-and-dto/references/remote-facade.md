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

Rendering one customer page with 10 orders: 13 round trips. At 1 ms each that is 13 ms plus
tail; at a 40 ms p99 per call, the probability that at least one call is slow approaches
certainty, so the page's p99 is far worse than any single call's
(`architecture-and-performance`).

```java
// A Remote Facade: one operation per interaction.
CustomerOverview overview = api.customerOverview(id, RECENT_ORDERS);   // 1 round trip
```

## What belongs in a facade

```java
@RestController
@RequestMapping("/api/customers")
class CustomerFacade {

    private final CustomerOverviewQuery overviewQuery;
    private final PlaceOrder placeOrder;

    @GetMapping("/{id}/overview")
    CustomerOverview overview(@PathVariable UUID id,
                              @RequestParam(defaultValue = "10") int recentOrders) {
        return overviewQuery.forCustomer(new CustomerId(id), Math.min(recentOrders, 50));
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
operation; bounding of caller-supplied sizes (`Math.min(recentOrders, 50)` — an unbounded
page size supplied by a client is a denial-of-service surface).

Does **not** belong here: business rules; transaction demarcation (the use case owns it);
persistence access; anything another caller would also need.

## Coarsening without over-fetching

The tension is real: one call that returns everything transfers data nobody uses; many calls
cost round trips. Three workable resolutions, in order of preference:

1. **Design the operation around the interaction.** "Customer overview" is a real thing a
   caller does; it is not the union of every field.
2. **Let the caller state what it needs**, from a bounded set:
   `GET /customers/{id}?include=orders,addresses`. Bounded, documented, cacheable — unlike an
   open query language, which moves your database's performance characteristics into the
   client's hands.
3. **Separate endpoints per interaction.** `/overview` for the page, `/summary` for the
   list. Two well-named endpoints beat one endpoint with a mode parameter.

## Batch operations and partial failure

```java
@PostMapping("/orders/batch")
BatchResult<OrderCreated> placeAll(@Valid @RequestBody List<PlaceOrderRequest> requests) { ... }
```

A batch endpoint must answer one question before it is written: **is it atomic?**

- **Atomic** — all or nothing. Simple to describe, and it means one bad item fails 999 good
  ones. Only viable when the items are genuinely one unit of work.
- **Per item** — each succeeds or fails independently, and the response reports per-item
  outcomes with a stable index or key. This is almost always the right choice, and it
  requires the response type to carry outcomes rather than throwing.

```java
public record BatchResult<T>(List<ItemResult<T>> results) {
    public record ItemResult<T>(int index, boolean succeeded, T value, ProblemDetail error) { }
}
```

Bound the batch size, and state the bound in the contract. An unbounded batch is a request
that can take arbitrarily long, hold a transaction arbitrarily long, and time out after
doing most of the work (`enterprise-transactions`).

## Idempotency and conditional requests at the boundary

The facade is where repeat-safety is implemented, because it is where the request arrives.

```java
@PostMapping("/orders")
ResponseEntity<OrderCreated> place(@RequestHeader("Idempotency-Key") String key,
                                   @Valid @RequestBody PlaceOrderRequest body) {
    return idempotency.execute(key, body, () -> placeOrder.place(body.toCommand()));
    // Replays the stored response for a repeated key; does not return 409.
}
```

```java
// Optimistic concurrency, expressed in HTTP the way intermediaries understand.
@PutMapping("/orders/{id}/shipping")
ResponseEntity<Void> updateShipping(@PathVariable UUID id,
                                    @RequestHeader("If-Match") String etag,
                                    @RequestBody ShippingRequest body) { ... }
// 412 Precondition Failed when the version has moved on.
```

Both are boundary concerns and belong in the facade, not in the domain
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

Three requirements: a stable machine-readable code (never a message string); enough
structured detail for the caller to act; and no infrastructure detail — a `SQLException`
message or a stack trace in a response body is both a leak and useless to the caller
(`rpc-and-api-contracts`).

## Facade granularity per consumer

One shared API cannot be simultaneously screen-shaped for a mobile client and
resource-shaped for a partner integration. When both are required:

```text
mobile client ──► mobile BFF ──┐
web client ────► web BFF ──────┼──► application services ──► domain
partner ───────► public API ───┘
```

Each facade is thin and owns its own representations; the application services are shared.
This costs one small module per consumer and removes the recurring argument about whose
needs shape the payload (`view-and-representation-patterns`).

## Reviewing a remote API

1. How many calls does the client make to render its main screen? More than one per
   interaction is the finding.
2. Is any operation named after a domain method rather than a caller's task?
3. Does any operation contain a business rule?
4. Is any caller-supplied size, depth or page unbounded?
5. Do writes accept an idempotency key, and do repeats replay rather than conflict?
6. Is there one error shape with stable codes?
7. Does any payload type come from the persistence model?
8. Is there a shared DTO library between this service and its callers?
