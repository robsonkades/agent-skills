---
name: spring-boot-observability
description: >-
  Wire and diagnose Spring Boot metrics, observations, traces and Actuator when a
  managed HTTP client loses trace context, asynchronous work detaches from its
  parent, instrumentation duplicates data, metric labels grow, or management
  endpoints and health groups expose the wrong behavior. Owns Boot integration;
  metric schema, trace topology, telemetry cost and SLO policy belong to specialists.
---

# Spring Boot Observability

Make the application's actual Boot beans emit the intended evidence and expose only
the intended management surface. Follow the user's implementation, review or diagnosis
scope; retain a working configuration when the evidence supports it.

Start with Boot's existing HTTP instrumentation, managed client builder and executor.
Add an observation only when the requested business boundary has meaning beyond those
existing measurements. Do not add `@Async`, a custom executor, a registry or a tracing
wrapper just to make a telemetry example look complete.

## Establish the target

Inspect the build, resolved Boot/Framework/Micrometer/tracing versions, Java release,
runtime flags, active properties, custom registries/builders/executors and existing
instrumentation. Include any OpenTelemetry Java agent or competing starter. Confirm
which process and environment produced the observed data before diagnosing a gap.

The authoring and executable baseline is **Java 25, Spring Boot 4.1.1**, using managed
dependencies without preview features. It is not an upgrade requirement for an existing
project. Preserve its Java version, build tool, telemetry provider and supported APIs;
check target-version documentation before copying properties or adding dependencies.
Use constructor or bean-method injection in application code; do not rewrite unrelated code.
Use the official [Spring Boot documentation](https://docs.spring.io/spring-boot/) for that
version as the starting authority. For an actual management authorization change, also
consult the matching [Spring Security reference](https://docs.spring.io/spring-security/reference/).
Micrometer and OpenTelemetry contracts supplement those sources; they do not override the
application's supported Boot integration.

When deployment configuration, exporter logs or traces are missing, report the supported
local finding and the smallest evidence that distinguishes wiring, sampling and export
failure. A screenshot with missing spans does not establish which component dropped them.

## Decisions that change the wiring

| Situation                          | Decision and evidence                                                                                                                                                                                                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Missing outbound trace parent      | Find the actual client construction. Use an injected Boot-configured builder or explicitly integrate a custom client with the existing registry; verify incoming, outgoing and downstream context together.                                                                                                  |
| Parent disappears in `@Async`      | Identify the executor selected by qualifier/default resolution and whether Boot owns it. On the baseline, enable `spring.task.execution.propagate-context` for the auto-configured executor. Explicitly attach a context decorator to a manually constructed executor. Test reuse after success and failure. |
| Duplicate spans or timers          | Inventory automatic instrumentation, annotations and manual handlers first. Retain one owner for each boundary. Do not annotate all controllers or register another default handler merely because Actuator data exists.                                                                                     |
| Custom business measurement        | Inject the managed registry. Add an observation only for a distinct operation; preserve exception propagation and close scopes/stop observations. An async method returning a future needs a deliberate completion boundary.                                                                                 |
| User/path values create series     | Inspect emitted meter IDs under distinct inputs. Keep request identities, credentials and raw paths out of labels; retain route templates and bounded outcomes. A high-cardinality trace attribute is still subject to data policy.                                                                          |
| Management endpoint access changes | Check availability/access, HTTP/JMX exposure and actual authorization independently. Exercise anonymous, wrong-role and authorized requests through effective paths and ports.                                                                                                                               |
| Probe answers the wrong question   | Select actual health group members. Keep external dependencies out of liveness; include one in readiness only when the serving contract requires it. Exercise availability transitions and HTTP status mappings.                                                                                             |

For missing/duplicate measurements or executor context, read
[instrumentation and propagation](references/instrumentation-and-propagation.md).
For Actuator exposure or health changes, read
[management and probes](references/management-and-probes.md).
For tests or evidence supporting a claim, read
[verification](references/verification.md), which routes the runnable fixture.
The fixture is a narrow propagation probe for an application that already uses `@Async`;
copy only the configuration or assertion relevant to the target defect, not its topology.

## Preserve the important distinctions

- An observation, a meter, a sampled span and a backend record are separate stages.
  Assert the stage that changed. An in-memory exporter verifies SDK output, not collector
  ingestion or retention. Preserve approved sampling; test-only full sampling is not a
  production default.
- Instrument the complete intended operation, including failure. HTTP outcome can reflect
  a handled 5xx while the server observation has no exception. Do not infer successful
  business processing from an absent exception tag or an HTTP 200 alone.
- Scope propagation to the registered context carriers. An observation decorator does not
  automatically authorize copying every MDC field, credential, request or transaction.
  Verify the emitted log correlation separately when that is the reported defect.
- A custom security chain changes default assumptions. A separate management port and
  hidden health details do not establish authorization. Avoid broad endpoint exposure to
  obtain one diagnostic value.

## Deliver and hand off

Deliver the focused change or finding, the evidence that selected it, the relevant
configuration and the checks run with their limits. No new dashboard, tracing backend,
performance experiment or production deployment is required for a local wiring fix.

Use `metrics-and-cardinality` for instrument/label budgets, `distributed-tracing-design`
for span meaning and parent/link choices, `opentelemetry-performance` for sampling/export
capacity or overhead, `structured-logging` for event schema and sensitive-field policy,
`slo-and-alerting` for objectives and alert rules, and `kubernetes-service-lifecycle` for
probe timing and rollout/drain behavior. Pass versions, emitted examples and the relevant
request/executor path; expect a decision for that contract. Use `spring-boot` for general
auto-configuration/binding issues and the API security specialist for authorization design.
These are optional handoffs, not prerequisites; state unresolved limits if unavailable.
