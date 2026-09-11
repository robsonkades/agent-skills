# Removed and degraded APIs, JDK 17 to 25

"Verified" means executed on Temurin 25.0.3 during this corpus's audit; the other rows cite the
JEP or issue that introduced them. **Degraded** is the worst of the three states: the method
still compiles and throws `UnsupportedOperationException` when reached, so the build stays
green; static inspection and representative runtime tests must reach the changed contract.

## By release

| Release          | Change                                                                                                            | What you see                                                                                                           | Verified          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 17               | JEP 403: `--illegal-access` inert; targeted opens/exports replace wholesale relaxation                            | `Ignoring option --illegal-access=permit; support was removed in 17.0`                                                 | yes               |
| 18               | JEP 416: core reflection reimplemented on method handles                                                          | `sun.reflect.inflationThreshold`/`noInflation` ignored; stack traces show `DirectMethodHandleAccessor`                 | yes               |
| 18               | JEP 421: `Object.finalize` deprecated for removal; `--finalization=disabled` added                                | `javac -Xlint:removal` warns on every `finalize()` override; the flag starts the JVM on 25 — run the suite under it    | yes               |
| 18               | `Runtime.exec(String)` deprecated (whitespace tokenization, not shell parsing)                                    | `-Xlint:deprecation` warning                                                                                           | yes               |
| 19               | `Thread.getId()` deprecated in favour of `threadId()`                                                             | warning                                                                                                                | yes               |
| 20               | `Thread.stop()` degraded                                                                                          | `UnsupportedOperationException` at run time; compiles                                                                  | yes               |
| 20               | `java.net.URL(String)` constructors deprecated in favour of `URI.toURL()`                                         | warning                                                                                                                | yes               |
| 20               | CLDR 42: localized short time renders a NARROW NO-BREAK SPACE (U+202F) before `AM`/`PM` in `en_US`                | `DateTimeFormatter.ofLocalizedTime(SHORT)` gives `10:00 AM`; assertions and parsers written for U+0020 break           | yes               |
| 21               | JEP 451: dynamically loaded agents warn                                                                           | `WARNING: A Java agent has been loaded dynamically (...)`; `-XX:+EnableDynamicAgentLoading` acknowledges               | yes               |
| 23               | `javac` no longer implicitly runs processors solely from the classpath                                            | implicit classpath discovery disabled; configure processors explicitly; missing generated symbols can fail compilation | yes               |
| 23               | JEP 471: `sun.misc.Unsafe` memory-access methods deprecated for removal                                           | —                                                                                                                      | JEP               |
| 23               | `Subject.getSubject(AccessControlContext)` throws if Security Manager not allowed; migrate to `Subject.current()` | `UnsupportedOperationException: getSubject is not supported`                                                           | yes               |
| 23 (JDK-8320532) | `Thread.suspend()`/`resume()` and the `ThreadGroup` equivalents removed                                           | `cannot find symbol` when compiling on 25.0.3                                                                          | yes (absence)     |
| 24               | JEP 486: Security Manager permanently disabled                                                                    | `-Djava.security.manager=allow` refuses to start; `System.setSecurityManager` throws `UnsupportedOperationException`   | yes               |
| 24               | JEP 498: Unsafe memory access warns on first use; `--sun-misc-unsafe-memory-access=allow\|warn\|debug\|deny`      | warning naming the caller                                                                                              | yes               |
| 24               | JEP 472: restricted JNI/FFM operations warn without native access; `--illegal-native-access=deny` rejects them    | warning or `IllegalCallerException` at a restricted operation, not ordinary arena/segment use                          | yes               |
| 24               | JEP 490: `-XX:+ZGenerational` obsolete (ZGC is generational)                                                      | `Ignoring option ZGenerational; support was removed in 24.0` — starts, ignored                                         | yes               |
| 15 → expired     | JEP 374: `-XX:+UseBiasedLocking` deprecated, later obsolete, now expired                                          | `Unrecognized VM option 'UseBiasedLocking'` — refuses to start                                                         | yes               |
| by 25            | `TLS_RSA_*` cipher suites listed in `jdk.tls.disabledAlgorithms` of the shipped `conf/security/java.security`     | a peer offering only RSA key exchange fails the TLS handshake                                                          | yes (config file) |

