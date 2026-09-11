# Page Controller versus Front Controller

## What you already have

```text
Request
  └── Servlet filter chain        wraps servlet dispatch
      └── DispatcherServlet       Front Controller for its mapped requests
        ├── Handler mapping       chooses the handler
        ├── Interceptors          after routing: knows the handler
        ├── Argument resolvers    build the handler's parameters
        ├── ── HANDLER ──         your Page Controller
        ├── Return value handlers serialise / select a view
        └── Exception resolvers   map exceptions to responses
```

Framework users usually configure the front controller. The decisions here are about where each
concern goes in that chain, and they are made wrongly often enough to be worth stating.

## Placing a concern

| Concern                                 | Stage                                              | Why there                                                                                      |
| --------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Correlation id into the logging context | Early filter before logs that need the id          | Cover configured routes/dispatches; validate or replace untrusted ids                          |
| Request/response logging, metrics       | Filter plus async completion lifecycle             | Raw dispatch timing and final response completion are different events                         |
| Authentication                          | Filter (security chain)                            | Before any handler is selected                                                                 |
| Tenant resolution from host or token    | Stage with required validated host/identity data   | Authenticate before trusting identity-derived tenant authority                                 |
| Authorisation based on the operation    | Enabled method security, plus request security     | Protect the operation; MVC interceptors can have path-matching gaps                            |
| Feature flag per route                  | Interceptor                                        | Sees handler metadata; do not substitute a flag for authorization                              |
| "Current user" as a typed parameter     | Argument resolver                                  | Removes boilerplate without hiding a decision                                                  |
| Parsing a custom range or filter header | Argument resolver                                  | Same                                                                                           |
| Input validation (syntax)               | Bean validation on the request type                | Declarative, one place, produces a consistent error shape                                      |
| Exception → response mapping            | MVC advice plus filter/security handlers           | Advice does not automatically catch failures outside MVC                                       |
| Response envelope / HATEOAS links       | Return value handler or advice                     | Otherwise repeated per handler                                                                 |
| Transaction demarcation                 | Boundary owning the required application operation | Trace actual transaction/proxy and resource lifetime; avoid unintended scope through rendering |

**Ordering matters and is a frequent source of confusion.** The correlation-id filter must
run before log statements that rely on that id. Identity-dependent policy must run after its
required authentication/context stage. A tentative host/tenant hint may select an authentication
realm, but does not authorize tenant access. Inspect actual security-chain matchers and filter
registration; a filter does not automatically cover every route or dispatch. An exception thrown in a filter is not
seen by a controller advice — it needs its own handling, which is why an authentication
failure often has a different error shape from every other error unless it is deliberately
aligned.

For async requests, a filter returning does not mean the response is complete. Configure
REQUEST/ASYNC/ERROR dispatch coverage deliberately, restore logging context in `finally`,
and propagate it explicitly across thread changes. Measure completion through the supported
async lifecycle, avoiding duplicate observations on redispatch. A tenant from an untrusted
header is a claim, not authorization to access that tenant.

## A handler doing only its job

