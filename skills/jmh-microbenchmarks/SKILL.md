---
name: jmh-microbenchmarks
description: >
  Designing and auditing JVM microbenchmarks whose workload, observation boundary,
  compiler context, state topology, lifecycle, units, and statistical comparison match the
  engineering question. Covers dead-code elimination, constant folding, Blackhole/return
  values, forks, warm-up, fixture levels, inputs, operations-per-invocation, allocation
  counters, experimental units, uncertainty, paired comparisons, negative controls, and
  production extrapolation. Use before trusting a JMH score or replacing a system test with
  a microbenchmark. Advanced concurrency layouts, profilers, assembly, and regression gates
  have separate owners.
---

# JMH microbenchmarks

## Purpose

Use JMH to estimate a narrowly defined cost under an explicitly generated JVM context. JMH
handles harness mechanics; it cannot decide whether the operation, data, compiler context, state
sharing, or statistical unit represents production. A precise answer to the wrong estimand is
still wrong.

Inspect the project's Java release/toolchain, JMH version, annotation processor and benchmark
packaging before supplying commands. The source contracts referenced here were checked against
JMH 1.37, not a required upgrade. Verify generated harness/benchmark discovery with the resolved
version; missing benchmarks or an IDE run are not evidence of a measured operation.

## Ownership boundary

- This skill owns the benchmark question, observable work, boundary, lifecycle, basic state, and
  result claim.
- `jmh-advanced` owns groups, profilers, counters, compiler controls, assembly capture, and
  difficult variance.
- `performance-regression-ci` owns automated gates and historical baselines.
- `jit-compilation` and `reading-jit-assembly` own compiler interpretation.
- `load-testing` owns arrival rate, queueing, saturation, and end-to-end latency.
- `performance-methodology` owns causal investigation and production validation.

## Benchmark contract

Write this before code:

```text
decision and smallest meaningful effect:
operation and semantic result:
included/excluded work:
input population and distribution:
state owner, sharing, mutation, and reset policy:
steady-state, cold, startup, or transition lifecycle:
mode, unit, threads, batch/operations semantics:
JDK/JMH/build/hardware/OS/JVM controls:
comparison design and experimental unit:
expected analytical scaling and negative/positive controls:
production fraction/denominator and external validation:
```

If changing the boundary or compiler context would reverse the decision, those are experimental
factors, not incidental details.

## Decide whether JMH is appropriate

| Question                                             | Use                                                            | Do not infer                                           |
| ---------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------ |
| Relative cost of two local implementations           | JMH with equivalent semantics/boundaries                       | service throughput or SLO impact directly              |
| Allocation produced by a hot operation               | JMH GC profiler plus compiler/escape-analysis context          | retained heap or GC-pause reduction                    |
| Shared in-process algorithm under controlled threads | JMH with representative sharing/topology                       | distributed or open-loop capacity                      |
| Cold invocation/startup                              | `SingleShotTime`, fork/process lifecycle, explicit cache state | steady-state cost                                      |
| Tail latency under arrival rate                      | load test/queueing experiment                                  | JMH sample percentiles as request latency              |
| Database/network/storage behavior                    | component/system benchmark with controlled dependency          | production behavior from a mocked/local microbenchmark |

Profile or model first when selecting the optimization target. Exploratory microbenchmarks are
legitimate, but label them as mechanism experiments rather than production impact estimates.

## Preserve semantic work

The compiler may fold inputs, inline through the benchmark, scalar-replace objects, remove unused
results, or specialize on a monomorphic profile. These can be the phenomenon under study or a
benchmark artifact.

- Return the semantic result or consume it with `Blackhole` when the caller must observe it.
- Create inputs through `@State`/`@Setup` when compile-time constants are not representative.
- `@Param` fixes values for a trial configuration; running several values separately does not
  model a mixed input/receiver distribution within one hot call site. Build a representative
  sequence when that mix matters, including predictable cycling/cache effects in the design.
- Vary inputs enough to model the decision, but do not add randomness inside the measured region
  unless random generation is part of the operation.
- Check generated/compiled code or profiler evidence when elimination/specialization could decide
  the result.
- Test a changed workload size or known-slower positive control. Expected scaling depends on the
  algorithm; doubling work need not double time.

Returning a value prevents some complete elimination; it does not guarantee the desired call
shape, allocation, type profile, or memory effects.

Returning a `Future` or submitting asynchronous work usually observes dispatch, not completion.
If completion is the operation, explicitly await and consume its result within the intended
boundary, bound outstanding work, and handle failures/cleanup. Waiting also changes concurrency:
use a system/load experiment for an arrival-rate or queueing claim.

