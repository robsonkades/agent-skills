# Composition Styles

One search screen: orders filtered by optional status, optional customer, optional date
range and optional minimum total. Compare four mechanisms against that requirement; the
fragments are not four complete equivalent implementations. Examples are partial application
code: record syntax needs Java 16+, while Spring 6.1 (including `JdbcClient`) requires Java 17+.
JPA metamodel/DSL
examples need their configured generators. Inspect the deployed Java, Spring Data, provider
and database versions; new Specification APIs are not available on every older release.

## 1. Derived methods — where it breaks

```java
public interface OrderRepository extends Repository<Order, Long> {
    List<Order> findByStatus(OrderStatus status);
    List<Order> findByStatusAndCustomerId(OrderStatus status, Long customerId);
    List<Order> findByStatusAndCustomerIdAndPlacedAtBetween(...);
    List<Order> findByCustomerIdAndPlacedAtBetween(...);
    // 16 combinations of 4 optional filters. This is the explosion.
}
```

Derived methods suit a small readable set, but names are not compiler-checked property
paths. Verify startup/query parsing after entity changes. Optionality warrants comparing
composition with explicit statements, not an automatic numerical cutoff.

## 2. Query Object — explicit filter values and translation

```java
public record OrderSearch(
        Optional<OrderStatus> status,
        Optional<CustomerId> customerId,
        Optional<LocalDate> placedFrom,
        Optional<LocalDate> placedTo,
        Optional<Money> minimumTotal) {

    public boolean isEmpty() {
        return status.isEmpty() && customerId.isEmpty() && placedFrom.isEmpty()
            && placedTo.isEmpty() && minimumTotal.isEmpty();
    }
}
```

The SQL sketch assumes validated non-null Optional components, an ordered date range,
an inclusive `placedTo` that can be advanced by one day, and a documented business time zone.
`AccessScope` comes from trusted authorization, not request filters; its allowed-customer list
must already be bounded and validated. Larger scopes may need an authorization join/EXISTS
or database policy. The example uses PostgreSQL `timestamptz` columns and JDBC 4.2
`OffsetDateTime` parameters; adapt and test the actual column/driver semantics. `Money.currency()` below
is assumed to return the stored currency code. Imports, constructor injection and application
types are omitted. Check column labels and status/time conversions against the actual JDBC
driver and row mapper; constructor/property mapping is not guaranteed by the DTO name alone.

```java
@Repository
class OrderSearchQuery {

    private final JdbcClient db;

    List<OrderSummary> run(OrderSearch search, Pageable page, AccessScope access, ZoneId zone) {
        if (page.isUnpaged() || page.getPageSize() > 200) throw new IllegalArgumentException("page bound");
        if (access.allowedCustomerIds().isEmpty()) return List.of();
        var sql = new StringBuilder("""
            SELECT o.id, o.status, o.placed_at, o.total_amount AS total, c.name AS customer_name
              FROM customer_order o
              JOIN customer c ON c.id = o.customer_id AND c.tenant_id = o.tenant_id
             WHERE o.tenant_id = :tenant AND o.customer_id IN (:allowedCustomers)
            """);
        var params = new HashMap<String, Object>();
        params.put("tenant", access.tenantId());
        params.put("allowedCustomers", access.allowedCustomerIds());
        params.put("offset", page.getOffset());
        params.put("size", page.getPageSize());

        search.status().ifPresent(s -> {
            sql.append(" AND o.status = :status");  params.put("status", s.name()); });
        search.customerId().ifPresent(id -> {
            sql.append(" AND o.customer_id = :customerId"); params.put("customerId", id.value()); });
        search.placedFrom().ifPresent(from -> {
            sql.append(" AND o.placed_at >= :from"); params.put("from", from.atStartOfDay(zone).toOffsetDateTime()); });
        search.placedTo().ifPresent(to -> {
            sql.append(" AND o.placed_at < :toExclusive");
            params.put("toExclusive", to.plusDays(1).atStartOfDay(zone).toOffsetDateTime()); });
        search.minimumTotal().ifPresent(min -> {
            sql.append(" AND o.total_currency = :currency AND o.total_amount >= :min");
            params.put("currency", min.currency()); params.put("min", min.amount()); });

        sql.append(" ORDER BY ").append(sortColumn(page.getSort()))   // allowlisted
           .append(" OFFSET :offset ROWS FETCH NEXT :size ROWS ONLY");

        return db.sql(sql.toString()).params(params).query(OrderSummary.class).list();
    }

    private static String sortColumn(Sort sort) {
        if (sort.stream().count() > 1) throw new IllegalArgumentException("one sort key");
        var order = sort.isUnsorted() ? Sort.Order.desc("placedAt") : sort.iterator().next();
        if (order.isIgnoreCase() || order.getNullHandling() != Sort.NullHandling.NATIVE)
            throw new IllegalArgumentException("unsupported sort options");
        String column = switch (order.getProperty()) {
            case "placedAt" -> "o.placed_at";
            case "total" -> "o.total_amount";
            case "id" -> "o.id";
            default -> throw new IllegalArgumentException("unsupported sort");
        };
        String direction = order.isAscending() ? " ASC" : " DESC";
        return column + direction + (column.equals("o.id") ? "" : ", o.id" + direction);
    }
}
```

The sort helper chooses fixed SQL fragments, preserves direction, supplies an unsorted default
and appends a unique tiebreaker. Define null ordering for nullable sort keys; reject unsupported
case/null-order options rather than silently promising to honor them. Bind values, including
pagination, and validate empty-filter cost. A query object does not automatically enforce
authorization: keep the mandatory scope outside user-controlled AND/OR/NOT groups.

