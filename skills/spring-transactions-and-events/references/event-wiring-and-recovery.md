# Event wiring and recovery

Read for a missing callback, an after-commit write, or a persistent publication that must
be retried. Follow only the path used by the application.

## Start with the consumer's contract

| Required behavior                                                                                | Small starting point                                                                              | What changes the choice                                                                                                                       |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| One required collaborator must succeed or fail with the command                                  | Call it directly inside the application's transaction                                             | Independent consumers can justify a synchronous application event; inspect any custom multicaster before assuming the same thread/transaction |
| An independent local hint should run only after successful commit; loss on restart is acceptable | `ApplicationEventPublisher` and `@TransactionalEventListener`                                     | If listener latency must leave the request path, consider bounded async execution and its failure policy                                      |
| A local database projection is updated after commit                                              | The listener's own effective transaction, if eventual repair/loss policy permits this arrangement | If the projection must survive interruption, retain intent atomically and operate recovery                                                    |
| Work must resume after a crash                                                                   | The existing outbox or a deliberately selected persistent registry                                | New stores, providers or replicas require additional atomicity, identity and recovery evidence                                                |

Events do not make a mandatory same-transaction dependency simpler by themselves. Preserve
a clear direct call when it satisfies the requirement. The default synchronous event path
can also participate in the publisher's transaction; an after-commit callback cannot roll
the original operation back. See the
[Framework event contract](https://docs.spring.io/spring-framework/reference/core/beans/context-introduction.html#context-functionality-events).

For the cache eviction below, publishing an immutable identity is enough:

```java
// Partial application code: inside the existing @Transactional service method,
// after its business state change. Inject ApplicationEventPublisher normally.
events.publishEvent(new OrderPlaced(orderId));

// A separate event type; no ApplicationEvent subclass or generic event base needed.
record OrderPlaced(String orderId) {}
```

The listener can remain equally small. This partial class assumes the application already
uses Spring caching, with caching advice enabled and an `orderHints` cache configured:

```java
@Component
class OrderHintListener {
    @TransactionalEventListener
    @CacheEvict(cacheNames = "orderHints", key = "#p0.orderId()")
    public void on(OrderPlaced event) {
        // Eviction is performed by Spring's caching advice after this callback.
    }
}
```

`CacheEvict` is Spring's caching annotation; no executor or publication table is needed.
If the project uses a cache API directly, keep that existing convention instead of adding
annotation infrastructure. This hint is allowed to be lost on restart and must have a
bounded stale-data policy such as expiry. Choose another mechanism if stale data can
violate business correctness. This does not guarantee email delivery or a durable projection.
[Caching annotation contract](https://docs.spring.io/spring-framework/reference/integration/cache/annotations.html).

## Choose what the event means to its consumer

An ID-only event followed by a reload observes state available when the consumer reads it,
which can differ from the state that caused publication. Use that shape for invalidation or
reconciliation against current state. If a receipt or audit must describe the original fact,
capture the minimum immutable values for that fact in the business operation, or reference
an immutable version that remains readable. Do not reload the current company name hours
later and call it the name at registration. Decide what a missing/deleted source means.

Keep event and listener names tied to the business fact and consumer responsibility;
retain project naming conventions. A typed value payload can express this contract without
a generic event superclass, fluent DSL or mutable entity. Include stable event identity and
trusted tenant identity when the chosen recovery/isolation contract needs them. A record
containing a mutable collection is not a deep snapshot; copy the relevant values, exclude
credentials and avoid carrying persistence proxies across transaction/executor boundaries.

This is a consumer-contract decision: Spring publication hands an event to the multicaster
and does not promise immediate processing. Persistent registries serialize the supplied
event; persistence does not reconstruct an omitted historical value. Verify actual serializer
and pending-record compatibility when changing that payload. These mechanics support the
ID-versus-snapshot distinction; the business decides which meaning is correct.
[Framework 7.0.9 publication contract](https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-context/src/main/java/org/springframework/context/ApplicationEventPublisher.java),
[Modulith 2.1.1 event serialization](https://github.com/spring-projects/spring-modulith/blob/2.1.1/src/docs/antora/modules/ROOT/pages/events.adoc#event-serializer).

## Transaction-bound listener wiring

Inspect the publish site, event type, listener bean, condition, phase and executor. With
`@TransactionalEventListener`, the default is AFTER_COMMIT; without an active transaction,
the default listener is skipped. `fallbackExecution=true` permits delivery without that
transaction; it does not provide a commit, persistence or recovery guarantee. Use it only
when the listener has a meaningful nontransactional contract.

BEFORE_COMMIT participates before the outcome is final. After completion, resources may
still be bound even though their transaction has ended. For a database write, establish
an effective independent transaction. The listener method itself can be the intercepted
boundary; a separate forwarding listener/writer pair is unnecessary when they have no
separate responsibility. This partial alternative assumes an existing `receipt` table
and a Boot-managed `JdbcTemplate`:

```java
@Component
class ReceiptListener {
    private final JdbcTemplate jdbc;

    ReceiptListener(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @TransactionalEventListener
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void on(OrderPlaced event) {
        jdbc.update("insert into receipt (order_id) values (?)", event.orderId());
    }
}
```

Use this only when the post-commit split is intentional and missing receipts can be
repaired or tolerated; a mandatory receipt can instead belong in the original transaction.
The snippet shows transaction timing, not restart recovery or duplicate handling. It uses
Spring's `Transactional`, `Propagation`, `TransactionalEventListener` and `Component`.
Boot supplies the ordinary transaction infrastructure; do not add a custom manager or
`@EnableTransactionManagement` merely to copy the snippet. Verify the actual manager and
proxy path in the target application. A separate transactional collaborator or
`TransactionTemplate` remains useful when ownership or a local programmatic boundary
justifies it. A direct self-call does not invoke advice.

Under Framework 7.0.9's standard transaction listener factory, a post-completion listener
with `@Transactional` must declare REQUIRES_NEW or NOT_SUPPORTED; other propagation modes
are rejected when the listener is registered. Check class-level annotations too. That
release exempts BEFORE_COMMIT from this check. NOT_SUPPORTED creates no transaction for
a database unit; it is not a substitute for the independent transactional write above.
Distinguish a context startup failure from a registered callback that fails at runtime.
[Version-matched listener restriction](https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-tx/src/main/java/org/springframework/transaction/annotation/RestrictedTransactionalEventListenerFactory.java).

Do not rely on REQUIRED in the completed resource context. To distinguish AFTER_COMMIT
from BEFORE_COMMIT, observe the source row from an independent READ_COMMITTED transaction
**inside the callback**, then assert that the listener write survives completion. Counts
before and after the service call cannot distinguish those phases. Arrange sufficient
pool capacity for the extra connection; keep test-only probes out of application behavior.
[Transaction-bound listener API](https://docs.spring.io/spring-framework/docs/7.0.9/javadoc-api/org/springframework/transaction/event/TransactionalEventListener.html).

Default synchronous events, synchronous after-commit callbacks and async listeners have
different failure paths. An exception after commit cannot undo the publisher's work;
inspect framework logging/error handling rather than assuming every callback exception
reaches the caller. With `@Async`, also inspect actual async enablement, proxy entry,
executor rejection and the configured exception handler. Thread-bound transactions do
not automatically transfer to the worker. An immutable ID/value payload can cross the
boundary; a managed entity with a lazy association needs a deliberate reload strategy.
For reactive transactions, use the context-bearing event path supported since Framework
6.1; imperative active-transaction probes do not validate it.
[Transaction events](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html),
[async invocation and exception handling](https://docs.spring.io/spring-framework/reference/integration/scheduling.html#scheduling-annotation-support-async).

## Decide whether retained intent is required

For a best-effort cache hint, an ordinary event and a bounded observable failure policy may
be enough. For a required business effect, identify the durable publication record and its
atomic relationship to the business write. Preserve an adequate existing outbox. A new
executor, fallback flag or after-commit annotation cannot close a crash gap. If durable
state is disallowed, state the resulting limit instead of presenting annotations as a fix.

An external email/payment may succeed before progress recording fails. Replaying a locally
deduplicated database transition does not prove that external effect occurs once. Pass the
provider's identity/receipt contract and this ambiguity window to `idempotency` and
`delivery-semantics`; do not retry the entire committed business command as recovery.

For a durable path, update the existing operational documentation with the source of retained
intent, recovery owner, supported inspection/replay procedure, concurrency/attempt limits
and handling of exhausted or incompatible work. Derive alert thresholds from the agreed
completion delay and observe pending age, failures and progress; a healthy process alone
does not show that follow-up is advancing. Reuse existing telemetry and access-controlled
administrative tooling. Keep business/event IDs in safe diagnostic context, not unbounded
metric labels. Do not add a public retry endpoint or select retention periods without a
requirement; a best-effort path only needs its documented loss/staleness and failure policy.

## Conditional path: Spring Modulith persistent registry

Use this path when a compatible registry already exists or persistent local listener
tracking is the chosen solution. `@ApplicationModuleListener` composes async execution,
transaction-bound delivery and REQUIRES_NEW, but durable tracking also requires a persistent
registry and an operated recovery policy. Keep async enablement and the executor explicit.
[Annotation source, 2.1.1](https://github.com/spring-projects/spring-modulith/blob/2.1.1/spring-modulith-events/spring-modulith-events-api/src/main/java/org/springframework/modulith/events/ApplicationModuleListener.java).

Verify these integration points before claiming recovery:

- The business row and listener publication share the publisher's committed transaction.
  A rollback must leave neither. The JDBC starter must use the intended datasource/manager;
  multiple-resource wiring needs its own test.
- Registration covers the intended listener. By default, the registry considers
  transaction-bound listeners. If only selected listener annotations should participate,
  configure `spring.modulith.events.registry-trigger-annotation` deliberately; adding a
  starter can otherwise change the behavior of existing local listeners.
- Stored event data remains deserializable and its listener ID remains resolvable across
  deployment. Preserve explicit IDs or plan migration of pending records; renaming a method
  can change the default listener identity. Payloads should not contain credentials or
  unnecessary private data.
- Inspect publication state before replaying. In Modulith 2.x, failure, processing and
  completion are distinct. A live slow handler is not necessarily abandoned work. Configure
  staleness/replay with processing bounds and multiple replicas in mind.
- Choose one recovery owner and bounded attempts/concurrency. Startup replay is opt-in and
  can overlap live work in another instance. An explicit administrative retry and a
  production recovery scheduler have different ownership and operational requirements.
- Retention and completion mode must allow the required inspection/reconciliation. Updating
  completed entries retains them; plan supported cleanup rather than letting the table grow
  indefinitely or deleting unfinished work.

[Registry lifecycle and persistence](https://docs.spring.io/spring-modulith/reference/events.html),
[configuration properties](https://docs.spring.io/spring-modulith/reference/appendix.html#appendix.configuration-properties).

For a 2.1.1 retry, `FailedEventPublications.resubmit(ResubmissionOptions)` uses the supplied
batch size, minimum age, filter and max in-flight settings. Choose these from the recovery
workload; defaults do not bound in-flight work. If the application needs a retry cutoff,
add an event filter/attempt budget and an owner for exhausted or incompatible records.
A batch size controls database fetch size, not a universal total-attempt limit.
[Resubmission options source](https://github.com/spring-projects/spring-modulith/blob/2.1.1/spring-modulith-events/spring-modulith-events-api/src/main/java/org/springframework/modulith/events/ResubmissionOptions.java).

Modulith 2.1.1's
[tagged build](https://github.com/spring-projects/spring-modulith/blob/2.1.1/pom.xml)
declares Boot 4.1.1. Verify target compatibility from resolved dependencies and matched
release sources, not the moving documentation's possibly stale compatibility table.
Do not add Modulith dependencies to a best-effort local event or replace an adequate
existing outbox. When this mechanism is required, select its matching persistence starter
and use the application's existing datasource, schema lifecycle and recovery owner.
