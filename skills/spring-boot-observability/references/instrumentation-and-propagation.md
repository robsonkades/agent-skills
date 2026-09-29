# Instrumentation and propagation

Read for missing or duplicate measurements, custom observations, or context loss. The
property/API examples target Boot 4.1.1; resolve the target application's versions first.

## Inventory before adding instrumentation

Map the affected path: inbound server, business operation, executor, outbound client,
downstream receiver, SDK/exporter. Record which library or agent owns each boundary and
whether it emits metrics, traces, or both. Inspect beans and emitted records, rather
than treating a dependency name as proof that the path is instrumented.

On this baseline, observation annotations require
`management.observations.annotations.enabled=true` and AspectJ support; they are not
activated by the annotation alone. Controllers and some repositories may already be
instrumented. Remove redundant annotations or deliberately replace the corresponding
automatic instrumentation, then assert the expected boundary count. An OTel Java agent
and Boot's Micrometer path can differ in conventions and ownership; do not globally
disable either without determining what coverage would disappear.
[Boot observation configuration](https://docs.spring.io/spring-boot/reference/actuator/observability.html)
describes these conditions.

Inspect the actual `ObservationRegistry`/`MeterRegistry` used by the component. Creating
a private registry can disconnect its data from Boot's handlers. Inject the managed bean
and use the appropriate customizer/convention when needed. Avoid adding a second default
meter or tracing handler to a registry already configured by Boot. Use a meter-only
filter for meter policy, an observation predicate to suppress a whole observation, and
an observation convention for names/keys; they affect different consumers.

## Client and executor boundaries

Boot-configured `RestClient.Builder`, `RestTemplateBuilder` and `WebClient.Builder` carry
the integration that automatic network propagation needs. A static client factory or
replacement builder does not inherit that configuration. For a custom client, choose
explicit integration rather than silently changing its transport, timeouts or pool.
Trace sampling, propagation and export are distinct; a locally absent exported parent
can reflect sampling, while an outgoing carrier can still have context.
[Boot tracing](https://docs.spring.io/spring-boot/reference/actuator/tracing.html)
documents the supported builder and tracing combinations.

For `@Async`, verify `@EnableAsync`, the proxy crossing, qualifier/default executor
selection and its ownership. Self-invocation is not a proxy crossing. Boot 4.1.1's
auto-configured executor uses `spring.task.execution.propagate-context=true` to opt in.
For a manually created executor, **attach** the decorator; registering a decorator bean
alone cannot configure an arbitrary object built with `new`. A configured Boot builder
can apply its customizers, but verify that the application actually used that builder.

For the ordinary Boot-owned case, the complete propagation change on this baseline is:

```properties
spring.task.execution.propagate-context=true
```

Keep the existing executor and verify the actual qualified call. If the task is synchronous
and has no context boundary, neither this property nor a new executor is needed.

Only for an executor the application must construct itself, attach the decorator inside
its existing bean definition. This partial line is not another executor implementation:

```java
executor.setTaskDecorator(new ContextPropagatingTaskDecorator());
```

Preserve its sizing, rejection policy and Spring-managed lifecycle. If it already has a
decorator, compose the required behaviors rather than silently replacing it; verify capture
and restoration order. Do not add a parallel executor solely for observability.

The [task selection guide](https://docs.spring.io/spring-boot/reference/features/task-execution-and-scheduling.html)
explains executor backoff/integration. The
[Framework decorator API](https://docs.spring.io/spring-framework/docs/7.0.9/javadoc-api/org/springframework/core/task/support/ContextPropagatingTaskDecorator.html)
defines task wrapping. Registered thread-local accessors determine what is captured;
Micrometer [context snapshots](https://docs.micrometer.io/context-propagation/reference/usage.html)
install and restore captured values within a scope. Capture at submission, restore the
worker's prior state after success or exception, and test an unscoped task on the same
worker. Inspect raw worker state in a test: decorating the inspection itself can conceal
a previous leak. Virtual threads do not make custom executors inherit arbitrary context.

For reactive applications, examine Reactor Context and the target's
`spring.reactor.context-propagation` support rather than transplanting a thread-pool fix.
Do not block a reactive chain to make thread-local assertions pass.

## Completion, errors and bounded labels

Prefer an existing observation when it measures the required boundary. For a distinct
operation, `Observation.observe` scopes the synchronous body and records thrown errors;
manual lifecycle code must signal errors, close the scope and stop on every path. Merely
returning a `CompletableFuture` from that body measures submission, not completion. Either
place the observation inside the task that completes the operation,
or implement explicit completion/error handling with a tested lifetime. Never leave a
thread-local scope open until a callback on another thread closes it.
[Micrometer's lifecycle contract](https://docs.micrometer.io/micrometer/reference/observation/components.html)
defines these operations.

A method that only delegates to one managed HTTP client already has a client observation.
The runnable probe deliberately relies on that measurement. A business observation becomes
useful when, for example, a fulfillment operation includes validation, several remote calls
and persistence, and the requested metric measures that complete outcome. Choose its start,
completion and failure semantics before adding a wrapper or annotation.

Low-cardinality values feed metrics as well as traces; do not pass caller-controlled
user IDs, authorization headers, raw paths or exception messages there. Start with
existing HTTP route conventions and bounded operation/outcome values. For outbound
requests use a URI template with variables instead of pre-expanding a different URI
string for every user. Exercise several identities and assert stable meter IDs, counts
and no sensitive labels. High-cardinality trace values are not automatically safe.

For handled HTTP exceptions, inspect status/outcome and the observation's recorded
error separately. MVC exception handlers may consume the exception before the filter
can observe it; explicit framework-supported error recording is a separate choice when
the telemetry contract needs it. Do not deliberately rethrow a handled error and break
the API contract merely to populate a tag. See
[Framework HTTP observations](https://docs.spring.io/spring-framework/reference/integration/observability.html).
