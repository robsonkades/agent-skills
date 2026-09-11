# DTO versus Domain Object

## The decision table

| Situation                                                                  | DTO?                        | Why                                                                                              |
| -------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| Public or partner API                                                      | **Wire contract**           | Keep the external contract independent of internal evolution                                     |
| Any remote boundary between services                                       | **Wire contract**           | Dedicated DTO, generated binding or deliberate stable boundary value                             |
| The type is a JPA entity                                                   | **Explicit representation** | Prefer DTO/scalar projection; tested serializer projection can also control exposure and loading |
| Response must hide fields the domain object holds                          | **Exposure allowlist**      | A dedicated type or explicit serializer projection must omit sensitive and future fields         |
| Caller needs 3 fields of a 40-field aggregate                              | **Consider projection**     | Avoid unnecessary hydration; retain already needed/materialized domain state when appropriate    |
| Immutable domain value with no secrets (Money, DateRange, an event record) | Optional                    | Check every component and wire encoding; separation may still decouple evolution                 |
| In-process call, same module, same team                                    | Usually no                  | Retain a DTO for exposure, ownership or independently evolving module contracts                  |
| Command entering the application from a controller                         | **Yes**                     | Input binding and validation are boundary concerns                                               |
| Message published to a broker                                              | **Wire contract**           | Event schema may be a dedicated or deliberately stable existing type                             |

## Where the ceremony comes from

```java
// Entity
@Entity class Customer { Long id; String name; String email; String phone; ... }

// DTO — an exact copy
public record CustomerDto(Long id, String name, String email, String phone) { }

// Mapper
@Mapper CustomerMapper { CustomerDto toDto(Customer c); }

// Test for the mapper
@Test void maps_all_fields() { ... }
```

Four artefacts may all change when the contract is mechanically kept in step with the entity.
But a presently field-for-field DTO can already earn its cost through independent ownership,
exposure or future evolution: a new internal field need not enter the public contract.

For JPA-backed responses, prefer an explicit DTO or projection. A tested serializer allowlist
or custom serializer can also define an independent representation; annotations or filters
alone do not prove it is safe. Check the actual serializer configuration, nested types,
new sensitive fields, lazy getter access/cycles and wire compatibility. Response controls do
not authorize binding requests into managed entities; writable fields and trusted scope need
separate controls.

For a read that otherwise hydrates an unnecessary graph, consider a scalar projection when
authorization, required domain work and consistency survive:

```java
// Partial JPQL scalar-constructor projection; constructor/types must match.
// Include trusted tenant/access predicates in the actual query.
@Query("""
    select new com.acme.api.CustomerSummary(c.id, c.name, c.email)
      from Customer c where c.id = :id
    """)
Optional<CustomerSummary> summary(@Param("id") Long id);
```

The projection **is** the DTO. It can remove entity hydration and a redundant mapper, but
retain tests for query binding, nulls, authorization and returned shape. Observe generated
SQL and query count; projections involving entity-valued selections or joins have different
loading behavior. If the aggregate is already needed or contains the state to be returned,
mapping its materialized values can be correct and cheaper than an additional query. Inspect
pending changes, flush behavior and snapshot requirements before substituting a database read
(`query-objects-and-specifications`).

## When the domain object may cross

```java
// Shape only: domain constructor validation (null, currency, scale) omitted.
public record Money(BigDecimal amount, String currency) { }

// Direct reuse requires stable names, null/precision/currency encoding, validation,
// exposure review and willingness to version this shape independently of internals.
```

This is common and correct for value types shared inside one deployable, and for events
where the domain event record is deliberately also the wire format. Where the boundary is
between services, use independently pinned schema bindings or owned local types; reusing a
server-side value does not force the client to import its Java class. An extra type remains
useful when internal and external evolution diverge.

## The shared DTO library trap

```text
acme-common-dtos  ← orders, billing and shipping all depend on this
```

Risk: forced version upgrades and shared behavior can require coordinated releases.
An optional additive field in independently pinned data-only bindings does not require
simultaneous deployment. Diagnose actual compatibility and release dependencies rather than
calling every shared artifact a distributed monolith
(`distribution-boundaries`).

**Each service owns its own representation of another service's data.** Two services having
structurally identical `CustomerDto` classes is not duplication to be eliminated — it is the
independence you paid for. What may be shared is a schema artefact (OpenAPI, Protobuf, Avro)
from which each side generates its own types, or generated data-only bindings with independent
version pinning. Schema generation also needs backward/forward compatibility tests; it does
not itself prevent lockstep deployment.

