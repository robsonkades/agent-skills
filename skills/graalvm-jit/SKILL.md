---
name: graalvm-jit
description: >
  Graal as a JIT compiler compared with C2: partial escape analysis, more aggressive
  inlining and speculation, where Graal wins and where it loses, JVMCI and what JEP 410
  actually removed, and how to evaluate the swap with a fair measurement. Use when someone
  proposes switching to GraalVM for throughput, when a Graal-versus-C2 benchmark shows Graal
  "slower" with no warm-up control, when `-XX:+UseJVMCICompiler` is set via `--module-path`
  on a stock OpenJDK, when a percentage gain is quoted with no source or workload, when
  GraalVM JIT is being confused with native image, or when picking a distribution and its
  licence. Does not cover how C2 itself works (c2-sea-of-nodes), ahead-of-time compilation
  as a separate product decision (graalvm-native-image), or running the comparison benchmark
  correctly (jmh-advanced).
---

# GraalVM JIT versus C2

## Purpose

Decide whether replacing C2 with Graal is worth it for a specific workload, and reach that
decision from a measurement rather than from a reputation. Graal substitutes **only** the
tier-4 compiler — interpreter, C1, GC and threading remain HotSpot's — so the entire
question narrows to whether Graal's optimisations pay off for this code.

The failure this prevents is the comparison that measures something other than what it
claims. Two versions of it dominate: warm-up not controlled, so the sample mixes
interpreter, C1 and tier 4 and Graal looks slow while still climbing; and Graal injected
as a plain module jar on a stock OpenJDK, which lands in **jargraal** mode where the
compiler itself is warming up, and then that cost is attributed to "Graal's deeper
analysis".

## Workflow

1. **Establish which product is under discussion.** GraalVM JIT compiles at runtime with a
   JVM present, optimising peak throughput at the cost of start-up. Native image compiles at
   build time with no JVM at runtime, optimising instant start-up at the cost of adaptive
   optimisation. Opposite trade-offs; treating them as one thing produces migration mistakes
   in both directions.
2. **Confirm the mode before interpreting any warm-up number.**
   `java -XX:+PrintFlagsFinal -version | grep UseJVMCINativeLibrary` — `true` is libgraal,
   `false` is jargraal.
3. **Profile first, then benchmark the methods profiling actually named.** Build JMH
   benchmarks for the real hot paths, not a synthetic microbenchmark detached from the
   application's allocation pattern.
4. **Pin the same GC on both sides** and warm up until the score stabilises — variation under
   roughly 5% between the last iterations, verified with `-v EXTRA`, not a fixed iteration
   count assumed in advance.
5. **Read the result against the workload profile,** not against expectation. See
   `references/workload-fit-and-migration.md` for which shapes trend which way.
6. **Check the gate conditions before migrating:** long-running uptime, consistent wins across
   runs, native image considered if the critical metric is start-up, and the licence terms
   confirmed at the official source.
7. **After migrating, confirm the laboratory gain in production under real load,** with a
   tested rollback plan.

## Rules

- GraalVM JIT replaces the tier-4 compiler only. Any claim that it changes GC behaviour,
  threading or the tiering ladder is wrong.
- JVMCI (JEP 243, JDK 9) is the interface that makes this possible, and it **survived**
  JEP 410. JEP 410 (JDK 17) removed the experimental in-tree Graal and `jaotc` from OpenJDK;
  it did not remove the plug-in mechanism. Using Graal now means bringing a separate GraalVM
  distribution, not building OpenJDK with an experimental flag.
- Partial escape analysis is the central conceptual advantage. C2's escape analysis is
  all-or-nothing: if an object escapes on **any** path — including a rarely taken error branch
  — it is heap-allocated on 100% of executions. PEA virtualises per path and materialises only
  where the object genuinely escapes.
- Cite PEA correctly: Lukas Stadler, Thomas Würthinger, Hanspeter Mössenböck, CGO 2014. It is
  **not** Christian Wimmer, PLDI 2013 — that attribution is a common error.
- libgraal and jargraal are not the same configuration. libgraal is the Graal compiler itself
  ahead-of-time compiled into a native library, so it pays no warm-up of its own. jargraal
  (`-XX:-UseJVMCINativeLibrary`) runs as ordinary Java bytecode and climbs the tiers like any
  other code, on top of the target code's own warm-up.
- Injecting Graal via `--module-path graal-compiler.jar` on a stock OpenJDK typically yields
  jargraal, and `-XX:+UseJVMCICompiler` alone does not warn you. Always confirm with
  `PrintFlagsFinal`.
- No percentage gain counts as a fact without the source, the version and the workload.
  Reproduce it for your own workload before it informs a migration decision.
- Numerically intensive workloads — image processing, tight binary serialisation, simple scalar
  loops over arrays — can be **slower** under Graal than under C2, whose intrinsics and
  vectorisation are more mature. Graal does not always win.
- Short-lived workloads (Lambda functions, CLIs, jobs measured in seconds) rarely benefit: the
  more expensive compilation never has time to repay itself. C2 or native image is the correct
  choice for that profile.
- Never compare each side under its own default GC. Both GraalVM distributions and OpenJDK
  default to G1, but pinning it explicitly is what makes the compiler the only variable.
- The two current distributions are Oracle GraalVM (GFTC, Oracle JDK base) and GraalVM CE
  (GPLv2 with Classpath Exception, OpenJDK base). GFTC permits production and commercial use
  free of charge, the way NFTC does for Oracle JDK. Licensing changes more often than anything
  else here — confirm current terms at the official source before a corporate decision.
- Graal's `-Dgraal.*` diagnostic and tuning flag names are not stable across distributions and
  versions. Confirm them against the documentation for the version in use before putting them
  in a script.

## References

- [Workload fit and the migration decision](references/workload-fit-and-migration.md) — the
  workload-shape table with the reason each way, the strong and weak candidate profiles, and
  the gate checklist before and after migrating. Read when deciding whether to evaluate or
  adopt Graal for a given service.
- [Enabling and comparing Graal](references/enabling-and-comparing.md) — the two activation
  paths and why they differ, confirming libgraal versus jargraal, the JMH comparison commands,
  and the Graal-side tuning flags with their caveats. Read before running the comparison.
