# Gateway contracts and placement

Read when adding or changing a gateway method, preserving package conventions, or
translating persistence outcomes. A domain gateway can represent persistence or an
external capability; this skill addresses the aggregate persistence role.

## Preserve the family's dependency direction

The reference project's category slice uses these names:

```text
domain.category
  Category, CategoryID, CategoryGateway
application.category.create
  CreateCategoryUseCase, DefaultCreateCategoryUseCase
infrastructure.category
  CategoryMySQLGateway
infrastructure.category.persistence
  CategoryJpaEntity, CategoryRepository
```

The service foundation's alternative convention uses
`domain.order.OrderGateway`, `infrastructure.order.gateway.OrderGatewayImpl`, and
`infrastructure.order.gateway.persistence.OrderJpaEntity`/`OrderJpaRepository`.
These are alternatives within the family; copying a sample is not authorization
to rename an existing layout. Infrastructure depends on the domain/application;
the domain/application must not import the implementation or Spring Data API.

The existing reference gateway separates creation and update. This abbreviated
Java 17-compatible shape illustrates that contract; `Category` and `CategoryID`
are existing project types and additional query methods are omitted:

```java
package com.example.domain.category;

import java.util.Optional;

public interface CategoryGateway {
    Category create(final Category category);
    Category update(final Category category);
    Optional<Category> findById(final CategoryID id);
}
```

Keep `final` parameters/dependencies and established nullability annotations or
null-marked scopes. `Optional` means an absent result, never a null `Optional`.
Annotate according to the target's existing JSpecify setup when applicable; do not
add that dependency merely to reproduce an example. Infrastructure mapping classes
may follow provider proxy/constructor requirements rather than a blanket final-class
rule.

## Make each method's promise executable

For `create`, distinguish a generated new identity from an already-known identity
being retried. An ID collision or duplicate natural key must not silently overwrite
another aggregate. For `update`, carry the observed revision through the mapping;
missing and stale are different conditions even if both prevent an update.

Method names do not enforce this distinction: the reference `CategoryMySQLGateway`
delegates both methods to the same `repository.save`, mapping an assigned ID without
a version field. In [Spring Data JPA 2.7.7](https://docs.spring.io/spring-data/jpa/docs/2.7.7/reference/html/#jpa.entity-persistence.saving-entites),
`save` selects `persist` or `merge` from entity newness, normally inspecting a nullable
version before the ID; `Persistable` can override that decision. A non-null ID does
not prove the row exists. A mapper that drops the loaded version or resets an
`isNew` flag can select the wrong path. Inspect the target's actual policy. For
strict creation, use an insert-only path that rejects identity collisions; for
update-only semantics, use an existing-row/version-conditional write or a verified
managed-entity protocol. An `exists` check followed by `save` cannot close the race.
Test both contracts through commit with the actual provider.

For a single `save` port, specify new/existing detection and whether upsert is
actually intended. Preserve a returned aggregate or persistence receipt when IDs or
revision become known during persistence. Define when a final version is available:
do not promise a post-commit token from a method that returns before flush/commit.
The caller's original object and the returned persisted representation need not be
the same instance. Do not introduce a persistence ID if business ID is already the
established primary key.

Business transitions belong to the root: load, call `category.deactivate()`, then
request persistence. A gateway method called `deactivateEligibleCategories` is
suspicious if eligibility, state transitions and domain events live only in its SQL.
A deliberate bulk protocol must preserve those rules and the concurrency contract;
name and test the trade-off rather than treating it as an ordinary aggregate save.

When multitenancy applies, derive scope from trusted application context and include
it in lookup, update, delete and unique-key predicates. Check that the aggregate's
tenant agrees with that scope. A globally unique ID does not itself authorize access.
Whether out-of-scope access appears absent is an application security decision; a
database outage is never evidence of absence.

## Absence and failures

| Condition                                                                | Port/application meaning                                                           |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| No identity visible in the requested scope                               | Defined absence; caller decides whether that is an error                           |
| Stale persisted revision                                                 | Concurrent modification; do not replace it with absence or automatically overwrite |
| Known natural-key constraint violated                                    | Defined duplicate business identity outcome                                        |
| Connection failure or timeout                                            | Storage unavailable or outcome uncertain; preserve cause for diagnostics           |
| Invalid persisted enum, missing required state or inconsistent ownership | Reconstitution/data-integrity failure; do not fabricate defaults                   |

Translate only failures whose cause is established. A general integrity exception
can represent many constraints; classify a duplicate only from the relevant known
constraint. The infrastructure transaction boundary may need to translate failures
raised after a gateway method returns. A timeout during commit may leave outcome
unknown; do not tell the caller that nothing was saved without evidence.

## Queries have their own shape

An aggregate-returning query must provide the state required for legitimate domain
behavior. A summary list should return a read model if that avoids needless loading.
Place such a port in the application when it serves a screen/report and returns an
application projection. Reuse established domain `SearchQuery`/`Pagination` types
when appropriate; avoid exposing framework `Pageable` to preserve independence.

Read replicas and asynchronous projections need an explicit freshness contract.
Do not use a stale projection to authorize a write or enforce a current aggregate
invariant. For multi-query loads, a transaction alone does not establish a snapshot:
verify the database isolation or the chosen version/locking protocol.
