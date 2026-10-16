---
name: java-ddd-aggregates
description: >-
  Design and implement Java DDD aggregates when deciding which entities must change
  atomically, moving invariants out of setters, separating creation from rehydration,
  or preventing concurrent writes from bypassing the root. Covers domain identity,
  child ownership, valid transitions and aggregate version checks. Use for aggregate
  boundaries and lifecycle behavior; bounded-context discovery and ORM mapping have
  separate owners.
---

# Java DDD Aggregates

## Purpose and scope

Make a business consistency boundary explicit in Java: one root controls the state
and behavior required to preserve its invariants. An aggregate is neither every
object reachable from an ORM entity nor a collection of tables with the same prefix.
This skill owns tactical boundary, identity and lifecycle decisions. Optional
handoffs are `bounded-context-design` for context boundaries,
`java-ddd-value-objects` for value semantics, `java-ddd-repositories` for persistence
implementation, and `java-ddd-testing` for broader test design.

## Workflow

1. **Inspect the actual model.** Read build/toolchain settings, the context's package
   tree, aggregate/identifier/validator foundations, commands, persistence mappings,
   transaction owner and relevant tests. Identify all write paths, including bulk
   updates and maintenance jobs. Keep the project's Java version and dependencies;
   the illustrative Java fragment uses a Java 17 baseline without frameworks. A
   reference project or an existing class name is evidence, not proof of a rule.
2. **Write the invariant before drawing the boundary.** For each relevant command,
   state what must hold when it succeeds, what state it reads, and whether another
   writer can invalidate that decision. Separate rules about one object, a root and
   its children, and independently owned aggregates. Name when the business permits
   intermediate states; never infer eventual consistency merely to obtain smaller
   aggregates. When choosing or changing a boundary, read
   [boundaries and concurrency](references/boundaries-and-concurrency.md).
3. **Choose identity and ownership.** Distinguish continuity of an entity from the
   attributes of a value. Use a typed `FooID` for a root's stable domain identity;
   child identity may be local to that root. Decide who creates, removes and modifies
   each child. A public child mutator or a returned mutable child can defeat a root
   even when its collection is unmodifiable.
4. **Implement intention-revealing transitions.** Prefer `order.submit(...)` or
   `order.changeQuantity(lineID, quantity)` to public field setters. Validate the
   proposed result before publishing it into the aggregate. Expected validation
   rejection must preserve state, audit values and pending events. A notification
   handler collecting errors must cause the command to reject before mutation;
   merely invoking `validate(handler)` does not enforce the invariant.
5. **Separate creation, rehydration and persistence.** Creation (`newFoo(...)` in the
   reference convention) establishes a new identity and valid initial state.
   `with(...)` or an explicitly named rehydration
   factory restores persisted identity, audit data and version without registering
   new events, generating identifiers or reading the current time. The persistence
   adapter restores state; it must not replay command methods. When editing these
   paths, read [Java lifecycle pattern](references/java-lifecycle-pattern.md).
6. **Close the concurrency boundary.** Every write affecting a root invariant,
   including child-only changes, must participate in its concurrency protocol.
   Verify root version checks/locks and persistence of children in the same
   transaction. Incrementing an audit or revision counter in memory alone cannot prevent a
   lost update. Do not claim Java thread safety from database optimistic locking;
   ordinarily confine a mutable aggregate instance to one command execution.
7. **Verify the changed behavior.** Reuse relevant tests, then add the missing
   counterexample: rejected command leaves state/events unchanged; a caller cannot
   mutate an internal child; rehydration preserves stored facts without new events;
   or two writers cannot both violate an invariant. Run concurrent persistence
   checks against the actual adapter/database when that guarantee changes. A domain
   unit test cannot prove transaction isolation or ORM version propagation.

## Java conventions and decisions

- Keep concepts under the project's domain package and context-specific subpackages
  (`com.example.domain.<context>` in the illustration).
  Follow the established `Foo extends AggregateRoot<FooID>`, `FooID extends Identifier`,
  `FooValidator extends Validator` and `ValidationHandler` vocabulary when that
  foundation exists. Reuse `validation.Error`, `Notification`,
  `ThrowsValidationHandler` and `exceptions.DomainException.with(...)` where provided.
  For a new model, introduce only the base abstractions that carry a real contract.
  Constructors and method parameters are `final`; stable fields and dependencies
  are `final`. State that transitions legitimately replace need not be final.
- Keep Spring/JPA/HTTP types and repository calls outside the aggregate in this
  architecture. If the project uses a different mapping approach, preserve its
  contract while proposing a scoped change; do not silently move every class.
  Use existing nullability annotations when available; adding an annotation library
  or upgrading the Java baseline is a separate decision.
- Prefer immutable value objects and immutable child snapshots on public reads.
  `List.copyOf` protects the container only. Use private/package-controlled child
  mutation plus root methods, or replace immutable child state through the root.
  Package visibility is useful only if package callers respect the same boundary.
- Keep entity equality stable across legitimate changes. Inspect the existing
  equality/proxy contract before modifying it; do not generate equality/hash from
  mutable fields. A database surrogate identifier and a domain `FooID` can coexist,
  but a generated nullable database key must not silently become domain identity.
- Prefer a smaller boundary only when its true invariants still hold. Read models
  may combine many roots without creating a new write aggregate. An unbounded
  collection or frequent conflicts calls for evidence about ownership and write
  patterns, not an automatic split or disabled locking.

## Deliverable and limits

For an implementation, deliver the root/child ownership decision, affected commands
and focused changes with executed checks. For a review, identify the write path that
can break the invariant and the smallest justified correction; an adequate model may
need no changes. State unresolved business consistency requirements separately from
observed code defects. Report whether validation covered domain behavior, persistence
concurrency or only a design sketch. Do not claim a boundary is correct without the
business rule, or that a version annotation protects child writes without evidence.
