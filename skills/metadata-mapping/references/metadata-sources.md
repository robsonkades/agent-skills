# Where Mapping Metadata Lives

## The four sources compared

These are composable mechanisms, not exclusive architectures. Compare the mapped type's
dependencies and the actual build/deployment path; generation can feed programmatic mappers.

| Dimension                        | Annotations                              | External XML (`orm.xml`)  | Programmatic                        | Generated from schema             |
| -------------------------------- | ---------------------------------------- | ------------------------- | ----------------------------------- | --------------------------------- |
| Coupling of the mapped class     | persistence API imports                  | avoids annotation imports | depends on mapped type/API          | generated API dependencies        |
| Discoverability                  | excellent                                | poor                      | good                                | good                              |
| Refactor safety (rename a field) | typed references only; strings can drift | startup/tool validation   | depends on typed API versus strings | regenerate then compile consumers |
| Varies per deployment            | needs another artifact or override       | yes                       | yes                                 | if regenerated/selected per build |
| Verbosity                        | low                                      | high                      | high                                | none (generated)                  |
| Review burden                    | low                                      | high                      | medium                              | reviews the schema                |
| Typical fit                      | most applications                        | multi-tenant/OEM mapping  | Data Mapper by hand                 | schema owned elsewhere            |

## Annotations: the default, with its coupling stated

Partial entity mapping: imports, the `order_seq` generator declaration and the mapped
`customer_id` field are omitted. Supply these in the actual persistence unit and test
against its migrated schema. Match Jakarta/legacy javax API and provider versions.

```java
@Entity
@Table(name = "customer_order",
       indexes = @Index(name = "ix_order_customer", columnList = "customer_id"))
public class Order {
    @Id @GeneratedValue(strategy = SEQUENCE, generator = "order_seq")
    private Long id;

    @Column(name = "placed_at", nullable = false)
    private Instant placedAt;
}
```

The mapping is visible beside the field, but explicit column names, `mappedBy` and index
column lists remain strings that can drift. The price is that `Order` imports `jakarta.persistence`.

If these entities are the persistence model and a distinct framework-free domain model sits
beside them, annotations belong on the persistence model. When the domain type is mapped
directly, assess the accepted dependency and entity-shape constraints rather than infer that
either model is redundant (`data-source-patterns`).

**Index and constraint declarations in annotations are documentation, not enforcement**
where migrations own the schema — the ORM will not create them under `validate`. Either keep
them and accept the duplication as intentional documentation, or omit them and let the
migration be the single statement. Choose one and be consistent; the failure mode is an
`@Index` that nobody created and everybody believes in.

## External metadata: the case that justifies it

Partial Jakarta Persistence 3.0 XML override: the persistence unit supplies the remaining
identity/access mapping. Match its namespace and merge rules to the target API/provider.

```xml
<!-- orm.xml — a mapping that varies per deployment -->
<entity-mappings xmlns="https://jakarta.ee/xml/ns/persistence/orm" version="3.0">
  <entity class="com.acme.orders.Order">
    <table name="ORDERS_EU"/>            <!-- region-specific table -->
    <attributes>
      <basic name="placedAt"><column name="PLACED_TS"/></basic>
    </attributes>
  </entity>
</entity-mappings>
```

Real use cases: one codebase deployed against several customer schemas; a product shipped to
customers who own their database; a legacy schema whose column names cannot be brought into
the code; or a mapped model whose dependency contract excludes persistence annotations.
Compare discoverability, rename validation and maintenance cost with that concrete need.
Avoiding annotation imports does not remove entity-shape, lifecycle or provider constraints.

When annotations are an acceptable base, a small XML override can keep common mapping
discoverable. External-only mapping or supported programmatic configuration can also fit.
Apply the specification's element-level override/default rules and metadata-complete settings;
do not assume omitted XML values always preserve annotations or that XML alone selects tenants.

## Programmatic mapping

A hand-written Data Mapper, Spring Data JDBC's conventions, MyBatis or jOOQ. The mapping is
code: explicit translation can be debugged and tested. Frameworks may still use reflection,
conventions or generated accessors; programmatic configuration does not imply zero reflection.

