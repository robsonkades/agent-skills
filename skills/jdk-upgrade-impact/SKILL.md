---
name: jdk-upgrade-impact
description: >
  Moving a service between JDKs: what breaks, in what order to find it, and what should get
  faster — running unchanged on the new runtime with warnings visible, classifying each
  failure as a retired flag, strong encapsulation, a removed API, a changed default or a
  third-party agent, and measuring the gain claimed for the upgrade. Use when an LTS-to-LTS
  move is planned, when a build passes and the service will not start on the new JDK, when
  --add-opens is being added to make something work, when -Djava.security.manager=allow is
  on the command line, when sun.misc.Unsafe or an instrumentation agent is in the dependency
  tree, when a mocking or proxy library fails on a new class file version, when generated
  code goes missing after the move to JDK 23 or later, when a formatted time stopped
  matching a literal, or when an upgrade is credited with a speedup nobody measured. Not the
  flag lifecycle in detail (jvm-performance-review), collector changes (jvm-gc-tuning), or
  automating source edits (refactoring-automation).
---

# JDK Upgrade Impact

## Purpose

Turn "we are moving to a newer JDK" into a list of things that will break, found deliberately
rather than in production, and a measured statement of what the move actually bought.

Two failures this prevents. The first is discovering the breakage at deploy: most of it is
findable before deployment by running the existing artefact on the new runtime with warnings made
visible. The second is the upgrade credited with a speedup nobody measured — a JDK move usually
changes several things at once, which is exactly the condition under which coincidence is
mistaken for cause.

## Workflow

Inspect exact source/target vendor builds, compiler `--release`, Maven/Gradle toolchains,
CI/runtime images, dependency/agent support and deployment constraints. The concrete examples
cover JDK 17–25; they do not authorize another upgrade, preview use or unrelated dependency
changes. A JEP's delivery/target release does not establish what is active in the deployed
build. Return observed failures, fixes and checks, unresolved compatibility evidence, and
the measured result or the explicit absence of a performance baseline.

1. **State both versions and the reason.** "Security support ends", "we want compact object
   headers", "the vendor image moved" are different reasons with different success criteria. An
   upgrade with no stated reason has no way to be judged finished.
2. **Run the existing artefact on the new JDK before changing a line.** Same jar, same flags, new
   runtime, in an isolated compatibility environment. Exercise lazy paths and rebuild separately;
   preserve the existing `--release` target for that rebuild unless changing it is authorized.
   Successful startup does not cover runtime-only or compiler/toolchain changes.
3. **Make the warnings impossible to miss.** Compatibility warnings can occur at startup or
   when the affected operation first runs, and are routinely lost in container logs. Capture them — see
   `references/verification-and-rollout.md`.
4. **Classify failures using five common kinds** in
   `references/breakage-classes.md`: a retired flag, strong encapsulation, a removed or changed
   API, a changed default, or a third-party agent or library that reads bytecode. The five have
   different fixes; record interacting causes or an unmatched failure instead of forcing one label.
5. **Fix in the smallest reversible increments supported by the cause.** A flag change is not
   automatically cheaper or safer than a supported library/source correction. Stage changes on
   the old JDK where compatible; record unavoidable combined changes and their attribution limits.
   Preserve unrelated working behavior.
6. **Measure what the upgrade was justified by**, with the method that produced the pre-upgrade
   baseline. Separate optional collector, heap or flag tuning from required compatibility and
   security changes; do not claim a runtime-only effect when those changes cannot be isolated.
7. **Stage the rollout** so that "it started" and "it is correct under load" are separate
   gates, and so a rollback is a deploy rather than a project.

## Rules

- **Compiling is not the test.** `--release` constrains language, class-file version and the
  documented platform API for that release; it does not validate third-party binaries or what
  the runtime encapsulates, removes or refuses at startup. A green build on the new JDK proves
  very little — and a _degraded_ API proves nothing at all: `Thread.stop()` (JDK 20),
  `Subject.getSubject` (23) and `System.setSecurityManager` (24) still compile and throw
  `UnsupportedOperationException` when reached (for `Subject.getSubject`, JDK 23's default
  disallows the Security Manager; JDK 24 disables it permanently). Exercise those paths. The
  release-by-release list is in `references/removed-and-degraded-apis.md`.
- **An old `--release` also limits deprecation lint to that older API.** Keep the published
  compatibility target; audit compiled code separately against the destination release with
  `jdeprscan`, with its coverage limits in `references/verification-and-rollout.md`.
