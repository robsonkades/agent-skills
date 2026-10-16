# Persistence and delivery evidence

Read when tests claim gateway fidelity, aggregate concurrency, transaction atomicity or
event delivery. These are scenarios to implement against the target; none of the following
is a recorded database or broker run.

## Round-trip without accidentally testing a cache

For `infrastructure.order.gateway.OrderGatewayImplTest`, use the actual adapter and
production migrations in an isolated database. Use a production-family engine for claims
about its constraints, dialect or isolation, with the relevant version/configuration.
H2 is useful only for the compatible behavior the test actually exercises. Testcontainers
or another disposable engine is provisioning, not a guarantee of configuration fidelity.

Save a representative root, ensure SQL executes, end the writing transaction, then load
through a new transaction/persistence context. Clear or bypass caches relevant to the
claim. Compare business ID, meaningful scalar fields, value objects, child identities,
precision, time precision and order where order is a contract. `isPresent()` or aggregate
identity equality alone misses corrupted values and omitted children.

Creation and rehydration need distinct evidence. Rehydrate stored state through the real
mapper/factory and assert:

- Business ID, creation/update instants and stored concurrency version survive as defined.
- Historical state is restored without invoking today's creation defaults.
- Loading does not perform a transition, assign a fresh timestamp, or emit a new success event.
- Pending transient events are empty on an ordinary state-based repository load. An event
  store has a different replay contract; inspect it instead of applying this assertion blindly.
- Invalid persisted representations follow the declared corruption/compatibility policy;
  a mapper must not silently convert unknown values into a valid business state.

Include child insertion, update and removal when owned by the root. A shallow happy-path
root round-trip says nothing about orphan removal or whether child changes update the
root's concurrency boundary.

## Reject stale aggregate writes

Arrange committed root version V. Load independent detached states A and B at V, update A
through the real adapter and commit, then attempt the conflicting change with B. Force the
point at which checks execute, whether save, flush or commit. Assert the specified conflict
translation and verify in a new transaction that A's accepted state was not overwritten.

Repeat with two changes to distinct children if both participate in one root invariant.
An annotation on the root does not by itself demonstrate that a child-only update checks
or increments that root version. Assert the actual root-level behavior needed by the rule.
Jakarta Persistence specifies version checks for versioned entities and owned relationships;
the application's aggregate can span entities outside that automatic protection.
[Jakarta Persistence 3.2, section 3.5 on locking](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2)

A sequential stale-write scenario suffices for optimistic stale-state rejection. To claim
locking or overlapping transaction behavior, use independent connections/transactions,
barriers around meaningful milestones, bounded waits and cleanup. Record each task's
exception and completion; a blocked task is not automatically the intended conflict.
Check the combined committed result against the business invariant, not merely the number
of successful calls. Document the schedule exercised; it does not cover all races.

For natural-key uniqueness, create two distinct aggregate IDs with the same business key
under the same agreed normalization/tenant scope. Test the real constraint and translated
error, including competing inserts if concurrency is the claim. A prior `exists` check or
a fake map keyed by aggregate ID cannot establish uniqueness of another field. Cover null,
case/collation and soft-deletion semantics only where the rule depends on them.

## Prove rollback at the application transaction boundary

Invoke the actual configured transaction entry point, including framework proxies when
used. Do not wrap the test in an outer transaction that supplies a boundary the application
forgot. Arrange committed initial state, inject a failure after the first relevant write
and before completion, then inspect durable state through an independent transaction.

Exercise the actual rejection channel as well as an injected infrastructure exception.
A caught exception or normally returned `Result`/`Either`/notification can leave managed
changes eligible for commit. Check the configured rollback rules and any explicitly
supported failure wrappers; a business error value alone is not evidence of rollback.
Use that rejection path and independently reload the root and relevant outbox state.
For an invariant-preserving command, prevent rejected mutations; for deferred candidate
validation, prove invalid work cannot cross the acceptance/commit boundary. Persistence
synchronization and framework rollback policy are separate mechanisms:
[Jakarta Persistence 3.2, section 3.3.4](https://jakarta.ee/specifications/persistence/3.2/jakarta-persistence-spec-3.2)
and [Spring transaction rollback rules](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative/rolling-back.html).
Match these contracts to the project's resolved provider and framework version.

If a root and its outbox row are promised to commit together, fail the second write and
prove neither durable change survives. Also exercise successful commit with both present.
An in-memory object may remain mutated after database rollback; inspect a fresh load and
discard/recreate invalid in-memory work according to the application's lifecycle.

An observed `save()` call, annotation scan, successful flush inside a rolled-back test, or
mocked broker failure does not prove this transaction behavior. Keep external effects out
of the claimed local atomic unit unless their actual coordination mechanism is tested.

## Follow events across the crash gaps

Test only mechanisms the application claims. A local `OrderSubmitted` in an aggregate's
buffer proves the model recorded a fact, not that any consumer received it. If using an
outbox, verify these stages independently:

| Controlled point                                    | Evidence after recovery                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Rollback before database commit                     | Neither accepted root change nor outbox entry is durable; no success message escaped               |
| Database commits, relay has not sent                | Pending outbox entry remains and is eventually attempted by the resumed relay                      |
| Send succeeds, relay fails before marking delivered | Retry may repeat the message with its stable event ID; no event is lost                            |
| Consumer effect commits, acknowledgement is lost    | Redelivery does not repeat the protected business effect under the documented deduplication policy |

The outbox solves a local dual-write gap; duplicate delivery can remain and needs an
appropriate consumer contract. This test design follows the issue described in
[AWS transactional outbox guidance](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).
Use controlled fault points or a harness that can retain durable state across process
restart. A thrown exception in a direct method call is not automatically a process-crash
experiment. Record which case was actually run.

Validate stable event identity, payload/schema compatibility and root/version metadata
where contracted. Apply ordering assertions only within the defined ordering scope. If
no outbox or reliable handoff exists, report the commit-to-publish loss window instead of
declaring an after-commit callback reliable. Do not add a broker/outbox to a small domain
test request merely to complete this list.
