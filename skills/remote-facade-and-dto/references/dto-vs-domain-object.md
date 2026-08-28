# DTO versus Domain Object

## The decision table

| Situation                                                                  | DTO?           | Why                                                                  |
| -------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------- |
| Public or partner API                                                      | **Mandatory**  | The contract must evolve independently of the model                  |
| Any remote boundary between services                                       | **Mandatory**  | Same, plus no shared types across the boundary                       |
| The type is a JPA entity                                                   | **Mandatory**  | Schema-to-contract coupling; lazy proxies; unintended field exposure |
| Response must hide fields the domain object holds                          | **Mandatory**  | Filtering by omission at the type level, not by configuration        |
| Caller needs 3 fields of a 40-field aggregate                              | **Projection** | Do not load what you will not send                                   |
| Immutable domain value with no secrets (Money, DateRange, an event record) | Optional       | A copy adds no decoupling; check the serialised names are stable     |
| In-process call, same module, same team                                    | **No**         | The mapping is pure cost; the boundary is refactorable in one commit |
| Command entering the application from a controller                         | **Yes**        | Input binding and validation are boundary concerns                   |
| Message published to a broker                                              | **Mandatory**  | Consumers deploy independently; the event is a contract              |

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
loaded aggregate**:

```java
// One query, exactly the needed columns, no entity loaded, no mapper, no mapper test.
@Query("""
    select new com.acme.api.CustomerSummary(c.id, c.name, c.email)
      from Customer c where c.id = :id
    """)
Optional<CustomerSummary> summary(@Param("id") Long id);
```

The projection **is** the DTO. This removes the mapper, the mapper test and the
over-fetching at once, and it is the single most effective change in an over-mapped codebase
(`query-objects-and-specifications`).

## When the domain object may cross

```java
// A value object: immutable, no identity, no persistence concern, nothing secret.
public record Money(BigDecimal amount, String currency) { }

// Crossing directly is fine, with two checks:
//   1. The serialised field names are a contract now — renaming a component breaks clients.
//   2. No component is internal-only.
```

This is common and correct for value types shared inside one deployable, and for events
where the domain event record is deliberately also the wire format. Where the boundary is
between services, prefer a copy anyway: the alternative is a shared library.

## The shared DTO library trap

```text
acme-common-dtos  ← orders, billing and shipping all depend on this
```

Consequences: a field added for one service is deployed to all; a breaking change requires a
coordinated release; and the boundary that was supposed to decouple the services now couples
them at compile time. This is the defining symptom of a distributed monolith
(`distribution-boundaries`).

**Each service owns its own representation of another service's data.** Two services having
structurally identical `CustomerDto` classes is not duplication to be eliminated — it is the
independence you paid for. What may be shared is a schema artefact (OpenAPI, Protobuf, Avro)
from which each side generates its own types, because that couples the sides to a versioned
contract rather than to a jar.

## Mapping strategies

| Strategy                          | Mismatch discovered | Notes                                                              |
| --------------------------------- | ------------------- | ------------------------------------------------------------------ |
| Constructor / record construction | Compile time        | A new component breaks every construction site — usually a feature |
| Annotation processor (MapStruct)  | Build time          | Configure `unmappedTargetPolicy = ERROR`, or it warns and passes   |
| Hand-written mapper method        | Never               | A forgotten field is silently null                                 |
| Reflection-based deep mapper      | Runtime             | Also slow, and type mismatches surface on one path only            |
| Projection in the query           | Build time          | No mapper at all — prefer where the shape allows                   |

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

Clients branch on this. Mixing the two conventions across endpoints is a defect that only
manifests in a client, which is why it survives so long.

## Shrinking an over-mapped codebase

Safely, in this order:

1. **Find DTOs built from loaded aggregates for read-only endpoints.** Replace with
   projections. Removes the load, the mapper and the mapper test.
2. **Find DTOs identical to internal domain records with no secrets, used only in-process.**
   Delete them and pass the record.
3. **Find layers that map to map** — entity → domain → DTO → response, where two of the four
   are structurally identical. Collapse the identical pair.
4. **Keep every DTO at a remote boundary**, however redundant it looks today. That is the
   one where the copy is doing work you cannot see until the schema changes.

Measure the result by files touched when adding a field. Seven is a symptom; two or three is
healthy (`enterprise-architecture-smells`).
