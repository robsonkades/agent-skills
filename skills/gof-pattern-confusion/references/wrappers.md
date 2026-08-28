# The four wrappers

Adapter, Decorator, Proxy and Facade can all be written as "a class holding another class and
forwarding". What differs is intent, and intent has observable consequences.

## The same shape, four ways

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

// PROXY — same interface; access controlled; the caller cannot reach the subject
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

2. How many objects does it hold, and did you design them?
     one, foreign      → Adapter
     one, yours        → probably an unfinished refactoring; consider
                         deleting it (gof-adapter)
     several, yours    → Facade
     several, foreign  → an anti-corruption layer built from adapters

3. Could two of them be stacked meaningfully?
     yes, and order changes behaviour  → Decorator
     no; it decides whether you reach
       the subject at all              → Proxy
```

Question 3's second branch is the reliable Proxy tell. A lazy loader, a security check and a
remote stub all answer "no": stacking two lazy loaders is meaningless, and the caller's belief that
it holds the real object is the point.

## Ownership and reachability

| Question                                             | Adapter        | Decorator     | Proxy                              | Facade                |
| ---------------------------------------------------- | -------------- | ------------- | ---------------------------------- | --------------------- |
| Can the caller reach the wrapped object another way? | Usually yes    | Usually yes   | **Usually no**                     | Yes (classically)     |
| Who decides the wrapper exists?                      | The integrator | Whoever wires | The subject's owner or a framework | The subsystem's owner |
| Does it manage the wrapped object's lifecycle?       | No             | No            | Often                              | No                    |
| Does it change the interface?                        | **Yes**        | No            | No                                 | Yes, coarser          |
| Is the wrapped type foreign?                         | **Yes**        | No            | Either                             | No                    |

The first row is the practical difference in review. If a protection "decorator" can be bypassed
because the subject is also a bean, it is not enforcing anything — the check is advisory
(`gof-proxy`).

## The composed case

Real outbound clients are usually all four at once:

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
- The lazy layer is a **proxy**: nobody else holds the real gateway, and it decides when it is
  created.
- The Stripe layer is an **adapter**: it is where `StripeException` stops.
- `Checkout` is a **facade**: coarse, sequencing several collaborators.

## Common misclassifications and what they cost

**"Decorator" that changes the interface.** It is an Adapter, and calling it a decorator implies it
can be stacked — someone will try, and the types will not compose. Cost: a wasted refactoring
attempt, and a wrong mental model of where foreign types stop.

**"Adapter" that wraps your own type and renames its methods.** Usually an unfinished refactoring.
Cost: a file, a stack frame and a layer readers must trace through for no translation. Delete it,
unless it exists to bound a foreign model — for an external dependency, a one-implementation port
does earn its place (`gof-adapter`).

**"Proxy" that is stacked three deep.** If they stack and the order matters, they are decorators.
Cost: the ordering question — retry outside or inside the timeout — never gets asked, because
nobody thinks of a proxy as having an order (`gof-decorator`).

**"Facade" invoked by its own collaborators.** It is a Mediator. Cost: it will accumulate the
participants' interaction rules and become a god object, and nobody will see it coming because a
facade is expected to stay thin (`gof-mediator`).

**"Facade" over a single collaborator.** A wrapper. Cost: indirection with no coupling reduction.

**"Adapter" containing business rules.** The rules are in the boundary layer where nobody looks for
them, and they will be lost when the vendor is replaced. The test: would the rule still be true
after swapping the vendor? Then it does not belong in the vendor's adapter.

## Framework wrappers are the same four

| Framework thing                         | Which pattern                                                    |
| --------------------------------------- | ---------------------------------------------------------------- |
| `@Transactional` / `@Cacheable` proxy   | Proxy — the caller cannot reach the target through the container |
| Servlet `Filter`, `HandlerInterceptor`  | Decorator (a pipeline), ordered explicitly                       |
| `RestClient` interceptors               | Decorator                                                        |
| Hibernate lazy association              | Proxy — virtual                                                  |
| A Spring Data repository implementation | Adapter over JDBC/JPA, generated                                 |
| An application service                  | Facade                                                           |

Knowing which is which explains the failure modes: proxies bring self-invocation and `instanceof`
problems; decorators bring ordering questions; adapters bring translation duties; facades bring
transaction-boundary decisions.