## Boundary and fixture lifecycle

Separate fixture construction from the operation only when production also amortizes it. For each
comparison, list work inside each measured boundary; semantic equality alone does not imply equal
setup, conversion, validation, copying, exception, or cleanup cost.

| Level        | Use                                                 | Risk                                                                              |
| ------------ | --------------------------------------------------- | --------------------------------------------------------------------------------- |
| `Trial`      | state valid for a whole fork                        | drift/mutation can make later iterations different                                |
| `Iteration`  | reset between measurement/warm-up intervals         | cache/GC/reset effects can leak across boundary                                   |
| `Invocation` | long operations needing per-call fixture/think time | per-invocation timestamps, arbitration, overlap, and coordinated-omission caveats |

JMH attempts to exclude invocation fixture time; it does not make it free. The official
`Level.Invocation` contract warns that timestamping and synchronization can distort short or
concurrent benchmarks. Prefer precomputed immutable inputs, indexed pools, or iteration reset when
they preserve semantics; validate exhaustion and wraparound.

Do not subtract an independently measured empty benchmark as a universal correction. Harness and
payload interact. Use empty/no-op cases as diagnostics, or design a direct paired/differential
operation when the difference itself is the stated estimand and both paths share the same context.

## Forks, warm-up, and lifecycle

A fork is a fresh JVM and a useful replication unit; it does not reset host caches, thermals,
external dependencies or data. Randomized/blocked runs still need those shared factors tracked.
Iterations within
one fork share compilation, heap, OS, and thermal history. `@Fork(0)` runs in the harness JVM and
is useful for debugging only; it invalidates ordinary isolation assumptions.

Choose counts empirically:

1. Run enough warm-up to observe throughput/time, compilation, deoptimization, allocation, and GC
   reaching the declared lifecycle state.
2. Use multiple measurement iterations to expose within-fork drift.
3. Use enough forks to expose between-JVM compilation/environment variation and support the
   intended comparison power.
4. Inspect per-fork trajectories; do not hide bimodality in one mean/error field.

JMH defaults are starting points, not evidence that a benchmark is warm or adequately powered.
Pinning `-Xms = -Xmx`, pre-touching memory, fixing a collector, or forcing CPU policy can remove
real production mechanisms. Apply controls only when they match the estimand or deliberately
isolate a factor, and record them.

For cold/startup questions, discarded warm-up is often conceptually wrong. Define process, class,
code, filesystem, page-cache, CDS, data-cache, and dependency state and reset the required layer
between observations.

`SingleShotTime` times the benchmark invocation/batch, not JVM launch, harness initialization or
setup by default. Use an external launch-to-readiness measurement when process startup itself is
the outcome; a fresh fork alone does not include startup in the JMH score.

## Mode and units

| Mode             | Measures                                  | Principal caveat                                      |
| ---------------- | ----------------------------------------- | ----------------------------------------------------- |
| `AverageTime`    | average operation time under harness loop | not request latency under load                        |
| `Throughput`     | completed operations per time             | saturation/threads and batching define the population |
| `SampleTime`     | sampled invocation-duration distribution  | sampled closed-loop service time; may omit pauses     |
| `SingleShotTime` | one/batched invocation per iteration      | reset/cold-state definition dominates                 |

`@OperationsPerInvocation(N)` rescales the score; it does not stop hoisting, vectorization,
amortization, loop unrolling, or partial elimination. Declare whether one reported operation is one
element, one batch, or one transaction and verify the arithmetic with a known case.

## State and concurrency basics

- `Scope.Thread`: one state instance per worker; referenced objects, static fields or external
  resources may still be shared. Inspect the reachable mutable graph and aliases.
- `Scope.Benchmark`: one state shared by all benchmark workers.
- `Scope.Group`: state shared by a configured group; use with advanced asymmetric layouts.

Thread count is part of the workload, not a knob for improving confidence. A shared data-structure
benchmark must define read/write mix, key distribution, occupancy, contention topology, CPU
placement, correctness/invariants, and whether failed/retried operations count. Use
`jmh-advanced` and concurrency-specific tests for deeper designs.

## Read results without statistical shortcuts

For average-aggregated results, JMH 1.37's standard `Score Error` uses a hard-coded 99.9%
confidence level in `Result`, over the data supplied to its aggregation; other result policies
may report no error estimate. It is not a generic
proof of reproducibility, effect significance, or equivalence; iterations within a fork are not
fresh JVM experiments.

Never use these shortcuts:

