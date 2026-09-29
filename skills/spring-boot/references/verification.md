# Verification by claim

Use when implementing or reviewing a changed contract. Select the smallest observation
that could expose the proposed defect; do not build a full service to test one factory.

| Claim                                       | Suitable evidence                                                             | Insufficient substitute                  |
| ------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------- |
| A consumer receives the managed resource    | Context identity assertion and observed close                                 | Number of annotations or compilation     |
| A user bean replaces the library default    | Runner with default, disabled, custom-bean and property-ownership cases       | Successful startup with defaults only    |
| Invalid configuration prevents startup      | Bind real keys and assert startup failure/cause                               | Construct the properties object manually |
| An environment override wins over a profile | Real Boot config-data loading with controlled property sources                | Runner `withPropertyValues` alone        |
| Management access follows policy            | Real chains and effective paths, anonymous and role-negative cases            | Security dependency on classpath         |
| Work stops and resources close              | Shutdown/failure observation with owned resources                             | Health was UP once                       |
| Fixed-delay jobs are independent            | Actual scheduler, blocked job/peer, no self-overlap and post-completion delay | Virtual threads or pool property alone   |
| Logs retain the right context               | Parsed emitted sample and sequential/failed async tasks                       | Config property exists                   |
| A task is durable                           | Crash/recovery evidence for a durable protocol                                | In-memory event listener test            |

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

- A direct bean-method call plus `proxyBeanMethods=false`: identify the extra instance;
  parameter injection or retaining full configuration must preserve managed identity.
  Change only the call to a parameter and reconsider: proxying is no longer necessary
  for that dependency. Do not derive a global "always false" rule from the pair.
- Deployment value differs from a YAML file: locate the winning source and its owner;
  propose a change at that source, not an ineffective edit to a lower-priority file.
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
