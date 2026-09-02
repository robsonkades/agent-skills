# Removed and degraded APIs, JDK 17 to 25

"Verified" means executed on Temurin 25.0.3 during this corpus's audit; the other rows cite the
JEP or issue that introduced them. **Degraded** is the worst of the three states: the method
still compiles and throws `UnsupportedOperationException` when reached, so the build stays
green and the test suite is the only detector.

## By release

| Release          | Change                                                                                                        | What you see                                                                                                         | Verified          |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------- |
| 17               | JEP 403: `--illegal-access` inert; per-package `--add-opens` is the only lever                                | `Ignoring option --illegal-access=permit; support was removed in 17.0`                                               | yes               |
| 18               | JEP 416: core reflection reimplemented on method handles                                                      | `sun.reflect.inflationThreshold`/`noInflation` ignored; stack traces show `DirectMethodHandleAccessor`               | yes               |
| 18               | JEP 421: `Object.finalize` deprecated for removal; `--finalization=disabled` added                            | `javac -Xlint:removal` warns on every `finalize()` override; the flag starts the JVM on 25 — run the suite under it  | yes               |
| 18               | `Runtime.exec(String)` deprecated (shell-style splitting)                                                     | `-Xlint:deprecation` warning                                                                                         | yes               |
| 19               | `Thread.getId()` deprecated in favour of `threadId()`                                                         | warning                                                                                                              | yes               |
| 20               | `Thread.stop()` degraded                                                                                      | `UnsupportedOperationException` at run time; compiles                                                                | yes               |
| 20               | `java.net.URL(String)` constructors deprecated in favour of `URI.toURL()`                                     | warning                                                                                                              | yes               |
| 20               | CLDR 42: `h:mm a` renders a NARROW NO-BREAK SPACE (U+202F) before `AM`/`PM` in `en_US`                        | `DateTimeFormatter.ofLocalizedTime(SHORT)` gives `10:00 AM`; assertions and parsers written for U+0020 break         | yes               |
| 21               | JEP 451: dynamically loaded agents warn                                                                       | `WARNING: A Java agent has been loaded dynamically (...)`; `-XX:+EnableDynamicAgentLoading` acknowledges             | yes               |
| 23               | `javac` runs no annotation processor found only on the classpath                                              | nothing — no warning, exit 0, generated code missing                                                                 | yes               |
| 23               | JEP 471: `sun.misc.Unsafe` memory-access methods deprecated for removal                                       | —                                                                                                                    | JEP               |
| 23               | `Subject.getSubject(AccessControlContext)` degraded; `Subject.current()` replaces it                          | `UnsupportedOperationException: getSubject is not supported`                                                         | yes               |
| 23 (JDK-8320532) | `Thread.suspend()`/`resume()` and the `ThreadGroup` equivalents removed                                       | `cannot find symbol` when compiling on 25.0.3                                                                        | yes (absence)     |
| 24               | JEP 486: Security Manager permanently disabled                                                                | `-Djava.security.manager=allow` refuses to start; `System.setSecurityManager` throws `UnsupportedOperationException` | yes               |
| 24               | JEP 498: Unsafe memory access warns on first use; `--sun-misc-unsafe-memory-access=allow\|warn\|debug\|deny`  | warning naming the caller                                                                                            | yes               |
| 24               | JEP 472: JNI and FFM warn without `--enable-native-access`; `--illegal-native-access=deny` fails them         | `WARNING: A restricted method in java.lang.foreign.Linker has been called`                                           | yes               |
| 24               | JEP 490: `-XX:+ZGenerational` obsolete (ZGC is generational)                                                  | `Ignoring option ZGenerational; support was removed in 24.0` — starts, ignored                                       | yes               |
| 15 → expired     | JEP 374: `-XX:+UseBiasedLocking` deprecated, later obsolete, now expired                                      | `Unrecognized VM option 'UseBiasedLocking'` — refuses to start                                                       | yes               |
| by 25            | `TLS_RSA_*` cipher suites listed in `jdk.tls.disabledAlgorithms` of the shipped `conf/security/java.security` | a peer offering only RSA key exchange fails the TLS handshake                                                        | yes (config file) |

Two rows carry the largest blast radius and neither produces an error: the annotation-processing
default (missing generated code shows as unrelated compile errors or a run-time
`NoSuchMethodError`) and the CLDR space (a test that compares formatted time to a literal, or a
downstream parser).

## Class-file versions

Bytecode tools fail on a version they have not seen, before any application code runs.

| JDK | major | JDK | major                    |
| --- | ----- | --- | ------------------------ |
| 17  | 61    | 22  | 66                       |
| 18  | 62    | 23  | 67                       |
| 19  | 63    | 24  | 68                       |
| 20  | 64    | 25  | 69 (verified `javap -v`) |
| 21  | 65    |     |                          |

`Unsupported class file major version 69` (ASM) or a library's own "Java 25 (69) is not
supported" is class 5 breakage: upgrade the tool, not the JDK. Compiling with `--release 21`
on the new JDK keeps the artefact at major 65 and is the bridge while a tool lags — the
runtime is still 25, with everything above still applying.

## Where flags hide

The command line you audit is not the whole command line:

| Source                                                                                              | Evidence it applied                                                                                                            |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `JDK_JAVA_OPTIONS` (the `java` launcher only)                                                       | `NOTE: Picked up JDK_JAVA_OPTIONS: ...` on stderr (verified)                                                                   |
| `JAVA_TOOL_OPTIONS` (every JDK tool)                                                                | `Picked up JAVA_TOOL_OPTIONS: ...`                                                                                             |
| `@argfile` on the command line                                                                      | expand the file                                                                                                                |
| Executable-jar manifest: `Add-Opens`, `Add-Exports`, `Enable-Native-Access`, `Launcher-Agent-Class` | `unzip -p app.jar META-INF/MANIFEST.MF`; honoured only under `java -jar` (verified for `Add-Opens` and `Enable-Native-Access`) |
| `-XX:Flags=<file>`, `-XX:VMOptionsFile=<file>`                                                      | the file                                                                                                                       |

`jcmd <pid> VM.flags` and `jcmd <pid> VM.system_properties` show what took effect, whichever
source it came from.

## Multi-release jars

A dependency jar with `META-INF/versions/25/` runs different classes on 25 than on 21 without
any version number changing. A behaviour difference after the upgrade with "no dependency
changed" is worth one `unzip -l dep.jar | grep versions/` before anything else.
