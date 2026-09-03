---
name: graalvm-native-image
description: >
  GraalVM Native Image: closed-world reachability, dynamic-feature metadata,
  class initialization and image-heap state, CPU targeting, GC and PGO choices,
  observability, and fair comparison with HotSpot. Use when deciding whether AOT
  fits a workload, diagnosing build or runtime-only failures, or validating startup,
  footprint, latency, throughput, build-cost, portability, and security trade-offs.
  Does not cover Graal as a JVM JIT (graalvm-jit), JVM-preserving startup strategies
  (startup-cds-crac-leyden), or HotSpot warm-up mechanics (jit-compilation).
---

# GraalVM Native Image

## Purpose

Choose Native Image only when its measured lifecycle economics and runtime behavior fit the
workload. AOT removes runtime compilation and can materially improve cold startup and initial
footprint, but it exchanges HotSpot's adaptive optimization and dynamic runtime for a longer,
more resource-intensive build, a closed-world compatibility contract, and different GC and
diagnostic capabilities. Neither Native Image nor a warmed JVM has a universal throughput or
latency advantage.

Prevent binaries that pass a happy-path test but fail on unregistered dynamic access, capture
build-host state in the image heap, require CPU features absent from production, exceed container
memory, or win a benchmark only because the JVM was measured before steady state.

## Decision framework

| Dominant constraint     | Native Image becomes attractive when                                                                | Prefer HotSpot or validate very carefully when                                              |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Cold start              | cold starts are frequent and user-visible, or process lifetime is short                             | instances are long-lived and startup is outside the SLO                                     |
| Footprint/density       | measured total RSS and fleet density improve at the required load                                   | heap dominates RSS or native metadata/code offsets the saving                               |
| Throughput/tail latency | the native build meets the SLO at target saturation, ideally with a representative PGO profile      | adaptive optimization, large heaps, or mature HotSpot collectors are material               |
| Dynamic behavior        | framework and libraries publish tested metadata; the dynamic surface is bounded                     | arbitrary plugins, runtime bytecode generation, agents, or unknown reflection are essential |
| Delivery                | reproducible native builds and per-platform artifacts fit the pipeline                              | build time, builder RAM, patch cadence, or target matrix dominates delivery cost            |
| Diagnostics             | required JFR, `jcmd`, heap-dump, debugger, and profiler workflows work on the exact binary/platform | operations depend on unsupported HotSpot events or tooling                                  |

Estimate a break-even point instead of classifying only by workload label:

```text
benefit per start × starts over artifact lifetime
+ density or latency value under representative load
> added build, test, artifact, compatibility, and operational cost
```

Reject the migration if correctness coverage or rollback cannot be made credible, even when the
startup number is compelling.

## Workflow

1. **State the decision and version boundary.** Record GraalVM distribution and release,
   target OS/architecture/libc, framework/plugin versions, required dynamic features, workload
   lifetime, SLO, memory limit, and deployment CPU floor. Recheck flags against the installed
   release; Native Image options and edition-specific features change.
2. **Build the framework-supported baseline first.** Prefer the framework's AOT integration and
   Native Build Tools over a hand-written command. It may generate substitutions and reachability
   metadata that a raw agent run cannot infer.
3. **Audit dynamic behavior.** Combine library-provided metadata, framework-generated metadata,
   targeted manual entries, and tracing-agent runs over representative integration tests. The
   agent records observed accesses; it does not prove completeness. Use exact metadata handling
   and a test mode that reports or exits on missing registration.
4. **Audit class initialization and image-heap state.** Application classes normally initialize
   at runtime unless proven safe or explicitly configured for build time. Inspect the build report
   or `-H:+PrintClassInitialization`; move environment-, secret-, clock-, filesystem-, network-,
   locale-, or host-dependent work to runtime. Prefer ordinary lazy construction/DI over internal
   substitutions.
5. **Select runtime and target deliberately.** Confirm whether the distribution supports the
   desired GC and PGO. Choose a portable `-march` floor for heterogeneous fleets, set a container-
   appropriate heap ceiling, and decide whether glibc, musl, or dynamic linking matches patching
   and compatibility requirements.
6. **Build reproducibly and inspect the result.** Pin the builder image/toolchain and inputs;
   retain the build report, effective arguments, SBOM, target CPU, debug-symbol policy, binary
   hash, build time, and peak builder RSS. Treat expert `-H:` flags as release-coupled and prove
   that each is accepted and still needed.
7. **Test the produced artifact.** Exercise success, invalid input, optional integrations,
   reflection/serialization/JNI/FFM, resources, locales/time zones, TLS/security providers,
   shutdown, signals, memory pressure, and the oldest deployment CPU. Run tests in the actual
   container/base image rather than only on the build host.
8. **Measure both candidates under the same experiment.** Compare time to first successful
   response, startup distribution, idle and loaded RSS, allocation/GC behavior, throughput,
   latency percentiles near saturation, CPU per operation, image size/pull time, and build cost.
   Warm the JVM deliberately and report cold and steady-state results separately. Repeat across
   forks and preserve raw results.
