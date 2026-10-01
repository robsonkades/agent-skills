# Verification by claim

Use when implementing or reviewing a changed contract. Select the smallest observation
that could expose the proposed defect; do not build a full service to test one factory.
For a new service, apply that principle to every agreed acceptance criterion and include
the real integration boundaries described in [service delivery](service-delivery.md).
Test scope follows the claim; the factory rule does not authorize delivering only a
factory for a service request.

| Claim                                       | Suitable evidence                                                                  | Insufficient substitute                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------- |
| A consumer receives the managed resource    | Context identity assertion and observed close                                      | Number of annotations or compilation              |
| A user bean replaces the library default    | Runner with default, disabled, custom-bean and property-ownership cases            | Successful startup with defaults only             |
| Invalid configuration prevents startup      | Bind real keys and assert startup failure/cause                                    | Construct the properties object manually          |
| An opt-in feature activates only as agreed  | Absent/true/false/malformed values with actual binding, conditions and replacement | `havingValue` alone or checking only bean absence |
| An environment override wins over a profile | Real Boot config-data loading with controlled property sources                     | Runner `withPropertyValues` alone                 |
| Management access follows policy            | Real chains and effective paths, anonymous and role-negative cases                 | Security dependency on classpath                  |
| Work stops and resources close              | Shutdown/failure observation with owned resources                                  | Health was UP once                                |
| Fixed-delay jobs are independent            | Actual scheduler, blocked job/peer, no self-overlap and post-completion delay      | Virtual threads or pool property alone            |
| Logs retain the right context               | Parsed emitted sample and sequential/failed async tasks                            | Config property exists                            |
| A task is durable                           | Crash/recovery evidence for a durable protocol                                     | In-memory event listener test                     |

## Select the real project's test level

Reuse project test conventions and focused checks. `ApplicationContextRunner` directly
controls the configuration under test, closes its context and reports startup failure;
it is appropriate for most condition/binding problems. Add a filtered classloader case
for optional integration when absence is part of its contract. Use an actual Boot
bootstrap when config imports, profiles, bootstrap order or package scanning is the
question. Use an integration test when proxies, request routing or actual threads matter.

Keep checks attached to the behavior being changed. For a new property, extend an existing
binding/startup test with the actual key and invalid value. For an application service,
exercise that service rather than constructing an unrelated client/dispatcher model.
For reusable auto-configuration, a focused runner test can supply the real user bean and
verify that its default backs off; it does not need a new demonstration application.

When environment precedence is disputed, use real config data with controlled sources
and record the winning origin. Replacing the whole environment is a diagnostic isolation
technique, not application bootstrap code. A deliberately failing configuration or
low-level scheduler probe belongs in a temporary reproduction only when it resolves
uncertainty the project's existing checks cannot. Record its versions, inputs, result
and limits; then verify the relevant behavior in the consuming project. Retain a focused
project regression test when it protects a supported configuration or known defect;
it does not require a separate sample application. Do not copy
fake resource counters, generic fixture bases or timing harnesses into product code.

Check the Boot 4 module and managed test dependencies before copying imports. Boot 4
removed Boot's `@MockBean` and `@SpyBean`; use Spring Framework's `@MockitoBean` and
`@MockitoSpyBean` where bean overrides in supported integration-test contexts are needed.
A runner often needs only a user configuration or supplied test bean. Do not silently
replace all collaborators or enable bean overriding to make a context start. See the
[Boot 4 migration notes](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide).

## Structured walkthroughs when execution is unavailable

These are reasoning checks, not measured agent or runtime outcomes:

- A new registration service with durable records: require a real store, migrations,
  shared uniqueness, explicit access policy and checks of the assembled use case. Change
  only the state-lifetime requirement to an explicitly disposable prototype: memory can
  be appropriate, with limits stated; it does not become evidence of durable delivery.
- The selected database runtime is unavailable: continue independent implementation and
  retain exact pending integration commands and prerequisites. Do not replace the runtime
  repository with memory or count skipped database tests as passed durability checks.
- A Spring-free use case must save two related records atomically, but each gateway call
  commits separately: keep the application boundary pure and wire one effective transaction
  around the invocation. Fail the second write and observe both records from outside the
  transaction. Two successful repository tests do not establish use-case atomicity.
- A request to fix one property binding failure: retain the focused binding/startup check.
  Do not add a database, API, security provider or deployment platform to expand the task.
- A direct bean-method call plus `proxyBeanMethods=false`: identify the extra instance;
  parameter injection or retaining full configuration must preserve managed identity.
  Change only the call to a parameter and reconsider: proxying is no longer necessary
  for that dependency. Do not derive a global "always false" rule from the pair.
- Deployment value differs from a YAML file: locate the winning source and its owner;
  propose a change at that source, not an ineffective edit to a lower-priority file.
- An opt-in client's flag is misspelled: check the condition's accepted values and the
  desired invalid-input policy independently. A true-only condition controls selection;
  reachable typed binding can reject malformed input. Preserve a replacement client's
  independence from unused default credentials and shared settings' validation.
- A startup dependency is unavailable and partial service policy is undocumented: ask
  which operations may serve while recovery is bounded, using the traced dependencies
  to recommend an option. Change only that policy to require the dependency for every
  operation: partial service is no longer acceptable. Keep the shared outage out of
  liveness; verify the agreed readiness/startup failure and recovery behavior.
- A factory opens a client and its next initialization step throws: require cleanup of
  that acquired client on the failure path; declaring a destroy callback is insufficient.
  Change only ownership so the client is a successfully initialized managed dependency
  borrowed by the failing consumer: let the container close it and avoid consumer
  double-close. Observe both paths and normal shutdown.
- A required startup write uses `@Transactional` on the same `@PostConstruct` method:
  identify the missing proxy boundary; use a bounded runner calling the managed
  transactional collaborator and observe persisted state on success and rollback.
  Returning from submission to an executor cannot prove completion before readiness.
- A user client replaces the default but unused default settings fail validation:
  identify the surviving properties registration. If only the default owns those
  settings, condition that registration too, retaining the dispatcher. Change only
  their ownership to an application-wide contract: validation must remain active.
- Two fixed-delay jobs interfere with virtual threads enabled: identify the scheduler
  before proposing a pool property. Preserve the delay after completion and test a
  scheduler that isolates the jobs. Change the timing requirement to fixed cadence
  with overlap allowed: fixed rate becomes an option, with explicit admission limits.
- A custom filter chain and broad Actuator exposure: inspect matching and access
  evidence; neither "Boot secures it" nor "the snippet is public" is proved yet.
- An async after-commit listener must survive process loss: record the durability gap
  and hand off the consistency/recovery requirement. Adding retries in memory does not
  satisfy it.
- A Boot 3 application with no upgrade authorization: return the compatibility boundary
  and a focused handoff instead of applying Boot 4 snippets.

When a tool fails, report the command, relevant failure and the exact unchecked claim.
Source inspection can support an API conclusion while runtime wiring remains unknown.
Do not relabel these walkthroughs as tests or claim a behavioral improvement percentage.
