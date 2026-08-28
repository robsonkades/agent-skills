---
name: architecture-and-performance
description: >
  Reasoning about performance across the whole request path rather than pattern by pattern:
  budgeting latency from controller to database, counting round trips as the primary
  currency, and knowing which architectural changes actually move a number. Use when a page
  is slow and each layer looks fine in isolation, when a pattern is chosen or rejected on
  performance grounds without a measurement, when adding a layer or a service is proposed as
  a fix, when query counts scale with result size, when a remote interface is chatty, when a
  transaction holds a connection across a network call, or when a load test passes and
  production does not. Does not cover the investigation process (performance-methodology),
  profiling tools (jfr-and-async-profiler), JVM behaviour (java-performance), queue
  arithmetic (littles-law-and-queueing), collector and heap tuning (jvm-gc-tuning), or
  designing and running the load test itself (load-testing).
---

# Architecture and Performance

## Purpose

Attribute latency to architecture. Most enterprise performance problems are not slow code:
they are a request doing more work than it needs to, across more boundaries than it needs
to cross, in more round trips than anyone counted. Optimising a pattern in isolation
answers the wrong question; the useful unit is the whole path from request to response and
back.

The failure this prevents is the local optimisation that changes nothing — a faster mapper
on a path whose 400 ms is 180 database round trips, or a cache added in front of a query
that was never the bottleneck.

## The request path is the unit

```text
Client
  └─ HTTP framework          parse, bind, validate, filter chain, security
      └─ Controller          mapping in
          └─ Application service    transaction begins ← connection acquired here
              └─ Domain              rules; how much state must be loaded?
                  └─ Repository      how many queries, and are they in a loop?
                      └─ ORM         flush, dirty check, lazy loads, identity map
                          └─ Pool    wait time when saturated
                              └─ DB  execution, locks, index use
          ← mapping out       DTO construction, serialisation, response size
```

Two numbers explain most enterprise latency: **round trips** (database and remote) and
**transaction duration**. Everything else — mapping cost, object allocation, serialisation
— matters after those two are right, and rarely before.

## Workflow

1. **Budget the path before measuring.** Write the expected count of database queries and
   remote calls for the operation. A number written in advance turns "it feels slow" into a
   falsifiable claim.
2. **Count what actually happens.** Query counts per request from the ORM statistics or a
   proxy; remote calls from client metrics; both attributed per endpoint, not aggregated.
3. **Find the multiplier.** If the count scales with result size, you have an N+1 — the
   dominant architectural performance defect in enterprise applications, in both the
   database and the remote-call forms.
4. **Measure transaction duration**, not just query duration. A 5 ms query inside a 900 ms
   transaction is a connection held for 900 ms, and the pool is the real constraint.
5. **Attribute the remainder by layer** before optimising anything: framework, mapping,
   domain, persistence, database. Optimising the wrong layer is the norm, not the
   exception.
6. **Change one architectural thing and re-measure the same budget.** Verify by mechanism —
   the query count should drop to the predicted number, not merely "get better"
   (`performance-methodology`).

## Decision rules

```text
Query count scales with the number of rows displayed
        → N+1. Fix by fetching what is needed in one query or a bounded
          number (jpa-fetching-and-n-plus-one style: join fetch, entity
          graph, or a projection). Do not fix it with a cache.

Query count is constant but large (30+ for one page)
        → the read path is going through the write model. Use a
          projection or a query object, not the aggregate
          (query-objects-and-specifications).

Latency is dominated by remote round trips
        → coarsen the interface (remote-facade-and-dto), parallelise
          independent calls, or replicate the data locally
          (distribution-boundaries). A faster serialiser will not help.

Connection pool wait time is non-zero
        → transactions are too long, or the pool is smaller than
          concurrency demands. Shorten the transaction first; sizing
          second (connection-pool-sizing).

Throughput is flat while CPU is low and the database is idle
        → something is serialised: a lock, a pool, a synchronised block,
          a single-threaded executor. Find the queue
          (littles-law-and-queueing).

The proposal is "add a cache"
        → establish h × T_source first, and establish that the source is
          the bottleneck. A cache over a fast query on a cold path is
          pure risk (caching-strategies).

The proposal is "extract a service to scale it"
        → the bottleneck is usually the shared database, which
          extraction does not move. Measure which resource is saturated
          before splitting a process.

Load test passes, production does not
        → the test's data volume, cardinality, cache state or
          concurrency shape differs. Compare query plans on production
          -shaped data, not on a seeded 100-row table.
```

## Rules

- **Round trips are the currency.** A round trip costs a fixed overhead — network,
  parse, pool, ORM bookkeeping — that dwarfs the work in most enterprise queries. Reducing
  180 queries to 3 beats making each of the 180 twice as fast, by an order of magnitude.
- Architectural patterns have predictable query costs, and those costs are knowable before
  writing the code. Class Table Inheritance costs a join per level; Lazy Load costs a query
  per traversal; an aggregate costs whatever its boundary spans
  (`persistence-cost-model.md`).
- **Transaction duration, not query duration, sizes the connection pool.** The pool is
  sized by concurrency × transaction duration; the single most effective pool fix is
  usually removing work from inside the transaction.
- A layer costs mapping and allocation, not architecture-scale latency. Do not remove a
  layer for performance without measuring — but do count the mapping when a single request
  maps the same data four times across six layers, because that is a real number at
  scale.
- Distribution adds latency it never removes. Extracting a service moves work across a
  network; it improves latency only when the extracted work was contending for a resource
  the caller needed, and it usually is not.
- Tail latency, not average, determines the user's experience and the system's stability
  under load. An average of 80 ms with a p99 of 3 s is a system that fails under
  concurrency, and averaging hides it (`latency-statistics`, `tail-latency-analysis`).
- Measure with production-shaped data. Query plans change with cardinality; a nested loop
  that is optimal at 100 rows is catastrophic at 10 million, and no amount of testing on a
  seeded database finds it.
- Do not benchmark a pattern. Benchmark the endpoint, with the real schema, the real
  volume and the real concurrency; the patterns' differences are almost always smaller than
  the differences between those conditions.
- Serialisation and payload size matter at the network edge, where they are frequently the
  largest single component of a slow API response — an endpoint returning 4 MB of JSON is
  not fixed by a database index (`serialization-performance`).
- Write the budget into a test. A test that fails when an endpoint exceeds its query budget
  catches the reintroduced N+1 on the day it is written, not in the incident review
  (`architecture-testing`).

## References

- [Budgeting the request path](references/request-path-budget.md) — building a latency and
  round-trip budget per endpoint, attributing time by layer, the measurements that
  discriminate between layers, transaction duration and pool arithmetic, and the load-test
  conditions that make a result transferable to production. Read when a path is slow and
  the cause is not yet located.
- [What each pattern costs](references/persistence-cost-model.md) — the query and call cost
  of the persistence and distribution patterns: lazy versus eager, identity map hits,
  inheritance strategies, aggregate size, DTO mapping, chatty remote interfaces, with the
  arithmetic and the fix for each. Read when choosing a pattern, or when explaining why an
  existing one is expensive.
