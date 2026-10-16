# Submission slice

Read when implementing the use-case contract or separating it from transport and
persistence models. This is an illustrative Java 17 API slice, not a complete
application or evidence extracted from a target repository. Each public type below
belongs in its own same-named file. The domain and access collaborators are contracts
described after the code; they must be implemented and tested in the target.

Assumed requirement: submit an existing draft order for the trusted tenant, if the
actor can submit it and the client's observed version is still current. An empty,
cancelled or already submitted order is rejected by the aggregate. A repeated
submission is not defined as successful replay in this example.

```java
package com.example.application;

public abstract class UseCase<C, O> {
    public abstract O execute(final C command);
}
```

```java
package com.example.application.order.submit;

import com.example.application.UseCase;

public sealed abstract class SubmitOrderUseCase
        extends UseCase<SubmitOrderCommand, SubmitOrderOutput>
        permits DefaultSubmitOrderUseCase {
}
```

```java
package com.example.application.order.submit;

import java.util.Objects;

public record SubmitOrderCommand(String orderId, long expectedVersion) {
    public SubmitOrderCommand {
        Objects.requireNonNull(orderId, "orderId");
        if (expectedVersion < 0) {
            throw new IllegalArgumentException("expectedVersion must be nonnegative");
        }
    }

    public static SubmitOrderCommand with(final String orderId, final long expectedVersion) {
        return new SubmitOrderCommand(orderId, expectedVersion);
    }
}
```

```java
package com.example.application.order.submit;

import com.example.domain.order.Order;

public record SubmitOrderOutput(String orderId, String status, long version) {
    public static SubmitOrderOutput from(final Order order) {
        return new SubmitOrderOutput(
                order.getId().getValue(), order.getStatus().name(), order.getVersion());
    }
}
```

```java
package com.example.application.order.submit;

import com.example.application.ActorContextProvider;
import com.example.application.NotFoundException;
import com.example.domain.order.OrderGateway;
import com.example.domain.order.OrderID;
import com.example.domain.order.StaleOrderException;
import java.util.Objects;

public non-sealed class DefaultSubmitOrderUseCase extends SubmitOrderUseCase {

    private final OrderGateway orderGateway;
    private final ActorContextProvider actorContextProvider;
    private final SubmitOrderAccess submitOrderAccess;

    public DefaultSubmitOrderUseCase(
            final OrderGateway orderGateway,
            final ActorContextProvider actorContextProvider,
            final SubmitOrderAccess submitOrderAccess) {
        this.orderGateway = Objects.requireNonNull(orderGateway);
        this.actorContextProvider = Objects.requireNonNull(actorContextProvider);
        this.submitOrderAccess = Objects.requireNonNull(submitOrderAccess);
    }

    @Override
    public SubmitOrderOutput execute(final SubmitOrderCommand command) {
        Objects.requireNonNull(command, "command");
        final var actor = actorContextProvider.current();
        submitOrderAccess.requireActionAllowed(actor);

        final var orderId = OrderID.from(command.orderId());
        final var order = orderGateway.findById(actor.tenantId(), orderId)
                .orElseThrow(() -> new NotFoundException("Order not available"));

        submitOrderAccess.requireResourceAllowed(actor, order);
        if (order.getVersion() != command.expectedVersion()) {
            throw new StaleOrderException("Order has changed");
        }

        order.submit();
        final var saved = orderGateway.update(order, command.expectedVersion());
        return SubmitOrderOutput.from(saved);
    }
}
```

## Contracts that make this code meaningful

`ActorContextProvider` is an application-owned port returning an immutable actor and
tenant context for this invocation, or a typed unauthenticated failure. The trusted
entry adapter supplies it; JSON fields never supply roles or override its scope. If
the context uses thread-local storage, the adapter owns propagation and cleanup for
async tasks and pooled threads. An explicit trusted parameter is a suitable existing
alternative; it is not a second caller-controlled tenant field in the command.

`SubmitOrderAccess`, in the use-case package here, defines
`requireActionAllowed(actor)` and `requireResourceAllowed(actor, order)`. They reject
without writes and implement the target's policy. A real policy can delegate a
business decision to a domain service. This example does not invent roles, ownership
rules or a permission database; if their facts can change concurrently, the unit of
work must protect the required decision consistency.

`OrderGateway`, in `domain.order`, exposes this conceptual domain port:

