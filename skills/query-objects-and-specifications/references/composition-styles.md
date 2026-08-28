# Composition Styles

One search screen: orders filtered by optional status, optional customer, optional date
range and optional minimum total. Four mechanisms, same requirement.

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

Derived methods are the right answer for a small fixed set — they are free, self-documenting
and refactor-safe. They stop being the right answer at exactly this point: when optionality
multiplies.

## 2. Query Object — usually the best answer for one screen

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

```java
@Repository
class OrderSearchQuery {

    private final JdbcClient db;

    List<OrderSummary> run(OrderSearch search, Pageable page) {
        var sql = new StringBuilder("""
            SELECT o.id, o.status, o.placed_at, o.total_amount, c.name AS customer_name
              FROM customer_order o
              JOIN customer c ON c.id = o.customer_id
             WHERE 1 = 1
            """);
        var params = new HashMap<String, Object>();

        search.status().ifPresent(s -> {
            sql.append(" AND o.status = :status");  params.put("status", s.name()); });
        search.customerId().ifPresent(id -> {
            sql.append(" AND o.customer_id = :customerId"); params.put("customerId", id.value()); });
        search.placedFrom().ifPresent(from -> {
            sql.append(" AND o.placed_at >= :from"); params.put("from", from.atStartOfDay()); });
        search.minimumTotal().ifPresent(min -> {
            sql.append(" AND o.total_amount >= :min"); params.put("min", min.amount()); });

        sql.append(" ORDER BY ").append(sortColumn(page.getSort()))   // allowlisted
           .append(" OFFSET :offset ROWS FETCH NEXT :size ROWS ONLY");

        return db.sql(sql.toString()).params(params).query(OrderSummary.class).list();
    }

    private static String sortColumn(Sort sort) {
        // Never interpolate a user-supplied field name.
        return switch (sort.iterator().next().getProperty()) {
            case "placedAt" -> "o.placed_at";
            case "total"    -> "o.total_amount";
            default         -> "o.id";
        };
    }
}
```

Every parameter is bound, the SQL is one readable statement, the projection is exactly what
the screen needs, and the whole thing is one class that can be unit tested against a real
database. For a single search screen this beats a specification framework on every axis
except cross-query reuse.

The allowlisted sort is not optional: any mechanism that accepts a property name from the
client and puts it into a query is an injection surface, including `Sort.by(userInput)`
against a repository.

## 3. Specifications — for criteria reused across queries

The justification is a business criterion used in several places that must stay consistent.

```java
public final class OrderSpecs {

    /** "Overdue" is defined once, here. Every query that needs it uses this. */
    public static Specification<Order> overdue(Clock clock) {
        return (root, query, cb) -> cb.and(
            cb.lessThan(root.get(Order_.dueDate), LocalDate.now(clock)),
            cb.notEqual(root.get(Order_.status), OrderStatus.SETTLED));
    }

    public static Specification<Order> forCustomer(CustomerId id) {
        return (root, query, cb) -> cb.equal(root.get(Order_.customerId), id.value());
    }

    public static Specification<Order> premiumCustomer() {
        return (root, query, cb) -> {
            // Reuse an existing join rather than adding a second one.
            Join<Order, Customer> customer = joinOnce(root, Order_.customer);
            return cb.equal(customer.get(Customer_.tier), CustomerTier.PREMIUM);
        };
    }
}

// Usage reads as the business criterion, and the definition lives in one place.
var overduePremium = OrderSpecs.overdue(clock).and(OrderSpecs.premiumCustomer());
```

### The three composition traps

**Duplicated joins.** Two specifications that each call `root.join(...)` on the same
association produce two joins, duplicated rows and an inflated count. Look up an existing
join first:

```java
static <X, Y> Join<X, Y> joinOnce(From<?, X> from, Attribute<X, Y> attribute) {
    return from.getJoins().stream()
        .filter(j -> j.getAttribute().equals(attribute))
        .findFirst().map(j -> (Join<X, Y>) j)
        .orElseGet(() -> from.join((SingularAttribute<X, Y>) attribute));
}
```

**Fetch joins in a count query.** Spring Data reuses the specification for the `count`
query; a `root.fetch(...)` there is invalid. Guard it:

```java
if (Long.class != query.getResultType() && query.getResultType() != long.class) {
    root.fetch(Order_.lines, JoinType.LEFT);
    query.distinct(true);
}
```

**`distinct` masking a cartesian product.** Adding `distinct` to fix duplicated rows removes
the symptom and keeps the cost — the database still built the multiplied result set. Fix the
join instead.

### The naming discipline

```java
// Good: names a business criterion. Readable at the call site; one definition.
OrderSpecs.overdue(clock)
OrderSpecs.awaitingApprovalOlderThan(Duration.ofDays(3))

// Bad: a query builder rebuilt badly. No reuse value, worse than SQL.
GenericSpecs.field("status").eq("OPEN").and(GenericSpecs.field("dueDate").lt(today))
```

The second form appears whenever specifications are adopted as a style rather than for
reuse. It is strictly worse than the query object above: less readable, less predictable,
and it still cannot express an aggregation (`enterprise-architecture-smells`).

## 4. Type-safe DSL

A generated fluent API over the schema or the entities gives composition **and** compile-time
checking:

```java
var orders = dsl.select(ORDER.ID, ORDER.PLACED_AT, ORDER.TOTAL_AMOUNT, CUSTOMER.NAME)
    .from(ORDER).join(CUSTOMER).on(CUSTOMER.ID.eq(ORDER.CUSTOMER_ID))
    .where(condition)                      // built up from optional filters
    .orderBy(ORDER.PLACED_AT.desc())
    .limit(size).offset(offset)
    .fetchInto(OrderSummary.class);
```

The cost is a build-time generation step and a second query technology in the codebase; the
gain is that a schema change breaks the build (`metadata-mapping`). Worth it when queries
are numerous and complex, or when the schema is owned elsewhere.

## Choosing

| Condition                                                      | Mechanism                                 |
| -------------------------------------------------------------- | ----------------------------------------- |
| Fewer than ~8 fixed queries per aggregate                      | Derived methods                           |
| One screen, several optional filters                           | Query object with one statement           |
| A business criterion reused across several queries             | Named specification                       |
| Arbitrary user-composed filtering (admin search, saved search) | Specifications or a type-safe DSL         |
| Aggregation, window function, recursion, bulk                  | SQL in a gateway                          |
| Anything returning data for display                            | Projection, whichever mechanism builds it |