An allowlist controls exposed fields and query cost. A validated Spring Data property name is
not automatically raw SQL injection, but concatenated identifiers or unsafe sort expressions
can be; never insert untrusted SQL fragments.

## 3. Specifications — for criteria reused across queries

The justification is a business criterion used in several places that must stay consistent.

```java
public final class OrderSpecs {

    /** "Overdue" is defined once, here. Every query that needs it uses this. */
    public static Specification<Order> overdue(LocalDate asOf) {
        return (root, query, cb) -> cb.and(
            cb.lessThan(root.get(Order_.dueDate), asOf),
            cb.notEqual(root.get(Order_.status), OrderStatus.SETTLED));
    }

    public static Specification<Order> forCustomer(CustomerId id) {
        return (root, query, cb) -> cb.equal(root.get(Order_.customerId), id.value());
    }

    public static Specification<Order> premiumCustomer() {
        return (root, query, cb) -> {
            // This standalone predicate owns an INNER join; compose joins deliberately.
            Join<Order, Customer> customer = root.join(Order_.customer, JoinType.INNER);
            return cb.equal(customer.get(Customer_.tier), CustomerTier.PREMIUM);
        };
    }
}

// Usage reads as the business criterion, and the definition lives in one place.
var overduePremium = OrderSpecs.overdue(asOf).and(OrderSpecs.premiumCustomer());
```

### The three composition traps

**Join semantics.** Repeated to-one joins may be redundant without multiplying rows;
to-many joins can multiply rows. Reusing a join by attribute name alone is unsafe when join
type, ON predicates or quantifiers differ. "A red line AND a large line" may allow two
different children; "one line that is red AND large" requires one shared match. Choose aliases
or correlated EXISTS from that meaning, then verify both data and count queries.

**Fetches and paging.** A specification may be invoked for data and count; fetch joins usually
do not belong in the count query. A result-type guard alone does not make a to-many fetch
join safely pageable: Hibernate may paginate in memory or reject it. Prefer projection
paging, page root ids then fetch with order restored, or an appropriate separate fetch plan.
Keep mandatory scope identical in both phases/counts. Null-query contexts and separate-count
APIs differ across Spring Data versions; inspect the executor being used.

**Distinct and SQL nulls.** Distinct-root semantics may be required for a legitimate to-many
join, although they do not remove intermediate row cost. EXISTS can avoid row multiplication
when only existence matters. SQL `NOT (status = 'SETTLED')` does not include NULL status;
`notEqual` has the same three-valued-logic issue. Require non-null status or explicitly
define the null branch. Capture `asOf = LocalDate.now(clock)` once for data and count so a
midnight boundary cannot change the criterion between invocations.

### The naming discipline

```java
// Good: names a business criterion. Readable at the call site; one definition.
OrderSpecs.overdue(asOf)
OrderSpecs.awaitingApprovalOlderThan(Duration.ofDays(3))

// Infrastructure-level expression; it does not name a reused business concept.
GenericSpecs.field("status").eq("OPEN").and(GenericSpecs.field("dueDate").lt(today))
```

Generic predicates can be useful infrastructure for a constrained search DSL, but do not
replace a named domain criterion. Whitelist fields/operators, bound nesting and joins, and
keep access predicates outside the user expression. Aggregation support depends on the
underlying API and executor (`enterprise-architecture-smells`).

## 4. Type-safe DSL

A generated fluent API over the schema or the entities gives composition **and** compile-time
checking:

This syntax-only fragment intentionally omits the mandatory tenant/allowed-customer scope,
tenant-qualified join, complete optional filters, stable `id` tiebreaker and `OrderSummary`'s
status/column aliases and enum/time conversion. It is not a replacement for the scoped search
above. A complete translation must supply those contracts, including empty-scope denial,
allowlisted sorting and an explicitly verified result mapping; `fetchInto` alone does not.

```java
var orders = dsl.select(ORDER.ID, ORDER.PLACED_AT, ORDER.TOTAL_AMOUNT, CUSTOMER.NAME)
    .from(ORDER).join(CUSTOMER).on(CUSTOMER.ID.eq(ORDER.CUSTOMER_ID))
    .where(condition)                      // built up from optional filters
    .orderBy(ORDER.PLACED_AT.desc())
    .limit(size).offset(offset)
    .fetchInto(OrderSummary.class);
```

The generated-model approach needs synchronized build-time metadata. Adopting a new DSL can
add another query technology; an adequate existing DSL need not add that cost. Generated
types catch some structural mistakes, but not every semantic change becomes a compiler error
(`metadata-mapping`). Choose from actual query complexity, schema ownership and maintainability.

## Choosing

| Condition                                                      | Mechanism                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------ |
| A small readable set of fixed queries                          | Derived methods, named statements or an adequate existing DSL      |
| One screen, several optional filters                           | Compare query object, statements and existing DSL translation      |
| A business criterion reused across several queries             | Named specification                                                |
| Arbitrary user-composed filtering (admin search, saved search) | Specifications or a type-safe DSL                                  |
| Aggregation, window function, recursion, bulk                  | Compare supported SQL, DSL and provider APIs                       |
| Data for display                                               | Projection or bounded entities according to required data/behavior |

Sources: [Spring Data JPA Specifications](https://docs.spring.io/spring-data/jpa/reference/jpa/specifications.html)
and [Jakarta Persistence query semantics](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2).
The rolling Spring documentation must be matched to the project's release.
