# Query semantics and Java/Spring boundaries

Read when the query filters, orders, pages or authorizes across owners, or when translating
the architecture into Java/Spring APIs. The examples are reasoning examples and a **partial
Java snippet**, not an executable application. No runtime/security behavior is claimed tested.

## Work backward from the mathematical query

Write the logical order: authorized population, joins, predicates, grouping/aggregation,
ordering, then page. Identify where each operation can run without changing the answer.
Pushing a filter or limit down is valid only when the remaining operations preserve its
meaning. Trace the join cardinality: summing an invoice amount after joining three invoice
lines may multiply the amount by three. Distinct identifiers and distinct values are different
operations; neither is a universal repair.

Consider a support screen listing unpaid orders by most recent order date. Orders owns dates;
Payments owns payment state. Fetching the first 20 orders, enriching them, and dropping paid
orders cannot promise the first 20 unpaid orders: an eligible order may be the 21st candidate.
It also cannot derive the total unpaid count from the count of orders. Refilling can be correct
if the scan continues over a stable, complete candidate set, but its work may become unbounded
as the unpaid fraction falls. Specify a scan cap and honest continuation/incomplete semantics,
or use an indexed projection satisfying the accepted freshness contract.

Change only the consumer question to “the latest 20 orders, with payment as optional display
information.” A bounded order page plus batch payment enrichment can now preserve membership
and order; unavailable enrichment becomes an explicit state. The trade-off changed because
payment no longer determines eligibility. This is a decision pair, not a measured comparison.