## Mapping strategies

| Strategy                          | Mismatch discovered                               | Notes                                                                                                   |
| --------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Constructor / record construction | Compile time                                      | Changed constructor signatures catch stale calls unless compatibility overloads remain                  |
| Annotation processor (MapStruct)  | Build time                                        | In 1.6.3, unmapped targets default to WARN; configure ERROR where required and inspect method overrides |
| Hand-written mapper method        | Compile time or tests                             | Constructor/type errors can fail compilation; semantic omissions need focused tests                     |
| Reflection-based deep mapper      | Runtime                                           | Runtime-only mismatch risk; throughput cost is library/workload specific                                |
| Projection in the query           | Bootstrap or execution; tooling may check earlier | String JPQL/SQL is not inherently compiler checked                                                      |

`unmappedTargetPolicy = ERROR` detects unmapped targets, not inappropriate auto-mapping of a
new sensitive source field. Use explicit mappings/allowlists for input privileges and output
exposure and test hostile input such as tenantId, ownerId or admin=true. Matching types and
names do not prove semantic correctness.

In MapStruct 1.6.3, `@BeanMapping(ignoreByDefault = true)` disables automatic property mapping
and ignores unmapped targets, even with an ERROR policy. Use explicit mappings deliberately;
inspect generated code and test required output as well as forbidden fields. A silent new
target omission is still possible with that allowlist policy.

Keep discount rules, authoritative status decisions and other business policy in their
application/domain owner (`enterprise-architecture-smells`). A mapper may calculate a
representation-only value or encode units, provided its precision, absence and semantics are
tested. Calling all arithmetic business logic would move encoding concerns into the domain;
calling policy mapping would duplicate the real rule.

## Nullability and absence

Decide once, document it, and be consistent:

```json
// Field omitted: "we have nothing to say about this"
{ "id": "...", "name": "Ana" }

// Field null: "we know there is no value"
{ "id": "...", "name": "Ana", "phone": null }
```

These are example semantics, not JSON defaults. Define semantics per operation: a PATCH
may use omission for unchanged and explicit null for clear. A plain nullable record component
may deserialize both as null and lose presence; use the serializer's supported presence-aware
representation. Verify unknown fields, enum additions and numeric/date encoding with old
readers and new writers. Never infer wire compatibility from Java compilation alone.

## Shrinking an over-mapped codebase

When reducing a demonstrated mapping burden, inspect these candidates; none requires a
change merely because the types have the same fields:

1. **Find DTOs built from loaded aggregates for read-only endpoints.** Replace with
   projections only where they remove unnecessary loading and preserve required domain state,
   authorization and consistency. Retain adequate mapping of already materialized values. Verify SQL/result shape and
   retain tests for the query contract; remove only tests made redundant.
2. **Find DTOs identical to internal domain records with no secrets, used only in-process.**
   Remove them only if they provide no ownership/exposure/evolution boundary; inspect nested
   mutability before passing the record.
3. **Find layers that map to map** — entity → domain → DTO → response, where two of the four
   are structurally identical. Collapse a pair only after verifying its responsibilities,
   validation and independent evolution are also redundant.
4. **Keep an explicit remote contract**, which may be a dedicated DTO, generated binding or stable
   immutable boundary type. Preserve a separate DTO when it controls exposure or independent
   evolution; do not retain a field-for-field copy solely by category label.

Measure unnecessary change propagation alongside preserved wire compatibility, exposure,
query behavior and ownership. No fixed number of edited files proves a healthy boundary (`enterprise-architecture-smells`).

## Sources

- [Fowler: Data Transfer Object](https://martinfowler.com/eaaCatalog/dataTransferObject.html) — transfer and serialization boundary.
- [Java 21 Record API](https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Record.html) — shallow immutability and defensive copying; records final since Java 16.
- [MapStruct 1.6.3 guide](https://mapstruct.org/documentation/1.6/reference/html/) — generated mapping and unmapped-target policy.
- [MapStruct 1.6.3 BeanMapping source](https://github.com/mapstruct/mapstruct/blob/1.6.3/core/src/main/java/org/mapstruct/BeanMapping.java) — explicit mapping and ignored-target diagnostics.
- [Jackson 2.18.3 JsonIncludeProperties](https://github.com/FasterXML/jackson-annotations/blob/jackson-annotations-2.18.3/src/main/java/com/fasterxml/jackson/annotation/JsonIncludeProperties.java) — one versioned allowlist mechanism; actual serializer configuration and nested paths still require tests.
