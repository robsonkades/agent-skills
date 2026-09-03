# Deciding whether to vectorise

## Decision tree

```text
Production profile proves a material hot kernel
└── Are vector and scalar semantics explicitly compatible?
    ├── no → keep scalar, or change the contract deliberately first
    └── yes → inspect current C2 output and constraints
        ├── already good SIMD → prototype explicit code only for a named remaining gap
        └── absent or poor SIMD → legality, recognition, or profitability?
            ├── true dependence or required order → redesign algorithm or keep scalar
            ├── compiler-shape limitation → simplify scalar shape or prototype Vector API
            └── unprofitable for current sizes/hardware → keep scalar or dispatch by threshold
                └── validate every fleet class and end-to-end impact before adoption
```

Existing SIMD is not an automatic veto, and absent SIMD is not automatic approval. Explicit
code can expose masks, gathers or a reduction unavailable to the current auto-vectoriser, but
it also adds an incubating API, tail paths and a new semantic surface. Name the gap and keep
the scalar implementation as oracle.

## Legality, recognition, and profitability

SuperWord is C2's SLP-style auto-vectorisation pass, normally enabled by
`-XX:+UseSuperWord`. Its accepted graph shapes and cost model change across JDK releases.
Separate three questions:

| Question                              | Examples                                                                   | Evidence                                      |
| ------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------- |
| Is reordering legal?                  | true loop-carried dependence, alias overlap, exceptions, strict FP order   | contract, tests, compiler dependency analysis |
| Can this compiler recognize/lower it? | counted-loop form, calls/control flow, gather/scatter, unsupported op/type | C2 log/debug build when available, assembly   |
| Is it profitable here?                | trip count, tail, memory bandwidth, dependency chain, ISA lowering         | JMH across sizes/data plus profile/counters   |

Counted loops, analyzable induction, legal memory dependencies and packable operations are
common SuperWord prerequisites, not a stable public contract. Simple contiguous arithmetic
often succeeds. Control flow that cannot become selects, opaque calls, unresolved aliasing,
non-contiguous access and ordered reductions are common blockers or version-sensitive cases.

A true recurrence such as `a[i] = f(a[i - 1])` prevents independent lane execution in that
form. A scan/prefix algorithm can expose parallelism without changing big-O complexity, but
it changes implementation, work/dependency structure and often floating-point grouping.
Evaluate that algorithmic trade-off instead of declaring all recurrences impossible.

## SuperWord versus explicit Vector API

| Criterion          | SuperWord                     | Vector API                                            |
| ------------------ | ----------------------------- | ----------------------------------------------------- |
| Source effort      | ordinary scalar loop          | species, vector operations, masks and tail            |
| Cross-JDK behavior | heuristic/output may change   | intent persists; incubating API/lowering can change   |
| Gather/scatter     | limited and version-sensitive | API operations exist; hardware lowering may be costly |
| Predication        | pattern/version-sensitive     | explicit mask; lowering remains target-dependent      |
| Reduction order    | constrained by Java semantics | programmer chooses grouping and accepts its semantics |
| Deployment         | no incubator module           | module flag, JDK pinning, upgrade work                |

Prefer the scalar loop when it already meets the SLO, inputs are short, readability dominates,
or the kernel is not material. Prototype explicit vectors when a measured hot kernel has a
specific unsupported shape and the team can own semantic and release risks.

## Lane count is not a speedup model

`vector width / element width` gives nominal lanes per vector value: eight 32-bit floats or
four 64-bit doubles in 256 bits. It is neither a theoretical speedup ceiling nor a forecast.
Scalar code can exploit instruction-level parallelism or already be vectorised; one vector
operation may lower to several instructions; memory and reductions may dominate.

Common limits:

1. **Memory bandwidth and cache misses.** SIMD can reduce loop/control overhead or improve
   request generation, but gains flatten when data movement dominates.
2. **Setup, guards and tails.** These matter more for short inputs, yet constants can hoist
   and native masked tails can outperform scalar tails. Measure the crossover.
3. **Dependencies and execution resources.** Horizontal reductions, shuffles, gathers and
   long dependency chains can cap throughput below nominal lane parallelism.
4. **Frequency and mixed workloads.** Wide instructions can alter frequency or contention on
   some CPUs. Measure service-level CPU/tails, not a kernel in isolation.

Do not invent a correction factor. Use address-correlated samples, supported counters and
before/after workload measurements to identify the actual limit.

## Amdahl before promising a number

```text
T_new = T_total × [(1 - p) + p / s]
```

Here `p` is the measured fraction of elapsed work attributable to the component and `s` is
its measured speedup under the same load. A 4× gain on 9% of elapsed time reduces total time
by about 7%, assuming other costs and queueing do not change. In concurrent services, also
measure saturation, tail latency and resource bottleneck migration; Amdahl is a bound, not a
capacity model.

## Incubation history

| JEP | Round    | JDK                            |
| --- | -------- | ------------------------------ |
| 338 | first    | 16                             |
| 414 | second   | 17                             |
| 417 | third    | 18                             |
| 426 | fourth   | 19                             |
| 438 | fifth    | 20                             |
| 448 | sixth    | 21                             |
| 460 | seventh  | 22                             |
| 469 | eighth   | 23                             |
| 489 | ninth    | 24                             |
| 508 | tenth    | 25                             |
| 529 | eleventh | 26                             |
| 537 | twelfth  | 27, targeted as of August 2026 |

JEP 508 is the baseline reference for JDK 25. For later releases, read the matching JEP and
the actual distribution's module docs. Do not describe a targeted release as deployed GA.
The JEPs tie finalization to future Valhalla work but promise no final version or date.

## Adoption gate

Adopt explicit Vector API code only when all are true:

- a production-shaped profile shows material CPU time in the kernel;
- scalar/vector semantics, including FP/reduction behavior, are specified;
- generated code and benchmarks improve relevant sizes on every supported CPU/JDK class;
- the service-level gain survives bandwidth, contention and tail-latency tests;
- the team accepts incubator-module packaging and migration on JDK upgrades;
- a readable scalar oracle, differential tests, observability and rollback path remain.

Avoid global diagnostic flags as a production fix, fixed species chosen from a developer
laptop, one-size/one-distribution benchmarks, or ISA claims inferred only from API calls.

## Primary references

- [JEP 508: Vector API (Tenth Incubator)](https://openjdk.org/jeps/508)
- [JEP 529: Vector API (Eleventh Incubator)](https://openjdk.org/jeps/529)
- [JEP 537: Vector API (Twelfth Incubator)](https://openjdk.org/jeps/537)
- [JDK 25 VectorSpecies](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.incubator.vector/jdk/incubator/vector/VectorSpecies.html)
- [SuperWord source](https://github.com/openjdk/jdk/blob/master/src/hotspot/share/opto/superword.cpp)
- [Larsen and Amarasinghe, Exploiting Superword Level Parallelism](https://groups.csail.mit.edu/cag/slp/SLP-PLDI-2000.pdf)
