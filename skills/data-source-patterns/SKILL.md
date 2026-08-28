---
name: data-source-patterns
description: >
  Choosing how code reaches the database — Table Data Gateway, Row Data Gateway, Active
  Record or Data Mapper — from the shape of the domain logic rather than from framework
  habit, and knowing what each one couples together. Use when a new module's persistence
  approach is being chosen, when entities carry both business rules and save() methods, when
  JPA is being applied to a schema that fights it, when SQL is scattered through service
  classes, when a "DAO" layer duplicates what the ORM already provides, when the domain
  model's shape is visibly dictated by the tables, when bulk or reporting work is being
  forced through an ORM, or when a team is arguing Active Record versus Data Mapper in the
  abstract. Does not cover where business logic lives (domain-logic-organization), the ORM's
  runtime behaviour — unit of work, identity map, lazy load (orm-behavioral-patterns), the
  column-level mapping decisions (orm-structural-mapping), or the collection-shaped
  abstraction over aggregates (repository-pattern).
---

# Data Source Patterns

## Purpose

Pick the data-access pattern that matches the logic it will serve, and know precisely what
each one couples to what. The four patterns differ in one dimension that predicts almost
everything else: **how much the in-memory representation is allowed to differ from the
table.**

The failure this prevents is choosing by default — JPA entities for everything because the
starter is on the classpath, or a hand-rolled DAO layer because the previous project had
one — and then fighting the consequences for years in code that looks like a mapping
problem but is a pattern-selection problem.

## The four patterns

```text
Table Data Gateway     one object per table; all SQL for that table lives
                       there; methods take and return primitives or record
                       sets. No domain objects, no per-row identity.

Row Data Gateway       one object per row; it holds the row's data and
                       knows how to load and save itself. No business
                       logic — that distinction is the whole point.

Active Record          Row Data Gateway plus the business logic for that
                       row. Object shape follows table shape; persistence
                       is a method on the object.

Data Mapper            a separate mapper moves data between objects and
                       tables. The objects know nothing about persistence,
                       so the two shapes may diverge freely.
```

An ORM like JPA/Hibernate is a Data Mapper implementation with an identity map and a unit
of work attached. Spring Data JDBC is closer to a Data Mapper with a simpler contract;
`JdbcClient` with a repository class is a Table Data Gateway.

## Workflow

1. **Start from the logic organisation**, which is the prior decision
   (`domain-logic-organization`). Transaction scripts pair naturally with gateways; a
   domain model needs a mapper — or Active Record if the model happens to mirror the tables.
2. **Measure the shape gap.** Compare the object model you want with the schema you have:
   count the places where one concept spans several tables, one table serves several
   concepts, or the schema is owned elsewhere. A wide gap forces a Data Mapper; a narrow
   one makes Active Record honest.
3. **Establish who owns the schema.** If it is yours and it can follow the model, Active
   Record is cheap. If a DBA team, another service or a legacy system owns it, assume the
   gap will widen and choose a mapper.
4. **Check the work shape.** Set-based and reporting work belongs in a gateway with SQL,
   whatever the write side uses. Mixing is normal and correct.
5. **Decide per module.** A pricing engine with a mapper and an admin CRUD area with Active
   Record in one application is a reasonable design, provided the boundary between them is
   explicit.
6. **Write down what the choice couples**, so the next person understands the cost of
   changing it.

## Decision rules

```text
Transaction scripts, set-based work, reporting, imports
        → Table Data Gateway. SQL is the point; objects would be
          overhead. Keep the gateway free of conditionals.

Simple CRUD, schema mirrors the model, you own the schema, thin rules
        → Active Record. Honest, compact, fastest to write. Say so
          explicitly rather than apologising for it.

Rich interacting business rules; model and schema will diverge
        → Data Mapper. This is what the pattern exists for and the cost
          is the mapping layer.

Schema owned elsewhere, or legacy, or shaped for reporting
        → Data Mapper, plus translation. Do not let the foreign schema
          become the model (legacy-enterprise-modernization).

Domain model already chosen, and the schema currently matches it
        → JPA entities are a Data Mapper whose mapping is declarative.
          Acceptable and common; the risk is that the annotations start
          shaping the model (orm-structural-mapping).

Needs testing without a database, or the persistence technology is
genuinely expected to change
        → Data Mapper with the interface owned by the domain. Note that
          "might change" is not evidence (architecture-decision-making).

Read path of an application whose write path uses a mapper
        → a gateway or a projection. Do not route reads through the
          write model (architecture-and-performance).
```

## Rules

- **Active Record is not a beginner's pattern.** It is the correct pattern when the object
  and the row are the same concept, and it stays correct as long as that holds. It fails
  when the model must diverge from the schema — and the failure is gradual, which is why
  the decision deserves a stated trigger for revisiting.
- Active Record's real cost is not "impure objects"; it is that **the object's shape is
  pinned to the table's shape**. Every schema change is a model change and every model
  change is a migration, so the two evolve in lockstep whether or not they should.
- Data Mapper's real cost is the mapping layer: code to write, code to test, and a place
  for bugs that neither the model nor the schema exhibits alone. It is worth paying when
  the shapes genuinely differ and wasteful when they do not.
- **A JPA entity annotated into a shape the ORM likes is Active Record wearing a mapper's
  clothes.** If the model has an `Integer` where the domain means an enum, a flattened
  address because `@Embeddable` was awkward, or a bidirectional association that exists
  only for a mapping, the schema is already shaping the model — decide deliberately whether
  that is acceptable here.
- Do not build a DAO layer that wraps a repository that wraps the ORM. Each layer must add
  behaviour — a translation, a policy, an aggregate boundary — or it is indirection
  (`enterprise-architecture-smells`).
- Table Data Gateway pairs with transaction scripts and stays healthy as long as it holds
  no conditionals. Business logic migrating into the gateway is the pattern degrading, and
  it is hard to find later because nobody looks for rules in a data-access class.
- Row Data Gateway is rarely chosen deliberately today, but it names a useful boundary: a
  row object with no business logic. When a "domain object" has only accessors and
  persistence, that is what it is, and calling it that clarifies the design
  (`domain-logic-organization`).
- Different patterns may coexist in one application, and usually should. What must not
  happen is two patterns writing the same table, because then two mechanisms own its
  invariants and its optimistic locking (`offline-concurrency-control`).
- SQL is not a failure of abstraction. Reporting, bulk updates and set-based rules are
  clearer, faster and more maintainable as SQL owned by a gateway than as object graphs
  loaded to be looped over.

## References

- [Gateways, Row Data Gateway and Active Record](references/gateways-and-active-record.md)
  — each pattern implemented in modern Java, what belongs in each and what must not, where
  the gateway degrades, Active Record in a Spring stack and its honest limits, and the
  signals that a pattern has been outgrown. Read when implementing or reviewing one of
  them.
- [Active Record versus Data Mapper](references/active-record-vs-data-mapper.md) — the
  comparison dimension by dimension with the same domain implemented both ways, what each
  actually couples, testability and query control, the JPA middle ground and its risks, and
  the migration path when the choice must change. Read when the decision is genuinely open
  or is being re-opened.
