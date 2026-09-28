# Mapping, identifiers and references

Use this for changes to entity fields, associations or identity. The checks below use
Jakarta Persistence contracts and Hibernate 7.4 where explicitly named; inspect the
resolved provider before transferring provider-specific annotations.

## Map three contracts together

Start with the business domain and deployed DDL, then reconcile Java representation,
JDBC binding/extraction and SQL storage. Include nullability, precision/scale, defaults,
length units, collation and values already written by older application versions.
`@Column(nullable = false)` in metadata is not proof of a deployed constraint; a Java
primitive cannot represent SQL null. `columnDefinition` is a dialect-specific DDL hint,
not a substitute for a correct binding or migration.

For a requested complete entity mapping, enumerate **all** persistent attributes after
resolving field/property access, inherited mappings and embeddables. Include optional
attributes and deliberate defaults, not just `@Column(nullable=false)` fields. For each,
account for the following applicable contract in annotations, domain code, migration,
tests or concise accompanying documentation:

- Attribute meaning and Java type; table/column name under the actual naming strategy;
  SQL/JDBC type, converter, enum representation and compatibility with existing rows.
- String/binary length with its units; decimal precision/scale and rounding; temporal
  precision/time semantics; null versus empty/default versus absence. Do not add precision
  and scale to types where they do not define the intended database representation.
- Nullability at each relevant layer: `@Basic(optional=false)` describes a basic mapping's
  value requirement (a hint disregarded for primitives); `@Column(nullable=false)` describes
  column nullability; Bean Validation `@NotNull` checks at configured validation boundaries.
  None alone proves the deployed database constraint or all input paths are validated.
- For associations, target/cardinality, owning side, join columns, `optional`, FK nullability,
  fetch behavior, cascades and orphan ownership. Do not put `@Column` on a relationship.
  An embedded value's columns/lifecycle belong to its owner; review attribute overrides too.
- Insert/update ownership, generated/default values, identifier strategy and version.
  `insertable=false`/`updatable=false` controls ORM-generated SQL, not Java immutability or
  database permissions; a database default does not apply when a NULL is explicitly inserted.
- Uniqueness, checks, FK/index shape and migration ownership. Add uniqueness only for a
  real invariant: a nullable or descriptive column does not become unique for completeness.
  Table-level/composite constraints may express the rule better than per-column flags.

