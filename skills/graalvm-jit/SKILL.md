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
question is whether Graal's optimisations pay off for this code, on a supported runtime/compiler
combination that is actually available to the project.

The failure this prevents is the comparison that measures something other than what it
claims. Three versions of it dominate: warm-up not controlled, so the sample mixes
interpreter, C1 and tier 4 and Graal looks slow while still climbing; the run landing in
**jargraal** mode, where the compiler itself is being compiled by C1 and that cost is
attributed to "Graal's deeper analysis"; and a prior about which workloads favour which
compiler carried across compiler versions that changed the answer.

## Workflow

Inspect the project's toolchain, runtime image, exact distribution/build, OS/architecture, flags and CPU/
memory limits first. The examples here target HotSpot/GraalVM JDK 25; they do not authorize
upgrading an older project or changing its distribution. Return the observed compiler/mode,
comparison conditions and result with uncertainty, then a conditional recommendation and
the measurement that would confirm it. Missing profiles or compiler evidence mean the
migration benefit remains unproven.
Reuse adequate profiles, comparisons and accepted operational constraints; ask only for gaps
that could change the decision. Retaining C2 is a complete outcome when it meets the targets
and no material benefit justifies a compiler change.

1. **Establish which product is under discussion.** GraalVM JIT compiles at runtime with a
   JVM present, optimising peak throughput at the cost of start-up. Native image compiles at
   build time with its own runtime rather than HotSpot, targeting faster start-up at the cost of adaptive
   optimisation of ordinary Java application code. These are different runtime/product decisions;
   do not infer a universal startup or throughput result from the product name.
2. **Establish where Graal comes from for this JDK.** The packaged choices examined here are
   GraalVM Community and Oracle GraalVM on a JDK 25 base. JVMCI also permits externally built
   compilers; verify the supplied compiler's compatibility and support rather than assuming
   any stock JDK plus arbitrary compiler artifacts works. The tested stock Temurin has JVMCI
   but no compiler: unlocked `-XX:+UseJVMCICompiler` passes
   `-version` silently and dies at the first compilation with `Cannot use JVMCI compiler:
No JVMCI compiler found`. Oracle JDK 25 removed the Graal JIT that 23 and 24 bundled.
   See `references/troubleshooting-and-timeline.md`.
3. **Confirm the mode and the configuration before interpreting any warm-up number.**
   `-Djdk.graal.ShowConfiguration=info` prints one line: `loaded from a Native Image
shared library` is libgraal, `loaded from class files` is jargraal. The JFR
   `jdk.Compilation` event's `compiler` field (`jvmci` versus `c2`) proves who produced the
   tier-4 code — HotSpot's `-XX:+PrintCompilation` never names the compiler.
4. **Use representative evidence for the unresolved question.** Compare the real workload
   and lifetime; add JMH for an isolated hot-path question when existing evidence is insufficient,
   using methods profiling actually named. A microbenchmark is not a prerequisite to retaining
   an adequate runtime or a substitute for application outcomes.
5. **When comparing, prefer A/B inside one compatible binary.** `-XX:-UseJVMCICompiler` on the GraalVM build gives C2 on the
   same class library, the same GC build and the same machine, so the compiler is the only
   intended treatment. Pin the GC and all non-compiler flags on both runs. Use independent
   forks, inspect per-iteration convergence, retain confidence intervals/raw results, and
   compare both steady state and time-to-steady-state; a fixed “last iterations within 5%”
   rule can accept drift or reject normal noise.
6. **Read the result against the workload shape and the compiler version,** not against
   expectation. GraalVM Community 25.3 gained loop vectorisation and a new default inliner;
   a prior formed on 25.0 is stale. See `references/workload-fit-and-migration.md`.
7. **Check the gate conditions before migrating:** measured lifetime break-even, consistent wins across
   runs, native image considered if the critical metric is start-up, the licence confirmed
   at the official source, and a support horizon for the GraalVM line now that it is
   detached from the Java SE release train.
