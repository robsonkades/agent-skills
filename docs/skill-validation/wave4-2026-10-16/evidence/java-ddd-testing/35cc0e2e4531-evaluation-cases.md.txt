# Evaluation cases

Read when evaluating the skill or auditing a suite's evidence. These are written probes
for agent decisions; they have not been executed against a target Java application.
Choose relevant probes and record input, proposed/applied change, actual checks and outcome.
These are teaching cases, not held-out evaluations. For an independent agent run, supply
only the input and ordinary project context; keep expected decisions and failure criteria
with the evaluator. Cases 1 and 1b change the persistence contract while keeping the
load-and-mutate operation, so the recommended test must change.

## 1. Shared reference hides an omitted save

**Input:** `OrderGatewayInMemory` stores `Order` directly in a map. The use case loads and
submits it but never calls the explicit persistence operation. The test reloads from the
same map and passes.

**Expected decision:** identify the alias, use detached snapshots for this port contract,
test fake isolation and observe the use-case test fail for the omitted write before fixing
it. Do not merely assert that the mock saw `save()` and claim persistence is proved.

**Failure:** keeps the shared mutable map as explicit-save evidence, or labels an
unexecuted proposed test as an observed failure.

## 1b. Managed state persists through a unit of work

**Input:** the same use case loads and submits an order without calling `save()`. This
time the port explicitly returns a managed aggregate inside a unit of work; successful
commit must persist changes and rollback must discard them. Review the test evidence.

**Expected decision:** preserve this contract. Test commit and rollback through a suitable
transaction-scoped fake or the real adapter; use independent post-transaction reads for
durability claims. Do not demand detached snapshots on every read inside the unit of work.

**Failure:** adds `save()` solely to satisfy case 1's expectations, treats object aliasing
within one managed context as sufficient proof of a bug, or calls fake rollback database
evidence. Findings-only work must leave the application untouched.

## 2. Rejection is observed after mutation

**Input:** `submit()` updates status/audit data, then discovers an invalid child and throws.
The test only asserts `DomainException`.

**Expected decision:** establish the transition's contract; for an invariant-preserving
command, add assertions on original fields, child state, audit data and event buffer.
Fix the mutation ordering if authorized. Distinguish an existing candidate/notification
validation design from a newly imposed always-valid construction policy.

**Failure:** asserts only the exception, or uses an alias as the before-state snapshot.

## 3. Immutable collection leaks a mutable child

**Input:** root exposes `List.copyOf(lines)` but a caller can set a line quantity directly.

**Expected decision:** test the attempted bypass and the root invariant, not just whether
`add()` throws. Suggest immutable child views or restricted mutation consistent with the
existing API. Do not claim `List.copyOf` performs a deep copy.

**Failure:** tests only list structure while the mutable child still bypasses the root.

## 4. Gateway test sees its own persistence context

**Input:** save then find returns an equal ID, with no flush/context separation. A mapper
omits a value object and reassigns creation time.

**Expected decision:** use actual storage and fresh context, assert explicit stored fields,
precision, timestamps and no newly generated events. State the database actually used.
Do not equate H2 mapping coverage with production isolation/locking evidence.

**Failure:** accepts ID equality or a cached entity as proof of a complete round-trip.

## 5. Root version misses child conflict

**Input:** two detached copies edit different children subject to one aggregate limit;
only the root is versioned and tests alter only root scalars.

**Expected decision:** create the child-only conflict through the real adapter and inspect
combined committed state; do not infer protection from `@Version` alone. A fake can verify
how the use case reports conflicts, not whether the database detects them.

**Failure:** concludes root-level protection from the annotation or a sequential fake.

## 6. Authorization tested only at HTTP

**Input:** controller rejects an unrelated tenant but a scheduled job invokes the same
use case with an arbitrary root ID.

**Expected decision:** inspect the job's identity and trust contract, test required
authorization on all supported paths and prove no protected state/event change on denial.
Do not assume every trusted internal job must impersonate an end-user; preserve the
documented service principal policy.

**Failure:** counts HTTP denial as coverage of every path, or invents an end-user policy
for an explicitly authorized service principal.

## 7. Committed root and missing message

**Input:** a test verifies `publisher.publish` once after save and claims reliable delivery.

**Expected decision:** identify commit/publish failure windows. If an outbox exists, test
atomic rollback plus relay recovery and duplicate handling at the claimed boundaries.
If it does not, report the gap and design options without claiming an unavailable mechanism.

**Failure:** calls one publish interaction reliable delivery or introduces an unsolicited
broker/outbox merely to satisfy a test checklist.

## 8. Refactoring starts by replacing old expectations

**Input:** a request extracts DDD behavior from a working application with Mockito tests;
the proposed change deletes them and introduces a new domain model before reproducing any
observable behavior.

**Expected decision:** preserve useful tests, characterize the relevant current behavior,
then extract in small steps. Adopt a fake only where its state contract improves the
assertion. Report commands/test counts and any unexecuted integration cases separately.

**Failure:** replaces adequate Mockito tests wholesale or reports skipped/zero tests as
executed evidence.

## 9. Normal return commits a rejected transition

**Input:** a transactional use case mutates a managed order, catches its validation error
and returns `Either.left(errors)`. The configured transaction policy has no rule for this
return type; no exception escapes and no rollback is requested. Its pure test checks only
the error result. Review whether a rejected transition can be stored.

**Expected decision:** identify the dirty-state commit risk and propose or execute the
actual entry-point test without an outer test transaction. Independently read durable state
after rejection; distinguish preserving a candidate-validation API from permitting invalid
commit. If the database cannot run, report the integration gap and limit pure-test claims.

**Failure:** assumes every error wrapper rolls back, converts the result API to exceptions
without establishing that need, or claims a fake proves database rollback.
