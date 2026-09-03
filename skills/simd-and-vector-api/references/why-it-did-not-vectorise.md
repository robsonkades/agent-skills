# Why it did not vectorise, and how to prove it

The implementation details below use OpenJDK 25 C2 as a baseline. Flag classes, defaults,
reason strings and accepted loop shapes are not APIs; verify them on the deployed vendor,
release, architecture and compiler. Do not turn a diagnostic flag into a production fix.

## Start with three different failures

| Failure             | Question                                       | Typical evidence                                               | Response                                                            |
| ------------------- | ---------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| Legality            | Would lanes change Java-visible semantics?     | dependence/alias graph, exceptions, FP/reduction contract      | preserve order or deliberately change algorithm/contract            |
| Recognition/support | Can this C2 build form and lower vector nodes? | inlining/compile log, debug trace if available, final assembly | simplify shape or use an explicit supported operation               |
| Profitability       | Would SIMD win for this workload/target?       | emitted code plus JMH sizes/data and profile/counters          | keep scalar, threshold-dispatch, or tune algorithm—not global flags |

`-XX:-UseSuperWord` or a profitability override can help classify an experiment, but timings
alone do not prove generated code. A memory-bound vector loop may be unchanged when disabled;
a flag may also alter unrolling or unrelated compilations. Assembly correlated to the actual
compile id is the direct evidence.

## Common C2 loop-shape diagnoses

| Source shape                                 | Likely constraint in the JDK 25 baseline                   | Better next step                                                            |
| -------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| simple contiguous `c[i] = a[i] + b[i]`       | usually a counted, packable loop                           | inspect output; explicit API may add no value                               |
| variable stride or opaque trip count         | counted-loop/induction recognition                         | isolate a constant-stride inner loop if semantics allow                     |
| `a[i + 1] = f(a[i])`                         | true loop-carried dependence                               | keep scalar or use a proven scan/recurrent algorithm                        |
| `c[i + 1] = f(a[i])` with possible `a == c`  | unresolved runtime alias dependence                        | enforce/document non-overlap or use a safe multiversioned path              |
| branch, surviving range check, throwing call | control/exception edges prevent packs                      | hoist/normalize only if exception timing and semantics remain valid         |
| `Math.addExact`                              | per-lane overflow must throw with scalar ordering          | do not replace by wrapping vector add; design explicit overflow masks/order |
| indexed gather/scatter                       | non-contiguous addresses plus per-lane bounds/aliasing     | Vector API prototype; expect ISA- and cache-dependent lowering              |
| integer reduction only                       | profitability and reduction support vary                   | inspect current JDK; explicit reduction only after workload measurement     |
| floating reduction                           | Java evaluation order and rounding constrain reassociation | define accuracy/reproducibility contract before lane-wise accumulation      |
| large loop body or non-inlined call          | unroll/graph-size and unsupported-node limits              | reduce hot kernel or improve inlining; do not raise internal limits blindly |
| byte/short arithmetic                        | subword widening/narrowing and supported packs             | inspect lane width and conversions, not just one vector opcode              |

JDK releases increasingly add runtime checks, multiversioning and cost models. Therefore a
specific “never vectorises” statement must carry a JDK tag or source revision. Re-test after
upgrades: new vectorisation can improve throughput, change floating-point results where the
program allowed reassociation, or expose a hardware-specific regression.

## Evidence on a product JVM

| Technique                              | What it can establish                                      | What it cannot establish                                         |
| -------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------- |
| scoped `PrintAssembly` / JMH `perfasm` | actual packed ops, widths, masks, branches and hot PCs     | why an earlier compiler phase refused another shape              |
| `PrintIntrinsics`                      | an intrinsic candidate was accepted/rejected at that point | that final code is one optimal ISA instruction or hot            |
| JMH A/B with `-XX:-UseSuperWord`       | performance sensitivity to that pass in this fork          | absence/presence of SIMD, or production value by itself          |
| width/ISA cap A/B                      | sensitivity to a changed code-generation policy            | a portable preferred width                                       |
| `perfnorm`/hardware counters           | instruction/event deltas on a supported host               | causal attribution without assembly/profile and adequate samples |
| fastdebug vector trace/Ideal graph     | rejection reason and compiler graph                        | product-build performance equivalence                            |

For a product capture:

1. Confirm method descriptor, compiler (`c2`), normal versus OSR body and compile id.
2. Decode the main loop and tails. A `v` prefix or `xmm` register alone is not SIMD proof;
   identify a packed lane operation and width.
3. Check calls, uncommon traps, range/alias guards and slow paths.
4. Correlate samples with the same nmethod; code-cache reuse/deoptimization can invalidate
   address mapping.
5. Compare scalar and vector implementations over input sizes, tails and data distributions.

