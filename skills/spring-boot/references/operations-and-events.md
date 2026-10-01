# Operations, lifecycle and in-process events

Use only for the affected operational contract: startup/readiness, closing resources,
management endpoints, logging/context or asynchronous/event integration.

## Startup and shutdown have owners

Use construction for cheap dependency establishment and lifecycle callbacks for the
resource's own initialization/release. For a bounded application task after context
refresh, compare `ApplicationRunner` (parsed arguments) with `CommandLineRunner` (raw
arguments); both run before Boot reports application readiness. Order only tasks with
a real ordering requirement. Never hide an unbounded dependency retry in a runner.

Keep `@PostConstruct`/init methods bounded and local to the bean. Waiting for work that
needs other beans during initialization can deadlock creation. Initialization callbacks
run on the raw target before its usual AOP proxy is applied; adding `@Transactional` or
`@Async` to that callback does not establish the intended interceptor boundary. Move an
application startup task to a runner invoking the appropriate managed collaborator,
then verify its transaction/execution behavior. Merely submitting required work does
not hold readiness until it finishes.

An `ApplicationReadyEvent` listener is not a substitute for defining essential readiness
or a durable background job. Choose whether failure should abort startup, keep the app
unready with bounded recovery, or allow an explicitly degraded capability. Make the
decision visible in a test or a captured lifecycle trace. See the
[SpringApplication lifecycle](https://docs.spring.io/spring-boot/reference/features/spring-application.html).

For a resource bean, verify whether the container infers `close`/`shutdown`, an explicit
destroy method is needed, or another owner closes it. Do not double-close borrowed
resources. A prototype or manually constructed object may not receive singleton cleanup.
`SmartLifecycle` is useful when components need coordinated start/stop phases: identify
the dependencies, stop admission, bound draining and invoke completion callbacks. Merely
setting a shutdown timeout does not implement cancellation or cleanup. Check the
[Framework lifecycle contract](https://docs.spring.io/spring-framework/reference/core/beans/factory-nature.html)
for inferred destruction and lifecycle phase behavior.

Handle acquisition failure before relying on destruction. If a factory or init method
opens a resource and then throws, close that partially acquired resource on the failing
path; `@PreDestroy` alone is insufficient. In the baseline's
[Framework 7.0.9 bean-creation path](https://github.com/spring-projects/spring-framework/blob/v7.0.9/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java),
destruction registration follows successful initialization. Alternatively, make an
independently owned resource a successfully initialized managed dependency, so it can be
destroyed when a later consumer fails. Borrowing consumers must not close it themselves.
Inject failure after acquisition, not only before it, and observe cleanup for that path
as well as normal close; preserve the original failure if cleanup also fails.

Inventory non-HTTP work too: schedulers, async tasks, consumers and owned executors can
outlive a drained HTTP server. Test normal close, partial startup failure and interrupted
work at the component boundary. A deployment kill can skip all callbacks; work requiring
recovery needs a persistence/lease strategy beyond orderly context close. For deployment
timing, pass phase durations and outstanding work to the lifecycle specialist.

## Actuator: availability, reachability and permission

Inventory enabled/accessible endpoints, HTTP and JMX exposure, base path, servlet context
path, management address/port, health details and network routes. The same property snippet
can result in different externally reachable paths behind a reverse proxy. A separate
port is not an authorization policy; `include: '*'` is not evidence that every endpoint
is implemented or publicly reachable.

A custom security chain changes the default-security assumptions. Evaluate chain order,
matchers and a catch-all policy for both management and application traffic. Test anonymous,
insufficient-authority and authorized requests to real effective paths. Protect sensitive
diagnostic values and mutation endpoints; do not weaken CSRF or other security merely
to make an operations client pass. The
[Boot endpoints contract](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html)
documents exposure, sanitization and security backoff; implement policy with the security
specialist when needed.

For health groups, ask which action a failed probe should trigger. Shared dependency
failures generally cannot be repaired by restarting this process. Readiness may include
a dependency when its loss actually prevents useful work, but consider the consequence
of removing every replica. Bound check execution and observe cached/stale results when
applicable. If the management server can still respond while the main server is exhausted,
also test probes on the serving path. See
[Boot readiness and liveness](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html#actuator.endpoints.kubernetes-probes).

## Logs, metrics and trace context

Keep an existing logging contract when it works. For Boot's native structured output,
`logging.structured.format.console` or `.file` selects a supported format such as ECS,
GELF or Logstash. A custom Logback/Log4j2 configuration must consume the relevant Boot
structured-format integration; setting a property alone need not replace its encoder.
Consult [Boot logging](https://docs.spring.io/spring-boot/reference/features/logging.html).

Validate emitted bytes, not only YAML: parse a normal event and an exception; inspect
timestamp, level, stable service identity, optional request/trace identifiers and value
types. Verify that credentials, tokens and private payloads are absent. Check compatibility
with the collector rather than renaming fields globally. No universal JSON performance
or token-saving claim follows from choosing a format.

MDC is context with a lifetime, not a global bag. At a task boundary define capture,
installation and restoration/clearing, including failure and nested execution. Reusing
one platform worker is a useful test: task A with context, task B without it, exception
path and existing worker context restored. A virtual thread doesn't make a manual
executor propagate the submitting thread's MDC. Use the framework's compatible task
decoration/context-propagation mechanism where available and verify it is attached to
the actual executor; do not copy security or request objects indiscriminately.

When adding Micrometer/observation wiring, check existing auto-configuration and custom
instrumentation to avoid double recording. Use stable metric dimensions such as operation
or bounded outcome; user IDs, request IDs and raw URLs are unsuitable metric labels.
Test that one representative operation emits the intended instrument/span and that
async context follows the intended parent. Sampling/exporter cost and schema ownership
belong to the corresponding observability specialist.

## Executors and events are conditional choices

Inspect `@Async` enablement, named executors, custom `Executor` beans, scheduler beans,
proxy entry points and rejected-task/exception handling. Property defaults are not proof
of the executor selected by every consumer. Self-invocation through `this` does not cross
the usual proxy boundary. Bound downstream admission separately from worker creation;
an unbounded queue can merely postpone failure. Verify cancellation, shutdown and MDC
under the chosen executor. Boot's
[task execution guide](https://docs.spring.io/spring-boot/reference/features/task-execution-and-scheduling.html)
defines integration and backoff for the exact release.

On the Java 25 baseline, `spring.threads.virtual.enabled=true` affects
supported Boot-managed integration points, not every manually created executor. CPU-heavy
work remains limited by actual CPU availability. JDBC capacity remains bounded by the
pool and database. Virtual threads are daemon threads, so a service relying on their
work may need `spring.main.keep-alive=true`; inspect whether other live components already
keep the process alive and still implement explicit shutdown. Scheduling on each replica
does not create a cluster singleton.

For scheduled jobs, identify the actual `TaskScheduler` and the timing contract. On the
Boot 4.1.1 baseline, an auto-configured scheduler with virtual threads is a
`SimpleAsyncTaskScheduler`; pooling properties such as `spring.task.scheduling.pool.size`
do not tune it. Its `fixedDelay` tasks run on one scheduler thread, so one blocking job
can delay unrelated fixed-delay jobs. A virtual thread setting alone does not isolate them.
The [scheduler API](https://docs.spring.io/spring-framework/docs/7.0.9/javadoc-api/org/springframework/scheduling/concurrent/SimpleAsyncTaskScheduler.html)
documents this behavior for the managed Framework 7.0.9 version.

If the requirement is to wait after the previous execution completes, retain `fixedDelay`.
Compare an explicitly sized `ThreadPoolTaskScheduler` or separately selected schedulers
when jobs need independence; budget threads/downstream work and retain container-managed
shutdown. If the active scheduler is already Boot's pooled scheduler, adjust its
`spring.task.scheduling.*` settings before declaring another bean. When replacing the
virtual scheduler is justified, inject Boot's configured builder instead of assembling
a scheduler and reapplying each property manually. This fragment belongs in an existing
configuration with scheduling enabled:

```java
import org.springframework.boot.task.ThreadPoolTaskSchedulerBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;

@Bean
ThreadPoolTaskScheduler taskScheduler(ThreadPoolTaskSchedulerBuilder builder) {
    return builder.build();
}
```

Keep sizing in the application's configuration, for example
`spring.task.scheduling.pool.size=2` for two jobs whose downstream budget permits that
concurrency. The injected builder carries Boot's bound scheduler settings and customizers;
the returned bean receives container lifecycle management. Inspect existing customizers
and scheduler selections before replacing a bean. Two workers do not guarantee progress
under arbitrary load, and preserving shutdown settings does not prove jobs can stop.
The [Boot task guide](https://docs.spring.io/spring-boot/reference/features/task-execution-and-scheduling.html)
describes both auto-configured scheduler variants and their builders. This change need
not disable virtual threads elsewhere in the application.

Use fixed rate or cron only when their timing and possible overlap match the requirement;
offloading a fixed-delay body with `@Async` also changes what "completion" means. Validate
the real job's scheduling boundary with a controlled blocked collaborator and bounded
waits. Check peer progress, no self-overlap, the completion-to-next-start delay and
cleanup when those are the changed requirements. A passing scheduler reproduction is
not evidence of cluster coordination, downstream capacity or the application's drain.

Choose an in-process event only when its observer relationship is useful. For the default
synchronous listener path, listener failure can affect the publisher; with async execution
the publisher cannot treat return as completed delivery. Pass an immutable payload/ID with
a defined context, not an open HTTP request or a managed JPA entity expected to lazy-load
later. Establish what can be retried and where an error becomes observable.

`@TransactionalEventListener` defaults to after commit; phase selection and
`fallbackExecution` determine other cases. With default fallback behavior, publishing
without a transaction does not invoke that listener. After-commit execution does not imply
that new database writes will be committed in the completed transaction: use an explicit,
tested new unit when needed. Async execution does not inherit the caller's transaction.
Exercise commit, rollback, no transaction and listener failure. The
[transaction-bound event contract](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html)
and [listener API](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/event/TransactionalEventListener.html)
define those boundaries. Required delivery across a crash between commit and notification
needs a durable protocol such as an appropriately designed outbox; annotations alone
cannot close that gap.