9. **Canary with rollback.** Monitor correctness errors, OOM/GC behavior, CPU, saturation, tail
   latency, startup, and diagnostic coverage. Keep the JVM artifact deployable until native-only
   paths and incident procedures have survived production traffic.

## Non-negotiable rules

- **Version-gate fallback advice.** GraalVM 25.1 removed fallback images; `--no-fallback` is
  deprecated and has no effect there and later. On older supported releases, use it to prevent a
  JVM-launching fallback artifact. Never infer “standalone” from the filename alone.
- **Reachable is not the same as dynamically accessible.** Static analysis can include a class
  while omitting reflective members, JNI access, serialization constructors, proxies, foreign
  access, or resources. Prefer narrow conditional metadata and validate against the schema shipped
  with the target release. Broad `allDeclared*` entries can hide gaps and inflate the image.
- **Treat agent output as evidence, not specification.** Merge runs from representative tests;
  review diffs; remove caller noise; retain deterministic hand-authored entries for intentional
  contracts. A health-check-only trace is not coverage.
- **Do not blanket-initialize packages at build time.** Native Image initializes important runtime
  and JDK classes at build time and can automatically initialize application classes proven safe;
  other application classes remain runtime-initialized unless configured. Build-time state must be
  host-independent, non-secret, deterministic, and safe to persist for the artifact lifetime.
- **Prefer public configuration over SVM internals.** `@TargetClass`, `@Alias`, and
  `@RecomputeFieldValue` are implementation APIs. Use a framework extension, public Feature API,
  runtime initialization, or code change first; pin and test the GraalVM release if substitution is
  unavoidable.
- **Treat `-H:` options as unstable expert controls.** Discover them with the installed tool's
  expert-option help, capture effective arguments in CI, and retest after every upgrade. Do not
  silently carry copied flags across releases.
- **Separate file size from runtime memory.** `--strip-debug` or separate debug symbols can reduce
  shipped bytes. Executable packers such as UPX alter packaging, not live Java-heap demand, and can
  interfere with code signing, scanning, page sharing, startup, crash analysis, or platform policy;
  use only after measuring and validating the delivery environment.
- **Compile for the fleet CPU floor.** Current AMD64 defaults use `x86-64-v3`; AArch64 defaults are
  release-specific. Use `-march=compatibility` for broad portability or an explicit fleet baseline,
  and test on the oldest supported machine. Use `-march=native` only for homogeneous compatible
  build and deployment CPUs.
- **Set memory limits explicitly.** With no explicit maximum, the Serial runtime heap can use up to
  80% of detected physical memory; that is a ceiling, not expected RSS. GC copying, thread stacks,
  code, image heap, native libraries, and allocator behavior also consume memory. Validate cgroup
  detection and leave headroom below the container limit.
- **Treat PGO as workload-specific.** Oracle GraalVM provides PGO; Community Edition does not in
  the current JDK 25 line. Train on representative traffic, keep training and evaluation data
  separate, compare the same source/toolchain/build configuration, and retrain when traffic or hot
  code changes. Do not promise a fixed percentage improvement.
- **Verify observability on the exact release and platform.** Native Image has JFR and `jcmd`
  support, but event and command coverage differs from HotSpot and platform support evolves. For
  example, Windows JFR recording arrived in GraalVM 25.1 while `jcmd` remains unavailable there in
  the current documentation. Enable only the required monitoring features and rehearse incident
  capture before production.
- **Rebuild for security updates.** A native artifact embeds reachable JDK/runtime and often native
  library code. Track the builder JDK, toolchain, libc/linking mode, metadata repository, and base
  image; rebuild and redeploy when any embedded dependency requires a fix. A smaller reachable set
  is not a security guarantee.

## Failure triage

```text
Build fails or is OOM-killed
  -> distinguish closed-world/unsupported feature from builder RAM or parallelism
  -> inspect reachability path, build report, peak RSS and container limit

Binary fails only on one path
  -> enable exact metadata handling and missing-registration reporting
  -> distinguish absent metadata from genuinely absent class/resource/native library

Binary starts on CI but not production
  -> compare target CPU, OS/libc, linked libraries, class-initialized state and secrets/config

RSS or tail latency violates the SLO
  -> separate Java heap, image heap, native allocations, stacks and GC transient headroom
  -> reproduce at target concurrency with explicit heap and the production GC
```

Use [troubleshooting](references/troubleshooting.md) for the detailed symptom matrix.

## References

- [Build and measurement recipes](references/build-and-measurement.md) — use while creating a
  reproducible artifact or performance comparison.
- [Closed world and metadata](references/closed-world-and-metadata.md) — use when reasoning about
  reachability, initialization, distribution features, or observability.
- [Troubleshooting](references/troubleshooting.md) — use when a build, binary, or measurement fails.
- [Native Image reference manual](https://www.graalvm.org/latest/reference-manual/native-image/)
- [Native Image release notes](https://www.graalvm.org/release-notes/)
- [Reachability Metadata repository](https://github.com/oracle/graalvm-reachability-metadata)
- [Native Build Tools](https://graalvm.github.io/native-build-tools/latest/)
- [GraalVM licensing FAQ](https://www.graalvm.org/faq/)