Without hsdis, the abstract disassembler preserves structure, bytes and some annotations but
does not decode lane opcodes. That capture can diagnose compile matching and runtime calls;
it cannot support a “no vector instructions” conclusion.

## Diagnostic flags are hypotheses, not configuration advice

The tested OpenJDK 25 family exposes flags such as `UseSuperWord`, `MaxVectorSize`, `UseAVX`,
`UseFMA`, `UseVectorCmov`, `SuperWordReductions`, unroll limits and diagnostic profitability
controls. Their classes/defaults and even existence vary. Use `PrintFlagsFinal` and
`CompileCommand=help` on the exact JDK.

- Disabling `UseSuperWord` asks whether that pass matters; intrinsics, library stubs and
  explicit Vector API code may still emit SIMD.
- Capping `MaxVectorSize`/`UseAVX` changes eligibility and sometimes unrelated stubs. It
  neither forces the cap's width nor isolates one loop perfectly.
- Profitability overrides can distinguish a heuristic refusal from a legal/support refusal
  on builds that provide them. A forced result may be slower and must not become a fleet flag.
- `UseFMA=false` does not authorize changing fused semantics; inspect the resulting fallback
  and numerical behavior.
- CMove/vector-predication flags affect broad compiler policy. Prefer explicit source masks
  only after confirming semantic equivalence and measured benefit.

Detailed `TraceAutoVectorization`, `TraceSuperWord`, `PrintIdeal` or related views are often
non-product/develop facilities. Reproduce with a matching fastdebug build, then confirm final
machine code and performance on the product build.

## Vector API intrinsic failures

Version-specific `PrintIntrinsics` diagnostics may report missing constants, unsupported
operation/type/length, uninitialized classes or failed unboxing. Interpret them as follows:

- Keep species/operators in forms C2 can see as constants—commonly `static final` species as
  recommended by the API docs—and ensure the caller/intrinsic path inlines.
- “Unsupported” means this operation/species was not intrinsified under current flags and
  target. The Java API contract still governs whether execution falls back, runs slowly or
  throws; test rather than assuming silent scalar behavior.
- One accepted load intrinsic does not prove the complete kernel stays in registers. Check
  every expensive operation, conversions, masks, shuffles, gather/scatter and stores.
- Real vector objects/boxing in allocation profiles indicate failed intrinsic/inlining or
  escape, but absence of allocation is not proof of optimal SIMD.

## Fleet and runtime behavior

`SPECIES_PREFERRED` is selected per process and chooses a shape supported across lane types.
For one element type, `VectorSpecies.ofLargestShape(type)` may choose a larger shape. A fixed
species is an abstract shape, not a promise of hardware width or deterministic performance.

Build the support matrix from actual fleet classes:

| Dimension       | Record/validate                                                           |
| --------------- | ------------------------------------------------------------------------- |
| x86/Arm ISA     | CPU model/features, JDK ergonomics, emitted width and operations          |
| containers/VMs  | exposed CPU flags, migration policy and performance-counter access        |
| mixed nodes     | preferred species, crossover sizes and service SLO on each class          |
| native segments | lifetime, bounds, byte order, alignment and slice offsets                 |
| upgrades        | compilation diff, numerical differential tests and performance regression |

Wide fixed species can fall back to expensive non-intrinsic code or fail on some platforms,
as the official API warns. AVX-512 may also affect frequency on particular Intel generations;
treat that as a measured fleet property, not a universal reason to cap width.

## Troubleshooting flow

```text
No speedup
  ↓ verify correctness and that the benchmark hits the intended method/compile id
No packed operations
  ↓ classify legality vs recognition vs support using guards/logs/debug build
Packed operations present
  ↓ inspect hot PCs, tails, calls, masks, gather/scatter and vector width
Instruction count falls but time does not
  ↓ test memory bandwidth/cache misses/dependencies/frequency and realistic concurrency
One host wins, another loses
  ↓ split by CPU/JDK/species; choose portable species or explicit dispatch/rollback
```

## Primary references

- [JEP 508: Vector API (Tenth Incubator)](https://openjdk.org/jeps/508)
- [JDK 25 Vector package](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.incubator.vector/jdk/incubator/vector/package-summary.html)
- [JDK 25 VectorSpecies](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.incubator.vector/jdk/incubator/vector/VectorSpecies.html)
- [OpenJDK SuperWord source](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/opto/superword.cpp)
- [OpenJDK vectorization source](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/opto/vectorization.cpp)
- [JDK-8302652: unordered reduction improvements](https://bugs.openjdk.org/browse/JDK-8302652)
- [JDK-8334431: store-to-load forwarding failure detection](https://bugs.openjdk.org/browse/JDK-8334431)
- [JDK-8340093: SuperWord cost-model work](https://bugs.openjdk.org/browse/JDK-8340093)
