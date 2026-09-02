---
name: graalvm-jit
description: >
  Graal as a JIT compiler compared with C2: partial escape analysis, graph-size inlining and
  speculation, where Graal wins and where it loses, JVMCI and what JEP 410 removed, libgraal
  versus jargraal, and how to evaluate the swap with a fair measurement. Use when someone
  proposes switching to GraalVM for throughput, when a Graal-versus-C2 benchmark shows Graal
  "slower" with no warm-up control, when `-XX:+UseJVMCICompiler` or `-XX:+UseGraalJIT` is set
  on a stock OpenJDK, when a `-Dgraal.*` flag is copied from old material, when an Oracle JDK
  24 deployment relied on its bundled Graal JIT, when a Truffle language warns about a
  fallback runtime, when a percentage gain is quoted with no source or workload, when GraalVM
  JIT is being confused with native image, or when picking a distribution and its licence.
  Does not cover how C2 itself works (c2-sea-of-nodes), ahead-of-time compilation as a
  separate product decision (graalvm-native-image), or running the comparison benchmark
  correctly (jmh-advanced).
---

# GraalVM JIT versus C2

## Purpose

Decide whether replacing C2 with Graal is worth it for a specific workload, and reach that
decision from a measurement rather than from a reputation. Graal substitutes **only** the
tier-4 compiler — interpreter, C1, GC and threading remain HotSpot's — so the entire
question narrows to whether Graal's optimisations pay off for this code, on a distribution
that actually ships the compiler and will keep shipping it.

The failure this prevents is the comparison that measures something other than what it
claims. Three versions of it dominate: warm-up not controlled, so the sample mixes
interpreter, C1 and tier 4 and Graal looks slow while still climbing; the run landing in
**jargraal** mode, where the compiler itself is being compiled by C1 and that cost is
attributed to "Graal's deeper analysis"; and a prior about which workloads favour which
compiler carried across compiler versions that changed the answer.

## Workflow

1. **Establish which product is under discussion.** GraalVM JIT compiles at runtime with a
   JVM present, optimising peak throughput at the cost of start-up. Native image compiles at
   build time with no JVM at runtime, optimising instant start-up at the cost of adaptive
   optimisation. Opposite trade-offs; treating them as one thing produces migration mistakes
   in both directions.
2. **Establish where Graal can even come from for this JDK.** In 2026 that is a GraalVM
   distribution — GraalVM Community or Oracle GraalVM, both on a JDK 25 base through the
   25.x line. A stock OpenJDK has JVMCI but no compiler: `-XX:+UseJVMCICompiler` passes
   `-version` silently and dies at the first compilation with `Cannot use JVMCI compiler:
No JVMCI compiler found`. Oracle JDK 25 removed the Graal JIT that 23 and 24 bundled.
   See `references/troubleshooting-and-timeline.md`.
3. **Confirm the mode and the configuration before interpreting any warm-up number.**
   `-Djdk.graal.ShowConfiguration=info` prints one line: `loaded from a Native Image
shared library` is libgraal, `loaded from class files` is jargraal. The JFR
   `jdk.Compilation` event's `compiler` field (`jvmci` versus `c2`) proves who produced the
   tier-4 code — HotSpot's `-XX:+PrintCompilation` never names the compiler.
4. **Profile first, then benchmark the methods profiling actually named.** Build JMH
   benchmarks for the real hot paths, not a synthetic microbenchmark detached from the
   application's allocation pattern.
5. **A/B inside one binary.** `-XX:-UseJVMCICompiler` on the GraalVM build gives C2 on the
   same class library, the same GC build and the same machine, so the compiler is the only
   variable. Pin the GC explicitly on both runs and warm up until the score stabilises —
   variation under roughly 5% between the last iterations, verified with `-v EXTRA`.
6. **Read the result against the workload shape and the compiler version,** not against
   expectation. GraalVM Community 25.3 gained loop vectorisation and a new default inliner;
   a prior formed on 25.0 is stale. See `references/workload-fit-and-migration.md`.
7. **Check the gate conditions before migrating:** long-running uptime, consistent wins across
   runs, native image considered if the critical metric is start-up, the licence confirmed
   at the official source, and a support horizon for the GraalVM line now that it is
   detached from the Java SE release train.
8. **After migrating, confirm the laboratory gain in production under real load,** with a
   tested rollback plan, and watch RSS: libgraal's threads and isolate heap live outside
   `-Xmx`.

## Rules

- GraalVM JIT replaces the tier-4 compiler only. On GraalVM CE 25.0.2 `TieredCompilation`,
  `TieredStopAtLevel`, the `Tier3`/`Tier4` thresholds and the G1 default are byte-for-byte
  HotSpot's. Any claim that it changes GC behaviour, threading or the tiering ladder is
  wrong; the whole C2 tier-ladder diagnosis in `c2-sea-of-nodes` still applies.
- JVMCI (JEP 243, JDK 9) is the interface that makes this possible, and it **survived**
  JEP 410. JEP 410 (JDK 17) removed `jdk.aot`, `jdk.internal.vm.compiler` and its
  management module from OpenJDK and kept `jdk.internal.vm.ci`. JDK 22 onwards carries an
  empty `jdk.graal.compiler` placeholder (JDK-8318027, Galahad preparation) and the
  `-XX:+UseGraalJIT` flag; on Temurin 25.0.3 the flag fails with `JVMCI compiler 'graal'
specified by jvmci.Compiler not found`. Galahad was dissolved in March 2026. Using Graal
  means a GraalVM distribution, not a flag on OpenJDK.
