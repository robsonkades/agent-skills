# What the Framework Already Provides

## Mechanisms substantially provided

### Front Controller → `DispatcherServlet`

Routing, handler selection, argument resolution, return-value handling and exception
resolution. Inspect its extension points before introducing a parallel dispatch mechanism.

**What remains yours:** which concern goes at which stage of the chain
(`mvc-and-request-handling`).

**Wrapper to avoid:** a `BaseController` holding cross-cutting helpers. Every one of those
concerns should first be evaluated against filters, interceptors, resolvers and advice;
a domain-specific controller collaborator can still have a purpose.

### Unit of Work → the persistence context

Change tracking and synchronization of managed state. Flush is not commit; the transaction
manager controls commit, and a persistence context can flush multiple times.

**The gap that matters:** context lifetime depends on creation and integration. A
transaction-scoped context follows the transaction; extended contexts, application-managed
contexts and Open Session In View can span multiple transactions. `REQUIRES_NEW` creates an
independent transaction when interception and the transaction manager support it; it does
not make the entire use case atomic. A detached entity is not tracked by a context.

**Wrapper to avoid:** a hand-written "unit of work" collecting changes and applying them at
the end when the persistence context already owns that work. Competing change trackers can
disagree about flush order; a higher-level application transaction boundary is a different role.

### Identity Map → the first-level cache

One managed instance per persistent entity identity within a context. Identity is not
merely a table row: inheritance and distinct entity mappings matter. A repeated `find`
may reuse a managed instance, while JPQL queries, refresh or lock modes can still issue SQL.
Shared identity does not make mutation or concurrent access safe.

**The gap that matters:** this context-local cache is not a cross-context cache. Its lifetime
is the context's, and an EntityManager is not safe for concurrent use. Bulk SQL may leave
managed objects stale; explicitly refresh or clear with care for pending changes (`orm-behavioral-patterns`).

**Wrapper to avoid:** a request-scoped map of loaded entities "to avoid reloading". Inside a
context it usually duplicates identity management; outside one, detached data requires
explicit freshness and lazy-loading rules.

### Lazy Load → ORM proxies

**The gap that matters:** loading can be triggered by access, enhancement or provider behavior;
loop traversal can cause N+1 selects, depending on distinct targets, caches and fetch plans. The pattern is provided; the **fetch strategy is a decision
per use case** and the framework's default is not one.

### Metadata Mapping → annotations and `orm.xml`

**The gap that matters:** the metadata is not validated against the schema unless you ask —
Spring Boot's `spring.jpa.hibernate.ddl-auto=validate` enables Hibernate schema validation.
That validation is not a complete audit of every constraint, index or migration
(`metadata-mapping`).

### Plugin → conditional bean registration

`@ConditionalOnProperty` and profiles implement selection at configuration time.

**The gap that matters:** define whether missing configuration selects a documented default
or is an error. Validate required selections and ambiguous/missing beans at startup;
conditional registration alone does not validate configuration or implement runtime hot loading.

### Registry → the application context

Constructor injection makes dependencies explicit; lifecycle and configuration costs remain. Used as
`context.getBean()` inside business code, it is the classical Registry with all of them
(`enterprise-base-patterns`).

## Provided partially — mechanism yes, decision no

### Repository → Spring Data

**Provided:** the implementation, derived queries, paging, specifications.

**Not provided, and it is the entire pattern:**

- which aggregates exist and where their boundaries are;
- whether repositories follow DDD aggregate roots when that model is used; Fowler's
  collection-like interface to domain objects does not universally require a DDD root;
- what the published surface is — `extends JpaRepository` publishes a broad inherited API including
  `deleteAll()`;
- whether reads for screens use the repository or a projection/query path;
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

**Wrapper to avoid:** an identical pass-through interface with no additional contract.
Check for an actual compatibility, lifetime, failure or application-owned replacement seam
before calling it redundant. Narrowing is one justification; merely renaming adds no such
contract (`repository-pattern`).

### Service Layer → `@Transactional`

**Provided:** declarative demarcation, propagation, rollback rules.

**Not provided:** what a use case is; where the boundary belongs; that it is demarcated once
per use case; what happens at a non-transactional edge.

**Gaps that cause incidents:** self-invocation bypasses new advice in default proxy mode,
though an existing outer transaction still applies; AspectJ weaving differs. Traditional
rollback defaults exclude checked exceptions unless configured (including configurable
global defaults in Spring 6.2+). Inherited CRUD methods have transaction metadata; declared
query methods do not automatically get it. An outer service transaction normally governs
participating repository calls, so there is no universal transaction-per-query rule
(`enterprise-transactions`).