API composition is a legitimate starting point for bounded joins, but large intermediate
datasets can make it unsuitable. See [Richardson's API Composition pattern](https://microservices.io/patterns/data/api-composition.html).

## Pagination is part of the contract

- Define a total ordering with a stable unique tie-breaker, null behavior, collation/time-zone
  semantics and sort-direction consistency. Different owners sorting “name” differently cannot
  safely merge pages under one comparator.
- Distinguish a stable snapshot/export from a live traversal. Keyset pagination avoids some
  offset shifts, but does not freeze mutable sort keys or concurrent inserts/deletes. A cursor
  alone does not establish snapshot isolation.
- Bind an opaque, integrity-protected cursor to the tenant/principal access scope as needed,
  filter/sort definition, schema/projection generation, position and expiry. Recheck current
  authorization; signing a cursor does not authorize its holder or hide its plaintext.
- A projection generation identifier identifies a dataset, not automatically a frozen
  snapshot. For stable traversal, use a store-supported snapshot/versioned dataset with a
  bounded lifetime; for live traversal, document possible movement, duplicates or omissions.
- Preserve a cursor's original generation while it is retained, or return the specified restart
  response after cutover. Do not silently reinterpret its offset against a rebuilt dataset.
- A partial response cannot claim an exact total without independent evidence covering the
  complete authorized population. Unknown total is preferable to a fabricated zero or an
  unauthorized count. Avoid exposing inaccessible categories through counts or diagnostics.

For bounded refilling, distinguish fetched candidates, conclusively consumed candidates and
emitted matches. A downstream batch cursor may advance past matching rows that did not fit
the response. Preserve those rows in bounded continuation state, or resume from a position
that can recover them under the declared traversal semantics. Never advance past an unresolved
required lookup as though its candidate were excluded. Keep rejected row identifiers out of
public continuation metadata.

For example, a batch contains candidates A–D and the page holds one result. If A is excluded
and B–D match, emitting B with the batch's after-D cursor loses C and D unless continuation
retains them. If a scan cap is reached after A and A is excluded, an empty page proves neither
an empty collection nor exhaustion. A continuation response may be valid if the consumer
contract supports it; otherwise use its pending/failure contract or choose a different query
plan. Test the actual consumer: clients that stop on a short page silently truncate this
protocol. [Google AIP-158](https://google.aip.dev/158) documents one pagination contract where
short or empty pages can carry continuation and tokens never substitute for authorization;
adopt those semantics only with compatible callers.

PostgreSQL **17** requires a predictable order for predictable `LIMIT`/`OFFSET` subsets and
still computes skipped offset rows. That supports inspecting order and cost, not a claim that
every keyset query is faster. See [LIMIT and OFFSET](https://www.postgresql.org/docs/17/queries-limit.html).
Inspect the actual index and query plan for the chosen predicate and ordering.

Spring Data Commons **4.1.1** documents `Page` total-count semantics and `Slice` continuation
without a global total; counts may require another query. These types describe a repository
query, not a proof of cross-service completeness. Preserve their consumer contract if already
public, or change it explicitly with callers. Do not wrap a partially enriched list in `Page`
with an invented total. See [query methods and paging](https://docs.spring.io/spring-data/commons/reference/repositories/query-methods-details.html)
(moving URL; select the project's release).

## A Java boundary that exposes uncertainty

This **partial snippet** uses Java **25** standard records/sealed types, no preview, and
Spring Framework **7.0.9** transaction metadata. Imports, constructors, domain types,
authorization implementation, persistence and cursor codec are intentionally omitted.
It illustrates a contract to implement and test, not ready-to-deploy security code.

```java
sealed interface PaymentDisplay {
    record Observed(PaymentState state, PaymentRevision revision)
            implements PaymentDisplay {}
    record Unavailable() implements PaymentDisplay {}
}

record OrderSummary(OrderId id, PaymentDisplay payment) {}

record OrderWindow(List<OrderSummary> rows, Optional<Cursor> next,
                   QueryCoverage coverage) {
    OrderWindow {
        rows = List.copyOf(rows);
        Objects.requireNonNull(next);
        Objects.requireNonNull(coverage);
    }
}

// Public method on a Spring-managed bean entered through its transaction proxy.
@Transactional(transactionManager = "projectionTransactionManager", readOnly = true)
public OrderWindow latestOrders(AuthenticatedCaller caller, OrderQuery request) {
    var scope = access.requireOrderRead(caller, request.tenant());
    var boundedQuery = queries.validateAndBound(request, scope);
    // Adapter contract: same local read snapshot for rows and coverage,
    // authorized rows/fields, and a cursor bound to scope/query/generation.
    return projection.readWindow(scope, boundedQuery);
}
```

`AuthenticatedCaller` must come from the trusted security boundary, never directly from a
deserialized body. `requireOrderRead` checks the caller's permission for the requested tenant;
the repository must still enforce row/field scope. Payment `Unavailable` is not a domain
`Unpaid` state. `QueryCoverage` represents verified coverage/freshness under the endpoint
contract; a handler cannot construct “complete” merely because every returned row is present.
Map these internal states to the established public error/partial-result contract.

`readOnly = true` is a hint to the transaction subsystem, not an authorization rule, replica
freshness guarantee or distributed snapshot. The local adapter must actually obtain the
promised snapshot, for example with a single suitable statement or a supported isolation
level across its reads. Multiple statements under a weaker isolation level may observe
different projection progress. Verify the database/transaction-manager behavior with a
concurrent writer test; the annotation above alone does not supply that guarantee.

Spring's imperative transaction context does not propagate to new threads. Parallel HTTP
reads are not enlisted into this local transaction by adding `@Transactional`. Reactive
transactions use Reactor context and need their own supported pipeline. See the
[Framework 7.0.9 transaction contract](https://docs.spring.io/spring-framework/docs/7.0.9/javadoc-api/org/springframework/transaction/annotation/Transactional.html).
Keep remote enrichment outside unnecessarily held local connections/snapshots, using explicit
deadlines and immutable detached DTOs. If coherence requires a different protocol, design it
rather than relying on thread placement.

Compile actual integrated code against the target project's declared baseline. For this
boundary, runtime validation must exercise concurrent progress updates, denied scopes,
cursor reuse by another tenant, missing enrichment and downstream command races. Compilation
alone does not validate any of these contracts.
