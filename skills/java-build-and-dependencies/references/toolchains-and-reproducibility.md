# Toolchains, wrapper trust and reproducibility

Read when build/test/deployment JVMs differ, the wrapper changes, or a lock/checksum is
being used to claim repeatable output. These checks diagnose the scoped build problem;
they are not a comprehensive supply chain program.

## Identify each Java boundary

Record evidence for the launcher and daemon JVM, compiler/toolchain executable,
compiler release, test executable and deployed runtime. Maven toolchains configure
toolchain-aware plugins; they do not replace the JVM running Maven. Gradle project
toolchains and task-specific overrides likewise differ from its daemon JVM. Inspect
CI/IDE configuration and actual task output when declarations disagree. Sources:
[Maven toolchains](https://maven.apache.org/guides/mini/guide-using-toolchains.html),
[Gradle 8.14.3 toolchains](https://docs.gradle.org/8.14.3/userguide/toolchains.html),
[Gradle daemon selection](https://docs.gradle.org/8.14.3/userguide/gradle_daemon.html).

Choose the remedy by where the incompatibility occurs:

| Evidence                                                     | Targeted interpretation and check                                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Build tool cannot start on the selected JVM                  | Check that wrapper version's supported launcher JVMs; restoring the intended launcher may be enough.                                       |
| `invalid target release` or release not supported            | Inspect the compiler actually selected and its supported releases, not only `JAVA_HOME`.                                                   |
| Compilation accepts a JDK API absent from the target runtime | Inspect the effective release setting; source/target alone does not fence newer JDK APIs.                                                  |
| Tests pass but deployed startup rejects a class-file version | Inspect which JAR/class is too new and the deployed JVM; the test JVM may be newer.                                                        |
| `NoSuchMethodError` despite compatible class-file versions   | Compare the caller's expected dependency API with the deployed dependency bytes/version; a lower bytecode target does not create that API. |

On a supporting compiler, `--release` sets language, class-file and Java SE API targets.
It does not rewrite dependencies or guarantee behavioral compatibility. Maven Compiler
Plugin 3.6+ exposes `maven.compiler.release`; on JDK 8 the 3.13+ `javac` path maps that
property to source/target rather than invoking a nonexistent `--release` flag. See
[Maven compiler release behavior](https://maven.apache.org/plugins/maven-compiler-plugin/examples/set-compiler-release.html).

These are **partial configuration snippets**, for a project whose agreed release is
Java 17. Preserve that agreement; `17` is an example, not this skill's default.

```xml
<!-- Inside Maven project/properties, with a compatible Compiler Plugin. -->
<maven.compiler.release>17</maven.compiler.release>
```

```kotlin
// Gradle 8.14.3 Kotlin DSL, Java plugin applied; a separate toolchain selects the JDK.
tasks.withType<JavaCompile>().configureEach {
    options.release.set(17)
}
```

Validate on a compiler supporting the target release and exercise the relevant tests
on the supported runtime. Do not upgrade the production runtime to hide an accidentally
new API or dependency. An intended baseline migration has wider checks owned by
`jdk-upgrade-impact`.

## Missing generated code: identify the producer before changing dependencies

First distinguish a type expected from a dependency JAR from one produced during this
build. Inspect the annotation/generator contract, compiler diagnostics, expected generated
sources/classes or other documented processor effect, and the failing main/test/custom
source set. Separate the annotation API used by source code, the processor executed by
the compiler and any runtime library required by the generated code. A processor path
is not the source compilation classpath or the application runtime classpath.

Starting with JDK 23, `javac` does not automatically run processors discovered only on
the ordinary classpath without explicit processing configuration. The executing compiler
determines this policy; `--release 17` does not restore JDK 17 processor discovery.
Inspect the effective processor path/module path, named processors and `-proc` options,
including intentional `-proc:none`. Configure the intended trusted processors rather
than blindly enabling classpath-wide discovery with `-proc:full`. These processors
execute build-time code. Sources: [JDK 23 release notes](https://www.oracle.com/java/technologies/javase/23-relnote-issues.html)
and the [OpenJDK engineering explanation](https://inside.java/2024/06/18/quality-heads-up/).

Use the target build's supported configuration:

- **Maven 3:** inspect the effective Compiler Plugin configuration, such as
  `annotationProcessorPaths` and `annotationProcessors`, for the failing execution.
  Those processor artifacts need not appear in an ordinary application dependency tree.
  Keep annotations/runtime support in their separately justified dependency scopes.
  The [Compiler Plugin 3.13.0 parameter reference](https://maven.apache.org/plugins-archives/maven-compiler-plugin-3.13.0/compile-mojo.html#annotationProcessorPaths)
  documents these options; match the installed plugin instead of copying
  [Maven 4 processor dependency syntax](https://maven.apache.org/plugins/maven-compiler-plugin-4.x/examples/annotation-processor.html)
  into a Maven 3 project.
- **Gradle 8.14.3 Java plugin:** inspect `annotationProcessor` or the relevant source
  set's processor configuration, for example `testAnnotationProcessor`, and the compile
  task's actual `annotationProcessorPath`. An `implementation` declaration alone is not
  that processor configuration. See the [versioned Java plugin documentation source](https://github.com/gradle/gradle/blob/v8.14.3/platforms/documentation/docs/src/docs/userguide/platforms/jvm/java_plugin.adoc).

If generation ran but compilation still cannot see its outputs, check generated-source
registration and task/phase ordering. A separate generator task/plugin must run before
its consumer and declare/register the outputs that consumer needs; fixing processor
discovery cannot repair an unrelated generator that was never scheduled. Compare IDE
and CI behavior without treating stale generated files as proof of a working build.

Verify from an isolated fresh output directory or a justified scoped clean: the intended
producer ran, expected output/effect exists and the consuming compilation/test succeeds.
If generation is intentionally disabled and nothing requires its outputs, preserve that
choice. If the processor fails while executing, inspect compatibility with the actual
compiler separately from the application's bytecode target; do not upgrade the entire
dependency family or production runtime to conceal that failure.

## Wrapper checks before execution

Read wrapper scripts and properties, inspect changes/provenance and confirm distribution
host and version. A wrapper pins the build distribution, not every plugin, JDK or artifact.
A trusted distribution checksum does not authenticate a modified script that runs first.

Gradle supports `distributionSha256Sum`; independently verify the wrapper JAR too.
Its distribution checksum is checked on download, so an existing cached distribution
does not demonstrate a fresh checksum check. Maven Wrapper supports distribution and,
where applicable, wrapper-JAR checksums (`distributionSha256Sum`, `wrapperSha256Sum`);
the chosen wrapper type determines whether a JAR is involved. Obtain expected checksums
from a trusted source, not merely by hashing the suspicious download. Sources:
[Gradle Wrapper 8.14.3](https://docs.gradle.org/8.14.3/userguide/gradle_wrapper.html),
[Maven Wrapper](https://maven.apache.org/tools/wrapper/).

## State exactly what is repeatable

**Version resolution:** a relevant lock/model constrains selected versions. Identify
the modules, configurations, profiles and build-logic coverage. A fixed SNAPSHOT name
or changing artifact can still fetch different bytes; offline success only covers what
the existing cache supplied. See [Gradle dependency caching](https://docs.gradle.org/8.14.3/userguide/dependency_caching.html).

**Accepted artifact bytes:** checksums/signatures verify against an accepted trust
policy. Gradle verification metadata generated from current downloads is a candidate
baseline to review; generation alone does not establish that those downloads are
trustworthy. On mismatch, preserve the expected/actual hashes and source repository,
then establish whether the bytes changed legitimately or unexpectedly. Do not disable
verification or automatically trust a new hash. See [Gradle verification](https://docs.gradle.org/8.14.3/userguide/dependency_verification.html).

**Build output bytes:** hold inputs/tool versions constant, rebuild in separate clean
directories and compare the outputs actually claimed reproducible. Account for compiler
and plugin versions, generated timestamps, archive ordering, encoding, locale and
environment-dependent generated content. Maven's `project.build.outputTimestamp` works
with supporting plugins; it is not a universal reproducibility switch. A same-machine
comparison covers fewer environmental differences than an independent rebuild. See
[Maven reproducible builds](https://maven.apache.org/guides/mini/guide-reproducible-builds.html).

For a fixture, redirect Maven local repository/settings or Gradle user home into its
temporary workspace. Keep wrapper distribution downloads/toolchain provisioning within
the allowed environment. Do not clear real user caches to manufacture a clean build.
Report the exact comparisons run and any network, toolchain or environment limitation;
written commands are recipes until executed.