Partial translation sketch; domain/row types, imports and `toLine` are omitted. `Stream.toList()`
requires Java16+. Adapt to the project's supported collection API and required mutability
without upgrading it. The sketch assumes stored status names match `OrderStatus`; otherwise
use an explicit code converter with defined null, unknown-code and historical-value behavior.

```java
@Component
final class OrderRowMapper {
    Order toDomain(OrderRow row, List<OrderLineRow> lines) {
        return Order.reconstitute(
            new OrderId(row.id()),
            new CustomerId(row.customerId()),
            OrderStatus.valueOf(row.status()),
            lines.stream().map(this::toLine).toList(),
            row.version());
    }
}
```

Verbose, and the verbosity is the feature when the domain and the schema genuinely differ:
every translation is visible and every awkward case has an obvious place to live. This is
the natural companion to a separate domain model
(`data-source-patterns`).

## Generated metamodels: removing the string literals

```java
// Generated by the JPA static metamodel processor
@StaticMetamodel(Order.class)
public class Order_ {
    public static volatile SingularAttribute<Order, Long> id;
    public static volatile SingularAttribute<Order, Instant> placedAt;
}

// Used in a criteria query — a renamed field is now a compile error.
cq.where(cb.greaterThan(root.get(Order_.placedAt), since));
```

Enable the metamodel processor matching the Hibernate/JDK version (`hibernate-jpamodelgen`
in older Hibernate lines; artifact names/configuration evolve) and use it wherever the API accepts an
attribute reference. Where it does not — JPQL strings, `Sort.by("...")`, native SQL —
the alternatives are:

- Named constants in one place per entity, so a rename touches one file.
- Provider named-query validation plus explicit Spring repository initialization where
  applicable; deferred/lazy repositories and native SQL need separate tests.
- Integration tests executing relevant queries with representative and edge-case inputs;
  lack of CI execution is a coverage gap, not proof of inevitable production failure.

## Mapping between object shapes

Entity ↔ DTO mapping is metadata mapping of a different kind, and the same trade applies.

| Approach                         | Failure mode                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Hand-written                     | Verbose; a forgotten new field is silent                                                              |
| Annotation processor (MapStruct) | Generated at build time; an unmapped field is a **build** warning or error                            |
| Reflection-based deep mapper     | An unmapped or mistyped field is a **runtime** surprise, sometimes only on one path                   |
| Constructor/record-based mapping | Changed required signatures fail affected call sites; overloads/defaults can keep old calls compiling |

Generation and explicit construction expose some structural mismatches at build time.
For MapStruct, use `unmappedTargetPolicy = ERROR` when every target property must be accounted
for, with intentional omissions explicit. That checks coverage, not semantic correctness:
same-typed fields can have different meanings, and automatic conversions can lose precision
or use the wrong units. Verify applicable null/default, unit/rounding, enum/code and nested
mapping contracts with representative and boundary values. Keep adequate hand-written
translation; strict processor settings do not establish superiority or validate business rules.

Whichever is used, keep the mapper free of business logic: a mapper that computes a total or
decides a status is a domain rule hiding in a translation layer
(`enterprise-architecture-smells`).

## Deciding, in one pass

```text
Is there a separate framework-free domain model?
├── no  → annotations on the entities. Record that the entities are the
│         persistence model and the coupling is accepted.
└── yes → metadata on the persistence model only. If annotations are
          appearing on the domain type, inspect the specific coupling and
          mapping responsibilities before declaring either model redundant.

Must the same code map to different schemas per deployment?
├── yes → annotations plus a small orm.xml override, or programmatic.
└── no  → retain the simplest mapping that meets the independence/tooling contract;
          external metadata can also isolate framework dependencies.

Do column or attribute names appear as strings anywhere?
└── yes → use a metamodel where the API accepts typed references and it improves this path;
          validate relevant remaining strings through supported bootstrap/query checks.
```

Sources: [Jakarta Persistence 3.2 XML descriptor rules](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2#use-of-the-xml-descriptor),
[MapStruct 1.6 reference](https://mapstruct.org/documentation/1.6/reference/html/),
[Java17 Stream.toList API](<https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/stream/Stream.html#toList()>).
