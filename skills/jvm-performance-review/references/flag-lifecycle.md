# Flag lifecycle and effective-state protocol

Do not maintain a timeless table of flag states. Lifecycle data changes by release train, update
build, vendor backport, platform, and product/debug build. Establish state from the exact artifacts
that will deploy.

## Classification

| State                    | What to establish                       | Review consequence                     |
| ------------------------ | --------------------------------------- | -------------------------------------- |
| recognized and effective | effective value, origin, interaction    | price against objective/default        |
| diagnostic/experimental  | unlock requirement and support contract | upgrade/operational risk               |
| deprecated               | accepted/effective behavior and warning | migration date and replacement         |
| obsolete/ignored         | accepted but no intended effect         | written config differs from runtime    |
| expired/unrecognized     | startup behavior                        | deployment failure unless masked       |
| vendor/platform-specific | supported builds only                   | fleet divergence and portability risk  |
| unknown                  | cannot establish from current evidence  | block claim; run exact-build preflight |

Warnings and state terminology are HotSpot implementation details, not a JVM-spec promise.

## Exact-build preflight

In a disposable environment using the production image/JDK and architecture:

1. Capture `java -version` and artifact/image digest.
2. Reproduce option composition and shell/entrypoint quoting.
3. Remove `-XX:+IgnoreUnrecognizedVMOptions` for the compatibility test.
4. Start a minimal representative command with one questionable flag or the complete line.
5. Capture exit status and complete stdout/stderr.
6. On success, capture effective flags/origins and selected runtime configuration.
7. Repeat for every supported fleet build, including the upgrade target.

Typical discovery tools:

```bash
java -XX:+PrintFlagsFinal -version
java -XX:+PrintCommandLineFlags -version
jcmd <pid> VM.command_line
jcmd <pid> VM.flags -all
jcmd <pid> VM.info
```

Options and diagnostic commands vary; use `java --help-extra` and `jcmd <pid> help` on the target.
`PrintFlagsFinal` output is implementation-specific and large; retain it as a machine-diffable
artifact, not as a hand-curated source of eternal defaults.

## Masking and duplicates

`IgnoreUnrecognizedVMOptions` suppresses failures for options the JVM does not recognize. It does
not prove that recognized flags were ignored, and it does not resolve semantic changes in a flag
that still exists. Findings should say which token was tested without masking.

Duplicate options often result from image defaults, `JAVA_TOOL_OPTIONS`, `JDK_JAVA_OPTIONS`,
launcher variables, and application arguments. “Last value wins” is not a safe universal review
rule: parsing order, aliases, unlock options, additive logging/agent options, constraints, and
ergonomics can interact. Capture the received command and effective flag origin.

## Upgrade matrix

Build evidence rather than copying a lifecycle table:

| Option | Current build startup/effective | Target build startup/effective | Replacement/action | Test owner |
| ------ | ------------------------------- | ------------------------------ | ------------------ | ---------- |
|        |                                 |                                |                    |            |

Test startup, readiness, workload, shutdown, OOM/recovery, and observability. A flag being accepted
on both builds does not mean its default, mechanism, or effect is identical.

## Source verification

When documentation is incomplete, use the exact OpenJDK/vendor tag, not the moving main branch.
Look at flag declarations, constraints/ergonomics, special/deprecated-option processing, and the
subsystem that consumes the value. Then confirm by executing the shipped binary; vendors can
backport or patch.

Record:

```text
repository/tag/commit and file/line
shipped vendor build and architecture
startup test command and result
effective value/origin
runtime behavior test
```

## High-risk families to test explicitly

- removed collectors and pre-unified-GC logging options;
- biased-locking/monitor implementation controls;
- PermGen/metaspace-era sizing;
- container-awareness and server-class-machine controls;
- generational/non-generational collector transition flags;
- compact-object-header/compressed-pointer controls;
- diagnostic/experimental compiler, allocation, NUMA, page, and GC-thread options;
- vendor agents and `-javaagent`/native-agent options.

The list is a routing hint, not a statement that any named family has the same status on all JDKs.

## Anti-patterns

| Anti-pattern                               | Failure                             | Better approach                                           |
| ------------------------------------------ | ----------------------------------- | --------------------------------------------------------- |
| “Removed in Java N” without build evidence | vendor/update differs               | exact-build preflight plus official/JEP/source provenance |
| Search source main branch only             | future state mislabeled current     | shipped release tag and binary                            |
| Keep masking through upgrade tests         | dead options survive silently       | remove masking in disposable compatibility gate           |
| Delete deprecated flag immediately         | replacement semantics untested      | migration experiment and rollback                         |
| Treat accepted as effective                | obsolete/constraint/ergonomic no-op | effective origin and runtime observation                  |

## Authoritative references

- [JDK 25 `java` command](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html)
- [JDK 25 `jcmd` command](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
- [OpenJDK HotSpot arguments source](https://github.com/openjdk/jdk/tree/master/src/hotspot/share/runtime)
- [OpenJDK JEP index](https://openjdk.org/jeps/0)
- [Java SE support roadmap](https://www.oracle.com/java/technologies/java-se-support-roadmap.html)
