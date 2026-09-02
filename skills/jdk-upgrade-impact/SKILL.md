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
findable in an afternoon by running the existing artefact on the new runtime with warnings made
visible. The second is the upgrade credited with a speedup nobody measured — a JDK move usually
changes several things at once, which is exactly the condition under which coincidence is
mistaken for cause.

## Workflow

1. **State both versions and the reason.** "Security support ends", "we want compact object
   headers", "the vendor image moved" are different reasons with different success criteria. An
   upgrade with no stated reason has no way to be judged finished.
2. **Run the existing artefact on the new JDK before changing a line.** Same jar, same flags, new
   runtime. Most of the breakage surfaces here and nothing else has been perturbed yet.
3. **Make the warnings impossible to miss.** The JVM's compatibility warnings go to stderr at
   startup, once, and are routinely lost in container logs. Capture them deliberately — see
   `references/verification-and-rollout.md`.
4. **Classify each failure into one of five kinds** using
   `references/breakage-classes.md`: a retired flag, strong encapsulation, a removed or changed
   API, a changed default, or a third-party agent or library that reads bytecode. The five have
   different fixes and very different costs.
5. **Fix in reversible order**: flags first (cheap, isolated), then dependency upgrades, then
   your own source. Resist fixing anything that is not broken.
6. **Measure what the upgrade was justified by**, with the method that produced the pre-upgrade
   baseline. Change one variable: do not tune the collector, the heap or the flags in the same
   change.
7. **Stage the rollout** so that "it started" and "it is correct under load" are separate
   gates, and so a rollback is a deploy rather than a project.

## Rules

- **Compiling is not the test.** `--release` targets a bytecode level; it says nothing about what
  the runtime encapsulates, removes or refuses at startup. A green build on the new JDK proves
  very little — and a _degraded_ API proves nothing at all: `Thread.stop()` (JDK 20),
  `Subject.getSubject` (23) and `System.setSecurityManager` (24) still compile and throw
  `UnsupportedOperationException` when reached, so the test suite is the only detector. The
  release-by-release list is in `references/removed-and-degraded-apis.md`.
- **A JVM that refuses to start is the good case.** It is loud, immediate and unambiguous. The
  expensive failures are the ones that start: an ignored flag whose value silently no longer
  applies, and a changed default that only shows under load. Two changed defaults produce no
  message at all: from JDK 23 `javac` runs no annotation processor found only on the classpath
  (exit 0, generated code missing, seen later as unrelated compile errors or a
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
- **Third-party bytecode breaks before your code does.** Instrumentation agents, mocking
  frameworks, bytecode generators and proxy libraries parse class files, so they fail on a class
  file version the day it exists. Upgrade them first, as their own change.
- **Preview APIs are version-locked by design.** Class files compiled with `--enable-preview`
  refuse to run on any other release, which makes them an upgrade obligation rather than an
  upgrade risk.
- **Retired flags are their own subject.** The three states — deprecated, obsolete, expired — and
  which release each flag entered them in belong to `jvm-performance-review`; that skill's
  lifecycle matrix is the reference to run the command line against.
- **The command line you audit is not the whole command line.** `JDK_JAVA_OPTIONS`,
  `JAVA_TOOL_OPTIONS`, `@argfile`s, `-XX:VMOptionsFile` and the executable-jar manifest
  (`Add-Opens`, `Enable-Native-Access`, honoured only under `java -jar`) all contribute.
  `jcmd <pid> VM.flags` and `VM.system_properties` show what took effect, whichever source it
  came from — see `references/removed-and-degraded-apis.md`.
- **Do not carry a performance claim across the boundary.** Any number measured on the old JDK is
  a number about the old JDK, including your own baselines and any threshold in CI.
- **Class-data and AOT archives do not survive the move.** They are tied to the runtime that
  produced them and must be regenerated; a stale one is silently ignored, and the startup win
  disappears without an error.

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
