# Budgeting the request path

## Define a budget without inventing a diagnosis

An illustrative hypothesis, not a default SLO or measured result:

```text
GET /orders?page=0&size=25
  target: p95 <= 200 ms at the agreed request mix and arrival rate
  expected SQL: <= 3 (root page, optional count, grouped line summary)
  remote calls: 0
  returned roots: <= 25; response: <= 60 KB
  connection hold: measure separately from request/transaction time
```

Derive the numbers from the use case, consumer contract and baseline. A measured 180 queries
against an expected 3 locates a discrepancy to explain, not proof that those queries dominate
latency. A measured 900 ms endpoint duration is valid evidence even before attribution.
Count background work and retries separately: an asynchronous acknowledgement is not the same
completion contract as a synchronous finished operation.

## Attribute wall time without double counting

Construct a timeline or dependency graph from traces and local timings. Include request queue,
framework/authentication, pool acquisition, database/client calls, hydration/domain work,
mapping/serialization and response transfer. Locate the critical path and unexplained gaps.

Nested spans include children; overlapping calls consume time simultaneously. Sum only
non-overlapping intervals on the path being explained. Do not subtract a sum of inclusive SQL
or service spans from request time, or add component p99 values to obtain endpoint p99.
A database client span may include network, server waits and result transfer; server execution
requires server-side evidence.

| Evidence                                          | Architectural question                                    | Limit                                                                          |
| ------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Request-correlated SQL executions and rows        | Repeated access, overfetching, hidden view queries?       | Statement count alone omits row volume, plan cost and wire batching            |
| Complete client spans with attempts               | Serial dependencies, fan-out, retries?                    | Missing/sampled spans cannot prove absence of calls                            |
| Pool acquisition and checkout-to-return timing    | Waiting versus occupied connections?                      | Acquisition includes normal overhead; a nonzero value need not mean saturation |
| Database plans, waits and locks                   | Expensive SQL or blocked transactions?                    | Match parameters/data and distinguish server time from client time             |
| CPU and allocation profiles tied to the operation | Mapping, hydration or serialization cost?                 | Allocation volume does not establish elapsed CPU time                          |
| Queue/admission and timeout/rejection metrics     | Is low throughput intentional limiting or a blocked path? | Low average CPU can hide a busy core, I/O waits or downstream throttling       |

Read `allocation-profiling` for allocation evidence, `java-performance` for JVM attribution,
and `serialization-performance` when payload processing is implicated. Payload bytes divided
by network throughput estimates transfer time, not serialization CPU. A no-op endpoint can
be a control for shared overhead, but different authentication, routing and queue behavior
mean it is not a universal floor to subtract from another endpoint.

## Query-count tests: scope the counter

Hibernate Statistics is SessionFactory-wide and must be enabled. Its prepared-statement count
is a preparation count, not a universal execution or network-round-trip count.
See [Hibernate Statistics](https://docs.hibernate.org/orm/7.1/javadocs/org/hibernate/stat/Statistics.html).

The reference baseline for this fragment is Hibernate 7.1 / Jakarta Persistence 3.2, with
Java 17 as its minimum Java baseline; see [Hibernate compatibility](https://hibernate.org/orm/releases/7.1/#compatibility).
Inspect the target's compiler release/toolchain, resolved ORM/framework/test dependencies and
runtime image before adapting it. Use the target version's statistics API; this example does
not authorize upgrading Java or replacing dependencies. No preview features are needed.

For an isolated integration test on that baseline, the following fragment needs a supplied
EntityManagerFactory, Hibernate Statistics/SessionFactory imports and endpoint test driver.
It is not a standalone test:

```java
// Enable statistics in test configuration; isolate this SessionFactory from concurrent work.
// Finish fixture setup first; use the cache state that the test explicitly promises.
Statistics stats = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
long before = stats.getPrepareStatementCount();
executeAndFullyConsumeOrderPage(25); // test helper, includes mapping/serialization
long prepared = stats.getPrepareStatementCount() - before;
assertThat(prepared).isLessThanOrEqualTo(3); // derived budget, AssertJ dependency required
```

Verify statistics are enabled and a known database access is observed, so disabled instrumentation
cannot pass as zero queries. For concurrent traffic, use request-correlated execution events or
a datasource interceptor with propagated context; global deltas mix requests. Avoid recording
sensitive bind values. Endpoint-tagged aggregate rates can estimate average demand but cannot
identify an individual slow request's count.

Use several result sizes and both fresh and deliberately warm persistence/cache states. Assert
returned contents, ordering and completeness as well as counts, including serialization where
lazy access may occur. Do not add extra result-consuming operations that themselves query.
Delegate detailed fetch controls to `orm-fetch-and-batching-performance` and regression placement
to `architecture-testing`.

## Occupancy: measure the actual resource interval

Use checkout-to-return duration for occupied pooled connections, not annotated method time.
A method timer can exclude commit/flush, include nontransactional work or time a method that
joins an existing transaction. Advisor ordering, proxy invocation and propagation matter; use
transaction-manager events when actual begin/completion is needed. See
[Spring transaction semantics](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/annotations.html).

Request, persistence context and database transaction lifetimes may differ. OSIV allows lazy
loads after the original transaction has completed; it does not itself guarantee one request-long
transaction or connection checkout. Inspect provider connection handling and actual borrow/return
events. See [Spring OSIV](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/orm/jpa/support/OpenEntityManagerInViewFilter.html)
and [Hibernate connection handling](https://docs.hibernate.org/orm/7.1/userguide/html_single/#database-connection-handling).

Applying Little's Law to occupied connections in a stable observation window:

```text
mean occupied connections = successful checkout rate/second × mean hold seconds
120 checkouts/s × 0.080 s = 9.6 average occupied
120 checkouts/s × 0.400 s = 48 average occupied
```

These are averages, not recommended pool sizes. Use checkout rate rather than endpoint rate
unless each request borrows exactly once; account for multiple pools, replicas, retries and
background traffic consistently. Do not insert p99 hold time into an equation for mean occupancy.
If the boundary includes acquisition wait, the population also includes waiters, not just holders.
See [MIT's Little's Law notes](https://web.mit.edu/1.041/www/lectures/L8-queuing-models-2024sp.pdf).

Determine whether long holds contain avoidable remote work, lock waits, slow SQL or hydration
before changing boundaries. Moving a call outside a transaction may change atomicity or introduce
a race; specify the consistency mechanism and failure handling first. Shorter holds may help,
but burstiness, database capacity and admission limits still constrain safe concurrency.
Use `connection-pool-sizing` for configuration and `littles-law-and-queueing` for fuller models.

## Transfer the comparison, not just the test result

Compare production and test request mix, offered/achieved rate, errors, data skew/selectivity,
query plans, replica resources, downstream limits, cache state, connection reuse and JVM warmup.
Exact duplication is often impossible; state mismatches and the conclusions they limit.
A nested loop is not inherently bad at large table sizes: selectivity, indexes and actual rows
processed determine its cost.

A closed-loop harness can reduce offered load when responses slow; whether that biases the
test depends on the intended arrival model. Route harness design to `load-testing` and
`coordinated-omission`. Include failures/timeouts alongside latency so dropping slow requests
does not masquerade as improvement. A high p99 warrants investigation against an SLO; it does
not by itself establish instability or its cause.

For a change, require the predicted count/bytes/hold-time effect and the end-to-end result
under comparable offered work. Record resource and correctness regressions even when latency
improves. A deterministic query-budget test is an architectural regression guard, not a load test.
