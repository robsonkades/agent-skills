# Closed world, metadata, and initialization

## Runtime model

Native Image statically analyzes reachable bytecode, compiles reachable methods ahead of time,
lays out an initial image heap, and links that output with SubstrateVM and selected native
libraries. The human-useful model is:

```text
entry points + class path/module path + configuration
  -> points-to/reachability analysis to a fixed point
  -> reachable types, methods, fields, dynamic-access registrations, and image-heap objects
  -> AOT compilation and object/code layout
  -> platform linker
  -> executable or shared library for one OS/architecture/libc contract
```

This is a conceptual dependency pipeline, not the exact order of the builder's displayed phases.
Analysis, parsing, class initialization, heap discovery, and compiler work interact and can revisit
state while the build converges.

The closed-world assumption means code that may execute must be available for analysis at build
time. It does not mean all supplied classes are included, nor that an included class automatically
permits every reflective operation on it. Dynamic loading of previously unknown bytecode remains
incompatible with an ordinary native executable; some runtime class definition is possible only
where Native Image can precompute and register the resulting classes.

## What static analysis can and cannot prove

The analysis can often resolve constant reflection and other dynamic accesses. It cannot generally
infer values supplied only at runtime:

```java
Class<?> plugin = Class.forName(configuration.get("plugin.class"));
Method method = plugin.getDeclaredMethod(request.methodName());
return method.invoke(instance, request.arguments());
```

If the class, member, resource, proxy interface set, serialization behavior, JNI access, or FFM
access cannot be inferred, metadata must describe the intended dynamic contract. Missing metadata
can cause a build failure, a `Missing*RegistrationError` in exact mode, a conventional lookup
exception, a null resource, or library-specific behavior. Therefore, do not diagnose every
`ClassNotFoundException` as a metadata error without confirming the artifact actually contains the
class and the failing operation is dynamic access.

## Metadata sources and ownership

Use multiple sources, with explicit ownership:

| Source                           | Strength                                             | Failure mode                                             | Appropriate use                                 |
| -------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| Framework AOT integration        | understands framework-generated code and conventions | coupled to framework/plugin version                      | primary source for supported frameworks         |
| Library-packaged metadata        | maintained with the library                          | may lag unusual configurations                           | preferred for library internals                 |
| Reachability Metadata Repository | reusable community/vendor metadata                   | version matching and conditionality matter               | dependencies that do not package metadata       |
| Tracing agent                    | captures observed runtime accesses                   | incomplete when coverage is incomplete; can record noise | discover application-specific accesses          |
| Hand-authored metadata           | deterministic statement of intent                    | can become broad, stale, or schema-invalid               | stable application contracts and reviewed fixes |
| Feature API/substitution         | can express build-time logic beyond JSON             | code and version coupling                                | last resort for integration authors             |

Store application metadata below
`META-INF/native-image/<group-id>/<artifact-id>/reachability-metadata.json`, validate it against the
schema for the target release, and prefer conditional entries so optional dependencies do not bloat
unrelated images. Keep generated agent output reviewable: merge runs, diff changes, and separate
intentional configuration from transient test/framework noise.

Current unified metadata covers reflection, JNI, resources and bundles, serialization, proxies,
and foreign access as documented by the release schema. Legacy per-feature files remain accepted
in supported releases, but “accepted today” is not an indefinite compatibility guarantee. Do not
mix formats for the same ownership boundary without a reason; it makes provenance and stale-entry
removal harder.

Use exact handling during tests:

```bash
native-image --exact-reachability-metadata -jar app.jar
./app -XX:MissingRegistrationReportingMode=Exit
```

Exact mode improves attribution but still needs representative execution to reach the problematic
path. `Warn` helps inventory multiple gaps; `Exit` is useful in a correctness gate where caught
errors must not be hidden. Confirm these runtime options against the selected release.

## Class initialization and image-heap state

Java requires a class to initialize at first active use. Native Image may move initialization to
build time when it is configured or proven safe, storing resulting static state in the executable's
initial heap. Important Native Image runtime and JDK classes are build-time initialized. Application
classes default to runtime initialization unless automatically proven safe or explicitly selected.

Relevant supertypes of build-time-initialized classes must also be build-time initialized. Relevant
subtypes of runtime-initialized classes must remain runtime initialized, and instances of a runtime-
initialized class cannot already be present in the image heap. Those constraints explain many
apparently indirect initialization errors.

