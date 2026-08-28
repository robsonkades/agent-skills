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
  the collection abstraction over aggregates (repository-pattern), fetch strategies and N+1
  (orm-behavioral-patterns), where mapping metadata lives (metadata-mapping), or index
  design and pagination at the database level.
---

# Query Objects and Specifications

## Purpose

Give queries a first-class representation when composition, reuse or dynamic filtering
justifies it — and keep them as plain statements when they do not. The Query Object pattern
exists because building SQL by string concatenation is unsafe and unreusable, and because a
business criterion ("orders overdue for a premium customer") deserves a name.

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
   specification that adds a join per predicate produces duplicated joins and wrong counts.
6. **Test the composition, not just the parts.** `and(a, b)` can be correct while both parts
   are, and still produce a cartesian product.

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
        → SQL. Do not express it as objects; it will be longer, slower
          and less reviewable.

A count or an existence check
        → a dedicated query. Loading entities to count them is the most
          common needless cost in this area.

The query returns entities that are only read
        → a projection. The write model is not the read model
          (repository-pattern).
```

## Rules

- **A query object is not a database abstraction.** Its purpose is composition and naming,
  not portability. Designing one so the storage could be swapped produces a lowest-common-
  denominator API and usually still fails to be portable
  (`architecture-decision-making`).
- Derived query methods are excellent until they are not: they stop paying when the name
  exceeds roughly four conditions, when the same criterion appears in several method names,
  or when optional parameters force a method per combination.
- **Composition hides joins.** Two specifications that each join the same association can
  produce two joins, duplicated rows and a wrong count. Where the API allows, check whether
  the join already exists before adding one, and always verify with a count assertion in a
  test.
- Specifications must be named after business criteria, not after SQL fragments.
  `OrderSpecs.overdue(clock)` is a domain concept; `OrderSpecs.dateLessThan(field, value)`
  is a query builder rebuilt badly, and it gives up every benefit of the pattern.
- Keep pagination and sorting out of the criteria object. They are presentation concerns
  that vary per caller; mixing them in makes the criteria non-reusable.
- **Sorting by a user-supplied field is an injection surface** in every mechanism that takes
  a property name as a string. Allowlist the sortable fields; never interpolate.
- Dynamic queries with wildly different shapes make the optimiser's job harder — parameter
  sniffing and plan reuse can produce a plan good for one filter combination and terrible
  for another. When one combination dominates, a dedicated statement for it is a legitimate
  optimisation.
- A criteria API is a poor way to express set operations, aggregations, window functions and
  recursion. Reach for SQL, owned by a gateway, and stop apologising for it
  (`data-source-patterns`).
- Every query used in production should be executed at least once in CI. A JPQL string or a
  criteria path that names a renamed field fails at runtime, on whichever path nobody
  tested (`metadata-mapping`).
- Read paths do not need the aggregate, the transaction or the repository. Routing them
  through the write model to preserve symmetry is the leading cause of slow list screens
  (`architecture-and-performance`).

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
