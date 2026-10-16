---
name: java-ddd-value-objects
description: >
  Design and review Java DDD value objects when primitives hide business meaning,
  factories accept invalid values, equality disagrees with collections, or records expose
  mutable state. Covers semantic equality, identifiers, immutable composition, explicit
  normalization, money, units, ranges, and persistence or JSON boundaries within a bounded
  context. Use for CustomerDocument.of(), OrderID, monetary values, and replacing primitive
  obsession. Aggregate consistency and use-case orchestration belong to their own skills.
---

# Java DDD Value Objects

## Scope and discovery

Own a business value's meaning, admissible states, equality, and operations. A value object
has no independent lifecycle identity: replacing it with an equal value preserves the
business meaning. An entity can be immutable and still have identity. A DTO carries a
boundary representation; making it a record does not make it a domain value.

Start with the concept in its bounded context. Read the target's build/toolchain, one nearby
domain type, factory and validator, callers, tests, and persistence/serialization mapper.
Find what domain experts call the concept and which differences they consider meaningful.
An existing class is evidence of a convention, not proof of the correct business rule.

Use java-ddd-aggregates for transitions and invariants involving other aggregate state,
java-ddd-use-cases for orchestration, and java-ddd-repositories for adapter reconstruction.
Use java-immutability, java-object-contracts, or java-numeric-types for deeper Java mechanics
when those are the obstacle. These are optional handoffs; this skill stands on its own.

## Workflow

1. **Write a short value contract before choosing syntax.** Record the context, valid and
   invalid examples, equality components, accepted input forms, allowed operations, units,
   absence policy, and external encoding. Distinguish documented requirements from a
   proposed model. Do not invent document checksums, tax rounding, or currency policy.
2. **Choose identity or value semantics.** A customer's document value is distinct from the
   customer's lifecycle. `OrderID` can itself be a value object identifying an `Order` entity.
   An address book entry may have identity while an order's shipping address is a snapshot
   value. If changing a field must preserve the object's identity, inspect the entity model.
3. **Keep the package and construction recognizable.** Prefer
   `com.example.domain.<context>.CustomerDocument`, `CustomerDocument.of(raw)`, and `OrderID`
   when consistent with the repository. Preserve established variants such as
   `CategoryID.from(raw)`, `CategoryID.unique()`, `ImageMedia.with(...)` and `getValue()`;
   factory names should distinguish parsing, generation and reconstruction. Keep `final`
   classes, parameters and immutable
   fields; use `var` only for obvious local types. Follow the existing nullability baseline;
   do not add JSpecify, a shared superclass, or a framework solely for one value object.
4. **Enforce the local invariant on every construction path.** Private construction and a
   factory work well when the factory expresses policy. Records need validation in their
   canonical constructor too; callers can bypass a named static factory. Rehydration and
   JSON mapping must not create an invalid value through an unchecked alternate path.
   Follow the project's exception/result/notification convention. Collect input failures
   outside the valid object; do not temporarily publish an invalid instance.
5. **Implement equality and immutability together.** Compare all semantically relevant
   components, implement the matching hash, and prevent mutable aliases in constructors,
   accessors and operations. A class named `ValueObject` proves none of these properties.
   Operations return a valid replacement and leave their operands unchanged.
6. **Keep context-dependent rules with their owner.** Format and internal relationships can
   be local invariants; uniqueness, account balance, stock availability and external validity
   cannot be proven by a pure factory. Return the value to the aggregate or application flow
   that has the required state. An identifier parser establishes syntax, not existence or
   permission to use the identified resource.
7. **Validate the actual contract.** Run the relevant domain tests, then mapper/database
   checks when the representation changed. Separate a compiled example from target-project
   execution and separate both from an evaluated agent behavior claim.

## Decisions that must remain explicit

| Situation                                                        | Decision and observable check                                                                                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two equal values are different instances                         | `equals` is true, hashes match, and a hash collection can find either instance. Do not test identity with `==`.                                          |
| Raw input includes spaces, punctuation, case or Unicode variants | Accept only specified forms. Normalize only approved equivalent forms; reject illegal characters rather than deleting them until input looks valid.      |
| A decimal's textual scale differs                                | Decide whether scale is meaningful. Ensure equality, hashing and any ordering implement the same equivalence; currency and units remain part of meaning. |
| A record contains a list, array or mutable element               | Inspect defensive copies, accessors and element ownership. Generated methods do not prove deep immutability or content-based array equality.             |
| A VO is used as a sorted key                                     | Define a domain order if one exists and check consistency with equality. Prefer a use-specific comparator to inventing a universal order.                |
| The same class name appears in two contexts                      | Compare policies, ownership and change cadence. Share only a deliberately governed concept; translate otherwise.                                         |
| Database or JSON shape differs from the value                    | Map at the adapter boundary and test round trips. Do not let a column, serializer setter or annotation define the business model.                        |

Keep domain values free of Spring, JPA and HTTP concerns in this clean-architecture family.
Match the target's package structure; do not reorganize a project to reproduce an example.
Avoid a generic `domain.vo` dumping ground. Put values near their owning context; a shared
kernel requires shared semantics and coordinated evolution, not matching fields.

## Conditional depth

- Read [semantic contracts](references/semantic-contracts.md) when input normalization,
  decimal scale/currency, composite values, ranges, units, time or external representations
  affect correctness. It supplies the policy distinctions and primary-source grounding.
  Its reference-project section explains how to retain `Identifier` and media conventions
  without copying mutable aliases or assuming superclass-provided equality.
- Read [the executable example guide](references/java-example.md) when writing a factory,
  reviewing an incomplete `equals`/`hashCode`, or checking strict parsing and exact amounts.
  Inspect its assets before running them; they are illustrative contracts, not production
  document or financial rules. Compile to a temporary output directory as the guide shows.

## Quality gate and output

Before declaring completion, show that all creation paths reject locally invalid states,
equivalent values work as collection keys, and external mutation cannot change a value.
Use adversarial inputs relevant to the model: appended letters in an identifier, leading
zero loss, Unicode lookalikes, decimal precision loss, mixed currencies, mutable nested
members, empty/inverted ranges, and incompatible serialized legacy values.

Deliver the value contract, package/class/factory choice, implementation or review findings,
tests actually run and any unresolved business decision. A small change needs a small report.
If equality or encoding changes for existing data, identify collisions and compatibility
impact before migrating it. Unknown legal formats, supported currencies or rounding stages
remain explicit unknowns; continue work that does not depend on them. A successful pure
Java fixture proves its exercised rules, not ORM behavior or the target business model.
