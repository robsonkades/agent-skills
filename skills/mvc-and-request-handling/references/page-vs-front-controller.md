# Page Controller versus Front Controller

## What you already have

```text
Request
  └── Front Controller (DispatcherServlet / router)
        ├── Filter chain          before routing: sees the raw request
        ├── Handler mapping       chooses the handler
        ├── Interceptors          after routing: knows the handler
        ├── Argument resolvers    build the handler's parameters
        ├── ── HANDLER ──         your Page Controller
        ├── Return value handlers serialise / select a view
        └── Exception resolvers   map exceptions to responses
```

Nobody writes the front controller any more. The decisions that remain are about where each
concern goes in that chain, and they are made wrongly often enough to be worth stating.

## Placing a concern

| Concern                                 | Stage                                   | Why there                                                                 |
| --------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| Correlation id into the logging context | Filter, first                           | Must cover everything, including failures before routing                  |
| Request/response logging, metrics       | Filter                                  | Needs the raw request and the final status                                |
| Authentication                          | Filter (security chain)                 | Before any handler is selected                                            |
| Tenant resolution from host or token    | Filter                                  | Everything downstream depends on it                                       |
| Authorisation based on the handler      | Interceptor / method security           | Needs to know which handler was chosen and its annotations                |
| Feature flag per route                  | Interceptor                             | Same                                                                      |
| "Current user" as a typed parameter     | Argument resolver                       | Removes boilerplate without hiding a decision                             |
| Parsing a custom range or filter header | Argument resolver                       | Same                                                                      |
| Input validation (syntax)               | Bean validation on the request type     | Declarative, one place, produces a consistent error shape                 |
| Exception → response mapping            | One controller advice                   | One error shape for the whole application                                 |
| Response envelope / HATEOAS links       | Return value handler or advice          | Otherwise repeated per handler                                            |
| Transaction demarcation                 | **None of these** — application service | A transaction spanning rendering holds a connection through serialisation |

**Ordering matters and is a frequent source of confusion.** The correlation-id filter must
run before the logging filter, or the first log lines have no id. The security filter chain
must run before anything that reads the principal. An exception thrown in a filter is not
seen by a controller advice — it needs its own handling, which is why an authentication
failure often has a different error shape from every other error unless it is deliberately
aligned.

## A handler doing only its job

```java
@RestController
@RequestMapping("/orders")
class OrderController {

    private final PlaceOrder placeOrder;
    private final OrderQueries queries;

    OrderController(PlaceOrder placeOrder, OrderQueries queries) {
        this.placeOrder = placeOrder;
        this.queries = queries;
    }

    @PostMapping
    ResponseEntity<Void> place(@Valid @RequestBody PlaceOrderRequest request,
                               @CurrentUser Actor actor) {          // argument resolver
        OrderId id = placeOrder.place(request.toCommand(actor));    // one call
        return ResponseEntity.created(URI.create("/orders/" + id.value())).build();
    }

    @GetMapping("/{id}")
    OrderDetailView detail(@PathVariable UUID id) {
        return queries.detail(new OrderId(id))
            .orElseThrow(() -> new OrderNotFound(id));               // advice maps it
    }
}
```

Bind, call, map. No `if` on domain state, no repository write, no `@Transactional`, no
try/catch. The read goes to a query interface rather than the write-side use case, which is
the read/write separation applied at the boundary
(`query-objects-and-specifications`).

## The base controller anti-pattern

```java
abstract class BaseController {
    protected ResponseEntity<?> ok(Object body) { ... }
    protected void audit(String action) { ... }
    protected Actor currentUser() { ... }         // static context lookup
    protected void checkPermission(String p) { ... }
}
```

Inheritance for cross-cutting concerns fails predictably: a handler needing two base classes
cannot have them; the "current user" becomes a static lookup that makes the handler
untestable without the framework; and the audit call must be remembered in every method,
which means it will be forgotten in one.

Each of those concerns has a chain stage that applies it without being remembered. Use them.

## One error shape

```java
@RestControllerAdvice
class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    @ExceptionHandler(OrderNotFound.class)
    ProblemDetail onNotFound(OrderNotFound e) {
        var problem = ProblemDetail.forStatus(HttpStatus.NOT_FOUND);
        problem.setTitle("Order not found");
        problem.setProperty("code", "ORDER_NOT_FOUND");
        problem.setProperty("orderId", e.orderId());
        return problem;
    }

    @ExceptionHandler(OptimisticLockingFailureException.class)
    ProblemDetail onConflict(OptimisticLockingFailureException e) { ... }   // 409
}
```

Three properties worth insisting on: a **stable machine-readable code** (clients must not
parse messages); the same envelope for every error including validation and framework
errors; and no infrastructure detail in the body — a `SQLException` message reaching a
client is both a leak and useless to the caller (`rpc-and-api-contracts`).

## Where controllers accumulate defects

| Smell in a handler                                 | What it means                                                  |
| -------------------------------------------------- | -------------------------------------------------------------- |
| `if` on domain state                               | A business rule in the web layer                               |
| `@Transactional`                                   | The transaction now spans binding and serialisation            |
| A repository call on a write path                  | The use case boundary is missing                               |
| A `try/catch` mapping to a status code             | Duplicates the advice; the next handler will do it differently |
| An entity in the response                          | Schema is now the public contract (`remote-facade-and-dto`)    |
| More than about five parameters                    | The request is a type waiting to be extracted                  |
| A second call to the same service to "get it back" | The use case should return what the caller needs               |
| Building a URL by string concatenation             | Use the framework's URI building; this breaks behind a proxy   |

## The same reasoning off the web

A message consumer and a scheduled job are the same shape: an entry point, shared concerns,
one call into the application.

```java
@Component
class OrderPlacedConsumer {

    private final AllocateStock allocateStock;

    @KafkaListener(topics = "orders")
    void on(OrderPlacedEvent event) {                 // binding
        allocateStock.allocate(event.orderId());       // one call
    }
}
```

The shared concerns — correlation id from the message headers, idempotency by message key,
error handling and retry policy, dead-lettering — belong in the container's configuration or
an interceptor, not in each listener. Teams that get this right for HTTP frequently
re-implement it badly per listener, and the result is a consumer that is retried without
being idempotent (`idempotency`, `delivery-semantics`).