Partial Spring MVC snippets: imports, request/application types and configured resolvers
are omitted. The error example uses Spring 6+ `ProblemDetail`.

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
        OrderId id = placeOrder.place(request.toCommand(actor));    // use-case transition
        return ResponseEntity.created(URI.create("/orders/" + id.value())).build();
    }

    @GetMapping("/{id}")
    OrderDetailView detail(@PathVariable UUID id) {
        return queries.detail(new OrderId(id))
            .orElseThrow(() -> new OrderNotFound(id));               // advice maps it
    }
}
```

This example delegates mutation policy and its transaction to `PlaceOrder`; its read uses a
query interface rather than the write-side use case. Call count and syntax alone do not prove
the boundary: check atomicity, authorization, failure outcomes and required read consistency
before changing an adequate handler. The separate query interface follows
`query-objects-and-specifications`.

## The base controller anti-pattern

```java
abstract class BaseController {
    protected ResponseEntity<?> ok(Object body) { ... }
    protected void audit(String action) { ... }
    protected Actor currentUser() { ... }         // static context lookup
    protected void checkPermission(String p) { ... }
}
```

This design risks independently varying policies competing for Java's single base class,
hidden context dependencies and manually omitted audit calls. Verify those problems in the
actual contract; a small tested base class with a pure response helper can be adequate.

Use chain stages or composed collaborators when they preserve required data, ordering and
coverage. Transport logging can be shared in a filter; a business audit or resource permission
check may need the application operation and its outcome, including non-HTTP callers.
Moving it into an HTTP-only chain does not preserve that contract automatically.

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

| Smell in a handler                                 | What it means                                                                                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `if` on domain state                               | Trace whether it enforces business legality or merely chooses a presentation response                                                       |
| `@Transactional`                                   | Inspect the proxy boundary: normally the handler invocation, not MVC binding or later serialization; move use-case ownership when needed    |
| A repository call on a write path                  | Trace transaction, invariant, authorization and caller coverage; extract coordination only when the actual boundary is missing              |
| A `try/catch` mapping to a status code             | Check for duplicated generic mapping; operation-specific recovery may belong locally                                                        |
| An entity in the response                          | Serialized entity properties may become public contract; column names are not automatically JSON names (`remote-facade-and-dto`)            |
| Several related request values                     | Consider a cohesive request type for shared validation; framework context and independent inputs need not be wrapped due to parameter count |
| A second call to the same service to "get it back" | Compare required snapshot/authorization semantics and call cost; an intentional separate query may be correct                               |
| Building a URL by string concatenation             | Check escaping, context path and external prefix; URI builders still require trusted proxy configuration                                    |

## The same reasoning off the web

A message consumer and a scheduled job are the same shape: an entry point, shared concerns,
delegation to the application operation. Call count alone does not define that operation.

Partial listener sketch: imports, event/application types and listener security, transaction,
acknowledgement and retry configuration are omitted. Constructor injection is shown explicitly.

```java
@Component
class OrderPlacedConsumer {

    private final AllocateStock allocateStock;

    OrderPlacedConsumer(AllocateStock allocateStock) {
        this.allocateStock = allocateStock;
    }

    @KafkaListener(topics = "orders")
    void on(OrderPlacedEvent event) {                 // binding
        allocateStock.allocate(event.orderId());       // delegated operation
    }
}
```

Shared transport concerns — correlation, error handling, retry policy and dead-lettering —
often belong in the container or an interceptor. Business idempotency still needs a stable
operation identity (not necessarily the partition key) and an atomic relation to its effects;
container retries alone cannot provide it. Teams that get this right for HTTP frequently
re-implement it badly per listener, and the result is a consumer that is retried without
being idempotent (`idempotency`, `delivery-semantics`).

## Primary contracts

- [Spring MVC 6.2.7 interception](https://github.com/spring-projects/spring-framework/blob/v6.2.7/framework-docs/modules/ROOT/pages/web/webmvc/mvc-servlet/handlermapping-interceptor.adoc): interceptor security limitations.
- [Spring 6.2.7 declarative transactions](https://github.com/spring-projects/spring-framework/blob/v6.2.7/framework-docs/modules/ROOT/pages/data-access/transaction/declarative/tx-decl-explained.adoc): advice around method invocation; an outer transaction can extend that scope.
- [Spring MVC 6.2.7 asynchronous requests](https://github.com/spring-projects/spring-framework/blob/v6.2.7/framework-docs/modules/ROOT/pages/web/webmvc/mvc-ann-async.adoc): dispatch and completion lifecycle.
- [ProblemDetail 6.2 API](https://docs.spring.io/spring-framework/docs/6.2.18/javadoc-api/org/springframework/http/ProblemDetail.html): available since 6.0.
- [Spring Security 6.5.0 filter architecture](https://github.com/spring-projects/spring-security/blob/6.5.0/docs/modules/ROOT/pages/servlet/architecture.adoc): matcher coverage and prerequisite-based filter placement.
- [Jakarta Servlet 6.0 AsyncListener](https://jakarta.ee/specifications/servlet/6.0/apidocs/jakarta.servlet/jakarta/servlet/AsyncListener.html): completion/error/timeout and new async-cycle notifications.
