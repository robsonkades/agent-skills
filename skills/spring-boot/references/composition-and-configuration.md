# Composition and configuration

Use for bootstrap, missing/duplicate beans, conditions, property binding and library
auto-configuration. The fragments below explain changes to existing project types;
they are not a standalone application or a script to run wholesale.

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
defines this distinction. For example, change the factory consuming an existing client:

```java
// Before: a plain Java call when proxyBeanMethods=false.
@Bean
Processor processor() { return new Processor(client()); }

// After: the container supplies its registered client.
@Bean
Processor processor(Client client) { return new Processor(client); }
```

These are alternative method fragments; `Processor`, `Client` and the `client()`
factory are the application's existing types. Keep one implementation. If the existing
configuration needs full interception elsewhere, retain it until those dependencies
are accounted for. Verify the real consumer's identity and owned-resource close rather
than adding a fake client with a close counter to production code.

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

Check what else survives a factory's backoff. A method-level `@ConditionalOnMissingBean`
does not disable its enclosing class's `@EnableConfigurationProperties`: those settings
can still bind and fail validation after a user replaces the client. Decide ownership:

- If the properties configure only the default implementation, place their registration
  and factory in a nested configuration conditioned on the missing client. Keep consumers
  outside that condition so they can use the replacement.
- If the properties describe an application-wide contract or another consumer still needs
  them, retain registration and validation. Do not disable validation merely to start.

Check other registration paths, including properties scanning. Test the same invalid
value with and without the replacement, then with explicitly shared properties.
See [bean conditions](https://docs.spring.io/spring-boot/reference/features/developing-auto-configuration.html#features.developing-auto-configuration.condition-annotations.bean-conditions)
and [properties validation](https://docs.spring.io/spring-boot/reference/features/external-config.html#features.external-config.typesafe-configuration-properties.validation).

For example, a library's default archive client needs an endpoint, while the application
owns a retention setting. A service supplying its own client should not need the unused
endpoint. Move the default factory and its `@EnableConfigurationProperties` registration
into the same nested `@Configuration(proxyBeanMethods = false)` guarded by
`@ConditionalOnMissingBean(ArchiveClient.class)`. Keep the retention settings and the
services consuming the client outside that condition:

| Configuration supplied by the consumer | Expected outcome | Reason                                                                     |
| -------------------------------------- | ---------------- | -------------------------------------------------------------------------- |
| No client, invalid endpoint            | Startup fails    | The default still needs valid connection settings.                         |
| Custom client, invalid unused endpoint | Startup succeeds | Default-only settings are no longer registered through that configuration. |
| Custom client, invalid retention       | Startup fails    | Application-wide validation remains active.                                |

This is a library override contract, not a reason to wrap a single application's client
in auto-configuration. In that application, change the existing typed settings/factory
and its binding test. If another scan independently registers the default properties,
moving one annotation is insufficient; fix that registration according to ownership.

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

### Property conditions are selection rules, not validation

For opt-in auto-configuration, define the missing-value policy and the accepted activation
value. With `@ConditionalOnProperty`, the default `havingValue` matches a present value
other than `false`; a misspelling such as `treu` can therefore activate a client. Use
`havingValue = "true"` for a true-only activation contract and choose `matchIfMissing`
deliberately. That condition alone does not reject malformed values: it can simply leave
the feature inactive. If malformed flags must fail startup, keep their typed binding and
validation reachable even when the feature's factory is not selected. Distinguish those
shared policy settings from credentials required only by the selected default client.

Exercise absent, true, false and malformed input with the real settings registration,
then the custom-client case. Assert bean selection **and** the expected startup result;
"no bean" and "invalid configuration rejected" are different outcomes. The
[Boot 4.1.1 condition contract](https://github.com/spring-projects/spring-boot/blob/v4.1.1/core/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/condition/ConditionalOnProperty.java)
also distinguishes a collection key from an indexed entry: do not use this condition to
infer that a bound collection is nonempty. Use a suitable explicit contract/condition
when collection content determines activation. Keep ordinary application wiring simple;
feature conditions are justified by supported optional behavior, not by every new bean.

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
For example, a polling interval should bind as `Duration` and reject zero or negative
values if they cannot satisfy the job's timing contract; parsing a duration alone does
not establish that constraint. Test an invalid value through binding, not only by
constructing the record directly.

Choose a narrowly used `@Value` only when that simpler contract suffices. Expression
evaluation and typed configuration binding are different features. Avoid scattering a
cohesive configuration contract through unrelated strings. Secret values require an
external source suitable to the deployment; neither typed properties nor profiles are
a secret store. A generated record `toString()` can disclose secrets if logged.

Test with actual config data when profiles, imports or precedence are disputed; a runner's
injected property list only proves binding under that artificial source. Do not invent
runtime refresh semantics: confirm the owning mechanism and whether existing consumers
observe new values before promising a configuration change without restart.

Treat configuration as an API consumed by operators and deployment automation. Before
renaming a key, changing units/defaults or making an optional setting mandatory, inspect
charts/manifests, environment overrides, documented examples and supported consumer
versions. Retain a compatible key when no contract change is needed. If migration is
required, document replacement, precedence when both forms are present, rollout order
and the rollback path; test the supported old/new configurations against the actual binder.
Do not claim an alias exists merely because metadata or documentation names a replacement.
For a reusable starter, include discoverable configuration metadata using the project's
[supported processor](https://github.com/spring-projects/spring-boot/blob/v4.1.1/documentation/spring-boot-docs/src/docs/antora/modules/specification/pages/configuration-metadata/annotation-processor.adoc);
metadata helps consumers author settings but does not validate
deployment values or implement compatibility behavior.

## Compatibility restraint

Java 25 is this skill's baseline. Inspect the actual project compiler release, toolchain
and deployment runtime; when they differ, identify the compatibility gap and the affected
recommendation without silently upgrading the application. Keep examples on stable APIs;
the baseline does not authorize enabling preview features.

Resolve Boot-managed versions before adding overrides to Framework, Jackson, logging,
validation or test libraries. Different majors of related APIs can be present intentionally;
the import and auto-configuration must match the actual module. Consult
[Boot build systems](https://docs.spring.io/spring-boot/reference/using/build-systems.html)
and the chosen BOM. Preserve Maven/Gradle conventions and verify the project's actual
build rather than substituting a sample build with different dependency resolution.

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
