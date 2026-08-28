# Budgeting the Request Path

## Write the budget first

For each significant endpoint, before measuring:

```text
GET /orders?page=0&size=25          budget: p95 200 ms
  database queries        ≤ 3       (page of orders, count, line summary)
  remote calls            0
  transaction duration    ≤ 30 ms   (read-only, or none)
  response payload        ≤ 60 KB

POST /orders                        budget: p95 400 ms
  database queries        ≤ 8       (customer, pricing, insert order + lines, outbox)
  remote calls            0         (inventory reservation is asynchronous)
  transaction duration    ≤ 80 ms
```

The budget is the hypothesis. A measured 180 queries against a budget of 8 is a located
defect; "the endpoint takes 900 ms" is a feeling.

## Counting what actually happens

**Database queries per request.** The reliable sources, in order of preference:

```java
// Hibernate statistics, per request, in a test or a dev profile
Statistics stats = entityManagerFactory.unwrap(SessionFactory.class).getStatistics();
long before = stats.getPrepareStatementCount();
// ... execute the endpoint ...
assertThat(stats.getPrepareStatementCount() - before).isLessThanOrEqualTo(8);
```

A datasource proxy (`datasource-proxy`, `p6spy`) gives the same count in production-like
environments and also shows the statements. Application logs at `DEBUG` are adequate for
development and unusable under load.

**Remote calls per request.** Client-side metrics tagged by endpoint and by callee. If a
count per request is not available, the trace is; a distributed trace of one slow request
answers this immediately and is worth the setup precisely for this question.

**Transaction duration.** Frequently unmeasured and frequently the answer. Instrument the
boundary:

```java
@Around("@annotation(org.springframework.transaction.annotation.Transactional)")
public Object timed(ProceedingJoinPoint pjp) throws Throwable {
    long start = System.nanoTime();
    try { return pjp.proceed(); }
    finally {
        meterRegistry.timer("tx.duration", "name", pjp.getSignature().toShortString())
            .record(System.nanoTime() - start, TimeUnit.NANOSECONDS);
    }
}
```

## Attributing the remainder by layer

Once round trips are accounted for, split the residue. A practical decomposition, cheapest
first:

| Question                                         | Measurement                                                  |
| ------------------------------------------------ | ------------------------------------------------------------ |
| How much is the database itself?                 | Sum of statement execution times vs total request time       |
| How much is waiting for a connection?            | Pool metrics: `hikaricp.connections.acquire` p99             |
| How much is the framework before the controller? | Filter chain timing; a no-op endpoint's latency is the floor |
| How much is serialisation?                       | Response size × observed throughput; a profile confirms      |
| How much is mapping and object churn?            | Allocation profile of the endpoint (`allocation-profiling`)  |
| How much is the JVM (GC, JIT)?                   | GC log and safepoint attribution (`java-performance`)        |

The no-op endpoint floor is the most under-used of these: add an endpoint that returns a
constant, measure it under the same load, and everything below that number is framework and
infrastructure, not your code.

## Transaction duration and the pool

The pool is sized by Little's Law: `connections = arrival_rate × transaction_duration`.

```text
120 write requests/second × 80 ms transaction = 9.6 concurrent connections
120 write requests/second × 400 ms transaction = 48 concurrent connections
```

The second case does not need a bigger pool; it needs a shorter transaction. A pool sized
for it will also overwhelm the database, which has its own concurrency limit — and past
that limit, adding connections reduces throughput (`connection-pool-sizing`,
`universal-scalability-law`).

What lengthens transactions, in order of frequency:

1. A remote call inside the boundary (`enterprise-transactions`).
2. Lazy loads triggered inside the transaction because the read path goes through the
   write model.
3. Mapping and serialisation performed inside the boundary — typically a controller
   annotated `@Transactional`, or an open-session-in-view filter.
4. Business logic that loads more state than the decision needs.
5. Batch work that should have been chunked.

**Open Session In View** deserves naming explicitly: it keeps the persistence context open
for the whole request so that lazy loads succeed during serialisation. It converts a
missing-fetch bug into a silent N+1 that runs during view rendering, and it holds a
connection for the request's full duration. Turn it off, and fix the resulting failures by
fetching properly.

## Load-test conditions that transfer

A load test result is transferable only if these match production:

- **Data volume and cardinality.** Plans change with row counts and with the selectivity of
  the values you filter on. Seeding 100 rows tests a different query plan than the one
  production runs.
- **Concurrency shape.** Twenty threads at full speed is not a hundred users with think
  time; the queue behaviour differs and so does lock contention.
- **Cache state.** A test that runs 5 minutes against a warm cache measures the cache. Test
  the cold path deliberately as well.
- **Client-side think time and connection reuse.** Coordinated omission makes the reported
  latency systematically optimistic when the harness waits for slow responses before
  issuing the next request (`coordinated-omission`).
- **The same JVM state.** A test that never leaves the interpreter, or that never reaches
  steady-state GC behaviour, is measuring warmup (`java-performance`).

## The budget as a test

```java
@Test
void order_list_stays_within_query_budget() {
    var before = statementCount();
    mockMvc.perform(get("/orders?page=0&size=25")).andExpect(status().isOk());
    assertThat(statementCount() - before)
        .as("query budget for the order list")
        .isLessThanOrEqualTo(3);
}
```

This is the highest-value performance test in most enterprise codebases, because the defect
it catches — a fetch strategy change or an added association reintroducing an N+1 — is
invisible in a functional test and appears in production at a data volume no other test
uses (`architecture-testing`).
