# Evaluation cases

Read when reviewing the skill or checking whether its decisions remain faithful to
the domain reference. These are written teaching cases, not executed agent trials.
Give an independent evaluator the criteria separately from the task input; provide
the actor only the input, skill and ordinary source access. Record the exact skill
revision, source state, agent output and executed checks. Compiling the examples
does not measure improvement in agent behavior.

Use `C:/git/ddd-example/domain` at the source revision recorded in
`behavioral-checks.md`, or record the current revision and adjust expectations
from actual source. Every generated unit test must contain `@DisplayName`, use
real domain objects and follow the source's test naming/structure.

## 1a. Explicit validation

**Input:** Add a test for a category with a null name, using the reference domain.

**Expected:** Construct `Category.newCategory(null, ...)`, invoke
`validate(new ThrowsValidationHandler())` inside `assertThrows`, and assert
one `DomainException` error with the exact name message.

**Failure:** Expects the factory to throw, replaces the validation design or tests a
mocked category. A proposed test is not an executed result.

## 1b. Self-validation changes the failing call

**Input:** The same request, but the subject is `CastMember.newMember` with null
name and an otherwise valid type.

**Expected:** Read `CastMember`, assert `NotificationException` from the factory
and inspect the name error. The decisive constraint changed from external validation
to self-validation, so the test boundary must change.

**Failure:** Reuses the category test's explicit-validation sequence or claims all
aggregates use one validation lifecycle.

## 2. Rejection after mutation

**Input:** Review a proposed `Genre.update` test that expects a null-name rejection
to leave name, categories, active state and timestamps unchanged.

**Expected:** Inspect assignments and `selfValidate`; explain that the proposed
unchanged-state expectation contradicts this reference. Characterize the actual
exception/error boundary and, when relevant, changed state. Ask before a requested
production semantic change. For findings-only review, leave production untouched.

**Failure:** Reorders production mutation to satisfy the invented test, claims
the exception proves rollback or snapshots the previous state by aliasing the root.

## 3. Mockito and missing display names

**Input:** Shared build dependencies contain Mockito. A domain test mocks a
`Video` and verifies `validate` was called; its only annotation is `@Test`.
Rewrite it to prove a real title validation rule.

**Expected:** Use the real factory and handler, exact error assertions and
method-level `@DisplayName`. Keep the existing `UnitTest` tag convention.

**Failure:** Keeps a spy/mock/static mock, treats a shared dependency as permission,
or adds `@DisplayName` only to the class while unit test methods lack it.

## 4. Value equality is concrete

**Input:** Add tests for `ImageMedia` equality and for `Resource` byte ownership.
A proposed suite treats every `ValueObject` as an immutable all-fields record.

**Expected:** Read both implementations. Independently constructed media with equal
checksum/location remain equal despite different ID/name; inspect other fields
explicitly where needed. State that `Resource` does not override equality or copy
its byte array. Do not introduce those absent contracts through tests.

**Failure:** Asserts inequality for renamed media, all-fields equality for
`Resource`, or an ownership guarantee absent from the source.

## 5. Media state decides the event

**Input:** Test `Video.updateVideoMedia` with pending media, then with completed
media in a fresh real video. Show what the domain tests establish.

**Expected:** Pending media records the right local event and payload; completed
media records no encoding-request event. Assert status directly because media
equality ignores it. Distinguish local event recording from external delivery.

**Failure:** Tests only event nonnull/count without payload for the triggering case,
expects a new event for completed media or labels a callback reliable delivery.

## 6. Update timestamps without sleeps

**Input:** A category update test sometimes fails because two immediate timestamps
are equal. The user requires fixed old dates through the existing reconstruction
factory and forbids sleeps and mocks.

**Expected:** Reconstruct with explicit past creation/update instants, update the
real aggregate, check preserved identity/creation date and update-time advancement
from the past value. Add `@DisplayName`. Report this as authorized test setup,
not as a change to production time behavior.

**Failure:** Adds `Thread.sleep`, static mocking, a new production `Clock` API,
or merely weakens the original assertion to a nonnull check.

## 7. Interface cannot establish storage

**Input:** Prove `CategoryGateway.create` persists a category using only the domain
module. Add an in-memory gateway if necessary.

**Expected:** Identify the domain interface and unsupported storage claim. Complete
any independently useful local factory test; ask for the infrastructure scope and
actual adapter evidence. No domain fake proves production storage.

**Failure:** Invents persistence semantics, writes an adapter in the domain or
claims a mock/in-memory map verifies durability.

## 8. Copy overload changes the result

**Input:** Review a test claiming every `Video.with` invocation clears pending
events. The provided object already contains one event.

**Expected:** Distinguish `with(Video)`, which preserves entries in a copied list,
from raw-argument `with(...)`, which starts without events. Choose the overload
named by the actual requirement and assert its event contents.

**Failure:** Uses one blanket rehydration rule, or considers the source test's
nonnull assertion proof of emptiness.

## 9. Missing authority or execution evidence

**Input:** The reference directory is unavailable and the target has conflicting
factory conventions. A filtered test command later reports zero executed tests.

**Expected:** Ask for the missing technical source or intended conflicting contract.
Continue only supported independent checks. Report the zero-test result accurately
and inspect the filter; do not claim either pattern or test behavior verified.

**Failure:** Fills the source gap from a general DDD recipe, invents a Java upgrade
or reports the command's successful exit as a passing test suite.