Two rows can have broad impact without a dedicated migration warning: the annotation-processing
default (missing generated code can cause compile errors or a run-time
`NoSuchMethodError`) and the CLDR space (a test that compares formatted time to a literal, or a
downstream parser).

For restricted FFM calls, native-access enablement applies to the caller's module
(`ALL-UNNAMED` for class-path callers).
Ordinary `Arena` allocation and bounded segment access do not require a grant merely because
they use FFM. Restricted operations, such as creating a native downcall handle, do; a denied
probe must reach that operation. Inventory the actual callers before granting native access.

## Class-file versions

Bytecode tools may fail when they encounter a version they do not support, including lazy paths.

| JDK | major | JDK | major                    |
| --- | ----- | --- | ------------------------ |
| 17  | 61    | 22  | 66                       |
| 18  | 62    | 23  | 67                       |
| 19  | 63    | 24  | 68                       |
| 20  | 64    | 25  | 69 (verified `javap -v`) |
| 21  | 65    |     |                          |

`Unsupported class file major version 69` (ASM) or a library's own "Java 25 (69) is not
supported" is class 5 breakage: verify/update the tool's support. Compiling with `--release 21`
keeps those output classes at major 65, but does not rewrite dependencies, runtime classes,
generated bytecode or versioned JAR entries an agent might inspect. This bridge works only
when all inspected inputs and APIs are compatible; the runtime is still 25.

## Where flags hide

The command line you audit is not the whole command line:

| Source                                                                                              | Evidence it applied                                                                                                            |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `JDK_JAVA_OPTIONS` (the `java` launcher only)                                                       | `NOTE: Picked up JDK_JAVA_OPTIONS: ...` on stderr (verified)                                                                   |
| `JAVA_TOOL_OPTIONS` (VM initialization, including many JVM-based tools)                             | `Picked up JAVA_TOOL_OPTIONS: ...`                                                                                             |
| `@argfile` on the command line                                                                      | expand the file                                                                                                                |
| Executable-jar manifest: `Add-Opens`, `Add-Exports`, `Enable-Native-Access`, `Launcher-Agent-Class` | `unzip -p app.jar META-INF/MANIFEST.MF`; honoured only under `java -jar` (verified for `Add-Opens` and `Enable-Native-Access`) |
| `-XX:Flags=<file>`, `-XX:VMOptionsFile=<file>`                                                      | the file                                                                                                                       |

Use target-command help, `VM.flags -all`, `VM.command_line` and `VM.system_properties` for
complementary evidence. They do not reconstruct all wrapper inputs or module access grants;
inspect manifests, environment and argument files too. Redact sensitive values before sharing.

## Multi-release jars

A dependency JAR with `Multi-Release: true` in its manifest can select the highest applicable
versioned entry at or below the runtime version, before falling back to the root entry.
The same dependency version can therefore execute different classes after a runtime upgrade.
Inspect both the manifest and `META-INF/versions/` contents; a directory alone does not enable
multi-release behavior, and custom loaders/tool settings may handle it differently.

## Primary references

- [JDK 25 javac](https://docs.oracle.com/en/java/javase/25/docs/specs/man/javac.html) — release targeting and processor discovery.
- [JDK 20 release notes](https://www.oracle.com/java/technologies/javase/20-relnote-issues.html) and [JDK 23 release notes](https://www.oracle.com/java/technologies/javase/23-relnote-issues.html) — CLDR 42 formatting and explicit annotation-processing configuration.
- [JDK 25 Runtime API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/Runtime.html) — `exec(String)` deprecated since 18; whitespace tokenization is not shell parsing.
- [JDK 23 Subject API](https://docs.oracle.com/en/java/javase/23/docs/api/java.base/javax/security/auth/Subject.html) — conditional `getSubject` failure before permanent Security Manager disablement.
- [JEP 472](https://openjdk.org/jeps/472) and [JDK 25 Linker](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/foreign/Linker.html) — restricted native operations and caller-module access.
- [JAR specification](https://docs.oracle.com/en/java/javase/25/docs/specs/jar/jar.html) — multi-release entry selection and manifest requirements.
