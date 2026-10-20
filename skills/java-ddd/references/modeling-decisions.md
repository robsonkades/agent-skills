# Modeling from the domain reference

Read when a capability spans several domain building blocks or when requirements do
not determine which reference contract applies. The authority and source-path aliases
are defined in [reference conventions](project-conventions.md). This guide uses that
module exclusively; it does not select among competing external DDD implementations.

## Separate business questions from implementation evidence

Start with an ordinary case and a rejected case. Identify the operation, inputs,
pre-existing state, expected transition and reason for rejection. Include correction
or deactivation only when part of the requested lifecycle. Reuse existing examples and
tests; do not invent stakeholder agreement or demand a workshop for an already clear rule.

The reference supplies implementation contracts, not every future business requirement.
For example, `CategoryValidator` establishes the reference category-name checks; it
does not establish that a new product code is unique, that every tenant shares a name
space, or that a future aggregate should use category-style external validation.

Before implementing a new family, resolve:

- Which domain concept and name own the requested behavior?
- Which reference family supplies creation, reconstruction, validation and lifecycle?
- Which inputs, states, rejection results and relationship cardinalities are required?
- Which part is established by source, and which missing decision needs the user?

Keep questions focused on consequences. When source and requirements already answer
them, proceed. When only one method is ambiguous, continue the independent confirmed
work and leave that choice unresolved rather than guessing.

## Select the observed contract

| Evidence or requested behavior                                                       | Follow                                                                                                                                           | Do not infer                                                                                                                |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| A change to an existing category                                                     | `D/category/Category.java`: private constructor, `newCategory`, `with`, explicit `validate`, `activate`, `deactivate`, fluent `update`           | Constructor/update rejection, self-validation or rollback                                                                   |
| A change to an existing cast member or genre                                         | Their protected constructors and `update` methods call `selfValidate()` with `Notification`; validation errors produce `NotificationException`   | Validation before assignment or automatic restoration after failure                                                         |
| A change to a video                                                                  | `D/video/Video.java`: protected constructor, `newVideo`, `with`, explicit `validate`, media updates and recorded events                          | Genre-style self-validation, event publication, storage, or encoding performed by the aggregate                             |
| A new root explicitly requested to follow one family                                 | Reproduce that family's base, ID, factories, Validator/Gateway placement and relevant lifecycle contracts with the confirmed business vocabulary | Copying unrelated fields, messages or constraints as business requirements                                                  |
| A new root with no chosen family and materially different rejection requirements     | Inspect adjacent target code and ask which validation/lifecycle contract is required when the choice remains unresolved                          | Picking the reviewer's preferred family or declaring one universal pattern                                                  |
| A relationship like a genre's categories or a video's categories/genres/cast members | Typed IDs and the reference method's list/set/copy contract                                                                                      | Loading a root graph, validating ID existence, enforcing uniqueness beyond the collection behavior, or changing list to set |
| A value/resource or identifier                                                       | Its concrete class contract and `java-ddd-value-objects`                                                                                         | `ValueObject` implies immutability, content equality or identical ID factory overloads                                      |
| A Gateway declaration                                                                | A domain-owned interface and the reference's declared input/result types                                                                         | A transaction, ORM mapping, delivery guarantee or HTTP response                                                             |

The matrix preserves differences that an abstract DDD rule would conceal. For a new
business concept whose semantics have no supported reference counterpart, ask for the
missing requirement; do not add a general `DomainService`, new base abstraction, factory
framework or policy mechanism to fill the gap.

## Preserve behavior while making the requested change

Creation and reconstruction must remain separate. Root creation uses the type's unique
ID factory and current lifecycle time. `with(...)` accepts existing identity/state;
the copy overload can have different collection/event behavior from the field overload.
Consult `java-ddd-aggregates` rather than replacing all overloads with a generic mapper.

Failure is a contract, not a generic promise. `Category.newCategory(null, ..., true)`
can produce an object for a later `validate(handler)` call, while a null cast-member
name is rejected during construction through self-validation. Updating a self-validating
root assigns fields before it validates. If a requested operation must leave state
unchanged on failure, that is a new guarantee relative to those update implementations:
explain the conflict and obtain a decision before changing the pattern.

Copying is also specific. `Entity` copies the constructor's event list but returns a
live unmodifiable view. `Resource` retains and exposes its `byte[]` without copying or
content-based equality. The `ValueObject` base does not repair that behavior. A request
to make such a type immutable is a contract change, not faithful reproduction.

Preserve exact exception categories, messages and error lists when reproducing the
reference operation. A future business concept still needs its own confirmed wording;
do not copy `"Failed to create a Aggregate Genre"` onto an unrelated root. Do not
invent unspecified constraints or normalize existing error text merely for style.

## Keep the domain boundary explicit

The source has roots, values, IDs, Validators/handlers, Gateway interfaces, event
contracts, exceptions and utilities. Domain behavior stays with the corresponding
type and validation with its Validator. Application loading/saving orchestration,
adapters, controllers, database constraints, authorization and message delivery are
outside this reference module and this implementation scope.

When a request extends beyond the domain, identify the missing layer and hand it to
the relevant skill only within the user's requested scope. Do not claim that this
module alone proves concurrent-write safety, commit atomicity, durable event delivery
or deployment boundaries. A separately requested architecture discussion may use
the appropriate specialist; it must not silently replace these implementation contracts.

## Check a decision with a discriminating example

Use examples that would fail if the wrong family or contract were selected:

- For explicit category validation, creation precedes the validation call; a throwing
  handler rejects there. For cast-member creation, rejection happens inside the factory.
  This pair changes the family while keeping invalid-name input analogous.
- For `DomainException.with(Error)`, the exception message is the error message;
  for `with(List<Error>)`, it is the empty string. Joining the list's messages changes
  the contract even when the same errors remain present.
- For a no-op null publisher, pending events remain; after successful publication,
  they clear. Neither case proves broker delivery.
- For `CollectionUtils.nullIfEmpty`, a nonempty set remains the same instance;
  an empty set becomes null. Returning a copied set changes alias behavior.

These are source-based walkthroughs, not executed agent evaluations. Use meaningful
tests when implementing an affected behavior, with real objects and `@DisplayName`
on every unit test method. Report checks that ran separately from cases that were
only inspected. Do not add tests for unrelated contracts merely to satisfy this list.
