# Gradle diagnosis

Read for Gradle dependency selection, configuration, platform or lock-state problems.
Sources and recipe syntax below target **Gradle 8.14.3**; preserve and verify the project's
actual wrapper version. Use `gradlew.bat` on Windows. Report tasks configure the build
and can execute build logic or fetch artifacts; the same trust boundary as a normal
build applies. Recipes require a project with the relevant Java plugin/configurations.

## Inspect the configuration that failed

Inspect `settings.gradle[.kts]`, build/convention plugins, version catalogs, included
builds and the failing project's configuration. Declaration buckets such as
`implementation` are not the resolvable classpath. Start with the configuration used
by the failing task; custom source sets and plugins may use other names.

```sh
./gradlew --version
./gradlew :app:dependencies --configuration runtimeClasspath
./gradlew :app:dependencyInsight --dependency org.example:codec --configuration runtimeClasspath
./gradlew :app:dependencies --configuration compileClasspath
```

Replace `:app` and the coordinate with the real project/artifact. `dependencies` shows
one project's requested-to-selected edges; `dependencyInsight` explains one selection
within one configuration. Inspect constraint, conflict, forced, rule and variant
information rather than interpreting an arrow as proof of incompatibility. A root
project report is not a report of every subproject. See [dependency reports](https://docs.gradle.org/8.14.3/userguide/viewing_debugging_dependencies.html).

## Version selection and ownership

For ordinary competing versions of the same module, Gradle selects the highest eligible
version, considering constraints; it does not use Maven's nearest-path rule. Rich strict
constraints, rejection, locking, forces, substitution and selection rules can change
the result or make resolution fail. An ordinary version declaration/constraint is not
necessarily an exact pin. A constraint participates only when the module enters the
graph; it does not add that module. Check the selection explanation before editing.
See [constraints](https://docs.gradle.org/8.14.3/userguide/dependency_constraints.html)
and [rich versions](https://docs.gradle.org/8.14.3/userguide/dependency_versions.html).

Choose a dependency declaration when the module needs a library; choose a constraint
when it needs to express a version requirement for an already included library. Prefer
the existing platform for coordinated version families. Version catalogs provide aliases
and requested versions; an ordinary catalog version is not an exact selection guarantee.
Inspect rich version constraints too when a catalog declares them. See
[version catalog semantics](https://docs.gradle.org/8.14.3/userguide/version_catalogs.html).

A Maven BOM imported with `platform(...)` supplies constraints for its managed modules;
the module dependencies must still be included. `enforcedPlatform(...)` overrides versions
and exports forceful requirements to consumers. Do not introduce it merely to silence a
conflict in a reusable library. First justify the compatible family and inspect the
consumer effect. See [platforms](https://docs.gradle.org/8.14.3/userguide/platforms.html).

If a force or substitution is genuinely required, scope it to the affected resolution
and record why ordinary constraints/platform alignment cannot express the requirement.
Rerun insight and the affected behavior. Excluding an old transitive edge is not proof
that the replacement implements the API its caller uses.

## Classpath roles are not interchangeable

For the Java Library plugin:

- `api` exposes a dependency to consumer compilation; `implementation` keeps it off
  that consumer compile classpath while still participating at runtime.
- `compileOnly` supplies compilation without runtime inclusion. `runtimeOnly` supplies
  runtime without main compilation.
- Test declarations serve the relevant test classpaths, not application deployment.
  Inspect `testRuntimeClasspath` for test-only failures and custom suites separately.
- `annotationProcessor` serves processor execution; its presence is not proof that
  the processor's annotations or runtime support are on the application classpath.

Read the [Java Library configuration contract](https://docs.gradle.org/8.14.3/userguide/java_library_plugin.html)
and [Java plugin configurations](https://docs.gradle.org/8.14.3/userguide/java_plugin.html)
when moving a dependency. Changing `implementation` to `api` can change a published
consumer's contract; it is not a general missing-runtime remedy.

Buildscript/plugin dependencies are separate from project runtime dependencies. Use
`./gradlew :app:buildEnvironment` for the relevant buildscript classpath, then inspect
plugin management and included/convention builds when applicable. An application
`runtimeClasspath` report does not cover all build-logic resolution. See
[the build environment report](https://docs.gradle.org/8.14.3/userguide/viewing_debugging_dependencies.html).

## Lock only the state you actually resolve

Gradle dependency locking must be activated; only resolvable configurations have lock
state. `lockAllConfigurations()` covers project configurations, not buildscript
configurations. Writing locks records the enabled configurations that the invocation
actually resolves, in the projects it reaches. Enumerate the relevant production, test,
custom-source-set and buildscript coverage instead of declaring everything locked after
one root task. Do not resolve incompatible platform-specific configurations blindly.

Treat `--write-locks` as a deliberate update, not a routine repair for a lock mismatch.
For an intended narrow update, use the project's supported `--update-locks` workflow,
inspect the complete diff and verify dependent changes too. Buildscript classpath locking
needs separate activation. SNAPSHOT/changing modules can change content under unchanged
coordinates, so locks cannot freeze their bytes. See [Gradle 8.14.3 locking](https://docs.gradle.org/8.14.3/userguide/dependency_locking.html).

For checksum failures or claims of identical outputs, continue with
[toolchains and reproducibility](toolchains-and-reproducibility.md). Do not regenerate
verification metadata simply to make changed bytes trusted.
