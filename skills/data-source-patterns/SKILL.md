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
each one couples to what. Inspect both **who owns database access** and how independently
the object model must evolve from the schema. Shape alone does not classify a pattern.

The failure this prevents is choosing by default — JPA entities for everything because the
starter is on the classpath, or a hand-rolled DAO layer because the previous project had
one — and then fighting the consequences for years in code that looks like a mapping
problem but is a pattern-selection problem.

## The four patterns

```text
Table Data Gateway     one gateway for a table or view; its SQL lives
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
`JdbcClient` is a JDBC facade, not a pattern choice: its caller can implement a table
gateway, aggregate repository or mapper. Classify responsibilities, not class names.

## Workflow

Examples are partial Java 17 snippets; `JdbcClient` requires Spring Framework 6.1+.
Inspect the project's compiler/toolchain, resolved Spring/JPA versions, database dialect,
schema constraints and transaction configuration before adapting them. Use existing JDBC
APIs on older stacks; adopting this skill does not authorize a dependency/runtime upgrade.

1. **Start from the logic organisation**, which is the prior decision
   (`domain-logic-organization`). Transaction scripts pair naturally with gateways; a
   domain model needs a mapper — or Active Record if the model happens to mirror the tables.
2. **Measure the shape gap.** Compare the object model you want with the schema you have:
   count the places where one concept spans several tables, one table serves several
   concepts, or the schema is owned elsewhere. A rich model with a wide gap favors a mapper;
   a reporting projection against that same schema may only need a gateway.
3. **Establish who owns the schema.** If it is yours and it can follow the model, Active
   Record may be economical. If it is externally owned, inspect actual constraints and change
   history: isolate translation when domain behavior needs independence, without inventing a domain model for reports.
4. **Check the work shape.** Consider a SQL gateway for set-based or reporting work when
   query control, translation or measured cost warrants it. An existing ORM projection or
   bulk query may already fit; validate its invariant, versioning and managed-state effects
   before adding another access layer. For mixed JDBC/JPA paths, verify transaction participation
   and flush/context visibility; sharing a database URL does not prove atomicity.
5. **Decide per module.** A pricing engine with a mapper and an admin CRUD area with Active
   Record in one application is a reasonable design, provided the boundary between them is
   explicit.
6. **Write down what the choice couples**, so the next person understands the cost of
   changing it.

## Decision rules

```text
Transaction scripts, set-based work, reporting, imports
        → Consider Table Data Gateway for explicit set-oriented access.
          Keep business-policy ownership outside it; technical checks are allowed.

Simple CRUD, schema mirrors the model, you own the schema, thin rules
        → Active Record is a candidate if persistence methods on the
          object fit the existing stack; a simple mapper is also reasonable.

Rich interacting business rules; model and schema will diverge
        → Data Mapper. This is what the pattern exists for and the cost
          is the mapping layer.

Schema owned elsewhere, or legacy, or shaped for reporting
        → Mapper plus translation when a domain model needs isolation;
          a read/reporting gateway may suffice. Do not let the foreign schema
          become the model (legacy-enterprise-modernization).

Domain model already chosen, and the schema currently matches it
        → JPA entities are a Data Mapper whose mapping is declarative.
          Acceptable and common; the risk is that the annotations start
          shaping the model (orm-structural-mapping).

Rules need testing without a database
        → First isolate rule execution from I/O. Both a JPA entity and an
          Active Record can have pure rule methods. Add a separate domain
          model only when mapping constraints justify it.

Read path of an application whose write path uses a mapper
        → Consider a gateway/projection when loading the write model adds
          measured cost; ordinary aggregate reads remain legitimate.
```

## Rules

- **Active Record is not a beginner's pattern.** A close object/row correspondence and
  simple rules can make combined access and behavior economical. Revisit when observed
  mapping or testing constraints obstruct the model, rather than on a pattern label alone.
- Active Record combines persistence and domain behavior in one object, often keeping a
  close row shape. Mapping features can absorb column renames or value types; inspect actual
  change propagation rather than asserting every domain change needs a migration.
- Data Mapper's real cost is the mapping layer: code to write, code to test, and a place
  for bugs that neither the model nor the schema exhibits alone. It is worth paying when
  independence or mapping complexity warrants it, even when current shapes happen to match.
- A JPA entity without persistence methods remains part of a Data Mapper-style unit of work, even
  when persistence constraints distort its design; call that **persistence leakage**, not Active
  Record. If the model has an `Integer` where the domain means an enum, a flattened
  address because `@Embeddable` was awkward, or a bidirectional association that exists
  only for a mapping, the schema is already shaping the model — decide deliberately whether
  that is acceptable here.
- Do not build a DAO layer that wraps a repository that wraps the ORM. Each layer must add
  behaviour — a translation, a policy, an aggregate boundary — or it is indirection
  (`enterprise-architecture-smells`).
- Table Data Gateway pairs with transaction scripts. Resource handling, row-count checks,
  SQL predicates and optimistic concurrency checks are legitimate conditionals. Hidden
  business-policy decisions migrating into the gateway are the concern, and
  it is hard to find later because nobody looks for rules in a data-access class.
- Row Data Gateway is rarely chosen deliberately today, but it names a useful boundary: a
  row object with no business logic. When a "domain object" has only accessors and
  persistence, that is what it is, and calling it that clarifies the design
  (`domain-logic-organization`).
- Different patterns may coexist. Multiple mechanisms can write one table during migrations or for
  deliberately partitioned operations, but they must share invariant, versioning and transaction
  rules with explicit write authority. Uncoordinated writers are the defect
  (`offline-concurrency-control`).
- SQL can avoid object loading for reporting and bulk changes; verify plans, rows touched,
  round trips and application latency. Set-based writes must preserve invariants, versioning
  and transaction semantics; ORM callbacks and managed state may be bypassed. Decide flush
  and invalidation order before direct SQL; `clear` can discard unflushed entity changes.

Deliver a pattern choice grounded in one representative read/write path, ownership and
coupling costs, plus a validation case and revisit trigger. If schema or lifecycle evidence
is missing, state the conditional choice instead of prescribing a migration.

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
