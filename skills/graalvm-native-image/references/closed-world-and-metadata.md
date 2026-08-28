# Closed world, metadata and initialisation

## The four build phases

```
.class files (bytecode)
  |
  1. POINTS-TO ANALYSIS (closed-world, Andersen style)
  |    starts from the entry points (main, methods registered via reachability
  |    metadata) and propagates transitively: if A calls B, B is included; if a
  |    field can point at instances of T, T is included. The result is a fixed
  |    point - the smallest set of classes, methods and fields that can execute
  |    given the statically observable call graph. Everything outside it is
  |    eliminated, not by heuristic but because the analysis proves it unreachable
  |    under the assumed closure.
  |
  2. HEAP SNAPSHOTTING
  |    runs static initializers at BUILD TIME and serialises the resulting state
  |    into the image heap, so the process starts with that state ready and never
  |    re-runs <clinit>.
  |
  3. AOT COMPILATION
  |    the Graal compiler as an offline compiler. Less run-time information than a
  |    JIT (no profile, unless PGO supplies one), but all code is compiled from the
  |    first execution - no warm-up.
  |
  4. LINKING
  |    compiled code + image heap + selected GC + minimal runtime (SubstrateVM)
  |    -> ELF (Linux) / PE (Windows) / Mach-O (macOS)

reachability metadata feeds into phase 1.
```

The closed-world assumption states that anything not reachable at build time does not exist
at run time. Without it the binary would have to include the whole JDK just in case
something is loaded dynamically, destroying both the size gain and the analysis time that
make Native Image viable. That same assumption is why reflection, dynamic proxies and
serialisation need explicit configuration.

Primary sources: Christian Wimmer et al., _"Initialize Once, Start Fast: Application
Initialization at Build Time"_, OOPSLA 2019, DOI 10.1145/3360610 — the canonical paper for
heap snapshotting plus points-to analysis. Thomas Würthinger et al., _"One VM to Rule Them
All"_, Onward! 2013 (a SPLASH track, not OOPSLA), DOI 10.1145/2509578.2509581.

## Why reflection breaks it

```java
Class<?> cls = Class.forName(className);        // className can be any String
Method method = cls.getDeclaredMethod(methodName);
method.invoke(instance, args);
```

The analyser cannot infer the value of an arbitrary String at build time. If the class or
method is not declared reachable, the binary does not contain it — and the failure arrives
at run time, not at build time.

## Legacy versus unified metadata

| Aspect                      | Legacy (five files)                                                                                                | `reachability-metadata.json`                      |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Files                       | `reflect-config.json`, `resource-config.json`, `proxy-config.json`, `serialization-config.json`, `jni-config.json` | One file                                          |
| Discovery                   | Automatic via `META-INF/native-image/<group>/<artifact>/`                                                          | Automatic, same mechanism                         |
| Manual authoring            | Edit each file separately                                                                                          | One file, sections named per category             |
| Compatibility               | Supported indefinitely, not deprecated                                                                             | Recommended for new configuration                 |
| Shared third-party metadata | N/A                                                                                                                | `github.com/oracle/graalvm-reachability-metadata` |

```json
// reflect-config.json — legacy, still supported
[
  {
    "name": "com.example.MyService",
    "allDeclaredConstructors": true,
    "allDeclaredMethods": true,
    "allDeclaredFields": true
  }
]
```

```json
// reachability-metadata.json — general shape, illustrative.
// Confirm exact key names and schema version against
// graalvm.org/latest/reference-manual/native-image/metadata/ for the release in use.
{
  "reflection": [
    {
      "type": "NativeImageLab$Service",
      "allDeclaredConstructors": true,
      "allDeclaredMethods": true,
      "allDeclaredFields": true
    }
  ]
}
```

## Build-time initialisation and its three fixes

```java
public class Config {
    static final Properties PROPS;
    static {
        PROPS = new Properties();
        PROPS.load(ClassLoader.getSystemResourceAsStream("config.properties"));
        // Runs at BUILD TIME - the contents of PROPS are frozen into the binary
    }
}
```

If the configuration depends on an environment variable, the captured value is the build
environment's. An empty variable fails the build loudly; a CI value is snapshotted silently,
which is the worse case.

In order of practical preference:

