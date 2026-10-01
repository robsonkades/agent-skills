# Verification by boundary promise

Read when implementing or reviewing the tests for a ports-and-adapters boundary. Choose
tests that retain the mechanism being claimed; do not replace missing integration evidence
with more mocks or an architectural diagram.

## Separate the assertions

| Claim                                             | Evidence that can support it                                                                                                          | Evidence that cannot establish it                                                               |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| The same business rule applies through two inputs | Both adapters invoke the real application operation; valid, invalid and unauthorized cases exercise each path.                        | Mocking the operation behind both adapters, or testing only request DTO constraints.            |
| Rules can run without a device/container          | Plain application tests with a controlled output fake; production core classes selected by dependency check.                          | A Boot context with a mocked database, or imports inspected in just one class.                  |
| Fake and real adapter meet an agreed subset       | Shared conformance cases for absence, success and conflict plus adapter-specific failure tests.                                       | Having implementations of the same Java interface.                                              |
| Actual adapter maps and persists correctly        | Real adapter against an isolated intended engine/configuration; committed state read back.                                            | Fake persistence or another engine's passing SQL tests.                                         |
| A use case is atomic                              | Actual wired transaction entry, failure after an earlier write, then committed-state observation outside any test transaction.        | Direct invocation of an annotated object; an outer test transaction that rolls everything back. |
| Production dependency direction is enforced       | Production imports with expected-package coverage, explicit nonempty checks and a known forbidden dependency caught by the same rule. | Suffix rules, a passing empty selection, or a negative fixture that never enters the importer.  |
| Resource lifetime is correct                      | Observed close/shutdown after success and failure, bounded completion where claimed.                                                  | Object construction succeeds or `AutoCloseable` appears in a signature.                         |

Assertions need not be duplicated at every layer. A pure invariant unit test can cover its
full value space; a focused adapter integration test then shows that path reaches it and maps
the outcome. Security tests should include an authorized actor attempting another owner's
resource, not only anonymous versus authenticated. A mocked principal proves that supplied
identity's policy treatment, not production credential validation.

## Do not let the harness hide a defect

For transaction checks, disable any outer test-managed transaction when observing the
application's commit boundary. Seed and inspect state with separate completed operations.
Force a failure after a known successful first write, assert the failure class and query both
effects afterward. A test that fails before the first write cannot show rollback. With ORM,
also account for flush timing and first-level cache; use the project's real mappings and
transaction manager when that is the claim.

For structural checks, import compiled production output rather than only named examples.
Confirm required application packages/classes are present; one adapter class makes a selection
nonempty without covering the core. Include method signatures, inherited types and annotation
dependencies in the chosen rule's capabilities. Explain exclusions for generated code and
tests. A static checker may not observe reflection, bean selection or runtime calls; cover
those with wiring/behavior tests rather than claiming total architectural proof.

Prove a new guard's sensitivity in an isolated copy: compile a forbidden Spring/JDBC/adapter
dependency into a production core class, run the same check and observe the named boundary
assertion fail, then restore and run the valid state. A compiler failure or unresolved artifact
does not demonstrate the architecture rule. Verify an empty production selection is rejected
too. Do not weaken the rule or change the promised boundary to obtain a green build.

For a real adapter, test absent data, a successful write/read, relevant constraint conflicts
and an actual controlled infrastructure failure. Share the contract portion with the fake
where useful, and state where the fake cannot simulate the mechanism. H2 evidence establishes
the exercised H2 configuration; PostgreSQL/MySQL dialects, isolation and production capacity
remain separate checks.

## Executable example and limits

The [contract fixture](../assets/contract-fixture/README.md) provides a compact worked
boundary: a plain order application, HTTP and controlled direct input, a fake and JDBC
output adapter, outer transaction wiring and a production dependency rule. Read its README
for exact prerequisites, commands, expected counts, failure injection and limitations.
Copy it into temporary storage before running; keep build output out of the skill package
and never connect it to an existing database or real agent configuration.

Adapt the relevant check to the target application instead of copying the fixture's domain
rules or build policy. The fixture's quantity/ownership constraints are explicit teaching
requirements, not generic order business rules. Its local transaction demonstrates the
configured database effects, not atomic remote publication, retries, broker acknowledgement,
production authentication, performance or all possible concurrency schedules.

## Record what happened

For changed code, report command, versions, actual tests/counts, pass/failure result and the
coverage limit. For a negative experiment, identify the mutation and assertion that detected
it, then the restored passing state. State a missing driver/toolchain or unavailable target
engine precisely and continue checks that do not depend on it.

A skill package's metadata/link validation, its Java fixture's tests, and an agent's decisions
while using the skill are separate results. Written scenarios or self-review do not constitute
executed behavioral evaluation. Keep evaluator-only inputs and rubrics outside the package's
ordinary teaching resources. A comparative improvement claim requires comparable with/without
skill runs; one observed result supports only that case and environment.
