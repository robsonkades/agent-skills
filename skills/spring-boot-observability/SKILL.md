---
name: spring-boot-observability
description: >-
  Wire Spring Boot metrics, observations, traces and Actuator for a maintained service,
  or diagnose when a managed HTTP client loses trace context, asynchronous work detaches from its
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
Read the affected tests, deployment overrides, operating notes and telemetry conventions.
Identify the signal's consumer and decision: an on-call diagnosis, a dashboard query, a
probe action or a business outcome. Inspect existing platform coverage before proposing
new wiring; a dashboard name alone does not define the measured operation.

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

For a new maintained service, deliver the local operational contract: health/probe paths
and membership, restricted management access, HTTP request counts/errors/durations with
bounded dimensions, and actionable application logs with safe diagnostic context. Identify
which consumer receives each signal and verify the actual emitted data. Wire the existing
platform's registry/tracer/exporter when supplied; Actuator alone is not a tracing backend.
If no export destination is specified, complete the local wiring and state the remaining
deployment decision instead of inventing a collector, credentials or mandatory tracing stack.
Keep domain types independent of HTTP and telemetry infrastructure; instrument an
application boundary or adapter where the intended operation can be measured.
A focused repair only needs the affected contract verified, not this whole service setup.

## Work from an observable contract

1. Define what starts and completes the affected operation, what failure means, and which
   evidence the consumer needs. For queued work, HTTP acceptance and business completion
   are different events; do not rename the HTTP timer as end-to-end processing time.
2. Reuse an adequate signal or configuration. Apply new instrumentation only for a missing
   boundary or actionable distinction; reject a duplicate wrapper. Defer a relevant export
   or policy change outside the agreed scope with its owner and condition for resuming it.
3. Resolve material unknowns after inspection. For example: "Does success mean accepting
   the job or completing it, and who acts on that measure? The existing HTTP timer covers
   acceptance; completion needs the worker's outcome." Keep independent work moving.
   Use explicit reversible assumptions for local test details; do not invent retention,
   sampling, sensitive-field or access policies. Preserve decisions already documented.
4. Change the identified owner using the managed extension point, then verify that boundary
   and its relevant failure path. Keep ordinary success/failure behavior unchanged by
   instrumentation. For longer work, record material decisions and progress in the project's
   existing format; reserve an ADR for a durable architecture choice, such as changing
   instrumentation ownership, rather than each property or tag.

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

For missing/duplicate measurements, safe error/log correlation or executor context, read
[instrumentation and propagation](references/instrumentation-and-propagation.md).
For Actuator exposure or health changes, read
[management and probes](references/management-and-probes.md).
For a missing backend signal, tests or an operational handoff, read
[verification](references/verification.md), which routes the runnable fixture.
The fixture is a narrow propagation probe for an application that already uses `@Async`;
copy only the configuration or assertion relevant to the target defect, not its topology.

## Preserve the important distinctions

- An observation, a meter, a sampled span and a backend record are separate stages.
  Assert the stage that changed. An in-memory exporter verifies SDK output, not collector
  ingestion or retention. Preserve approved sampling; test-only full sampling is not a
  production default.
- A requirement to retain every business change durably is not met by ordinary tracing.
  Raising sampling does not supply transactional audit storage or guaranteed delivery.
  Identify the business contract and hand it to its application owner; keep operational
  telemetry useful without silently implementing an audit or messaging subsystem here.
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
configuration and the checks run with their limits. For new wiring, include the dependency
and environment configuration, example emitted signals and how to verify them locally.
Update the existing runbook or service documentation for changed names, dimensions,
completion/error semantics, access paths and diagnosis steps that its consumer needs.
Finish when the requested boundary is verified, or deliver an actionable diagnosis with
the missing evidence, responsible boundary and next check explicitly identified.
No new dashboard, tracing backend, performance experiment or production deployment is
required for a local wiring fix.

Use `metrics-and-cardinality` for instrument/label budgets, `distributed-tracing-design`
for span meaning and parent/link choices, `opentelemetry-performance` for sampling/export
capacity or overhead, `structured-logging` for event schema and sensitive-field policy,
`slo-and-alerting` for objectives and alert rules, and `kubernetes-service-lifecycle` for
probe timing and rollout/drain behavior. Pass versions, emitted examples and the relevant
request/executor path; expect a decision for that contract. Use `spring-boot` for general
auto-configuration/binding issues and the API security specialist for authorization design.
These are optional handoffs, not prerequisites; state unresolved limits if unavailable.