```java
// 3 (most portable): lazy initialisation - defer the side effect to first use, via DI
@Singleton
class DataSourceFactory {
    @Bean
    DataSource dataSource(DataSourceConfig config) {
        return createDataSource(config.getUrl());   // created at run time
    }
}
```

```bash
# 2: the native-image flag - simplest
native-image --initialize-at-run-time=com.example.Config -jar myapp.jar
```

```java
// 1: SVM class substitution - recomputes the field at run time instead of
// inheriting the build-time snapshot. There is no "@Reinitialize" annotation;
// the real mechanism is these three.
@TargetClass(className = "com.example.Config")
final class Target_Config {
    @Alias
    @RecomputeFieldValue(kind = RecomputeFieldValue.Kind.Reset)
    static Properties PROPS;
}
```

`RecomputeFieldValue` lives in `com.oracle.svm.core.annotate` and is an internal SVM API, not
a stable public one — confirm the `Kind` constant against the installed GraalVM version.

## Choosing native or the JVM

| Scenario                                                                      | Choose                                                                                         | Why                                                                                  |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Serverless / FaaS with frequent cold starts                                   | Native Image                                                                                   | Millisecond startup removes warm-up cost charged on every cold invocation            |
| CLI run thousands of times by users                                           | Native Image                                                                                   | There is no steady state over which to amortise JIT warm-up                          |
| Long-running service, sustained high throughput                               | Traditional JVM                                                                                | C2 exploits the real profile; the higher post-warm-up ceiling outweighs startup cost |
| Heavy dynamic reflection unknowable at build time (plugins by arbitrary name) | Traditional JVM, or Native Image with `--no-fallback` and robust reachability regression tests | Closed world requires every dynamic path to be known at build time                   |
| Needs PGO or G1 in Native Image                                               | Confirm the distribution before committing to the design                                       | CE has neither; changing distribution afterwards is avoidable rework                 |

## Distributions

Since the GraalVM for JDK 17 line (2023), the old paid Community/Enterprise split became two
distributions with different licences, **both free**: GraalVM Community Edition under GPLv2
with Classpath Exception, and Oracle GraalVM under the GraalVM Free Terms and Conditions
(GFTC), free in production including commercially.

| Aspect           | GraalVM CE                                  | Oracle GraalVM                            |
| ---------------- | ------------------------------------------- | ----------------------------------------- |
| Licence          | GPLv2 + Classpath Exception                 | GFTC                                      |
| Production cost  | Free                                        | Free                                      |
| Native Image GCs | Serial (default), Epsilon                   | Serial, Epsilon, **G1**                   |
| PGO              | **Not available**                           | Available                                 |
| Where to get it  | `graalvm.org/downloads`, SDKMAN `*-graalce` | `graalvm.org/downloads`, SDKMAN `*-graal` |

Licensing and feature set are normatively defined by `graalvm.org/faq/` and the `LICENSE` /
`LICENSE_GRAALVM_CE` files in the `oracle/graal` repository; terms can be revised between
releases.

## JFR support

JFR works in native binaries, but with structurally narrower support: much of the JVM's JFR
instrumentation is coupled to HotSpot internals — multi-tier JIT, HotSpot-sense safepoints,
particular GC structures — that do not exist in the same form on SubstrateVM. This is a
consequence of a different runtime, not an implementation gap awaiting a fix.

| Aspect                                                       | JVM (HotSpot)         | Native Image                                                                                                                                                                      |
| ------------------------------------------------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application (custom) events                                  | Supported             | Supported                                                                                                                                                                         |
| Allocation / GC events for the selected collector            | Supported             | Partially supported, depending on the GC chosen (Serial/G1)                                                                                                                       |
| Most VM-internal events (JIT compilation, tiers, code cache) | Supported             | **Not supported** — no run-time JIT and no tiers for them to describe                                                                                                             |
| Stack traces on events                                       | Complete              | **Can be incomplete**, depending on the event and the depth SVM captured                                                                                                          |
| Platform                                                     | Linux, Windows, macOS | All three; local recording works everywhere, but **remote JMX and `jcmd` control are unavailable on Windows** (recurring-callback fallback instead of the signal-handler sampler) |

Planning production observability on assumed JFR parity is the kind of decision that only
surfaces during an incident. Test the specific events on the real binary first.
