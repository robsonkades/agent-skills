# The four wrappers

Adapter, Decorator, Proxy and Facade can all be written as "a class holding another class and
forwarding". What differs is intent, and intent has observable consequences.

## The same shape, four ways

Partial Java 17 shape sketches, not executable SDK integrations: constructors, mappings, return
bodies and lazy initialization are omitted. Inspect actual project SDK/framework versions.
Payment retry requires an outcome-aware idempotency contract and bounded deadline/attempts;
volatile alone does not make lazy initialization once-only. Use the specialist skills to implement.
For repeated payment effects, `idempotency` owns the effect contract; a retrying wrapper does not
establish repeat safety or resolve an earlier unknown outcome by its shape.

```java
// ADAPTER — different interface; the foreign type stops here
public final class StripeGateway implements PaymentGateway {     // your interface
    private final StripeClient stripe;                            // their type
    public Authorisation authorise(Payment p) {
        try { return toAuthorisation(stripe.charges().create(toRequest(p))); }
        catch (StripeException e) { throw new PaymentGatewayFailure(p.id(), e); }
    }
}

// DECORATOR — same interface; behaviour added; stackable, order matters
public final class RetryingGateway implements PaymentGateway {
    private final PaymentGateway delegate;                        // same type
    public Authorisation authorise(Payment p) { /* retry loop around delegate */ }
}

// PROXY — same interface; controls lazy creation; audit other paths to the subject
public final class LazyGateway implements PaymentGateway {
    private final Supplier<PaymentGateway> factory;
    private volatile PaymentGateway target;                       // created on demand
    public Authorisation authorise(Payment p) { return target().authorise(p); }
}

// FACADE — new, coarser interface; several collaborators, all yours
public final class Checkout {
    private final PaymentGateway payments;
    private final StockReservation stock;
    private final OrderRepository orders;
    public OrderId place(BasketId id) { /* sequences all three */ }
}
```

## Classifying an existing wrapper in three questions

```text
1. Is its interface the same as the wrapped type's?
     no  → 2
     yes → 3

2. What incompatibility or complexity does it hide?
     translates collaborator API/semantics → Adapter
     presents a simpler subsystem entry   → Facade
     both                                 → describe both roles

3. What responsibility does it own?
     adds behavior around a component → Decorator
     controls access/lifecycle/location → Proxy
     either may compose; inspect order and bypass paths
```

Object count and authorship are not discriminators: an adapter can bridge your own legacy API,
and a facade can simplify one complex foreign service. Proxies can stack; inspect which contract
each layer preserves and what happens when a layer short-circuits or fails.

## Ownership and reachability

| Review question                   | Evidence to inspect                                                    |
| --------------------------------- | ---------------------------------------------------------------------- |
| Can protected access be bypassed? | Actual exposed references and caller trust, not the pattern label      |
| Who owns lifecycle?               | Acquisition, initialization, close and failure contracts of each layer |
| What interface is preserved?      | Client-facing operations, results and failures; helper APIs may differ |
| What is translated or simplified? | Mapping and workflow code, regardless of collaborator count/authorship |

These are common arrangements, not guarantees from pattern names. Establish lifecycle ownership
explicitly. If an untrusted caller can bypass a protection wrapper through another reference,
the wrapper does not enforce that boundary; an internal trusted reference alone is not proof
(`gof-proxy`).

## The composed case

An outbound design can compose these roles when each responsibility is needed:

```java
PaymentGateway gateway =
    new MetricsGateway(meters,                  // Decorator
      new RetryingGateway(policy,               // Decorator
        new LazyGateway(() ->                   // Proxy
          new StripeGateway(stripeClient))));   // Adapter

Checkout checkout = new Checkout(gateway, stock, orders);   // Facade
```

Describe it in those terms rather than calling the whole stack "the payment wrapper". Each layer's
name tells a reader what to expect:

- The metrics and retry layers are **stackable** and their order carries meaning
  (`gof-decorator`).
- The lazy layer is a **proxy**: it decides when to obtain the gateway. The factory's implementation
  determines whether other references exist; the sketch does not prove exclusive access.
- The Stripe layer is an **adapter**: it is where `StripeException` stops.
- `Checkout` is a **facade**: coarse, sequencing several collaborators.

## Common misclassifications and what they cost

**"Decorator" that does not preserve the component contract.** Inspect whether it instead
translates an API or simplifies a subsystem. Extra helper methods alone do not break conformity;
verify the client-facing contract before promising stackability.

**"Adapter" over your own type.** Valid for incompatible legacy/versioned contracts. Remove only
when it performs no useful translation or boundary role and callers/public contracts permit it
(`gof-adapter`).

**"Proxy" stacked three deep.** Can remain a proxy stack, possibly with decorator duties.
Check ordering, such as authorization before caching and retry within a total deadline;
stackability alone does not rename the layers (`gof-decorator`).

**"Facade" invoked by collaborators.** A callback alone does not establish mediation. If it owns
their interaction protocol, identify and bound that additional role (`gof-mediator`).

**"Facade" over one collaborator.** Useful if that collaborator is a complex subsystem and the
facade supplies a stable, simpler contract; count does not measure coupling reduction.

**"Adapter" containing business rules.** A vendor-independent invariant hidden in translation can
be lost when the vendor changes. Identify its domain/application owner; invoking that owner's
validation from an adapter can be legitimate. Vendor-specific mapping rules belong at this
boundary. Judge ownership and callers before moving code.

## Framework wrappers are the same four

| Framework thing                         | Which pattern                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `@Transactional` / `@Cacheable` proxy   | Proxy-based advice when enabled; self-invocation can bypass it               |
| Servlet `Filter`, `HandlerInterceptor`  | Ordered processing chain; may stop continuation                              |
| `RestClient` interceptors               | Continuation chain; may also wrap requests/responses or add decorator duties |
| Hibernate lazy association              | Proxy or bytecode enhancement; inspect mapping/runtime                       |
| A Spring Data repository implementation | Repository abstraction; may combine proxy, adapter and query implementation  |
| An application service                  | May expose a facade; inspect actual responsibilities                         |

Use the role to choose a contract check, not to infer a failure: advice reachability depends on
the actual proxy/weaving mechanism; type checks depend on interface versus subclass proxying.
Wrapping raises ordering questions, translation raises mapping duties, and a facade's workflow
raises transaction/partial-effect questions without supplying atomicity.

Verify the actual mechanism: [Spring AOP proxying](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html)
documents self-invocation bypass for proxy advice (AspectJ weaving differs).
[Jakarta Servlet 6 Filter](https://jakarta.ee/specifications/servlet/6.0/apidocs/jakarta.servlet/jakarta/servlet/filter)
can invoke the chain or block it; do not infer that every layer must run from a decorator label.
Likewise [Spring 6.1.21 ClientHttpRequestInterceptor](https://docs.spring.io/spring-framework/docs/6.1.21/javadoc-api/org/springframework/http/client/ClientHttpRequestInterceptor.html)
may forward or block execution and wrap a response. If it throws after receiving a response, it
must close that response. Inspect the project's actual version and continuation contract.