- On a stock JDK the JVMCI flags are `{JVMCI experimental}` and need
  `-XX:+UnlockExperimentalVMOptions` first; on GraalVM they are `{JVMCI product}` and need
  nothing. The stock-JDK failure is **late** — at the first compile request, not at
  start-up. `-XX:+BootstrapJVMCI` moves it to start-up, which is the only safe way to put
  the flag in a launch script.
- Graal options use the `-Djdk.graal.` prefix (GraalVM for JDK 22 onwards). `-Dgraal.`
  still works with a deprecation warning on 25.0 and without one on 25.1. An option name
  Graal does not know is **fatal at start-up** — `Error parsing Graal options: Could not
find option X` — so never carry a flag across versions unlisted: `-XX:+JVMCIPrintProperties`
  with `-Djdk.graal.PrintPropertiesAll=true` is the authoritative list for the build in use.
- There is no `CompilerThreads` Graal option. Compiler threads are `-XX:CICompilerCount`
  split by `-XX:JVMCINativeLibraryThreadFraction` (0.66 since GraalVM for JDK 24,
  JDK-8337493): a lower fraction trades warm-up for lower peak RSS.
- Partial escape analysis is the central conceptual advantage. C2's escape analysis is
  all-or-nothing: if an object escapes on **any** path — including a rarely taken error branch
  — it is heap-allocated on 100% of executions. PEA virtualises per path and materialises only
  where the object genuinely escapes.
- Cite PEA correctly: Lukas Stadler, Thomas Würthinger, Hanspeter Mössenböck, CGO 2014. It is
  **not** Christian Wimmer, PLDI 2013 — that attribution is a common error.
- Graal's inlining budget is measured in **graph nodes** (`TrivialInliningSize=10`,
  `MaximumInliningSize=300`, `SmallCompiledLowLevelGraphSize=330` on CE 25.0.2), not in
  bytecode bytes like C2's `MaxInlineSize`/`FreqInlineSize`. The numbers do not transfer,
  and `-XX:+PrintInlining` shows nothing for Graal's tier-4 decisions — use
  `-Djdk.graal.TraceInlining=true` with `-Djdk.graal.MethodFilter`. GraalVM 25.3 replaced
  the inliner (`UsePriorityInlining`), so 25.0 traces do not describe 25.3.
- libgraal and jargraal are not the same configuration. libgraal is the compiler compiled
  ahead of time into `libjvmcicompiler`, so it pays no warm-up of its own. jargraal
  (`-XX:-UseJVMCINativeLibrary`) runs as bytecode **and is compiled by C1 only**
  (`CompileGraalWithC1Only=true`), so its penalty is per compilation for the life of the
  process, not a warm-up that ends: a 25 ms C2 run took ~310 ms under jargraal on CE 25.0.2.
  The `(gc=Serial GC)` in the libgraal configuration line is the compiler isolate's own GC,
  not the application's.
- Compiler configurations are `community` and `economy` on CE; `enterprise` exists only on
  Oracle GraalVM. Requesting one the build lacks does not fall back — JVMCI is disabled
  after N failed upcalls and the JVM aborts with an `hs_err` file. A flags file copied from
  Oracle GraalVM onto CE is the usual way to hit this.
- No percentage gain counts as a fact without the source, the version and the workload.
  "Numeric loops favour C2" was true of CE through 25.2, which had no auto-vectorisation
  (Oracle-only `Vectorization`); CE 25.3 enables `VectorizeLoops` by default. Reproduce on
  the exact GraalVM line before it informs a migration decision.
- Short-lived workloads (Lambda functions, CLIs, jobs measured in seconds) rarely benefit: the
  more expensive compilation never has time to repay itself. C2 or native image is the correct
  choice for that profile.
- Never compare each side under its own default GC; pin it explicitly so the compiler is the
  only variable.
- The two distributions are Oracle GraalVM (GFTC, Oracle JDK base) and GraalVM CE (GPLv2 with
  Classpath Exception, OpenJDK base). Since September 2025 GraalVM is detached from the Java
  SE release train: Oracle JDK 24 was the last Oracle JDK with a bundled Graal JIT, GraalVM
  25.x ships monthly innovation releases on a JDK 25 base, and no OpenJDK-integrated Graal
  is coming. Licence **and support horizon** are both gates; JDK 17 CPU releases already
  moved from GFTC to the OTN licence. Confirm at the official source before a corporate
  decision.
- Truffle languages (GraalJS, GraalPy) need the Graal compiler for partial evaluation. On
  OpenJDK or Oracle JDK 25 the optimising runtime exists only as a polyglot isolate;
  otherwise the engine prints `[engine] WARNING: The polyglot engine uses a fallback
runtime` and interprets. Since GraalVM 25.1 jargraal on plain OpenJDK is unsupported for
  Truffle. Embedding a Graal language is a reason to run on GraalVM independent of the
  C2-versus-Graal throughput question.

## References

- [Workload fit and the migration decision](references/workload-fit-and-migration.md) — the
  workload-shape table with the reason each way and the GraalVM line it was true on, the
  strong and weak candidate profiles, the gate checklist, and the 2026 licensing and
  support picture. Read when deciding whether to evaluate or adopt Graal for a given service.
- [Enabling and comparing Graal](references/enabling-and-comparing.md) — the activation
  paths and what each really yields, confirming libgraal versus jargraal and who compiled
  tier 4, the verified `-Djdk.graal.` option set, and the single-binary JMH comparison. Read
  before running the comparison.
- [Troubleshooting and timeline](references/troubleshooting-and-timeline.md) — the
  symptom-to-cause table for Graal that will not start, silently is not running, crashes or
  underperforms, production behaviour at scale (threads, RSS, code cache), the Truffle
  runtime matrix, and the JEP and release timeline from JVMCI to the detachment. Read when
  a Graal run misbehaves or when a claim about "Graal in OpenJDK" needs a date.
