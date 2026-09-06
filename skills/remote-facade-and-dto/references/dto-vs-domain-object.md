# DTO versus Domain Object

## The decision table

| Situation                                                                  | DTO?              | Why                                                                              |
| -------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------- |
| Public or partner API                                                      | **Wire contract** | Keep the external contract independent of internal evolution                     |
| Any remote boundary between services                                       | **Wire contract** | Dedicated DTO, generated binding or deliberate stable boundary value             |
| The type is a JPA entity                                                   | **Mandatory**     | Schema-to-contract coupling; lazy proxies; unintended field exposure             |
| Response must hide fields the domain object holds                          | **Mandatory**     | Filtering by omission at the type level, not by configuration                    |
| Caller needs 3 fields of a 40-field aggregate                              | **Projection**    | Do not load what you will not send                                               |
| Immutable domain value with no secrets (Money, DateRange, an event record) | Optional          | Check every component and wire encoding; separation may still decouple evolution |
| In-process call, same module, same team                                    | Usually no        | Retain a DTO for exposure, ownership or independently evolving module contracts  |
| Command entering the application from a controller                         | **Yes**           | Input binding and validation are boundary concerns                               |
| Message published to a broker                                              | **Wire contract** | Event schema may be a dedicated or deliberately stable existing type             |

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

Four artefacts. Every new field touches all four. The DTO provides decoupling only if it can
differ from the entity — and if it is regenerated to match on every change, it cannot.

**But the copy is still mandatory when the entity is a JPA entity**, because the coupling it
prevents is not field-level; it is schema-to-contract, lazy-proxy and exposure coupling. The
honest fix for the ceremony is not to delete the DTO — it is to **stop building it from a
loaded aggregate when a projection preserves its authorization and read semantics**:

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
loading behavior
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

| Strategy                          | Mismatch discovered                               | Notes                                                                                  |
| --------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Constructor / record construction | Compile time                                      | Changed constructor signatures catch stale calls unless compatibility overloads remain |
| Annotation processor (MapStruct)  | Build time                                        | Configure `unmappedTargetPolicy = ERROR`, or it warns and passes                       |
| Hand-written mapper method        | Compile time or tests                             | Constructor/type errors can fail compilation; semantic omissions need focused tests    |
| Reflection-based deep mapper      | Runtime                                           | Runtime-only mismatch risk; throughput cost is library/workload specific               |
| Projection in the query           | Bootstrap or execution; tooling may check earlier | String JPQL/SQL is not inherently compiler checked                                     |

`unmappedTargetPolicy = ERROR` detects unmapped targets, not inappropriate auto-mapping of a
new sensitive source field. Use explicit mappings/allowlists for input privileges and output
exposure and test hostile input such as tenantId, ownerId or admin=true. Matching types and
names do not prove semantic correctness.

Whichever is used: **no business logic in the mapper.** A mapper that computes a total,
resolves a status or applies a discount has put a rule where nobody looks for one and where
no domain test covers it (`enterprise-architecture-smells`).

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

Safely, in this order:

1. **Find DTOs built from loaded aggregates for read-only endpoints.** Replace with
   projections where authorization and consistency survive. Verify SQL/result shape and
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
- [MapStruct 1.6.3 guide](https://mapstruct.org/documentation/stable/reference/html/) — generated mapping and unmapped-target policy.
