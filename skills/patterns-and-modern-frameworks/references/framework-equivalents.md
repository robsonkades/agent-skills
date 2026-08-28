# What the Framework Already Provides

## Provided completely

### Front Controller → `DispatcherServlet`

Routing, handler selection, argument resolution, return-value handling and exception
resolution. Hand-rolling any of it produces a worse version.

**What remains yours:** which concern goes at which stage of the chain
(`mvc-and-request-handling`).

**Wrapper to avoid:** a `BaseController` holding cross-cutting helpers. Every one of those
concerns has a chain stage that applies it without being remembered.

### Unit of Work → the persistence context

Change tracking, ordered flush, one commit.

**The gap that matters:** its scope is the **transaction**, not the request and not the use
case. Two `REQUIRES_NEW` calls are two units of work; a detached entity is in none.

**Wrapper to avoid:** a hand-written "unit of work" collecting changes and applying them at
the end. It duplicates the persistence context, and the two will disagree about flush order.

### Identity Map → the first-level cache

One instance per row per persistence context. Repeated loads are free and aliasing is safe.

**The gap that matters:** it is **not a cache**. It dies with the transaction, it is not
shared between threads, and it is not invalidated by a bulk statement — after a bulk update,
the map holds stale objects until cleared (`orm-behavioral-patterns`).

**Wrapper to avoid:** a request-scoped map of loaded entities "to avoid reloading". Inside a
transaction it is redundant; outside one it holds detached objects with dead proxies.

### Lazy Load → ORM proxies

**The gap that matters:** the fetch happens at a getter, may occur outside the boundary, and
occurs once per row in a loop. The pattern is provided; the **fetch strategy is a decision
per use case** and the framework's default is not one.

### Metadata Mapping → annotations and `orm.xml`

**The gap that matters:** the metadata is not validated against the schema unless you ask —
`ddl-auto: validate` (`metadata-mapping`).

### Plugin → conditional bean registration

`@ConditionalOnProperty` and profiles implement selection at configuration time.

**The gap that matters:** a misconfigured value should fail at startup. A conditional that
silently leaves no bean, or falls back to a default, is how the wrong implementation reaches
production.

### Registry → the application context

Used well, it is dependency injection and the pattern's costs disappear. Used as
`context.getBean()` inside business code, it is the classical Registry with all of them
(`enterprise-base-patterns`).

## Provided partially — mechanism yes, decision no

### Repository → Spring Data

**Provided:** the implementation, derived queries, paging, specifications.

**Not provided, and it is the entire pattern:**

- which aggregates exist and where their boundaries are;
- that there is one repository per aggregate root, not one per table;
- what the published surface is — `extends JpaRepository` publishes ~20 methods including
  `deleteAll()`;
- that reads for screens do not go through it;
- that the interface speaks the domain's language.

```java
// Framework's answer — a complete implementation of nothing you decided.
interface OrderRepository extends JpaRepository<Order, Long> { }

// Your decision: the surface, in your language, over one aggregate root.
public interface Orders {
    Optional<Order> byId(OrderId id);
    List<Order> overdueFor(CustomerId customer, LocalDate asOf);
    Order save(Order order);
    OrderId nextIdentity();
}
```

**Wrapper to avoid:** a hand-written interface whose methods are identical to Spring Data's.
Narrowing is a justification; renaming is not (`repository-pattern`).

### Service Layer → `@Transactional`

**Provided:** declarative demarcation, propagation, rollback rules.

**Not provided:** what a use case is; where the boundary belongs; that it is demarcated once
per use case; what happens at a non-transactional edge.

**Gaps that cause incidents:** self-invocation silently skips the proxy; checked exceptions
do not roll back by default; `@Transactional` on a repository gives one transaction per
query (`enterprise-transactions`).

### Optimistic Offline Lock → `@Version`

**Provided:** the version column, the `WHERE` clause, the exception.

**Not provided:** the version reaching the client and coming back (without it, the check
compares the row to itself); the conflict's presentation; whether a retry is safe; and
protection against bulk statements, which bypass it entirely
(`offline-concurrency-control`).

### Data Mapper → JPA

**Provided:** the mapping engine.

**Not provided:** whether the domain model is allowed to diverge from the schema. Annotating
domain classes gives Data Mapper's runtime services with Active Record's coupling — a
legitimate middle ground that should be a recorded decision rather than a default
(`data-source-patterns`).

### Caching → the caching abstraction

**Provided:** `@Cacheable`, `@CacheEvict`, a pluggable store.

**Not provided:** whether to cache at all, the TTL, the size bound, stampede protection,
invalidation across instances, and the rule against caching entities
(`caching-strategies`).

**Gap that surprises:** `@Cacheable` is proxy-based, so a call from within the same bean does
not consult the cache — the same self-invocation trap as `@Transactional`.

## Not provided at all

| Pattern                      | Why a framework cannot supply it                                            |
| ---------------------------- | --------------------------------------------------------------------------- |
| Domain Model organisation    | It is your business; no framework knows your invariants                     |
| Aggregate boundaries         | Same; and this decision drives locking, transactions and performance        |
| Remote Facade granularity    | Depends on your callers' interactions                                       |
| Pessimistic Offline Lock     | Spans requests; no transaction can carry it (`offline-concurrency-control`) |
| Coarse-Grained Lock scope    | Follows the invariant, which is yours                                       |
| Application Controller flow  | Your process                                                                |
| Session state placement      | A trade-off between your requirements                                       |
| Distribution boundaries      | Organisational and operational, not technical                               |
| Saga and compensation design | Business semantics of "undo"                                                |

This table is the answer to "do we still need to know the patterns?". Everything in it is a
decision, and every one of them is more expensive to get wrong than anything the framework
provides.

## Patterns absorbed, not refuted

| Pattern              | Modern form                                                           |
| -------------------- | --------------------------------------------------------------------- |
| Table Data Gateway   | A `JdbcClient` repository holding a table's SQL — alive and useful    |
| Row Data Gateway     | A row `record` returned by a projection                               |
| Table Module         | Set-based SQL owned by one class (`domain-logic-organization`)        |
| Record Set           | `List<SomeRow>` of records; Java has no first-class record set        |
| Transform View       | A DTO plus a serialiser                                               |
| Two Step View        | A layout template, or a controller advice producing a shared envelope |
| Special Case         | A sealed interface variant, or a null-object record                   |
| Money / Value Object | A record with validation in the compact constructor                   |
| Separated Interface  | The port of ports-and-adapters                                        |
| Service Stub         | A hand-written fake, or a stub HTTP server                            |

Knowing the classical name is not nostalgia: it is what lets you predict the framework's
behaviour instead of discovering it. Every surprising ORM behaviour in a production incident
is one of these patterns' classical consequences.
