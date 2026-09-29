# Verification in the application

Read when an interception, phase or recovery claim needs evidence. The examples in
[event wiring and recovery](event-wiring-and-recovery.md) are partial application snippets,
not a starter project or a test framework. Adapt the relevant path to the actual application's
beans, manager, schema and declared Java/Boot versions. Do not add a publication registry
merely to test ordinary transactions.

## Select the disputed contract

Use the existing Spring Boot integration test setup, usually `@SpringBootTest` for actual
service proxies and listener wiring. Inject the real application bean and inspect committed
state after it returns. An enclosing test-managed transaction can hide missing service
advice or defer the callback; omit it for these checks. `spring-boot-testing` owns test-slice,
container, cleanup and TestContext choices; pass it the real bean path and the transaction
observation required here. If unavailable, reuse the project's existing test conventions.

| Disputed contract                                                   | Discriminating check                                                                                                                                                                                                      |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The service's transaction advice executes                           | Cause a real failure after a write through the injected bean; assert no committed row remains. If a self-call is the suspected cause, compare that actual call path rather than relying on `isActualTransactionActive()`  |
| A checked exception should roll back                                | Inspect configured defaults, let that exception escape the interceptor, and verify persisted state. Test the targeted typed rule; do not change application-wide exception policy for the test                            |
| Catching an inner REQUIRED failure allows the outer write to commit | Call the real participating bean, catch its failure, then assert the outer completion raises `UnexpectedRollbackException` and neither write persists                                                                     |
| A best-effort callback follows commit                               | A successful command produces its local effect; rollback and nontransactional publication produce none under the default listener contract                                                                                |
| The precise listener phase is AFTER_COMMIT                          | Read the publisher's row from an independent READ_COMMITTED transaction inside the real callback, not only after the service returns. BEFORE_COMMIT must fail that observation. An invocation count alone is insufficient |
| A database write after commit is independent                        | The listener's own intercepted transaction persists its effect; an injected listener failure rolls back that effect without undoing the already committed business row                                                    |

Use failure injection at existing collaborators or a narrow test-only probe, not production
methods named `failAfterWrite` or a generic fixture API. Give independent reads a timeout
and enough pool capacity. Keep probe queries inside the callback only where proving its
phase requires them. Match manager, isolation and database to the claim; an H2 result does
not certify a production engine's locks or crash behavior.

For a synchronous listener, assert after the application call completes. For a genuinely
asynchronous path, await the observable effect with a bound; a sleep or a zero count
immediately after publication proves little. Inspect actual async enablement, executor
rejection and exception handling before attributing a missing effect to transaction phase.

## Additional evidence only when durable recovery is required

Reuse the application's existing outbox or registry and its public management API. Verify:

1. A rolled-back command leaves neither the business row nor retained publication intent.
2. A committed command whose consumer fails leaves retained work and no partial local
   consumer effect. Do not retry the committed command to repair that work.
3. After the old consumer has stopped, a new application instance reads the same retained
   state and the configured recovery mechanism completes the effect.
4. Replaying the same business event does not duplicate the required effect. A conditional
   database update can guard one local transition; an external provider needs its own
   identity, receipt or reconciliation contract.

Report what actually ran. Closing and reopening contexts in one JVM proves that specific
recreation path. It does not exercise a killed process between commit and scheduling,
storage failure, competing recovery replicas, or an email accepted just before progress
recording fails. Test those windows only when they belong to the application's guarantee.
Do not read internal registry SQL status columns as though they were a stable application
API; use version-matched public APIs unless schema diagnosis is the actual task.

## Completion

Return the corrected call/listener path, the failure or constraint that selected it, the
observed persisted-state or local-effect result, and any unexercised guarantee. Compilation
checks API use, not transaction behavior. A skipped or context-start-failed test verifies no
scenario. If runtime tools are unavailable, retain the source-backed diagnosis and state
the smallest remaining check; do not ship a new demonstration harness to mask the gap.
