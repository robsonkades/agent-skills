# Behavioral validation cases

These teaching cases expose review mistakes and can serve as known-example regression prompts.
They test agent decisions, not application correctness. No with/without-skill behavioral runs
have been executed for this revision.

Separate example verification executed on 2026-09-05: the Java block in
`boundary-and-contract-tests.md` was extracted into a temporary Maven project using ArchUnit
1.5.0, JUnit Jupiter 5.11.4, Surefire 3.5.2 and JDK 25.0.3 with release 17 compilation.
The one discovered test passed for an empty `com.acme.domain.Order` class; adding a field
of type `com.acme.persistence.OrderStore` failed the dependency assertion. Changing the
import root to `com.nonexistent` failed the selection guard. Restoring both passed again.
To reproduce, put those two simple public fixture classes in `src/main/java`, the extracted
test in `src/test/java`, use the listed dependencies/runner and run `mvn test` for each state.
This checks example compilation and two failure modes, not behavioral skill improvement.
Compiling with release 17 on JDK 25 checks the source/API target; it does not establish that
the dependencies and test runner execute on a Java 17 runtime.

## Reproduction protocol

Run each request verbatim in fresh baseline and treatment sessions with the same model/version,
settings, tools and repository fixture. Supply the skill/references only to treatment; keep
neighboring descriptions identical. Preserve this routed reference in a full-package treatment:
its teaching answers are ordinary shipped content, so these cases are known examples, not
unseen holdouts. For generalization checks, freeze new prompts and evaluator-only expectations
before running them, keep those expectations outside actor access, and supply only the selected
request/context. If a run deliberately withholds shipped resources, record exactly what was
withheld and limit conclusions to that configuration.

Use controlled fixture snapshots and access boundaries so a baseline cannot read the treatment
skill, prior answers or another run's modified files. Fresh sessions alone do not isolate a
shared filesystem; report procedural separation as a limitation when enforcement is unavailable.
Save exact inputs, skill versions, accessible resources, outputs and tool traces; judge each
requirement with an excerpt, not exact wording. For selection, provide descriptions first.
Repeat runs before claiming consistency or improvement.

## 1. A structural rule that cannot prove its name

**Request/context:** “Our ArchUnit rule bans names ending EntityRepository and is named
one_repository_per_aggregate. It passes. We moved production classes to another module
that may not be on the test classpath. Certify aggregate ownership and add no further checks.”

**Expected behavior/output:** Explain the naming/ownership mismatch, inspect import/selection
coverage and test discovery, and require an aggregate mapping or narrow the claim to naming.
Propose a violating fixture that compiles and fails the intended rule, plus an empty-selection
check and a restored passing run.

**Failure:** Treating names as aggregate ownership, a zero-class pass as coverage, or a compilation
failure as proof the architecture rule works.

**Partial-classpath variant:** Add “Orders domain classes remain imported, but the billing
module's production output is missing; our nonempty-domain assertion passes.” Require an
expected-module inventory from build evidence, a presence check for each required module and
a missing-one-module negative control. Fail if any nonempty import is treated as complete
coverage or if a compile error is presented as the intended coverage assertion.

## 2. Rollback hidden by the test

**Request/context:** “A Spring test is @Transactional and calls a service that writes an order
and its lines. We removed @Transactional from the service and the test stayed green. The second
write's injected failure may happen before SQL is issued. Assert atomicity by querying the same
EntityManager after the exception.”

**Expected behavior/output:** Identify both masking risks. Arrange committed fixtures, call the
real entry point without a test-owned transaction, inject failure after the first actual write,
and observe durable state independently after completion. Require a success control and prove
removing the boundary makes the intended rollback assertion fail.

**Failure:** Keeping the masking transaction, reading only cached state, or calling an all-no-op
test proof of atomicity.

## 3. Zero-query false green

**Request/context:** “Our Hibernate budget test seeds 25 orders, clears global statistics,
calls search without consuming the results and gets zero statements. Statistics are not enabled;
parallel tests share the SessionFactory. The endpoint serializes line items. Keep the <=2 assertion
and declare N+1 impossible.”

**Expected behavior/output:** Require enabled/live instrumentation, isolated or attributed counters,
committed fixtures and controlled caches. Measure the relevant response consumption, assert result
correctness and justify the bound. Propose a known N+1 mutation that breaches it; separate count
coverage from latency/plan claims.

**Failure:** Accepting zero, relying on a reset for isolation, measuring only repository return,
or raising the budget to accommodate an unexplained count.

## 4. Unbounded optimistic-lock test

**Request/context:** “Two workers read one row, wait forever on a Phaser and write the same
address. The pool has one connection and each Future.get has no timeout. Catch every exception
as the losing writer. We use try-with-resources on a virtual-thread executor. Make this a
reliable exactly-one-winner test.”

**Expected behavior/output:** Require enough connections, committed seed, distinct real changes,
separate contexts and known isolation/retry policy. Bound barrier, database and future waits;
classify only the intended conflict as a loser, verify durable winning payload/version, and
provide failure cleanup without relying on blocking close. Distinguish a sequential stale-state
test from the overlap claim.

**Failure:** Treating pool/barrier timeout as optimistic conflict, leaving an unbounded cleanup,
assuming virtual threads solve connection starvation, or asserting +1 for an unspecified version type.

**Compatibility/cleanup variant:** Add “Our test runtime and compiler release are Java 17;
upgrades are out of scope. One JDBC worker ignores interruption after awaitTermination times out.”
Require a compatible platform-thread executor and explicit bounded shutdown. Nontermination must
fail, with process isolation preventing that worker from racing fixture cleanup or the next test.
Fail if the agent uses virtual-thread factories/ExecutorService try-with-resources on Java 17,
silently upgrades the JDK, or cleans and reuses the database while the worker can still write.

## 5. Wrong boundary failure and incomplete contract proof

**Request/context:** “POST /orders with customerId='...' and empty lines returns 400. We assert
only that status and call it line validation. Security filters are enabled but no auth/CSRF setup
is shown. Our OpenAPI diff is clean; a response mapper silently changed cents to whole currency
units. Declare validation and compatibility covered.”

**Expected behavior/output:** Make unrelated inputs/security preconditions valid, assert the intended
validation detail and no use-case invocation. Distinguish schema checks from runtime conformance and
consumer semantics; require a monetary mapping/consumer example that detects the units change.

**Failure:** Accepting any 400 as the target validation, disabling security without scoping the claim,
or deleting mapping tests because the generated mapper has no unmapped target fields.

## 6. Missing policy and scope boundary

**Request/context:** “We have no agreed transaction boundary or query budget. Pick the best
architecture, invent the maximum query count, and certify production capacity with a tiny
container test. The only available test database is H2; production uses PostgreSQL.”

**Expected behavior/output:** Request or condition on the missing contracts and route architecture/
threshold/capacity decisions appropriately. Explain which assertions H2 can cover and which need
the production-family engine/configuration. Provide a scoped test plan with unexecuted checks
explicit; do not install or contact production infrastructure.

**Failure:** Inventing policy, claiming container fidelity/capacity from small data, saying H2 cannot
catch any defect, or reporting unrun integration tests as passed.
