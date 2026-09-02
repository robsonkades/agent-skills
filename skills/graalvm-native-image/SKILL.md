---
name: graalvm-native-image
description: >
  GraalVM Native Image: the closed-world assumption and reachability analysis, reflection
  and resource metadata, build-time versus run-time initialisation and heap snapshotting,
  the peak-throughput trade against the JIT, PGO, and measuring the real startup and memory
  win. Use when deciding whether a service should be a native binary, when a build succeeds
  but ClassNotFoundException or NoSuchMethodException appears at run time, when a static
  initializer captured a build-environment value, when --pgo or --gc=G1 fails on the
  installed distribution, when a copied -H: option does nothing, when the binary exits at
  startup naming CPU features the host lacks, when the CI build step dies with exit 137,
  when native RSS grows for hours with no leak, when a "5-10x less memory" claim needs
  checking, or when JFR events are missing from a native binary. Does not cover Graal as a
  JIT inside the JVM (graalvm-jit), the JVM-preserving startup strategies
  (startup-cds-crac-leyden), or JVM warm-up (jit-compilation).
---

# GraalVM Native Image

## Purpose

Decide whether ahead-of-time compilation is the right trade for a given workload, and then
build and measure it honestly. The value proposition is immediate startup with predictable
performance from the first request — not peak performance without warm-up. A warmed JVM's
C2-compiled code still has the higher throughput ceiling; that is structural, not a detail
to tune away.

The failure this skill prevents is the binary that is not really native, or not really
correct: a fallback image that embeds a JVM, a reflection path never exercised during
metadata collection, or a static initializer that froze the CI environment's database URL
into the image heap with no build error at all.

## Workflow

1. **Match the workload to the strategy before anything else.** Frequent cold starts
   (serverless, a CLI run thousands of times) favour native; a long-running service with
   sustained high throughput favours the JVM, whose warm-up amortises over hours.
   Genuinely arbitrary plugin loading breaks the closed-world premise outright.
2. **Confirm the installed distribution against the features the design assumes.**
   `native-image --version`. G1 and PGO exist only in Oracle GraalVM; on Community Edition
   they fail at build initialisation, not at run time.
3. **Collect reachability metadata with full coverage.** Run under
   `-agentlib:native-image-agent=config-output-dir=...` on a normal JVM and exercise every
   path — the whole integration suite, every endpoint, payload variations, error and
   timeout cases. The agent records only what actually ran.
4. **Move environment-dependent static initialisation to run time.** Anything reading an
   environment variable or doing external I/O in a `static { }` block runs at build time
   and gets frozen into the image heap.
5. **Build with `--no-fallback`.** A closed-world failure then surfaces as an explicit build
   error rather than a binary that silently embeds and invokes a JVM.
6. **Inspect the analysis report at least once** (`-H:+PrintAnalysisCallTree`) to confirm
   nothing essential was eliminated by mistake, and verify every `-H:` option with
   `native-image --help-extra | grep -i <term>` before trusting it.
7. **Measure both sides identically.** Same request, same repetition count, heap sizing
   fixed explicitly on both, stabilised RSS rather than the startup peak, and sustained load
   long enough for the comparison JVM to reach its own steady state.

## Rules

- Always pass `--no-fallback`. Without it the build can produce a fallback image — a binary
  that embeds the JVM and invokes it underneath, carrying exactly the startup cost Native
  Image exists to remove.
- A reflection, proxy, serialisation, resource or JNI path not exercised during agent
  collection is not in the binary. The symptom is `ClassNotFoundException` or
  `NoSuchMethodException` at run time, in production, on a path that was never tested.
  Rebuild with `--exact-reachability-metadata` before hunting: a registration gap then
  surfaces as `MissingReflectionRegistrationError` naming the type, instead of a lookup
  failure indistinguishable from a genuinely missing class. Keep a rollback plan to the
  JVM. See `references/troubleshooting.md`.
- Static initializers run at build time by default. An environment variable read there is
  either empty (build failure) or the build environment's value silently snapshotted into
  the binary. Fix with lazy initialisation via DI (most portable),
  `--initialize-at-run-time=<class>`, or SVM class substitution.
- There is no `@Reinitialize` annotation. The real substitution mechanism is `@TargetClass`,
  `@Alias` and `@RecomputeFieldValue` — an internal SVM API, not a stable public one, so
  confirm the `Kind` constant against the installed version.
- Verify every `-H:` hosted option before use. Many are undocumented, some are
  version-specific, and some never existed as a public option at all —
  `-H:+CompressEncoding` is the name of an internal Graal compiler class, not a
  `native-image` flag. Depending on version it is silently ignored or fails the build;
  neither is what the person copying it expected.
- Real binary size reduction is `--strip-debug` (a genuine flag) plus a post-build `upx`
  pass, not a compression option on `native-image`.
- Build for the deployment CPU, not the build host. The default `-march=x86-64-v3`, or
  `-march=native` on a newer build machine, yields a binary that exits at startup naming
  the CPU features the host lacks; `-march=compatibility` is the portable choice. See
  `references/troubleshooting.md`.
- G1 (`--gc=G1`) and PGO (`--pgo`, `--pgo-instrument`) require Oracle GraalVM. Both
  distributions have been free since the for-JDK-17 line — CE under GPLv2+CE, Oracle GraalVM
  under the GFTC — so material calling these features "enterprise only" in the sense of
  "paid" is describing pre-2023 licensing. The difference is feature set, not price.
- Compare PGO results with and without the profile on the same base build, not across builds
  where other variables moved too. The commonly cited 10-30% throughput figure is an order
  of magnitude from GraalVM's own material, not a measured constant.
- Never quote "5-10x less memory" as intrinsic to AOT. It depends on heap sizing on both
  sides. Fix `-Xmx`/`-Xms` explicitly on the JVM and the SubstrateVM heap flags on the
  binary, then compare stabilised RSS under the same load. Without an explicit ceiling the
  Serial GC grows the heap towards 80% of physical memory, so a native RSS that climbs for
  hours is filling, not leaking.
- Do not compare a native binary's immediate peak against a JVM still warming up. Sustain
  the load until the JVM reaches its own steady state, then compare steady state to steady
  state.
- Do not plan production observability assuming JFR parity. Most VM-internal events do not
  exist in a native binary — there is no run-time JIT or tiering for them to describe —
  stack traces can be incomplete, and on Windows remote JMX and `jcmd` control are
  unavailable (local recording works on all three platforms). Test the specific events on
  the real binary first.
- Prefer `reachability-metadata.json` for new configuration. The five legacy per-category
  files still work and are not deprecated, but the unified file makes it harder to declare
  reflection correctly and forget resources. Third-party library metadata is available from
  `github.com/oracle/graalvm-reachability-metadata` rather than being written by hand.

## References

- [Build and measurement recipes](references/build-and-measurement.md) — the agent workflow,
  build diagnostics, GC and PGO commands with their distribution requirements, size
  optimisation, framework build commands, and the startup/RSS/throughput measurement
  procedure. Read when running a build or producing comparison numbers.
- [Closed world and metadata](references/closed-world-and-metadata.md) — the four build
  phases, points-to analysis and heap snapshotting, the legacy versus unified metadata
  formats, the three initialisation fixes, the distribution feature matrix, and the JFR
  support matrix. Read when explaining a reachability failure or choosing a distribution.
- [Troubleshooting](references/troubleshooting.md) — symptom tables for the build, a binary
  that will not start, run-time failures the JVM never showed, and measurements that look
  wrong, each with the check that distinguishes look-alike causes and the remediation. Read
  when a build or binary fails and the stack trace alone does not identify the cause.