Build-time initialization is valid only when its observable result is safe for every deployment of
that artifact. Audit reads of:

- environment variables, system properties, secrets, hostnames, paths, locale, time zone, clocks,
  randomness, certificates, and network/file content;
- mutable singletons, caches, thread pools, file descriptors, native pointers, and background
  threads;
- providers or registries whose membership differs between build and deployment environments.

Prefer fixes in this order:

1. ordinary runtime construction through DI, lazy holders, or explicit application startup;
2. narrow `--initialize-at-run-time=<class>` or the public
   `RuntimeClassInitialization.initializeAtRunTime` Feature API;
3. a framework-supported extension;
4. SVM substitution only when source/framework changes are impossible.

Avoid package-wide `--initialize-at-build-time`. It expands the review surface and may turn future
dependency additions into persisted state without an obvious source change.

```java
// Portable: read deployment configuration at runtime.
final class DataSourceFactory {
    DataSource create(RuntimeConfig config) {
        return connect(config.databaseUrl());
    }
}
```

If internal substitution is unavoidable, pin the GraalVM release and regression-test it:

```java
@TargetClass(className = "com.example.LegacyConfig")
final class Target_LegacyConfig {
    @Alias
    @RecomputeFieldValue(kind = RecomputeFieldValue.Kind.Reset)
    static Properties PROPERTIES;
}
```

`com.oracle.svm.core.annotate` is an implementation API, not a portable Java or stable Native Image
contract. There is no general public `@Reinitialize` annotation.

## Runtime and distribution choices

Distribution capabilities are release-specific. For the current JDK 25 line, Community Edition
uses GPLv2 with Classpath Exception and supports Serial/Epsilon collectors; Oracle GraalVM uses the
GFTC and additionally provides Native Image G1 and PGO. The GFTC permits commercial and production
use subject to its terms, but redistribution and support terms still require review. Confirm the
actual release rather than copying an old “Community versus Enterprise” table.

Collector choice is a workload decision:

| Collector | Prefer when                                                                 | Avoid or investigate when                                                                       |
| --------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Serial    | small heaps, low footprint, low CPU budget, or short-lived processes        | stop-the-world time at target live set violates the SLO                                         |
| G1        | larger live sets or pause/throughput goals justify parallel/concurrent work | distribution/platform support, extra threads/footprint, or small-container economics do not fit |
| Epsilon   | bounded process lifetime and allocation budget make reclamation unnecessary | any request/load growth can outlive the allocation budget                                       |

The Serial heap's default maximum can be 80% of detected physical memory. That is an upper bound,
not an RSS prediction. A copying collector can need transient headroom, and the process also has
image heap, stacks, native allocations, code, mappings, and libraries. Always validate the
container-visible memory calculation and set an operational ceiling.

## Observability is a product feature

Build monitoring capabilities into the artifact with `--enable-monitoring=<features>`. JFR, heap
dumps, NMT, JMX, `jcmd`, and thread diagnostics have distinct inclusion and platform rules. Native
Image implements many useful JFR events, but not all HotSpot bytecode-instrumented or VM-internal
events; old-object root paths are limited. GraalVM 25.1 added Windows JFR recording and heap dumps,
while current documentation still excludes `jcmd` on Windows.

Do not preserve a static parity table across all GraalVM versions. Instead, for the release and
platform being deployed:

1. build with only required monitoring capabilities;
2. list available `jcmd` commands and JFR event types on the produced artifact;
3. capture a representative recording, heap dump, thread dump, and native-memory view;
4. verify symbol retention and crash/core-dump procedures;
5. quantify feature overhead under load.

## Primary references

- [Native Image overview](https://www.graalvm.org/latest/reference-manual/native-image/)
- [Reachability Metadata](https://www.graalvm.org/latest/reference-manual/native-image/metadata/)
- [Class Initialization](https://www.graalvm.org/latest/reference-manual/native-image/optimizations-and-performance/ClassInitialization/)
- [Memory Management](https://docs.oracle.com/en/graalvm/jdk/25/docs/reference-manual/native-image/optimizations-and-performance/MemoryManagement/)
- [Debugging and Diagnostics](https://www.graalvm.org/latest/reference-manual/native-image/debugging-and-diagnostics/)
- [GraalVM 25.1 release notes](https://www.graalvm.org/release-notes/25.1/)
- [Initialize Once, Start Fast (OOPSLA 2019)](https://doi.org/10.1145/3360610)
