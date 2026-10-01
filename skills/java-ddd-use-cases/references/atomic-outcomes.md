# Atomic outcomes and failure cases

Read for transaction composition, concurrent commands, retries, events or a change
to result/exception handling. Begin with the operation's promised observable outcome
and enumerate the writes and remote effects it needs. The table describes contract
choices, not a guarantee supplied by a Java annotation.

| Situation                                             | Required decision and discriminating evidence                                                                                                                                                                                                  |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two clients submit version 4                          | A conditional write/lock protects the invariant; two successful incompatible transitions are forbidden. Exercise concurrent calls with the production database mechanism.                                                                      |
| Save succeeds, transaction completion raises an error | Preserve whether completion is rolled back, unknown or committed with a failed follow-up; a prebuilt output alone is no proof. Force the error through the real wrapper.                                                                       |
| Failure result returned after a first write           | Either perform no writes until rejection is known, or ensure the unit of work explicitly rolls back. A failure object is not a rollback signal by itself.                                                                                      |
| Duplicate message or response lost after commit       | Recognize the same operation and recover its durable outcome without repeating effects. Race two deliveries, and retry after a simulated lost response.                                                                                        |
| Order change and external event publication           | Define atomic intent recording and eventual delivery, or another explicit coordination protocol. A local transaction does not enlist an arbitrary broker.                                                                                      |
| Two aggregates must change together                   | Verify the business reason and enlisted resources. Same-database atomicity may be valid; cross-system work needs an explicit eventual or coordinated protocol. Do not fragment an existing invariant just to claim one aggregate per use case. |

## Compose the boundary outside the pure core

The application owns the required unit of work; an outer mechanism implements it.
Trace the real entry to the transaction facade/decorator and into `execute`, through
persistence and back through commit. Keep Spring annotations, transaction templates,
JPA objects and HTTP mapping in the outer layer for this architectural family.
An adequate existing plain use-case class does not need an abstract parent first.

Ensure exception translation preserves the intended rollback and that any deferred
flush/commit error reaches public error mapping with its outcome semantics intact.
Decide whether a returned business rejection leaves no changes, intentionally commits
an audit record, or requires rollback of all application writes. Make that difference
explicit in tests.
Do not send a response from inside a transaction callback before it has returned
through commit. If the wrapper joins an existing transaction, its return is provisional
until the owning boundary completes. Moving the inner work to an independent
transaction merely to return sooner can break the larger atomic unit.

Keep confirmed rollback, unknown completion and committed state with failed follow-up
distinct. For an unknown outcome, recover using durable operation identity or
reconciliation before repeating the mutation. If a callback fails after commit,
recover the failed follow-up according to its delivery contract; do not describe the
aggregate change as rolled back. The same outward error may require different
recovery depending on which phase failed.

If Spring proxies supply the boundary, inspect the target version and configuration:
proxy type, visibility, final/sealed constraints, caller path, self-invocation,
transaction manager and propagation. Verify the behavior through the configured
entrypoint. Pure unit tests and a visible `@Transactional` annotation cannot establish
that the proxy was involved. Select the applicable Spring specialist for those
mechanics; this skill specifies the guarantee to preserve.

For example, Spring Framework 5.3.24's
[transaction-manager contract](https://docs.spring.io/spring-framework/docs/5.3.24/javadoc-api/org/springframework/transaction/PlatformTransactionManager.html#commit-org.springframework.transaction.TransactionStatus-)
defers commit when participating in an existing transaction, and its
[synchronization contract](https://docs.spring.io/spring-framework/docs/5.3.24/javadoc-api/org/springframework/transaction/support/TransactionSynchronization.html#afterCommit--)
allows `afterCommit` exceptions to reach the caller after the transaction committed.
These illustrate the distinction; verify the target's version and actual mechanism.

## Make retries preserve intent

A process crash or timeout leaves an ambiguous outcome when a commit may already
have occurred. Blindly reexecuting a non-idempotent transition is not recovery.
If duplicate delivery is possible, define an operation key scoped at least to the
relevant tenant/actor policy and action, bind it to the semantic request, and decide
how long its outcome is retained. Reusing a key with a different payload must be a
documented conflict, not a replay of an unrelated success.

Use an atomic uniqueness/claim mechanism for concurrent duplicates. Persist the
business change and a completed operation result in the same transaction when they
share an atomic store, or choose a protocol that explicitly handles the gap. A
deduplication cache written before the business commit can suppress work that never
happened; one written after commit can let a crash repeat an effect. Returning a
stored outcome must still respect the caller's current authorization and disclosure
policy.

On optimistic conflict, determine whether the operation can be recomputed safely
from fresh state. A user command carrying an expected version commonly requires a
visible conflict; silently replacing its version changes the user's intent. For a
permitted automatic retry, bound attempts, reload state, repeat all dependent policy
checks and preserve the operation identity. Never repeat irreversible remote work
merely because the local update lost a race.

## Preserve effect timing

Collect domain events as the domain's facts. If reliable publication is promised,
persist publication intent with the aggregate change, then publish through the
selected delivery mechanism. After-commit callbacks can avoid publishing rolled-back
facts but still have a crash window; use a durable protocol where required. The
consumer must handle the delivery semantics actually provided.

If the operation charges an external provider, define what success means when the
provider succeeds but the local transaction fails. A stable provider idempotency key,
durable operation state, reconciliation or compensation may participate. The DDD use
case coordinates this intent; it does not invent exactly-once execution or hold a
database transaction open as a substitute for a cross-system protocol.

## Failure examples to retain in a target suite

For existing-order submission, test an unknown ID, another tenant's ID, a cancelled
order and a stale version. None may create an order or report submission success.
An infrastructure outage is not an absence result. Add a race between load and save,
and a deletion during that interval, when those behaviors are relevant.

For authorization changes, invoke the same operation through HTTP and through its
job/consumer path with a forged actor or tenant payload. Both must use trusted
identity and reject unauthorized access. The suite must not rely solely on an HTTP
filter to obtain the desired result.

For a multi-write unit, force failure after the first mutation and during final
commit. Also invoke it inside an existing transaction that later rolls back: an inner
return must not become a durable-success response. Compare a rollback-triggering
failure in a before-commit callback with the same failure in an after-commit callback:
the former must leave no business change, while the latter must not repeat the
committed transition. Inspect durable state, not just which mocks were called. For
replay, include simultaneous identical keys, the same key with a different request, and recovery
after commit with a lost response. Use isolated data and the repository's existing
test harness; do not send real charges or production messages.

These are validation designs, not recorded executed tests. Report which were run,
with what database and wiring, and which guarantees remain unverified.