8. **After migrating, confirm the laboratory gain in production under real load,** with a
   tested rollback plan, and watch RSS: libgraal's threads and isolate heap live outside
   `-Xmx`.

## Rules

- GraalVM JIT replaces the tier-4 compiler only. On GraalVM CE 25.0.2 `TieredCompilation`,
  `TieredStopAtLevel`, the `Tier3`/`Tier4` thresholds and the G1 default are byte-for-byte
  HotSpot's in that build. Replacing the compiler does not replace those subsystems, but
  changed allocation, generated code and compiler CPU usage can change observed GC,
  scheduling and tier progression. Recheck target-build ergonomics and collector support.
- JVMCI (JEP 243, JDK 9) is the interface that makes this possible, and it **survived**
  JEP 410. JEP 410 (JDK 17) removed `jdk.aot`, `jdk.internal.vm.compiler` and its
  management module from OpenJDK and kept `jdk.internal.vm.ci`. JDK 22 onwards carries an
  empty `jdk.graal.compiler` placeholder (JDK-8318027, Galahad preparation) and the
  `-XX:+UseGraalJIT` flag; on Temurin 25.0.3 the flag fails with `JVMCI compiler 'graal'
specified by jvmci.Compiler not found`. Galahad was dissolved in March 2026. Using Graal
  requires an actual compatible compiler, not merely a flag on OpenJDK. JEP 410 explicitly
  retained externally built compiler use; availability and production support are separate checks.
- On a stock JDK the JVMCI flags are `{JVMCI experimental}` and need
  `-XX:+UnlockExperimentalVMOptions` first; on GraalVM they are `{JVMCI product}` and need
  nothing. The stock-JDK failure is **late** — at the first compile request, not at
  start-up. `-XX:+BootstrapJVMCI` can expose it in an isolated preflight; it adds compilation
  work and is not a mandatory production launch flag. A representative hot-code smoke test
  with compiler evidence is another validation route.
- Graal options use the `-Djdk.graal.` prefix (GraalVM for JDK 22 onwards). `-Dgraal.`
  still works with a deprecation warning on 25.0 and without one on 25.1. On the tested CE
  25.0.2 native configuration, an unknown option is **fatal at start-up**, even with `-version`
  — `Error parsing Graal options: Could not
find option X` — so never carry a flag across versions unlisted: `-XX:+JVMCIPrintProperties`
  with `-Djdk.graal.PrintPropertiesAll=true` is the authoritative list for the build in use.
- There is no `CompilerThreads` Graal option. Compiler threads are `-XX:CICompilerCount`
  split by `-XX:JVMCINativeLibraryThreadFraction` (0.66 since GraalVM for JDK 24,
  JDK-8337493). Lowering it is a candidate trade-off between compiler concurrency, warm-up
  and peak RSS; measure the outcome rather than assuming RSS must fall.
- Partial escape analysis is the central conceptual advantage. C2's escape analysis is
  flow-insensitive for this decision: an object classified as escaping because of one path is
  not scalar-replaced only on the non-escaping path. Graal PEA can keep it virtual across
  paths and materialise it where required. Inlining, identity use, synchronization, array
  limits and compiler heuristics still constrain both compilers; prove the allocation change.
- Cite PEA correctly: Lukas Stadler, Thomas Würthinger, Hanspeter Mössenböck, CGO 2014. It is
  **not** Christian Wimmer, PLDI 2013 — that attribution is a common error.
- Graal's inlining budget is measured in **graph nodes** (`TrivialInliningSize=10`,
  `MaximumInliningSize=300`, `SmallCompiledLowLevelGraphSize=330` on CE 25.0.2), not in
  bytecode bytes like C2's `MaxInlineSize`/`FreqInlineSize`. The numbers do not transfer,
  and `-XX:+PrintInlining` shows nothing for Graal's tier-4 decisions — use
  `-Djdk.graal.TraceInlining=true` with `-Djdk.graal.MethodFilter`. GraalVM 25.3 replaced
  the inliner (`UsePriorityInlining`), so 25.0 traces do not describe 25.3.