Choose useful explicit annotations when they prevent ambiguity; retain conventional names
or defaults when documented and verified. A complete review reconciles that inventory with
schema and boundaries; it does not mechanically set every annotation parameter. Test optional
null and present values, size/range edges and mutable/generated field behavior. Do not apply
runtime HTTP schema annotations to entities as a substitute for persistence contracts.
[Jakarta Column](https://jakarta.ee/specifications/persistence/3.2/apidocs/jakarta.persistence/jakarta/persistence/column),
[Jakarta Basic](https://jakarta.ee/specifications/persistence/3.2/apidocs/jakarta.persistence/jakarta/persistence/basic).

| Situation                                            | Decision and discriminating evidence                                                                                                                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL Server status is 0–255                           | Java `byte`/`Byte` cannot express the full range. Use an adequate Java type, explicit domain validation and the actual dialect's binding. Test 0, 127, 128, 255 and rejection of -1/256.                                                                      |
| Status is an unconstrained integer or may exceed 255 | An INTEGER mapping and schema may be appropriate. Do not squeeze the domain into TINYINT for presumed space/performance gains. A changed requirement needs a compatible migration.                                                                            |
| A stable code is stored for an enum                  | Assign stable codes with a converter or explicit mapping, reject/handle unknown codes by contract, and test old rows after enum evolution. Reordering an ordinal mapping changes meaning. Do not combine `@Enumerated` and a converter as competing mappings. |
| Decimal quantity or amount                           | Define range, scale and rounding policy, use an appropriate decimal Java/SQL representation, and test boundary/rounding behavior. A floating representation changes the numerical contract.                                                                   |
| Text contains non-ASCII or supplementary characters  | Choose column/collation and national/non-national binding as one contract. Test write, read, equality, ordering and maximum encoded length, not just a literal SQL insert.                                                                                    |

`@JdbcTypeCode(SqlTypes.TINYINT)` and `@JdbcTypeCode(SqlTypes.INTEGER)` are Hibernate
mapping choices, not universally better annotations. Defaults may already match. SQL
Server TINYINT is unsigned 0–255; PostgreSQL does not have that TINYINT type. In the
fixture's Hibernate **7.4.5.Final**, SQLServerDialect registers TinyIntAsSmallIntJdbcType
for TINYINT, so its binder differs from the generic byte-based TinyIntJdbcType. The
fixture uses `Short` for the Java range. Do not extrapolate this implementation detail
to other dialects/releases or claim an annotation alone proves a 255 round-trip.
[SQL Server ranges](https://learn.microsoft.com/en-us/sql/t-sql/data-types/int-bigint-smallint-and-tinyint-transact-sql),
[version-pinned dialect source](https://github.com/hibernate/hibernate-orm/blob/7.4.5/hibernate-core/src/main/java/org/hibernate/dialect/SQLServerDialect.java),
[generic binder source](https://github.com/hibernate/hibernate-orm/blob/7.4.5/hibernate-core/src/main/java/org/hibernate/type/descriptor/jdbc/TinyIntJdbcType.java).

For SQL Server, NVARCHAR and Hibernate `@Nationalized` are useful when national character
storage/binding is intended. VARCHAR under an appropriate UTF-8 collation can also hold
Unicode; legacy code pages differ, and `varchar(n)` measures bytes. Inspect actual
collation, driver version and `setString` versus `setNString`. The Microsoft driver checks
`sendStringParametersAsUnicode` for CHAR/VARCHAR/LONGVARCHAR parameters; national methods
send Unicode regardless. Setting the flag false globally can lose characters on some
paths. Match the indexed column without sacrificing data integrity, then compare plans.
PostgreSQL character encoding and types require their own choices; do not copy NVARCHAR
DDL or Microsoft connection flags there.
[Collation and Unicode](https://learn.microsoft.com/en-us/sql/relational-databases/collations/collation-and-unicode-support),
[driver parameter contract](https://learn.microsoft.com/en-us/sql/connect/jdbc/setting-the-connection-properties#sendstringparametersasunicode),
[PostgreSQL character types](https://www.postgresql.org/docs/current/datatype-character.html).

For `Instant`/offset/local time, establish whether the domain is an instant, wall-clock
time or an offset-preserving value. Inspect Hibernate's chosen JDBC type and DDL rather
than assuming every Instant uses SQL Server datetime2 or every timestamp preserves an
offset. Test round-trips under two JVM time zones and at database precision boundaries.
`hibernate.jdbc.time_zone=UTC` affects specific JDBC temporal interactions; it does not
govern every Java-time API or repair incorrectly stored historical values.
[Hibernate JDBC settings](https://docs.hibernate.org/orm/7.4/javadocs/org/hibernate/cfg/JdbcSettings.html).

## Entity and association ownership

Preserve the entity construction/access strategy and provider requirements; avoid
automatic equality, hashing or string output over mutable fields or lazy associations.
Generated IDs may be absent before persistence: test collection membership and equality
at the lifecycle points the application uses. Do not expose a persistence graph as an
HTTP contract just to avoid writing a DTO.

Identify the owning side that writes the FK; maintain both Java sides when needed for a
consistent graph. Cascade describes propagation of persistence operations, not generic
ownership or authorization. `REMOVE`/orphan removal is suitable only for lifecycle-owned
children; cascading removal to a shared catalog entity can delete unrelated data. Inspect
database cascades too. Test reassignment, removal, empty relationships and rollback after
flush/clear. Deeper inheritance/aggregate restructuring is a separate mapping decision.

## Equality across entity lifecycles

Preserve reference identity when entities remain within one persistence context and callers
do not require logical equality across detached instances. An immutable, genuinely unique
natural key established before persistence is another option; enforce its uniqueness and
avoid nullable/mutable fields or lazy associations. Neither choice is universal. Composite
identifier classes have their own value-equality contract.

When generated-ID entity equality is required, the requested pattern is implemented in
the runnable Movement fixture: final `equals`, identity fast path, null rejection, both
effective classes resolved with `HibernateProxy.getHibernateLazyInitializer().getPersistentClass()`
or `getClass()`, followed by non-null `getId()` and `Objects.equals(this.getId(), that.getId())`.
Its final `hashCode` uses the same effective class's hash, not the generated ID. This keeps
an object in the same hash bucket when its ID is assigned and prevents two new null-ID
objects from being equal. It deliberately gives all instances of one class the same hash;
large hash collections can therefore have poor distribution. Do not claim it improves
collection performance or replace every adequate equality design with it.

The complete implementation lives in
[Movement.java](../assets/persistence-fixture/src/main/java/example/persistence/Movement.java).
Final methods keep a Hibernate subclass proxy from intercepting those methods; getters
remain callable by the proxy. The effective-class step does not initialize the proxy just
to obtain its declared persistent class. **ID getter access can still initialize it**:
`hibernate.jpa.compliance.proxy=true` can initialize a proxy still associated with its
session when its identifier is accessed. In Hibernate **7.4.5**, AbstractLazyInitializer
checks `session != null` before applying that rule. The fixture observes that closing the
context detaches the proxy: equality can then use its known ID without initializing it,
even though compliance was true. Access to unloaded non-ID state still fails. This
counterexample means neither blanket zero-query nor blanket closed-context failure follows
from the compliance flag. Do not turn compliance off solely to hide a
failure. Test actual lifecycle/configuration, or compare known IDs outside the entity when
that better expresses the caller's contract.
[Hibernate proxy compliance](https://docs.hibernate.org/orm/7.4/javadocs/org/hibernate/cfg/JpaComplianceSettings.html),
[LazyInitializer API](https://docs.hibernate.org/orm/7.4/javadocs/org/hibernate/proxy/LazyInitializer.html),
[version-pinned initializer](https://github.com/hibernate/hibernate-orm/blob/7.4.5/hibernate-core/src/main/java/org/hibernate/proxy/AbstractLazyInitializer.java).

The example has no entity inheritance. A proxy obtained for a polymorphic base type may
expose that declared persistent class while the loaded object is a subtype; do not assume
the exact-class rule implements the desired hierarchy equality. Establish the inheritance
identity contract and test base/subtype/proxy combinations before reusing this pattern.
Direct access to a proxy's ID field is not equivalent to its getter. Avoid Lombok `@Data`
or generated all-field equality on entities: mutable quantities, version, audit timestamps
and relationships are not stable identity inputs.

Required checks for this pattern: distinct transient instances, reflexivity/null/other type,
HashSet insertion before ID allocation and lookup afterward, independently loaded/detached
instances, proxy/concrete symmetry and equal hashes, and initialized/uninitialized proxies
with open/closed contexts under the actual compliance configuration. The fixture exercises
both proxy-compliance settings; this does not establish behavior for every provider or
bytecode-enhanced/polymorphic model.

## ID generation is a shared protocol

| Candidate                     | Favor it when                                                                   | Cost/condition that can reverse the choice                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing identity column      | Existing schema/writers and modest insertion needs make it sufficient           | Hibernate identity generation prevents its normal JDBC insert batching for those inserts. Do not change a published ID/schema contract solely to enable a theoretical batch.            |
| Sequence                      | Database supports it and identifier preallocation or batched inserts are useful | Coordinate physical increment, optimizer, all writers and migration sequencing. Reservations/restarts/rollbacks create gaps.                                                            |
| Assigned business key or UUID | Offline creation or an established immutable identity needs it                  | Establish new-entity detection, collision/uniqueness contract, storage/index consequences and generation source. Random UUID locality and distributed uniqueness are separate concerns. |

The concrete sequence example is the **SQL Server fixture**, not a global recipe:

```java
// Partial mapping; complete class and DDL are in assets/persistence-fixture/.
@Id
@GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "outbox_event_seq")
@SequenceGenerator(name = "outbox_event_seq", sequenceName = "outbox_event_seq",
                   allocationSize = 50)
private Long id;
```

For the fixture's `hibernate.id.optimizer.pooled.preferred=pooled-lo`, the database
sequence increments by 50. The optimizer interprets a returned value as the start of
an allocated range. Check schema qualification, initial/current sequence state,
`allocationSize`, optimizer selection and physical increment before deployment; a
live sequence change needs a coordinated rollout and existing-writer analysis.
Allocation 50 is not JDBC batch 50 and neither is the database sequence cache size.
Do not reset a shared sequence to `max(id)+1` while processes hold reserved ranges.
Non-Hibernate writers must participate in a compatible allocation protocol; inspect
them instead of assuming every `NEXT VALUE FOR` consumer allocates identically.
[Pooled-lo contract](https://docs.hibernate.org/orm/7.4/javadocs/org/hibernate/id/enhanced/PooledLoOptimizer.html).

Verify more than the first insert: allocate across a block boundary, interleave separate
factories/processes, restart one, roll back an insert, and check uniqueness plus valid
ranges. Gaps are expected; never assert consecutive IDs or infer commit order from them.
Sequence validation at startup can expose mismatch, but it does not audit external writers.

## References and managed state

Use `getReferenceById` or `EntityManager.getReference` to associate a known ID when
state is unnecessary and delayed missing-row failure is acceptable. Use an authorized
query when the operation must establish existence, ownership, tenant membership or a
state-dependent rule. `existsById` followed by a write does not remove races; constraints
and the selected consistency mechanism still matter. Reference creation can defer
missing-row exceptions; initialization needs an appropriate persistence context. Some
providers/call paths can query early, so there is no unconditional zero-SELECT promise.
[EntityManager contract](https://jakarta.ee/specifications/persistence/3.2/apidocs/jakarta.persistence/jakarta/persistence/entitymanager).

For Spring Data `save`, inspect newness detection: nullable version first where supported,
then identifier, or an explicit `Persistable.isNew()` contract. Assigned non-null IDs
need particular care. `merge` copies state into a managed instance; use its return value
and do not treat the detached input as attached. For PATCH, load the permitted entity
and apply only present fields, preserving omitted values and version conflict behavior.
[Spring Data entity persistence](https://docs.spring.io/spring-data/jpa/reference/jpa/entity-persistence.html).
