---
name: simd-and-vector-api
description: >
  Vectorisation on the JVM: C2 SuperWord auto-vectorisation and the loop shapes that defeat
  it, the incubating Vector API (species, lanes, masks, loop bound and tail handling),
  proving that vector instructions were actually emitted, and portability and non-intrinsic
  fallback risks. Use when someone proposes rewriting a hot loop with jdk.incubator.vector,
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
nothing: a loop C2 already vectorised, a kernel bounded by memory or dependencies, or a
fixed species/op that lowers poorly on part of the fleet. Explicit vector source expresses
intent; it does not guarantee one instruction, a width, or a speedup.

The second failure is arithmetic, not technical: a measured 4x on a component that occupies
9% of total time is roughly a 7% end-to-end gain, not 4x. Amdahl's law applies before any
throughput number is promised.

## Workflow

1. **Prove the loop matters.** Profile the production-shaped workload and identify the hot
   kernel, input-size distribution, data layout and semantic constraints. Do not vectorise a
   merely conspicuous loop.
2. **Check whether C2 already vectorised it.** Capture the scalar loop with
   `-XX:+UnlockDiagnosticVMOptions -XX:+PrintAssembly -XX:CompileCommand=print,*Class.method`
   and identify packed lane operations in the actual loop, not just `v` prefixes or vector
   registers. Existing SIMD lowers the expected upside, but explicit code may still merit an
   experiment for unsupported operations or cross-version predictability.
3. **Name the constraint.** Separate legality (dependencies, exception/order semantics,
   aliasing) from profitability (trip count, setup/tail, memory bandwidth, instruction mix)
   and compiler recognition. A flag-forced result is a diagnostic, not a deployment fix.
4. **Preserve semantics deliberately.** Integer overflow, floating-point reassociation/FMA,
   NaN and signed zero, masked inactive lanes, bounds exceptions, overlap and reduction order
   can differ from an apparently equivalent scalar rewrite. Define tolerances and tests first.
5. **Choose species from the portability contract.** Prefer `SPECIES_PREFERRED` for
   shape-agnostic algorithms; consider `ofLargestShape` only for one lane type and fixed
   species only when a protocol/algorithm requires it. Benchmark every supported node class.
6. **Write a canonical bounded loop** — `loopBound`, the vector loop, then a scalar or
   masked tail. See `references/vector-api-recipes.md` for the shapes and the exact masked
   signatures.
7. **Prove lowering and measure crossover.** Use assembly for emitted instructions;
   `PrintIntrinsics` is supporting evidence that an intrinsic path was accepted, not proof of
   a particular ISA sequence. Benchmark scalar and vector implementations across real sizes,
   tails, data distributions, JDKs and CPUs, then validate the service with Amdahl/queueing.

## Rules

- The Vector API is **incubating**, not stable—tenth round (JEP 508) in JDK 25, eleventh
  (JEP 529) in JDK 26, and JEP 537 targets a twelfth round in JDK 27. Until the target release
  is GA in the deployed distribution, describe it as targeted rather than available. Any ADR
  that adopts it must state that risk explicitly rather than cite a finalisation that has
  not happened.
- Finalisation depends on Project Valhalla, so no version can be promised. Vector values are
  reference-typed API objects today, but C2 intrinsics model supported vector values as
  whole machine values specifically to avoid ordinary boxing/allocation limitations. Failed
  intrinsification/inlining can expose Java fallback work and allocations; confirm with
  compilation and allocation evidence rather than inferring cost from source syntax.
- Do not conflate `jdk.incubator.vector` with the FFM API. `java.lang.foreign` (JEP 454) has
  been final since JDK 22 and needs no `--add-modules`. Common Panama origin, unrelated
  standardisation status.
- `--add-modules jdk.incubator.vector` must reach **both** `javac` and `java` — and every
  build, CI, test-JVM, JMH and `jlink` wrapper in between. Missing it at compile time gives
  "package jdk.incubator.vector is not visible"; missing it at run time gives "module not
  found" or `NoClassDefFoundError`.
- The API does not promise that an arbitrary fixed shape/op lowers to hardware SIMD. Official
  docs warn that choosing unsupported shapes may run slowly or fail. Prefer
  `SPECIES_PREFERRED` for portable shape-invariant algorithms and test both behavior and
  lowering on every supported architecture; never make fallback mode part of an SLO assumption.
- The masked signatures are `fromArray(species, array, offset, mask)` — four arguments — and
  `intoArray(array, offset, mask)` — three. No extra numeric parameter.
- Never measure SIMD with `System.nanoTime()` around a manual loop. No forks, no harness
  warm-up, and a discarded return value lets C2 remove the computation as dead code. Use
  JMH: a `@Benchmark` returning a value is consumed automatically; a `void` one needs
  `Blackhole.consume(...)`.
- Test tail handling with array lengths that are not multiples of the lane count, including
  lengths shorter than one full vector.
- Use `fma` when single-rounding fused semantics are desired; do not substitute it for
  `mul().add()` when bitwise compatibility or the scalar operation order is the contract.
  Throughput depends on lowering, execution ports, dependencies and memory behavior.
- Lane count is nominal data parallelism, not a speedup ceiling or forecast. Scalar baselines
  may already unroll/vectorise, SIMD may reduce instruction count without moving a
  bandwidth-bound workload, and one vector operation can lower to multiple instructions.
- Never extrapolate a component speedup to system throughput without measuring `p` and
  applying `T_new = T_total x [(1-p) + p/s]`.
- Treat wide-vector frequency effects as something to profile per fleet, not a general rule.
  They vary by CPU generation, instruction mix, active cores and power policy; a narrower
  implementation can win in mixed workloads even when a wider kernel wins in isolation.
- Keep a scalar/reference implementation for semantic differential tests and a supported
  operational fallback. Test zero/short lengths, every tail size, overlapping inputs where
  allowed, extremes, NaN/infinities/signed zero, integer overflow and misaligned segments.
- Incubator adoption is a release-engineering decision: pin the JDK line, compile/test with
  the matching module, include it in `jlink`, assess API migration on every JDK upgrade, and
  canary by CPU architecture before broad rollout.

## References

- [Vector API recipes](references/vector-api-recipes.md) — the canonical loop shapes
  (explicit tail, masked tail, reduction with FMA, conditional count), the flags for
  compiling, running and confirming emission, and the species-to-lanes table. Read when
  writing or reviewing vector code.
- [When to vectorise](references/when-to-vectorise.md) — the decision tree from hot loop to
  adoption, the SuperWord-versus-explicit comparison, why lane count is not a speedup model,
  and the Amdahl calculation. Read before proposing or approving a rewrite.
- [Why it did not vectorise](references/why-it-did-not-vectorise.md) — product-build evidence,
  legality versus profitability, diagnostic flags and version-scoped C2 examples. Read when
  a loop does not lower as expected or regresses after a JDK/CPU change.
