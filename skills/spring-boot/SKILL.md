---
name: spring-boot
description: >-
  Configure, implement and diagnose Spring Boot 4 applications when bean composition,
  auto-configuration, external properties, startup, shutdown or operational wiring
  need evidence-backed decisions. Use existing project conventions and managed
  dependencies. Excludes Boot 3 migration, endpoint contracts and ORM query design.
---

# Spring Boot

## Responsibility and activation

Own the composition and runtime configuration of **Spring Boot 4.x** applications.
Use when adding an application capability, diagnosing a missing/duplicate bean, tracing
an unexpected property value, testing conditional configuration, or changing startup,
shutdown or operational wiring. Developers and coding agents should obtain a working
change, a justified design, or an evidence-backed diagnosis according to the request.
Review-only work ends with findings; a sound configuration can be retained.

An isolated Java class, business architecture, HTTP contract, ORM query, or Boot 3
migration is outside this skill's responsibility. An exception mentioning Spring is
not enough to attribute its cause to Boot. Identify the failing component and use the
handoffs below when it owns the decision.

## Establish the application contract

1. Inspect the relevant build files, wrapper/toolchain, compiler release, runtime image,
   resolved dependency graph and tests. Confirm the exact Boot 4 patch and managed
   Framework/library versions. **Use Java 25 as the baseline for this skill, its new
   examples and guidance.** If an existing project targets another Java version,
   report the compatibility difference before recommending version-sensitive changes;
   do not silently retarget it. Preserve its build tool. Selecting this skill does not
   authorize an upgrade, preview feature or new dependency.
   The worked guidance uses Boot **4.1.1** and Java **25**. Code fragments explain
   individual changes to an existing project; they are not a standalone application
   or a compatibility guarantee for every 4.x patch.
   Ground Boot decisions in the [official Spring Boot documentation](https://docs.spring.io/spring-boot/),
   selecting the release that matches the resolved project. A rolling documentation
   link is an entry point, not permission to assume its current defaults apply.
2. Locate bootstrap/package scanning, explicit imports, configuration classes, similar
   components and deployment configuration. Separate explicit requirements, documented
   standards, consistent conventions, isolated examples and hypotheses. Preserve
   adequate conventions without imposing a layer layout or moving unrelated classes.
3. Collect evidence that could change this decision: condition report, bean candidates,
   winning property origin, active profiles, exception cause chain, or lifecycle trace.
   Sanitize values; do not dump secrets through logs, command arguments or Actuator.
4. Ask only for consequential information unavailable in the repository, such as who
   owns a deployment override or whether startup may serve degraded traffic. Continue
   independent reversible work; state material assumptions and how to validate them.

For missing beans, conflicting properties, bootstrap changes or new starters, read
[composition and configuration](references/composition-and-configuration.md).

## Core decisions

| Decision                      | Choose from evidence                                                                                                                                                                                                                                                                                        | Verify the contract                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Managed dependencies          | Start with the existing Boot parent/BOM and the starter for the required capability. A BOM manages versions, not presence on the classpath or every plugin. Investigate a resolved mismatch before pinning transitive versions.                                                                             | Actual compile/runtime dependency graph and a focused startup/test; no unrelated upgrade.                                                                                     |
| Registration versus injection | Follow existing composition: `@Service` for application services, `@Component` for other scanned components, `@Bean` for factories/third-party objects/explicit wiring. Register each intended instance once. **New code and examples use no `@Autowired`**: use one constructor or bean-method parameters. | Bean count, type and consumer identity; no scan-plus-factory duplicate or hidden service locator.                                                                             |
| Configuration interception    | Use `proxyBeanMethods = false` for independent factories receiving dependencies as parameters. When direct calls to bean methods rely on interception, retain `true` or refactor those calls and test identity, scope and cleanup.                                                                          | The consumer receives the managed object. Flag-only replacement can create unmanaged duplicates; this flag does not disable transactional/security proxies on produced beans. |
| Competing beans or cycles     | Determine whether candidates are duplicates, alternatives, a collection or a lifetime mismatch. Use a qualifier for a real selection requirement; `@Primary` only for an intentional default. Repair ownership/cycles before adding lazy lookup.                                                            | Required, optional and ambiguous cases; no blanket bean overriding/circular-reference switch to hide the defect.                                                              |
| Auto-configuration            | Inspect classpath, conditions, user beans and exclusions. Prefer an offered property/customizer or narrowly scoped user bean to replacement. A custom bean may make defaults back off; this is different from redefining a bean with the same name.                                                         | Positive, negative and user-override cases; the condition report explains the observed selection.                                                                             |
| External properties           | Find the winning source before editing a file. Use validated `@ConfigurationProperties` for cohesive settings; an existing `@Value` can remain for an isolated value. Record units, absent/default/null behavior and limits.                                                                                | Binding plus invalid/missing input; profile/import/environment precedence under the real bootstrap when relevant.                                                             |
| Startup and resources         | Use bounded initialization at the appropriate lifecycle point; represent essential readiness honestly. Give clients, executors and background work a clear owner, stop behavior and failure policy.                                                                                                         | Startup failure, context close, in-flight work and timeout behavior, not just a successful construction.                                                                      |

`@Autowired` remains a Spring API; avoiding it is the authoring convention of this
skill, not a claim of removal. Do not rewrite unrelated existing injection to enforce it.
Spring-managed singleton scope does not itself make mutable application state thread-safe.
When a default factory backs off, check whether its properties remain registered and
validated. Their ownership decides whether replacement should disable that binding.
For an ordinary application, use its existing components, typed settings and Boot
properties/builders/customizers. Add conditional library wiring only when independent
consumers actually need default/override behavior. A demonstration client, dispatcher
or custom context harness is not a prerequisite for configuring a real component.

## Operational and conditional decisions

When changing Actuator, health, logging, execution or lifecycle, read
[operations and events](references/operations-and-events.md). Keep these guards visible:

- Exposure, endpoint availability/access and authentication are different controls.
  A custom `SecurityFilterChain` can disable Boot's default security configuration.
  Inspect actual chains, paths, ports and network reachability before declaring an
  endpoint public or protected. Never enable every endpoint merely to debug a value.
- Liveness must describe a process problem that restart can repair. A shared database
  outage belongs in a deliberate readiness/degradation decision, not an automatic
  restart of every replica. Probe the serving path when a separate management port
  could remain healthy while application traffic fails.
- Preserve a working encoder/consumer contract. Boot's structured formats can provide
  JSON without another encoder dependency, but a custom logging configuration may
  need integration. Inspect an emitted event and exercise context cleanup across
  tasks; MDC does not automatically follow every executor. JSON alone proves no cost
  reduction. Keep secrets, arbitrary request bodies and unbounded labels out of telemetry.
- Virtual-thread auto-configuration, custom executors, scheduling and application
  keep-alive are conditional on versions and active beans. Virtual threads do not
  create CPU, database connections or downstream capacity. Verify the executor used
  by the caller before tuning properties that may no longer apply.
  With `SimpleAsyncTaskScheduler`, `fixedDelay` jobs share one scheduler thread;
  preserve the required completion-to-next-start delay when resolving interference.
- Prefer a direct call when the caller needs an immediate result/failure. In-process
  events are useful for a defined decoupling need; asynchronous or after-commit
  listeners do **not** establish delivery after a process crash. Decide transaction
  phase, no-transaction behavior, failure reporting and payload lifetime explicitly.
- Building a reusable starter, AOT/native support and startup optimization are
  conditional projects. Do not add them to an ordinary application change. Confirm
  their constraints before choosing reflection, classpath conditions or measurements.

## Validate, deliver and stop

Read [verification by claim](references/verification.md) when selecting checks for a
configuration change. Adapt a focused check to the project's actual bean, settings or
job; create a separate framework reproduction only when an unresolved mechanism needs
isolation. Passing a reproduction establishes that mechanism under its stated versions,
not the behavior of the application that motivated it.

Choose the smallest check that observes the changed contract: plain unit test for a
pure collaborator, `ApplicationContextRunner` for binding/conditions/bean identity,
real Boot bootstrap for config data and profiles, or an application/server check for
actual management security and lifecycle. A context runner is not evidence of deployed
configuration precedence, network security, durable delivery or native-image behavior.
Test relevant disabled, invalid and failure cases alongside the happy path.

For implementation, deliver the focused change, representative configuration/usage,
checks and their limits. For diagnosis, name the observation, competing explanations,
discriminating evidence and smallest justified correction. For review, give location,
consequence, correction and validation without making unauthorized changes. No mandatory
ADR, coverage percentage, deployment or report is required for a small task.

Stop when the requested behavior is accounted for, material changes have appropriate
evidence, adequate existing behavior is preserved and known limits are stated. Missing
tooling permits a precise unverified result and next check; never invent a passing run
or equate a planned test with executed evidence.

## Optional handoffs

Use `java-build-and-dependencies` when dependency resolution/plugin classpaths are the
cause; pass the build, resolved graph, toolchain and failure and expect a minimal build
repair. Use `spring-boot-web` for HTTP/MVC contracts or container capacity and
`spring-boot-jpa` for persistence behavior; pass exact versions, configuration and
observed request/SQL failure and expect a component-specific correction.
For that persistence work, use the corresponding version of the
[official Spring Data JPA reference](https://docs.spring.io/spring-data/jpa/reference/jpa.html).

Use `spring-security-for-apis` for management/application authorization policy with
actual chain matchers, paths, principals and access expectations; expect access rules
and adversarial checks grounded in the matching
[official Spring Security reference](https://docs.spring.io/spring-security/reference/).
These specialist references are conditional on the task; they do not require unrelated
JPA or security changes. Use `kubernetes-service-lifecycle` for rollout/probe timing with
startup/shutdown traces and deployment budgets; expect a verified drain/probe design.

Use `structured-logging`, `metrics-and-cardinality` or `distributed-tracing-design` when
the issue is event schema, metric dimensions or span/context design rather than Boot
wiring; pass an emitted sample, consumer requirements and transport/executor path.
Expect a bounded telemetry contract and appropriate tests. Use `event-driven-architecture`
for durable event delivery with commit boundary, payload, identity and recovery needs;
expect a consistency/delivery design rather than an annotation substitution.

These are optional collaborators. If unavailable, retain the essential guards here,
produce the supported local finding and specify the unresolved contract and evidence
needed; do not assume an absent specialist completed the work.