- libgraal and jargraal are not the same configuration. libgraal is the compiler compiled
  ahead of time into `libjvmcicompiler`, avoiding compiler bytecode warm-up; initialization
  and compilation still cost work. jargraal (`-XX:-UseJVMCINativeLibrary`) runs as bytecode
  and, with the CE 25.0.2 default `CompileGraalWithC1Only=true`, is compiled by C1 only.
  Under that setting its compiler cost can persist for the life of the
  process while new compilations occur. That does not imply a permanent application
  slowdown: once hot code is installed, compilation costs can be amortised. Measure
  compilation CPU and the complete workload lifetime separately.
  The `(gc=Serial GC)` in the libgraal configuration line is the compiler isolate's own GC,
  not the application's.
- Compiler configurations are `community` and `economy` on CE; `enterprise` exists only on
  Oracle GraalVM. Requesting one the build lacks does not fall back — JVMCI is disabled
  after N failed upcalls and the JVM aborts with an `hs_err` file. A flags file copied from
  Oracle GraalVM onto CE is the usual way to hit this.
- No percentage gain counts as a fact without the source, the version and the workload.
  The older heuristic favouring C2 for numeric loops reflected CE's lack of auto-vectorisation
  through 25.2 (Oracle-only `Vectorization`); that alone did not prove a speed advantage.
  CE 25.3 enables `VectorizeLoops` by default. Reproduce on
  the exact GraalVM line before it informs a migration decision.
- Short-lived workloads (functions, CLIs, jobs measured in seconds) are weak candidates when
  added compilation cost exceeds the runtime saving. Measure cold start, warm-up CPU, total
  job duration and invocation reuse; C2, HotSpot AOT caches, CRaC or native image are competing
  choices with different compatibility and operational costs.
- Do not compare each side under different default GC or security/compiler option sets. Pin
  non-treatment flags, record ergonomically selected values, and include options such as
  `jdk.graal.SpectrePHTBarriers` in the equivalence review: changing a mitigation changes both
  security posture and generated-code cost.
- The two distributions are Oracle GraalVM (GFTC, Oracle JDK base) and GraalVM CE (GPLv2 with
  Classpath Exception, OpenJDK base). Since September 2025 GraalVM is detached from the Java
  SE release train: Oracle JDK 24 was the last Oracle JDK with a bundled Graal JIT, GraalVM
  25.1+ ships monthly innovation releases on a JDK 25 base, while Oracle GraalVM 25.0 LTS
  receives quarterly CPUs. Confirm the selected line's terms; these are distinct support choices.
  The dissolved Galahad project
  is no delivery commitment for future OpenJDK integration. Licence **and support horizon**
  are both gates; JDK 17 CPU releases already
  moved from GFTC to the OTN licence. Confirm at the official source before a corporate
  decision.
- Truffle languages (GraalJS, GraalPy) need the Graal compiler for partial evaluation. For
  Polyglot 25.1+, on OpenJDK or Oracle JDK 25 the optimising runtime uses a polyglot isolate;
  otherwise the engine prints `[engine] WARNING: The polyglot engine uses a fallback
runtime` and interprets. Polyglot 25.1 withdraws the external-jargraal route for that
  Truffle runtime; its notes direct users needing the older route to Polyglot 25.0 LTS.
  Record both Polyglot and host versions. This is not a blanket withdrawal of external
  JVMCI compilers. Retain an adequate intentional fallback or compatible isolate setup;
  guest-language optimization is a separate reason to evaluate GraalVM.

## References

The release-line facts below were checked against GraalVM 25.3.4.1 (2026-08-25). Consult the
current official release calendar and target build properties before a new migration.

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