```java
package com.example.domain.order;

import com.example.domain.tenant.TenantID;
import java.util.Optional;

public interface OrderGateway {
    Optional<Order> findById(final TenantID tenantId, final OrderID orderId);

    Order update(final Order order, final long expectedVersion);
}
```

The repository must already have `OrderID`, `TenantID` and `Order`, or design those
types for its own language. `Order` carries an immutable tenant identity and exposes
the ID, version and status accessors used above. `update` conditionally updates the
same tenant and order only if the stored version matches, increments the version and
returns the new in-memory snapshot. A zero-row conditional update is a typed conflict
or another documented non-disclosing result, never an insertion. A deletion after
load must not recreate the order. The adapter translates persistence errors to the
port's documented failure contract without leaking SQL exceptions inward.

The early version comparison produces a prompt conflict; only the conditional write
closes the race after the read. With a database transaction, `update` may return before
commit. The external caller receives confirmed success only after the owning
transaction commits; an internal caller's result can still be provisional. On failure,
discard this invocation's mutated aggregate, then distinguish rollback, unknown
completion and failure after commit as described in [atomic outcomes](atomic-outcomes.md).
Discarding the object does not undo committed storage. A fake gateway returning
its stored object by reference would violate that expectation and give misleading
rollback tests.

`Order.submit()` owns the invariant and transition. It must reject an invalid draft
without partially changing aggregate state. Neither the use case nor its gateway
may set the status directly to evade those checks. `NotFoundException` is an
application failure; `StaleOrderException` represents the inner port's conflict
contract. They are illustrative typed runtime exceptions, not prescribed public
error names. Adapt to the project's existing result/error strategy.

## Why the hierarchy is conditional

The catalog reference's `application.castmember.create.CreateCastMemberUseCase`
and `DefaultCreateCastMemberUseCase` demonstrate sealed/non-sealed contracts;
`application.category.create.CreateCategoryUseCase` and its default implementation
demonstrate plain abstract/concrete contracts. Both use `<Action>Output` records.
The installed foundation's `SubmitOrderCommandOutput` is an alternative naming
convention, not the suffix observed in those catalog classes.

The reference provides an outer `infrastructure.configuration.usecases.CategoryUseCaseConfig`
that constructs implementations through `@Bean` methods, leaving those classes free
of Spring annotations. That is evidence of composition placement, not proof of
transaction or authorization behavior. Its `DefaultListCategoriesUseCase` uses a
domain-owned `SearchQuery` and `Pagination`, not Spring Data types. A projection port
is a justified option when reads need a different shape, not a claim that this
reference already uses one.

The sealed contract preserves this family's selected vocabulary; it is not a DDD
requirement. The implementation is `non-sealed` in the illustrated family so it
does not close further subclassing. Other projects deliberately make it `final` or
use a plain interface. Match the target's extension policy, and test the effective
outer wiring before changing it. The language restrictions are specified in
[JLS 17, sealed, non-sealed and final classes](https://docs.oracle.com/javase/specs/jls/se17/html/jls-8.html#jls-8.1.1.2).

An infrastructure wrapper cannot arbitrarily extend the sealed contract: direct
subclasses must be permitted and satisfy the module/package restrictions. Prefer
composition at the outer entry boundary when compatible with the existing API;
an infrastructure facade can hold a `SubmitOrderUseCase` delegate and invoke it
within the unit of work. Do not add an inward dependency on that facade to satisfy
a `permits` list. A generic `UseCase<C, O>` reference or an existing interface can
be a useful seam, but do not introduce type-erased dispatch just to retain a diagram.

## Changes that would require a different slice

- For `CreateOrder`, invoke a domain factory deliberately and use storage-enforced
  identity uniqueness. Do not reuse the submission method's absence fallback.
- If the operation accepts asynchronous work, return a durable operation ID and
  accepted state, not a fictional submitted aggregate state.
- For `ListOrders`, a projection gateway can return immutable rows directly. Define
  tenant scope, limits, sort and staleness without reconstructing every order.
- For replay-safe submission, add the request identity and atomic replay protocol
  from [atomic outcomes](atomic-outcomes.md); `submit()` accepting any already
  submitted order would not prove that this request produced the prior outcome.

The snippet intentionally omits a transaction implementation, HTTP mappings, domain
implementation, persistence adapter and executable test harness. Compile it only
after providing those contracts in the target or an isolated fixture; compilation
alone cannot prove the tenant, conflict or commit guarantees described here.