- **A JVM that refuses to start is the good case.** It is loud, immediate and unambiguous. The
  expensive failures are the ones that start: an ignored flag whose value silently no longer
  applies, and a changed default that only shows under load. Two changed defaults produce no
  dedicated migration warning: from JDK 23 `javac` no longer implicitly discovers annotation
  processors solely from the classpath without explicit processing configuration
  (generated code can be missing, seen as compile errors or a
  `NoSuchMethodError`), and from JDK 20 CLDR 42 puts a NARROW NO-BREAK SPACE before `AM`/`PM`
  in `en_US`, breaking any assertion or parser written for a plain space.
- **`-Djava.security.manager=allow` stops the JVM from starting on JDK 24 and later.** Executed on
  Temurin 25.0.3: `java.lang.Error: A command line option has attempted to allow or enable the
Security Manager` during VM initialisation. It became permanently disabled in JEP 486 (JDK 24).
  This is a system property, so it hides in start scripts and Dockerfiles rather than in code.
- **`--illegal-access` has done nothing since JDK 17** (JEP 403). Measured on 25.0.3, it starts
  and prints `Ignoring option --illegal-access=permit; support was removed in 17.0`. A team that
  believes it is holding the door open is not — whatever still works, works for another reason.
- **`--add-opens` is a migration lever, not a fix.** It buys time for a dependency that has not
  caught up. Each one should have an owner and a reason recorded, because the set only ever grows
  otherwise, and a build that needs a dozen of them has an upgrade problem it has not addressed.
- **Find `sun.misc.Unsafe` before it finds you.** The memory-access methods were deprecated for
  removal in JEP 471 (JDK 23) and warn on first use from JEP 498 (JDK 24). Run with
  `--sun-misc-unsafe-memory-access=deny` in a test environment: it turns a warning you will
  ignore into a failure you cannot.
- **Check third-party bytecode support early.** Instrumentation agents, mocking frameworks,
  generators and proxy libraries may reject unsupported class-file versions when loaded or
  exercised. Use documented compatible versions; separate upgrades when they also support the
  old JDK, otherwise record the unavoidable combined change.
- **Preview-dependent class files are version-locked.** A class marked with minor version
  65535 requires the matching Java release and runtime `--enable-preview`. Merely supplying
  the compiler flag does not mark every class as preview-dependent. Recompile and review
  actual preview usage on the target; do not assume source compatibility.
- **Retired flags are their own subject.** The three states — deprecated, obsolete, expired — and
  which release each flag entered them in belong to `jvm-performance-review`; that skill's
  lifecycle matrix is the reference to run the command line against.
- **The command line you audit is not the whole command line.** `JDK_JAVA_OPTIONS`,
  `JAVA_TOOL_OPTIONS`, `@argfile`s, `-XX:VMOptionsFile` and the executable-jar manifest
  (`Add-Opens`, `Enable-Native-Access`, honoured only under `java -jar`) all contribute.
  `jcmd <pid> VM.flags -all`, `VM.command_line` and `VM.system_properties` supply different
  evidence, not a complete launch/module-access inventory; inspect the contributing files
  and wrapper configuration too. Protect secrets in this output.
- **Revalidate performance estimates, preserve acceptance requirements.** A measurement on the old
  JDK does not predict the new runtime. Keep agreed SLOs and regression gates unless their contract
  changes; do not reset a CI threshold merely to make an upgrade pass. Version-specific measured
  baselines remain comparison evidence, with workload/environment differences recorded.
- **Regenerate class-data/AOT artifacts for the target build.** Compatibility checks and launch
  mode can reject an archive, fall back or fail startup. Verify actual use and diagnostics;
  silent fallback is not guaranteed. Preserve the old image and matching artifacts for rollback.

## References

- [Breakage classes](references/breakage-classes.md) — the five kinds of failure, the diagnostic
  that identifies each, and the fix with its reversibility. Read once something fails on the new
  runtime.
- [Removed and degraded APIs](references/removed-and-degraded-apis.md) — the release-by-release
  table from JDK 17 to 25 of what was removed, degraded to `UnsupportedOperationException`,
  deprecated or changed by default, with the message each produces; the class-file major
  version per JDK; where flags hide outside the visible command line; and multi-release jars.
  Read when placing a failure in a release, when a tool reports an unsupported class file
  version, or when behaviour changed with "no dependency changed".
- [Verification and rollout](references/verification-and-rollout.md) — the compatibility pass,
  making warnings visible, what to measure and against what baseline, and staging the rollout.
  Read before the first run on the new JDK.
