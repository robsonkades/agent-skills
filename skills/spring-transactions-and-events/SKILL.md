---
name: spring-transactions-and-events
description: >-
  Diagnose and implement Spring transaction interception and transaction-bound
  listeners when rollback differs from intent, after-commit work disappears, or
  persisted event publications need recovery. Verify proxy entry, rollback rules,
  listener phases and repeat-safe republication. Excludes general isolation design,
  ORM tuning and broker delivery topology.
---

# Spring Transactions and Events

Turn the intended commit, rollback and follow-up behavior into a Spring wiring contract
with evidence from persisted state. Keep an adequate existing transaction/event mechanism;
a missing audit row does not by itself justify introducing a message bus or Modulith.

## Establish the actual path

Inspect the resolved Boot/Framework versions, transaction manager and enlisted datasource,
proxy mode, bean/call sites, exception types and configured rollback defaults. For events,
include publisher location, listener registration/condition/phase, executor and recovery
store. An annotation or an active-transaction flag alone does not prove that a particular
write participates. If those artifacts are unavailable, name the unknown path and the
smallest test that distinguishes the hypotheses; do not diagnose self-invocation by guess.

Use version-matched [Spring Boot documentation](https://docs.spring.io/spring-boot/) for
auto-configuration and testing. When repositories participate, also consult
[Spring Data JPA](https://docs.spring.io/spring-data/jpa/reference/jpa.html) for transaction
and aggregate-event behavior; when authorization advice or security context affects the
call, consult [Spring Security](https://docs.spring.io/spring-security/reference/). Select
the project's release before following a moving documentation default. Framework and
Modulith sources below provide the transaction/event contracts those guides build on.

The worked snippets target **Java 25, Boot 4.1.1 and Framework 7.0.9**, without preview;
the conditional registry guidance targets **Modulith 2.1.1**. These are authoring baselines,
not permission to upgrade a target application or add those dependencies. This skill
focuses on imperative transactions; reactive listeners need the Reactor transaction
context carried by `TransactionalEventPublisher`, not thread-local assumptions.

## Choose the affected contract

- **Adding follow-up behavior:** start with a direct collaborator call when it belongs in
  the same business transaction. Use an application event when independent consumers
  justify it. If only successful commits should trigger a best-effort local effect,
  `@TransactionalEventListener` is sufficient for that timing contract; neither an
  executor nor a persistent registry is implied. Read the worked choices in
  [event wiring and recovery](references/event-wiring-and-recovery.md).
- **A write commits or rolls back unexpectedly:** read
  [interception and rollback](references/interception-and-rollback.md). Identify the
  effective interceptor entry and escaping failure, then assert database state outside
  that transaction. Repair the narrow boundary/rule; do not silently change every checked
  exception in the application to rollback.
- **A listener runs too early, never runs or fails to save:** read
  [event wiring and recovery](references/event-wiring-and-recovery.md). Default
  transaction-bound delivery requires a transaction and successful commit. Post-completion
  writes need an effective independent transaction; a self-call to an annotated method
  does not create it in proxy mode.
- **Follow-up must survive interruption:** use the recovery section of that reference.
  Plain application events and `@Async` do not persist intent. Reuse an existing outbox or
  persistent publication registry when suitable. Explicitly surface incompatible demands
  such as required restart recovery with no durable state. Do not retry the committed
  business command merely because follow-up failed.
- **Implementing or challenging these guarantees:** read
  [verification](references/verification.md) for tests to adapt to the actual application.
  Observe commit/rollback, missing transaction, listener failure, recovery and duplicate
  effects as applicable. Report orderly context recreation separately from process kills.

## Keep the specialist boundary

`enterprise-transactions` owns business atomicity, propagation/isolation trade-offs and
cross-resource boundaries; pass it the use case, managers and required outcome.
`spring-boot-jpa` owns entity/flush/fetch/query behavior; pass actual SQL and persistence
context lifetime. `delivery-semantics` owns broker confirmation and acknowledgment paths,
while `idempotency` owns repeat-safe external effects; pass event identity, effect/progress
stores and ambiguous outcome windows. `gof-observer` owns choosing an observer mechanism.
For a schema/serialized-event change, hand off stored event versions, listener IDs and
old pending records to `schema-evolution-and-compatibility`.
`spring-boot-testing` owns test harness and cleanup choices; pass the real bean path and
the transaction observation required here rather than adding a parallel fixture framework.

If a neighboring skill is unavailable, keep its unresolved contract explicit and continue
the Spring wiring work that does not depend on it; do not invent a delivery guarantee.

Return the concrete wiring change or diagnosis, the expected commit/follow-up outcome and the
test that supports it. Include unresolved configuration and recovery gaps when material.
Small fixes need a small explanation, not a mandatory architecture report.
