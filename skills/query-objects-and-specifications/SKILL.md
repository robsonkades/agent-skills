---
name: query-objects-and-specifications
description: >
  Expressing queries as objects that can be composed, named and tested — Query Object,
  Specification, criteria builders, derived repository methods and explicit SQL — and
  choosing between them per query rather than adopting one style everywhere. Use when
  repository interfaces have grown dozens of findByAAndBAndCOrderByD methods, when a search
  screen with optional filters is being built by concatenating strings, when a Specification
  chain has become unreadable or produces a query nobody can predict, when dynamic filtering
  is needed across several entities, when a criteria query is being written for something a
  single SQL statement would express, when reads are being forced through the aggregate, or
  when a query object is being proposed as an abstraction over the database. Does not cover
  the collection abstraction over domain objects (repository-pattern), fetch strategies and N+1
  (orm-behavioral-patterns), where mapping metadata lives (metadata-mapping), or index
  design and pagination at the database level.
---

# Query Objects and Specifications

## Purpose

Give queries a first-class representation when composition, reuse or dynamic filtering
justifies it — and keep them as plain statements when they do not. The Query Object pattern
can support safe reusable composition. Concatenating trusted fixed SQL fragments with bound
values is valid; interpolating untrusted values or identifiers is not. A
business criterion ("orders overdue for a premium customer") also deserves a name.

Two failures bracket the topic. The **method explosion**: a repository with 40 derived
finders, each a slight variation, none composable. The **specification maze**: a composable
DSL so indirect that nobody can predict the SQL, the fetch behaviour or the index usage from
reading the call site.

## The options

```text
Derived query method       findByStatusAndCustomerId(...). Zero code,
                           self-documenting, not composable. Excellent
                           for a small fixed set of queries.

Named query / explicit     JPQL or SQL, written once, named. Predictable,
statement                  reviewable, optimisable. Not composable.

Query Object               an object holding criteria, translated to a
                           query by something that knows the storage.
                           Composable and testable.

Specification              a predicate object over the domain, combinable
                           with and/or/not; the ORM's criteria API is the
                           usual implementation.

Type-safe query DSL        a generated fluent API over the schema or the
                           entities. Composable and compile-checked.
```

## Workflow

1. **Count the real variability.** A screen with three optional filters has eight
   combinations, not infinite ones — and eight is often better served by two or three named
   queries than by a composable framework.
2. **Name the business criteria.** `OverdueInvoices`, `ActiveSubscriptionsRenewingBefore`.
   If a criterion has a name in the business, it should have one in the code, whatever
   mechanism implements it.
3. **Choose the mechanism per query**, not per project. A repository can hold derived
   methods, a named JPQL query and one specification-based search without inconsistency.
4. **Decide the result shape first.** Most queries behind a screen want a projection, not
   an entity — that decision usually matters more than the composition mechanism
   (`architecture-and-performance`).
5. **Read the generated SQL** for anything composed. Composition hides joins, and a
   specification that adds a join per predicate can change row multiplicity or existential
   meaning. Join reuse must preserve type, ON clauses and same-child versus different-child intent.
6. **Test the composition, not just the parts.** Individually correct predicates can combine
   into wrong joins, NULL behavior or counts. Test content, count, existence and access scope.

## Decision rules

```text
A handful of fixed queries, each used in one place
        → derived methods or a named query. Adding a composition
          framework here is pure overhead.

One search screen with optional filters
        → a query object holding the filter values, translated in one
          place. Readable, testable, and the SQL is predictable.

The same business criterion is used in several queries and must stay
consistent (what counts as "active", "overdue", "billable")
        → a named specification. This is the strongest justification for
          the pattern: one definition, many uses.

Filters must combine arbitrarily across many fields (an admin search,
a rules engine, a saved-search feature)
        → specifications or a type-safe DSL. Accept the indirection;
          this is the case that earns it.

A report, an aggregation, a window function, a recursive query
        → compare explicit SQL with a capable DSL/provider API. Choose the
          clearest supported expression and verify the generated plan.

A count or an existence check
        → a dedicated query. Loading entities to count them is the most
          common needless cost in this area.

The query returns entities that are only read
        → consider a projection; bounded entity reads can also be appropriate.
          Choose result shape from required data and behavior (repository-pattern).
```

## Rules

- **A query object is not a database abstraction.** Its purpose is composition and naming,
  not portability. Designing one so the storage could be swapped produces a lowest-common-
  denominator API and usually still fails to be portable
  (`architecture-decision-making`).
- Derived query methods stop paying when names obscure intent, criteria repeat, optional parameters
  cause combinatorial methods, or generated SQL becomes hard to predict. There is no meaningful
  universal condition-count threshold; use reviewability and change frequency.
- **Composition hides joins.** Repeated to-many joins can multiply roots, while reused joins
  can accidentally require predicates to match the same child. Choose join aliases or EXISTS
  from the intended quantifiers; verify result rows, count and SQL. Reuse by attribute name
  alone is insufficient.
- Name reusable business criteria explicitly. Generic field predicates can support a
  constrained query builder but are not a substitute for domain names; validate their
  fields, operators and complexity.
- Keep reusable predicates separable from pagination and sorting. A use-case query request
  may contain both; cursors must bind their ordering and filters consistently.
- Allowlist sortable fields, directions and supported null semantics. Validated ORM property
  paths are not inherently raw SQL injection, but interpolated identifiers and unsafe sort
  expressions can be. Bind values and choose SQL fragments from trusted constants.
- Dynamic queries with wildly different shapes make the optimiser's job harder — parameter
  sniffing and plan reuse can produce a plan good for one filter combination and terrible
  for another. When one combination dominates, a dedicated statement for it is a legitimate
  optimisation.
- Criteria, HQL and generated DSL support varies by version. Prefer explicit SQL when it
  expresses complex operations more clearly; do not infer performance from syntax alone
  (`data-source-patterns`).
- Execute every materially distinct query shape in CI where feasible, prioritizing dynamic,
  privileged and high-traffic paths. Combinatorial searches may require pairwise/property-based
  coverage plus production telemetry rather than pretending every value combination was run
  (`metadata-mapping`).
- Read paths need not hydrate aggregates or use their write repository, but may still need
  transactions for consistency or cursor lifecycle. Choose deliberately rather than routing
  through the write model only for symmetry
  (`architecture-and-performance`).

Mandatory tenant/authorization predicates are not optional user filters. Obtain their scope
from trusted context and AND it outside any user-controlled OR/NOT expression; apply the same
scope to content, count, existence, export and subsequent fetch phases. An empty allowed scope
must deny results, not omit the restriction. Bound page size and query complexity.

Inspect the Java toolchain, Spring/Data/provider versions, generated metamodel and schema
before choosing APIs. Return the chosen representation, result/NULL/date/currency semantics,
mandatory scope, predicted SQL and a test covering the material composition risk. Missing
schema or version evidence leaves those choices conditional; no dependency upgrade is implied.

## References

- [Composition styles](references/composition-styles.md) — derived methods, a plain query
  object, JPA specifications and a type-safe DSL implemented over the same search screen,
  with the composition traps (duplicated joins, wrong counts, lost fetches) and the naming
  discipline that keeps specifications readable. Read when choosing a mechanism or
  refactoring a repository that has outgrown derived methods.
- [Query performance and result shape](references/query-performance.md) — projections
  versus entities, counting and existence, pagination including keyset pagination, what
  composition does to plans and indexes, streaming large results, and the query-budget test.
  Read when a query is slow, returns too much, or is about to be written against a large
  table.
