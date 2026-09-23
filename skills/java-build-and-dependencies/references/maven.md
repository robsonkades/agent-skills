# Maven diagnosis

Read for Maven model, dependency, plugin or reactor failures. Recipes assume Maven 3,
a trusted existing wrapper and project-supported plugin versions. They are commands
to adapt to a target project, not a fixture that has been executed for that project.
Use `mvnw.cmd` on Windows. Report goals may download plugins and dependencies; an
offline failure with an empty repository is not evidence that a coordinate is invalid.

## Model first, graph second

Reuse CI arguments, settings and active profiles that affect the failure. Inspect
parents, imported BOMs, properties, `.mvn/maven.config`, settings mirrors and plugin
configuration. Do not print credentials from settings or diagnostic logs.

These example commands target a module named `app`; replace it with the real reactor
selector. Prefer the repository's pinned diagnostic plugin versions. If prefix
resolution is ambiguous, use the verified fully qualified plugin coordinate, without
changing the build's plugin baseline just to run a report.

```sh
./mvnw -version
./mvnw -pl app help:active-profiles
./mvnw -pl app help:effective-pom -Dverbose
./mvnw -pl app dependency:tree -Dverbose -Dincludes=org.example:codec
```

The effective POM incorporates active profiles; Help Plugin 3.2.0+ supports origin
comments with `verbose`. It explains where management/configuration came from, not
which transitive version ultimately resolves. The dependency tree supplies paths and
selected scopes. Check the actual Dependency Plugin version's support for omitted
nodes; older releases differ. First inspect an unfiltered tree if a filter hides the
relevant path. Sources: [effective POM](https://maven.apache.org/plugins/maven-help-plugin/effective-pom-mojo.html)
and [dependency tree parameters](https://maven.apache.org/plugins/maven-dependency-plugin/tree-mojo.html).

## Choose the correct repair

For ordinary mediation, Maven favors the version on the shorter path; equal-depth
conflicts follow declaration order. Applicable dependency management controls transitive
versions and can override that result. A managed entry or BOM import does not itself
add its listed artifacts. A direct dependency still needs an inclusion declaration.
Match management by group, artifact, type and classifier when non-default artifacts
are involved. Do not reorder dependencies to conceal a compatibility choice.

Scopes explain many apparent resolution defects: `provided` participates in compilation
and tests but expects an external runtime provider; `runtime` omits main compilation;
`test` serves tests. Optional dependencies are not automatically propagated to consumers.
Exclusions act on a dependency path, so inspect other paths. Project dependency management
does not manage a plugin's transitive dependencies. These are Maven-specific semantics,
not interchangeable with Gradle configurations. See the [dependency mechanism](https://maven.apache.org/guides/introduction/introduction-to-dependency-mechanism.html).

Apply those rules to the failure:

- If source directly uses a library that happens to arrive transitively, declare that
  direct requirement in the using module, using existing management when appropriate.
  This makes the requirement survive a future change to the intermediate library.
- If framework modules resolve to an unintended mixture, inspect the intended BOM
  family and overriding declaration before pinning one arbitrary transitive version.
  Test compatibility at the caller that exposed the mismatch.
- If a standalone executable relies on an API marked `provided`, establish who supplies
  it at runtime. Correct the runtime dependency or packaging only if that deployment
  owns it; a container-provided contract may already be correct.
- If the stack trace names a build plugin, inspect that plugin's version, configuration
  and dependency realm. Adding its missing class to application dependencies may change
  the application without repairing the plugin. Use the plugin's supported dependency
  customization or compatible version only when the evidence calls for it.

A parent/BOM policy shared by many modules is a larger change than a local declaration.
Inspect affected modules before changing it. Conversely, scattered child overrides can
hide one mistaken central value; choose the owner that actually expresses the requirement.

## Reactor versus published artifacts

Only inspect multi-module behavior when module selection, stale local artifacts or
publication is implicated. Aggregation and inheritance are separate: an aggregator does
not automatically manage every child, and a parent need not aggregate its children.

From the reactor root, `./mvnw -pl app -am verify` includes required reactor projects
for the selected application. It is a verification recipe, so inspect configured
lifecycle bindings and expect writes to build outputs. Running a child alone can use
a previously installed sibling instead of current source. The reactor sorts instantiated
dependency/plugin/extension references; management entries alone do not create those
edges. Do not add `install` merely to hide incorrect module selection. See [Maven 3
multi-module behavior](https://maven.apache.org/guides/mini/guide-multiple-modules.html).

When the actual bug is in a published library's consumer graph, a reactor success is
insufficient. Inspect the artifact's generated POM, classifier and scopes, then resolve
it from an isolated repository in a separate consumer. Keep publication/release policy
with `component-and-release-boundaries`; do not deploy an artifact as a diagnostic step.
