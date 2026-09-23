---
name: java-build-and-dependencies
description: >-
  Diagnose and repair Maven or Gradle builds when a managed dependency is missing,
  a transitive version wins unexpectedly, compilation and runtime classpaths differ,
  or the launcher JDK, toolchain and release target disagree. Use for dependency
  conflicts, missing runtime artifacts, plugin classpath failures and unreliable
  dependency resolution. Covers focused build repairs and reproducibility checks;
  intentional JDK upgrades, classloader internals and published-library governance
  belong to neighboring skills.
---

# Java Build and Dependencies

## Purpose and boundary

Find the build input that explains the failure, then make the smallest compatible
change and verify the affected path. A declaration, an effective model, a resolved
configuration, a packaged artifact and a running process are different evidence.

Basic repository discovery is covered by `feature-context-analysis`. This skill
continues from that evidence into build diagnosis and repair. For intentional JDK
migration consider `jdk-upgrade-impact`; for loader identity, initialization and JPMS
access consider `jvm-class-loading`. Publication and consumer compatibility decisions
belong to `component-and-release-boundaries`; comprehensive supply chain and CI gate
design belongs to `quality-gates`. These are optional neighbors, not prerequisites
for a scoped build fix.

## Establish the execution context

Inspect the wrapper/version, target module, active Maven profiles or Gradle
configuration, CI invocation, build plugins, repositories and relevant existing
reports. Preserve the project's Java, framework and build-tool baselines. This
skill does not prescribe a Java release or authorize upgrades to fit an example.
Reference recipes use Maven 3 and Gradle 8.14.3 documentation; match syntax and
behavior to the target wrapper and plugin versions before applying them.

Before invoking an unfamiliar wrapper or build, inspect its provenance, scripts,
distribution URL and applicable checksum verification. Build configuration and
plugins can execute code even for report tasks. Use the authorized environment;
keep synthetic reproductions and their repositories/caches isolated. Do not run
publication, deployment or global installation as a diagnostic step.

Record separately the JVM launching Maven/Gradle, any Gradle daemon JVM, compiler
toolchain, compiler release, test JVM and deployment JVM. `java -version` in one
shell establishes only that executable. A compiler release limits language/JDK API
usage and class-file target; it neither chooses the production JVM nor retargets
third-party JARs. Read [toolchains and reproducibility](references/toolchains-and-reproducibility.md)
when these identities differ, a wrapper changes, or the task makes a repeatability claim.

## Workflow

1. **Locate the failing phase and owner.** Capture the exact invocation and first
   relevant failure: model/configuration, artifact resolution, plugin execution,
   compile, test, packaging or application startup. Identify the module and
   configuration that needs the missing class or version. A plugin failure is not
   automatically an application dependency failure.
2. **Inspect the selected graph.** For Maven read
   [Maven diagnosis](references/maven.md); for Gradle read
   [Gradle diagnosis](references/gradle.md). Record the coordinate, requested and
   selected versions, introducing path, scope/configuration and selection rule.
   A BOM, dependency-management entry, version catalog or constraint alone does
   not establish that an artifact is present.
3. **Form a discriminating explanation.** Connect the observed graph or toolchain
   to the error. Compare compile, test and runtime evidence only where the failure
   requires it. For packaged applications inspect the produced distribution/image
   and launch classpath as well; the build graph does not prove deployment contents.
   If reports cannot run, state the declared information, unresolved selection and
   smallest missing check. Do not invent a resolved version.
4. **Repair at the narrowest correct owner.** Correct an absent direct dependency,
   wrong scope/configuration, mistaken management entry, plugin dependency or
   toolchain selection according to the evidence. Respect an intentional platform
   version family. A targeted management override or constraint needs a compatibility
   reason and a check; a global force, transitivity disable or broad exclusion is
   not a default conflict fix. Do not upgrade unrelated dependencies.
5. **Verify the causal path.** Compare the relevant graph before/after, rerun the
   failing task and an affected test or launch check. Check that requested tests
   actually ran; success with zero tests or an up-to-date task is not fresh execution.
   If a changed library is published, inspect generated consumer metadata and use
   a separate consumer when that contract is in scope. Do not claim a runtime fix
   from compilation alone.

## Decision rules

- **Managed but absent:** first establish an actual dependency path. Add a dependency
  only to the module/configuration that needs it; changing the BOM version cannot
  supply an artifact that is never included.
- **Conflicting versions:** use the build tool's selection evidence. Maven's nearest
  definition and Gradle's ordinary highest eligible version selection are different
  rules, both affected by explicit management/constraints. Neither proves binary or
  behavioral compatibility.
- **Exclusion proposed:** identify the introducing edge, the feature losing that
  artifact and any alternate path that still includes it. Exercise that feature or
  replacement. An exclusion removes an edge; it does not repair incompatible APIs.
- **Compile succeeds, runtime fails:** examine runtime inclusion, packaging and the
  deployed JVM. Test dependencies, provided/compile-only APIs and a newer dependency's
  bytecode are concrete hypotheses. If artifacts and versions are correct but loader
  behavior remains in question, retain the evidence for the class-loading handoff.
- **Local succeeds, CI fails:** compare wrapper, profiles/properties, toolchains,
  repository/mirror access, selected versions and bytes before clearing anything.
  Avoid deleting shared caches or using refresh/update flags until there is a cache
  hypothesis; preserve the failing evidence and refresh narrowly when justified.
- **Locked therefore reproducible:** identify configurations covered by lock state,
  mutable artifacts, verification policy and actual outputs compared. A same-version
  SNAPSHOT can have different bytes. Keep version repeatability, artifact integrity
  and byte-for-byte build reproducibility as separate claims.

## Minimum result

For a small fix, a short explanation and diff are enough. Include the failing target,
evidence for the selected dependency/toolchain, causal explanation or remaining
hypothesis, scoped change, and checks actually executed. Name unavailable evidence
and the next check explicitly. Stop when the original failure is addressed and the
affected behavior is verified, or when a material external gap has a concrete
resolving action. Do not turn the repair into a build-system migration.
