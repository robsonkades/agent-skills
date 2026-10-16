---
name: spring-transactions-and-events
description: >-
  Implement use-case transaction boundaries and diagnose Spring interception and
  transaction-bound listeners when rollback differs from intent, after-commit work disappears, or
  persisted event publications need recovery. Verify proxy entry, rollback rules,
  listener phases and repeat-safe republication. Excludes general isolation design,
  ORM tuning and broker delivery topology.
---

# Spring Transactions and Events

Turn the intended commit, rollback and follow-up behavior into a Spring wiring contract
with evidence from persisted state. Keep an adequate existing transaction/event mechanism;
a missing audit row does not by itself justify introducing a message bus or Modulith.

## Establish the actual path

Start from the caller and each affected consumer: what must exist when the command returns,
what must roll back together, and what may finish later or be lost? Inspect their contracts,
tests, ADRs and recovery runbooks before choosing annotations. Record the relevant existing
boundary, delivery policy and owner; distinguish an established requirement from a reversible
implementation assumption. For delayed work, check event meaning, acceptable delay, traffic
and competing replicas before selecting execution or recovery capacity.

Inspect the resolved Boot/Framework versions, transaction manager and enlisted datasource,
proxy mode, bean/call sites, exception types and configured rollback defaults. For events,
include publisher location, listener registration/condition/phase, executor and recovery
store. An annotation or an active-transaction flag alone does not prove that a particular
write participates. If those artifacts are unavailable, name the unknown path and the
smallest test that distinguishes the hypotheses; do not diagnose self-invocation by guess.

Ask only when missing requirements change the boundary: for example, "Must the audit record
exist before success is returned, or may it be recovered later? The existing outbox supports
the latter; use the same database transaction if both records must commit together." Do not
ask which annotation the user prefers. Continue independent diagnosis/tests while a material
policy is unresolved; do not silently invent a loss, delay or retention guarantee. Reuse an
adequate existing mechanism, omit infrastructure without a required contract, and defer
unrelated recovery redesign with its reason and the requirement that would reopen it.

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

- **Implementing a business operation:** identify the writes that must commit together
  and give the application use case one effective transaction boundary. Repository
  annotations alone do not compose several calls into one unit. Preserve the project's
  application/domain separation; transaction ownership does not require HTTP types or
  Spring annotations in domain objects. Read
  [interception and rollback](references/interception-and-rollback.md) for boundary
  placement, completion failures and participating attributes.
- **Adding follow-up behavior:** start with a direct collaborator call when it belongs in
  the same business transaction. Use an application event when independent consumers
  justify it. If only successful commits should trigger a best-effort local effect,
  `@TransactionalEventListener` is sufficient for that timing contract; neither an
  executor nor a persistent registry is implied. Read the worked choices in
  [event wiring and recovery](references/event-wiring-and-recovery.md), including ID/reload
  versus snapshot payloads and the operational contract when recovery is required.
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

## Execute and close the selected change

1. State the expected commit/follow-up outcome and select a discriminating check from
   [verification](references/verification.md). For diagnosis, separate observed state from
   the suspected cause; for implementation, identify the actual manager, schema and bean
   entrypoint needed before coding.
2. Change the smallest complete call/listener path, preserving existing package roles,
   exception contracts and collaborators. Include required wiring, schema changes and
   consumer compatibility for the selected mechanism; an annotation alone is not delivery.
3. Update the existing contract/runbook with who owns completion, what the caller observes
   on failure and how required follow-up recovers. For a larger change, track progress and
   pending decisions in the project's usual format; use an ADR for a durable boundary or
   recovery choice, not for each annotation fix.
4. Run the relevant checks and report their observed outcomes separately from proposed or
   blocked checks. A diagnosis ends with a supported cause or discriminating next step;
   an implementation ends with the complete selected path and its evidence or explicit gap.
   Small fixes need a small explanation, not a mandatory architecture report.

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
