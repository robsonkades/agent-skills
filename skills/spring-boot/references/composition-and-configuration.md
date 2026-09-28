# Composition and configuration

Use for bootstrap, missing/duplicate beans, conditions, property binding and library
auto-configuration. Examples in the asset are executable on the pinned baseline;
the diagnostic sequences here are decision guidance, not a script to run wholesale.

## Trace the composition before changing it

Locate the bootstrap class and the packages reached by `@SpringBootApplication`,
explicit component scans and imports. Putting the application in a package above its
components is often sufficient; widening a scan to an entire organization can include
unrelated configurations. Check whether a test slice intentionally omits the component
before "fixing" production scanning. Avoid the default package.

For an unsatisfied dependency, trace this sequence:

1. Does the required artifact/type exist in the runtime graph, not just the IDE or
   test classpath? Inspect the build's existing dependency report. Boot 4 has changed
   module/test starter boundaries; use the exact release's starter documentation.
2. Which factory/scan/import is expected to register it? What is the actual bean type,
   name, qualifier, profile and context hierarchy?
3. Did a condition reject it? Read the relevant entry of the condition evaluation
   report, including the bean/class/property it tested. A missing class is different
   from a deliberately supplied replacement or disabled feature.
4. Did construction fail after registration? Read the first relevant cause and binding
   error, not only the outer "application failed" message.
5. Reproduce only the discriminating condition in a small context. If runtime evidence
   is unavailable, distinguish a plausible configuration cause from a confirmed cause.

Temporarily enabling the Boot condition report locally can be useful. Prefer a targeted
test or already authorized diagnostics over exposing `/conditions`, `/beans` or `/env`
on a deployed service. Do not echo complete environments or secret-bearing URLs.

## Keep registration, identity and scope distinct

New application-owned services can use their existing `@Service`/`@Component` conventions
with one constructor. Objects built from typed settings, third-party clients and factories
often fit `@Bean`; avoid also component-scanning the same implementation. Multiple
constructors create a new selection decision: simplify to one when possible rather than
adding hidden injection. Dependencies should be explicit, normally `final`.

`@Configuration(proxyBeanMethods = false)` treats direct calls as ordinary Java. A call
like `new Processor(client())` inside another factory can obtain a second resource,
while the container closes only its managed one. Parameter injection expresses the
dependency without that interception. Existing full configuration can legitimately
retain `true`; a flag change is not a performance fix without a relevant measurement.
Test the consumer's reference against the context's bean and observe cleanup. The
[Framework configuration contract](https://docs.spring.io/spring-framework/reference/core/beans/java/configuration-annotation.html)
defines this distinction; the fixture tests both flag values and the parameter-injected
alternative.

For lifetime mismatches, a singleton injected with a prototype does not acquire a new
instance on every invocation. Choose an explicit factory/provider or scoped proxy only
if repeated resolution or request scope is needed. Specify who releases prototype
resources; a scoped proxy is not a general concurrency guard. Do not introduce a request
scoped dependency into startup/background work without defining its absent-request path.
See [bean scopes](https://docs.spring.io/spring-framework/reference/core/beans/factory-scopes.html).

When a set of strategies is actually needed, inject the implementations and construct
the selection mechanism once. `Map<String, Strategy>` injection uses bean names, which
need not equal business keys. Define unknown-key and duplicate-business-key behavior;
silently retaining the last value can route work to the wrong implementation. Preserve
a direct dependency for a single stable implementation. A qualifier resolves wiring,
not arbitrary runtime business dispatch.

## Customize before replacing

Start with a property or supported customizer when it preserves the useful defaults.
Use a user-defined bean for a required replacement, then inspect which configurations
back off. An exclusion must name the configuration, why its effect is unwanted, and
who now supplies the lost capability. Bean-definition overriding is a different, wider
mechanism than conditional backoff; do not enable it to suppress an unexplained collision.

For a reusable library, use `@AutoConfiguration`, appropriately ordered conditions and
the auto-configuration imports resource instead of scanning consumers' packages.
Bean conditions depend on definitions processed so far; place them where the ordering
contract is appropriate. Return specific bean types so conditions can identify them.
Verify absent/present optional classes, explicit false, missing property, defaults and
custom replacement. A condition on a method cannot always protect loading an optional
return type: isolate the optional class-dependent configuration. The
[Boot auto-configuration guide](https://docs.spring.io/spring-boot/reference/features/developing-auto-configuration.html)
defines these mechanisms and `ApplicationContextRunner` checks. Application composition
does not require making a new starter.

## Find the winning configuration source

Build a small provenance table for the affected keys: intended contract, source, effective
value (redacted if sensitive), default/unit and override owner. Check active profiles,
config imports, mounted configuration, environment/system properties and command-line
arguments. A YAML edit cannot defeat a higher-priority deployment override by itself.
`spring.config.location` replaces default locations; `additional-location` adds locations.
An optional import tolerates a missing resource and is wrong when that resource supplies
essential production credentials. `@PropertySource` arrives too late for some bootstrap
and logging settings. Check the versioned
[external configuration contract](https://docs.spring.io/spring-boot/reference/features/external-config.html)
instead of assuming all configuration sources have identical precedence or activation.

For a cohesive group, use `@ConfigurationProperties`, register it through configuration
properties scanning or explicit enabling, and validate it. A constructor-bound record
does not need a component stereotype or `@Autowired`. Use `Duration`/`DataSize` for units
and state valid ranges. Ensure nested objects receive cascading validation where needed.
Decide whether absence is permitted; do not substitute empty/zero for required values.
The fixture shows a defaulted record with range and positive-duration validation.

Choose a narrowly used `@Value` only when that simpler contract suffices. Expression
evaluation and typed configuration binding are different features. Avoid scattering a
cohesive configuration contract through unrelated strings. Secret values require an
external source suitable to the deployment; neither typed properties nor profiles are
a secret store. A generated record `toString()` can disclose secrets if logged.

Test with actual config data when profiles, imports or precedence are disputed; a runner's
injected property list only proves binding under that artificial source. Do not invent
runtime refresh semantics: confirm the owning mechanism and whether existing consumers
observe new values before promising a configuration change without restart.

## Compatibility restraint

Java 25 is this skill's baseline. Inspect the actual project compiler release, toolchain
and deployment runtime; when they differ, identify the compatibility gap and the affected
recommendation without silently upgrading the application. Keep examples on stable APIs;
the baseline does not authorize enabling preview features.

Resolve Boot-managed versions before adding overrides to Framework, Jackson, logging,
validation or test libraries. Different majors of related APIs can be present intentionally;
the import and auto-configuration must match the actual module. Consult
[Boot build systems](https://docs.spring.io/spring-boot/reference/using/build-systems.html)
and the chosen BOM. Preserve Maven/Gradle conventions; the fixture's Maven build does
not claim that an untested Gradle translation is equivalent.

If tests pass but the deployed artifact cannot start, inspect the packaged artifact and
launch command as well as the dependency graph. Importing a BOM does not configure an
executable archive: the project's Boot Maven plugin/repackage or Gradle `bootJar` setup
and selected main class must match how that artifact is launched. Do not add packaging
plugins to a library or non-executable fixture merely because it uses Boot dependencies.

For AOT/native requirements, inspect reachability hints, reflective resources, dynamic
loading and the build-time versus runtime condition contract. A JVM runner check does
not prove native behavior; arrange a native build/test only for a native requirement.
For startup tuning, first separate dependency/initialization failures from measured
startup time; deferring required beans with global lazy initialization can move failure
to the first request and invalidate readiness.
