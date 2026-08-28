---
name: simd-and-vector-api
description: >
  Vectorisation on the JVM: C2 SuperWord auto-vectorisation and the loop shapes that defeat
  it, the incubating Vector API (species, lanes, masks, loop bound and tail handling),
  proving that vector instructions were actually emitted, and the portability and silent
  fallback rules. Use when someone proposes rewriting a hot loop with jdk.incubator.vector,
  when a SIMD rewrite produced no measurable gain, when "the Vector API is stable since JDK
  21" appears in a PR or design document, when compilation fails with "package
  jdk.incubator.vector is not visible", when a fixed species is pinned across a
  heterogeneous fleet, or when a component speedup is being extrapolated to system
  throughput. Does not cover reading the emitted instructions in general
  (reading-jit-assembly), the loop optimisations upstream of code generation
  (c2-sea-of-nodes), or benchmark construction and harness pitfalls (jmh-advanced).
---

# SIMD and the Vector API

## Purpose

Decide whether a loop should be rewritten with explicit vector code at all, and prove the
answer instead of assuming it. The failure this skill prevents is the rewrite that buys
nothing: a loop C2's SuperWord pass already vectorised, an array too short for the setup
cost, or a species the host CPU cannot honour — which falls back to scalar execution
silently, with no exception and no log.

The second failure is arithmetic, not technical: a measured 4x on a component that occupies
9% of total time is roughly a 7% end-to-end gain, not 4x. Amdahl's law applies before any
throughput number is promised.

## Workflow

1. **Check whether C2 already vectorised it.** Capture the scalar loop with
   `-XX:+UnlockDiagnosticVMOptions -XX:+PrintAssembly -XX:CompileCommand=print,*Class.method`
   and look for `ymm`/`zmm` registers and `v`-prefixed mnemonics. If they are there,
   SuperWord solved it — stop.
2. **Name why auto-vectorisation failed** before writing vector code. Control flow inside
   the loop, gather/scatter access, a non-associative floating-point reduction, or aliasing
   C2 cannot resolve are the structural cases. Anything else is a loop-shape problem to fix
   in the scalar code first.
3. **Reject sequential dependence.** If each iteration consumes the previous iteration's
   result, no lane parallelism exists. Restructuring into a prefix-sum form is possible but
   changes the algorithm's complexity — decide whether that is worth it before starting.
4. **Size the array against the species.** With `N` not much larger than
   `SPECIES.length()`, every iteration is tail and setup dominates. Measure the crossover on
   the target hardware; do not assume a threshold.
5. **Write the canonical loop shape** — `loopBound`, the vector loop, then a scalar or
   masked tail. See `references/vector-api-recipes.md` for the shapes and the exact masked
   signatures.
6. **Prove the instructions were emitted.** `PrintAssembly` on the new method, or
   `-XX:+PrintIntrinsics` when the method is too large to scan. A wrong `CompileCommand`
   name produces no output and no error, which reads exactly like "did not vectorise".
7. **Measure with JMH, then apply Amdahl.** Compare against the theoretical ceiling
   (`vector width / element width`) and compute the fraction `p` of total time the component
   occupies before quoting any end-to-end number.

## Rules

- The Vector API is **incubating**, not stable — tenth round (JEP 508) in JDK 25, eleventh
  (JEP 529) in JDK 26, twelfth (JEP 537) in JDK 27, still in `jdk.incubator.vector` after
  twelve rounds. Any document, PR or architecture decision
  that adopts it must state that risk explicitly rather than cite a finalisation that has
  not happened.
- Finalisation depends on Project Valhalla, so no version can be promised. `Vector` is an
  ordinary Java object today; avoiding real allocation depends on inlining plus escape
  analysis and scalar replacement succeeding. Where C2 has not compiled the code, or escape
  analysis fails, the allocation cost is real.
- Do not conflate `jdk.incubator.vector` with the FFM API. `java.lang.foreign` (JEP 454) has
  been final since JDK 22 and needs no `--add-modules`. Common Panama origin, unrelated
  standardisation status.
- `--add-modules jdk.incubator.vector` must reach **both** `javac` and `java` — and every
  build, CI, test-JVM, JMH and `jlink` wrapper in between. Missing it at compile time gives
  "package jdk.incubator.vector is not visible"; missing it at run time gives "module not
  found" or `NoClassDefFoundError`.
- A species the CPU cannot support does not throw and does not log — it degrades to a scalar
  path. On a heterogeneous fleet, prefer `SPECIES_PREFERRED`; choose a fixed species only
  when determinism is the requirement (fixed binary layout, bit-exact comparison,
  reproducible tests), and then verify emission per node type.
- The masked signatures are `fromArray(species, array, offset, mask)` — four arguments — and
  `intoArray(array, offset, mask)` — three. No extra numeric parameter.
- Never measure SIMD with `System.nanoTime()` around a manual loop. No forks, no harness
  warm-up, and a discarded return value lets C2 remove the computation as dead code. Use
  JMH: a `@Benchmark` returning a value is consumed automatically; a `void` one needs
  `Blackhole.consume(...)`.
- Test tail handling with array lengths that are not multiples of the lane count, including
  lengths shorter than one full vector.
- Prefer `va.fma(vb, vc)` over `va.mul(vb).add(vc)`. The precision gain is a fact — one
  rounding instead of two. The throughput gain is not: it depends on available FMA execution
  ports and on the loop not being memory-bound.
- Quote "~2x from FMA" and "4-6x from SIMD" as microarchitecture-dependent estimates, never
  as constants. Where measured speedup falls short of the ceiling, the cause is memory
  boundedness, setup and tail cost, or instruction latency — identify which, do not invent a
  correction factor such as halving the lane count "for FMA overhead".
- Never extrapolate a component speedup to system throughput without measuring `p` and
  applying `T_new = T_total x [(1-p) + p/s]`.
- Treat AVX-512 downclocking as something to profile per fleet, not a general rule: on some
  Intel server microarchitectures (notably Skylake-X and Cascade Lake, mitigated from Ice
  Lake onward) sustained 512-bit work can reduce core frequency, so the 256-bit version can
  win end-to-end in mixed workloads.

## References

- [Vector API recipes](references/vector-api-recipes.md) — the canonical loop shapes
  (explicit tail, masked tail, reduction with FMA, conditional count), the flags for
  compiling, running and confirming emission, and the species-to-lanes table. Read when
  writing or reviewing vector code.
- [When to vectorise](references/when-to-vectorise.md) — the decision tree from hot loop to
  adoption, the SuperWord-versus-explicit comparison, why real speedup falls short of the
  ceiling, and the Amdahl calculation. Read before proposing or approving a rewrite.