### Optimistic Offline Lock → `@Version`

**Provided:** the version column, the `WHERE` clause, the exception.

**Not provided:** returning the editor's original version (a fresh server read protects only
subsequent races, not earlier thinking-time edits); conflict presentation and valid retry.
Bulk statements need explicit version participation: incrementing invalidates old editors,
while an expected-version predicate protects the bulk operation's own stale snapshot
(`offline-concurrency-control`).

### Data Mapper → JPA

**Provided:** the mapping engine.

**Not provided:** whether the domain model is allowed to diverge from the schema. Annotating
domain classes creates metadata coupling; it does not make those entities Active Record
unless they also own persistence behavior. Record the chosen coupling and separation
(`data-source-patterns`).

### Caching → the caching abstraction

**Provided:** `@Cacheable`, `@CacheEvict`, a pluggable store.

**Not decided:** whether to cache, keys, TTL, size bounds, consistency and cross-instance
invalidation. `@Cacheable(sync=true)` requests synchronized loading from the provider with
API restrictions; verify its actual scope, especially across nodes. Avoid sharing managed
mutable entities as application-cache values without an explicit lifecycle contract
(`caching-strategies`).

**Gap that surprises:** default proxy-mode `@Cacheable` does not intercept same-bean calls;
AspectJ mode has different interception semantics. Verify caching is enabled and the actual
cache manager implements the intended behavior.

## Not provided at all

| Pattern                      | Why a framework cannot supply it                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| Domain Model organisation    | It is your business; no framework knows your invariants                                                   |
| Aggregate boundaries         | Same; and this decision drives locking, transactions and performance                                      |
| Remote Facade granularity    | Depends on your callers' interactions                                                                     |
| Pessimistic Offline Lock     | Conversation ownership and abandonment recovery are application decisions (`offline-concurrency-control`) |
| Coarse-Grained Lock scope    | Follows the invariant, which is yours                                                                     |
| Application Controller flow  | Your process                                                                                              |
| Session state placement      | A trade-off between your requirements                                                                     |
| Distribution boundaries      | Technical, organizational and operational trade-offs                                                      |
| Saga and compensation design | Business semantics of "undo"                                                                              |

An application can hold a database transaction beyond one request; request-scoped framework
demarcation does not automatically carry it there. A held transaction can retain connections,
locks and snapshot resources and needs explicit concurrency, timeout and recovery bounds.
For human thinking time, prefer short database transactions with an appropriate offline
protocol. Durable checkout may use explicit release and audited recovery; a lease needs
safe expiry/renewal and stale-owner rejection. An extended persistence context is not proof
that one database transaction stays active.

The table separates application decisions from available mechanisms; prioritize the gaps
that matter to the requested contract rather than ranking their costs by pattern name.

## Patterns absorbed, not refuted

| Pattern              | Modern form                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------- |
| Table Data Gateway   | A `JdbcClient` repository holding a table's SQL — alive and useful                          |
| Row Data Gateway     | A row object that also owns row persistence; a plain projection is only data                |
| Table Module         | Set-based SQL owned by one class (`domain-logic-organization`)                              |
| Record Set           | JDBC RowSet/CachedRowSet, or projected rows when only typed read data is needed             |
| Transform View       | A transformation from model data to output; DTO serialization alone may be insufficient     |
| Two Step View        | A logical presentation stage followed by rendering; a shared envelope alone is insufficient |
| Special Case         | A sealed interface variant, or a null-object record                                         |
| Money / Value Object | A record with validation in the compact constructor                                         |
| Separated Interface  | The port of ports-and-adapters                                                              |
| Service Stub         | A hand-written fake, or a stub HTTP server                                                  |

Knowing the classical name is not nostalgia: it is what lets you predict the framework's
behaviour instead of discovering it. Classical patterns explain some consequences; provider versions, configuration and defects
still require direct evidence.

Sources: [Spring transaction interception](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html),
[Spring Data JPA transactionality](https://docs.spring.io/spring-data/jpa/reference/jpa/transactions.html),
and [Spring caching annotations](https://docs.spring.io/spring-framework/reference/integration/cache/annotations.html).
Check the matching documentation version for the deployed stack.
For transaction lifetime, see [JDBC Connection's explicit commit/rollback contract, Java 21](<https://docs.oracle.com/en/java/javase/21/docs/api/java.sql/java/sql/Connection.html#setAutoCommit(boolean)>)
and [Hibernate 6.6 conversation patterns](https://docs.hibernate.org/orm/6.6/userguide/html_single/#long-conversations).
These distinguish possible lifetimes from appropriate resource ownership; they do not
authorize holding a project's transaction across user interaction.