- overlapping intervals => equal;
- non-overlapping intervals => production-relevant;
- error/score below a fixed percentage => valid;
- more iterations => independent replication;
- one faster aggregate => all forks/workloads faster.

For a comparison, preserve raw iteration and fork identity. Randomize or block execution order,
pair comparable baseline/candidate runs when defensible, examine drift/outliers without silently
deleting them, and use an interval for the effect (ratio/difference) against a predeclared practical
threshold. If the design cannot distinguish improvement, equivalence, regression, and instability,
report it as inconclusive. Follow `latency-statistics` and `performance-regression-ci`.

## Allocation and secondary results

Allocation profilers estimate a specific allocation metric (for example normalized bytes per
operation) in this compiled context. Treat `0 B/op`, nonzero TLAB activity, and profiler rounding
according to the profiler/version implementation. Escape analysis may remove an object here but
not at a non-inlined production caller. Allocation rate is not retained size, live set, native
memory, or pause time.

The profiler's observation window can include fixture/harness activity excluded from primary
operation timing. In particular, moving allocation into invocation setup need not remove it
from B/op. Check the secondary metric's actual counter window and normalization separately.

Use allocation as a high-signal regression dimension when it represents the outcome, but do not
call it universally deterministic or JMH's most reliable number. Validate with compiler evidence
and production allocation/GC behavior.

## From score to engineering decision

Estimate system impact only after establishing production exposure:

```text
work-normalized saving = calls per business operation * saving per call
capacity/latency impact = function of hot fraction, concurrency, queueing, GC, and new bottleneck
```

Amdahl's law can bound CPU speedup when its assumptions hold; it is not mandatory and does not
model allocation, queueing, tail latency, resource contention, or changed parallelism by itself.
Validate the change at the next realistic layer and explain divergence.

## Anti-patterns

| Anti-pattern                     | Symptom/detection                          | Better approach                                 | Sometimes acceptable                            |
| -------------------------------- | ------------------------------------------ | ----------------------------------------------- | ----------------------------------------------- |
| Hand-written `nanoTime` loop     | no fork/warm-up/generated harness controls | JMH or justified component harness              | coarse long-running external operation          |
| Discarded result                 | implausible scaling/empty assembly         | observe semantic output and inspect compilation | operation's real semantics are side effects     |
| One constant happy input         | folded/monomorphic/unrepresentative path   | parameterized representative input cohorts      | deliberately measuring that specialization      |
| `@Fork(0)` result published      | order/IDE/harness-JVM sensitivity          | isolated forks                                  | debugger-only diagnosis                         |
| Fixed “5% noise” validity rule   | result accepted/rejected by ratio alone    | effect/power/drift/fork analysis                | local triage heuristic, explicitly non-decisive |
| SampleTime p99 sold as SLO       | no arrival rate/queue/dependency           | open-loop/component/system load test            | isolated service-time mechanism question        |
| Independent baseline subtraction | negative/unstable adjusted cost            | direct boundary or paired differential design   | calibrated instrument with justified model      |

## Validation checklist

- [ ] The contract and practical effect threshold are written.
- [ ] Inputs, state sharing, reset, and result observation match the intended semantics.
- [ ] Positive/negative controls and analytical scaling behave as expected.
- [ ] Warm-up/measurement trajectories and compiler/GC activity support the lifecycle claim.
- [ ] Multiple forks expose between-JVM behavior; raw fork identity is retained.
- [ ] Comparison order, pairing/blocking, environment, versions, and flags are recorded.
- [ ] Score, unit, operation denominator, secondary metrics, uncertainty, and exclusions are clear.
- [ ] The claim is bounded to the benchmark context and validated at the next realistic layer.

## References

- [Validating a benchmark](references/validating-a-benchmark.md) — read when auditing boundaries,
  controls, comparison design or an implausible score, and before publishing a result.
- [OpenJDK JMH project and samples](https://github.com/openjdk/jmh)
- [JMH sample: dead-code elimination](https://github.com/openjdk/jmh/blob/master/jmh-samples/src/main/java/org/openjdk/jmh/samples/JMHSample_08_DeadCode.java)
- [JMH sample: constant folding](https://github.com/openjdk/jmh/blob/master/jmh-samples/src/main/java/org/openjdk/jmh/samples/JMHSample_10_ConstantFold.java)
- [JMH `Level.Invocation` API contract](https://javadoc.io/doc/org.openjdk.jmh/jmh-core/latest/org/openjdk/jmh/annotations/Level.html)
- [JMH 1.37 result statistics source](https://github.com/openjdk/jmh/blob/1.37/jmh-core/src/main/java/org/openjdk/jmh/results/Result.java)
