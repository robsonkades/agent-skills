# Deciding whether to vectorise

## Decision tree

```
Hot-path loop, candidate for SIMD
└── Does PrintAssembly already show vmovdqu / vaddps / vpaddd on ymm/zmm?
    ├── yes → Do not rewrite. SuperWord already did it.
    └── no  → Why did it fail?
        ├── Sequential dependence between iterations
        │     → The Vector API does not help. Restructure the algorithm
        │       (prefix sum) only if the gain justifies the complexity.
        └── A pattern SuperWord structurally does not cover
            └── Is N much larger than SPECIES.length()?
                ├── no  → Setup cost dominates. Do not vectorise.
                └── yes → Real candidate. Measure with JMH before and after.
                    └── Does the component gain move the pipeline?
                        ├── small fraction of total time → modest end-to-end
                        │     gain; optimise a different bottleneck instead
                        └── relevant fraction → adopt, documenting the
                              incubating-API risk
```

## Where SuperWord succeeds and where it stops

SuperWord is C2's auto-vectorisation pass (Larsen & Amarasinghe, adapted to HotSpot),
enabled by default via `-XX:+UseSuperWord`. It works on **countable** loops — bound known at
compile time or provable by range check, simple induction variable.

Succeeds with:

- a simple bound (`for (int i = 0; i < n; i++)`) and no branches in the body;
- contiguous array access with resolvable aliasing;
- an iteration body independent of the previous iteration;
- simple associative reductions (sum, product) — increasingly well supported, but not
  guaranteed for every reduction pattern.

Stops at:

- complex control flow inside the loop — `if`/`switch` in the body, even where the pattern
  could in principle become a `select`/`blend`;
- non-associative floating-point reductions where operation order is semantically
  significant. `float`/`double` arithmetic is not associative, so C2 may not reorder without
  changing the observable result;
- non-contiguous access — gather (read from scattered indices) and scatter (write to
  scattered indices), historically out of reach;
- aliasing it can neither prove nor refute cheaply — C2 prefers not to vectorise over
  emitting excessive runtime range checks.

## SuperWord versus explicit Vector API

| Criterion                             | SuperWord (automatic)                | Vector API (explicit)               |
| ------------------------------------- | ------------------------------------ | ----------------------------------- |
| Code effort                           | Zero — the ordinary scalar loop      | Rewrite: species, load/store, tail  |
| Guarantee across JDK versions         | None — the heuristic may change      | High — intent is in the source      |
| Gather/scatter                        | Not supported                        | Supported                           |
| Condition-masked operations           | No                                   | Yes (`VectorMask`, `blend`)         |
| Controlled non-associative reductions | Does not vectorise (order preserved) | Explicitly under programmer control |
| Depends on an incubating module       | No                                   | Yes                                 |

The table implies an order of operations, not a preference: confirm with `PrintAssembly`
first, rewrite only when the answer is no **and** the reason is a pattern SuperWord
structurally does not cover.

## Why real speedup falls below the ceiling

The theoretical ceiling is pure arithmetic: `vector width in bits / element width in bits`.
A 256-bit register over 32-bit `float` gives 8x; over 64-bit `double`, 4x.

Three independent reasons keep the measured number below it:

1. **Memory-bound loops gain nothing from more ALU.** A simple dot product is limited by the
   memory bandwidth feeding the loads and stores, not by arithmetic capacity. Processing 8
   elements per instruction does not help when the bottleneck is fetching them.
2. **Setup and tail handling.** Resolving the species, building masks and processing the
   residual elements is time the theoretical model does not contain — proportionally larger
   the shorter the array.
3. **Pipeline and instruction latency.** SIMD instructions have latency as well as
   throughput; a loop with sequential dependence cannot fill the pipeline the way the model
   assumes.

Do not invent a correction factor. Halving the lane count "to compensate for FMA overhead"
is a specific, recurring error: FMA does not reduce lane parallelism, it reduces the number
of _instructions_ per combined operation, which normally helps. If the measured speedup is
below the ceiling, identify which of (1), (2) or (3) applies — measure, do not estimate.

## Amdahl before promising a number

```
T_new = T_total x [(1 - p) + p / s]
```

where `p` is the fraction of total time the component occupies and `s` its measured speedup.
A 4x gain on a component that is 9% of total time yields roughly 7% end to end. Measure `p`
— do not assume it — before quoting a system throughput figure.

## Incubation history

| JEP | Round           | JDK               |
| --- | --------------- | ----------------- |
| 338 | 1st (Incubator) | 16                |
| 414 | 2nd             | 17                |
| 417 | 3rd             | 18                |
| 426 | 4th             | 19                |
| 438 | 5th             | 20                |
| 448 | 6th             | 21 (previous LTS) |
| 460 | 7th             | 22                |
| 469 | 8th             | 23                |
| 489 | 9th             | 24                |
| 508 | **10th**        | **25 (baseline)** |
| 529 | 11th            | 26                |
| 537 | 12th            | 27                |

JEP 508 is the canonical reference for the API's state at the JDK 25 baseline, including
the official text on the Valhalla dependency for finalisation; on a later JDK read the
round matching it (JEP 529 for 26, JEP 537 for 27), which restate the same dependency. No finalisation date or round has
been announced; any "GA in version X" claim is speculation. Note that JEP 480 is _Structured
Concurrency (Third Preview)_ and is sometimes miscited here — it is unrelated.
