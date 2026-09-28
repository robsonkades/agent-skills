# Verification by claim

Use when implementing or reviewing a changed contract. Select the smallest observation
that could expose the proposed defect; do not build a full service to test one factory.

| Claim                                       | Suitable evidence                                                  | Insufficient substitute                  |
| ------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------- |
| A consumer receives the managed resource    | Context identity assertion and observed close                      | Number of annotations or compilation     |
| A user bean replaces the library default    | Runner with default, disabled and custom-bean cases                | Successful startup with defaults only    |
| Invalid configuration prevents startup      | Bind real keys and assert startup failure/cause                    | Construct the properties object manually |
| An environment override wins over a profile | Real Boot config-data loading with controlled property sources     | Runner `withPropertyValues` alone        |
| Management access follows policy            | Real chains and effective paths, anonymous and role-negative cases | Security dependency on classpath         |
| Work stops and resources close              | Shutdown/failure observation with owned resources                  | Health was UP once                       |
| Logs retain the right context               | Parsed emitted sample and sequential/failed async tasks            | Config property exists                   |
| A task is durable                           | Crash/recovery evidence for a durable protocol                     | In-memory event listener test            |

## Executable teaching fixture

Read [the fixture README](../assets/composition-fixture/README.md) and
[POM](../assets/composition-fixture/pom.xml) before running. Copy the complete fixture to
an isolated temporary directory and run its Maven tests there. It needs Maven, JDK 25
with compilation targeting `--release 25`, and first-run dependency access; no database, Docker,
credentials or external service is used. Maven downloads dependencies and writes its
cache plus build output; use a temporary Maven repository if those writes must be isolated.

The fixture proves small, consequential contracts: conditional feature registration,
default/custom-bean selection, validated binding, effective profile/environment/CLI
precedence, singleton identity for full configuration versus plain calls, parameter
injection and managed close. The deliberately broken direct-call case asserts the
mismatched identity to expose why a flag-only change is wrong; it cleans up its extra
object itself. It is not a recommended wiring pattern.

The fixture is an executable teaching example, not a benchmark, starter distribution,
production client or guarantee for all Boot 4.x. Compile and execute on the Java 25
baseline; do not present execution on a different JDK as equivalent runtime evidence.
Record the actual runtime, Maven, patch, test count and results. No native, HTTP security,
real service shutdown, logging transport or event-delivery claims follow from it.

## Select the real project's test level

Reuse project test conventions and focused checks. `ApplicationContextRunner` directly
controls the configuration under test, closes its context and reports startup failure;
it is appropriate for most condition/binding problems. Add a filtered classloader case
for optional integration when absence is part of its contract. Use an actual Boot
bootstrap when config imports, profiles, bootstrap order or package scanning is the
question. Use an integration test when proxies, request routing or actual threads matter.

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
