---
name: jmh-advanced
description: >
  Designing advanced JMH experiments: shared and asymmetric state topologies, groups,
  parameter matrices, auxiliary counters, fixture arbitration, fork/JVM controls, profilers,
  hardware counters, annotated assembly, compiler controls, cold-state protocols, and
  multi-modal variance diagnosis. Uses runtime capability discovery and separates diagnostic
  profiled runs from decision runs. Use when a benchmark is concurrent, fork-dependent,
  profiler-sensitive, cold/startup-oriented, or produces unexplained clusters. Basic benchmark
  validity, statistical gates, assembly interpretation, and load tests have separate owners.
---

# JMH advanced

## Purpose

Design experiments in which JVM compilation, state topology, fixture lifecycle, hardware, and
instrumentation are explicit factors. Advanced annotations do not create realism automatically;
they make it possible to represent and distinguish mechanisms.

## Ownership boundary

- `jmh-microbenchmarks` owns semantic validity, observable work, basic modes/forks, uncertainty,
  and production extrapolation.
- This skill owns groups/topologies, parameters, auxiliary counters, profilers, compiler controls,
  cold-state protocols, and difficult variance.
- `reading-jit-assembly` owns instruction-level interpretation.
- `performance-regression-ci` owns automation and baseline governance.
- `concurrency-testing` owns correctness and schedule exploration; JMH is not a linearizability
  proof.

## Advanced experiment contract

```text
hypothesis and competing mechanisms:
state ownership and sharing graph:
actor roles, ratios, threads, CPU/NUMA placement:
input/key/access distribution and mutation lifecycle:
success/failure/retry/drop counters and invariant oracle:
JVM/JDK/JMH factors and compiler context:
profiler/counter question, adequacy, overhead and control run:
cold/steady/transition cache and process state:
fork/block/randomization design and practical effect:
```

## State topology before annotations

| Production relationship                      | JMH shape                       | Common false conclusion                      |
| -------------------------------------------- | ------------------------------- | -------------------------------------------- |
| independent state per worker                 | `Scope.Thread`                  | using it for a shared map removes contention |
| one shared object                            | `Scope.Benchmark`               | throughput hides role fairness or failures   |
| repeated independent producer/consumer cells | `Scope.Group` + groups          | aggregate rate hides asymmetric starvation   |
| partitioned/sharded state                    | explicit shard mapping in state | random sharing measures a different topology |

Thread count is a workload factor. Sweep across meaningful concurrency and topology points rather
than publishing only the best saturation point. Record logical CPUs, SMT siblings, sockets/NUMA,
cpuset/quota, and whether worker placement changes between forks.

## Asymmetric groups

`@Group` and `@GroupThreads` model roles that share a `Scope.Group` instance. Define:

- actor ratio and whether it reflects arrivals or merely continuously looping workers;
- operation result and counters for success, miss, retry, full/empty, timeout, or failed CAS;
- initial occupancy and whether it drifts during an iteration;
- fairness/starvation per actor, not only total throughput;
- shutdown/progress behavior when one role stops or throws.

A `1 producer : 3 consumers` closed loop is not automatically a production 1:3 arrival ratio.
Backpressure and actor speed determine realized operations. Use `@AuxCounters` or returned results
to observe the realized mix.

## Parameters and experimental matrices

`@Param` expands combinations. Estimate run cost before launching:

```text
cells = product(parameter cardinalities) * benchmark methods * modes * JVM variants
approximate time = cells * forks * (warm-up + measurement + lifecycle overhead)
```

Avoid a full Cartesian product when impossible combinations, redundant dimensions, or insufficient
replication make it wasteful. Split experiments, generate a justified design, or use command-line
parameter subsets. Keep one primary factor per causal comparison when interactions are not the
question; use a factorial design when they are.

Input distributions need semantic names and reproducible generation. A fixed seed aids replay but
does not provide population diversity; use multiple predeclared seeds/data cohorts when input
variance matters and retain cohort identity.

## Fixture arbitration and mutable state

`Level.Trial`, `Iteration`, and `Invocation` describe lifecycle, not whether costs are harmless.
With shared state, helper invocation and teardown thread ownership can differ. `Level.Invocation`
requires per-invocation timing and may require synchronization on the critical path; official JMH
documentation also warns about overlap and coordinated omission.

For mutable structures, establish:

- reset point and whether reset is outside timing;
- cache/branch/type-profile/heap consequences of reset;
- data exhaustion, wraparound, ABA/version, and overflow behavior;
- invariant verification after an iteration/fork;
- whether reset creates an unrealistically pristine state.

Prebuilding a finite pool removes construction from the boundary but introduces reuse, cache
locality, index coordination, memory footprint, and exhaustion. Measure or vary those factors.

## Fork and JVM controls

Forks isolate JVM history and expose compilation/environment variation. Select counts from pilot
variance and decision power, not a universal number. Warm-up forks, iteration warm-up, and
measurement forks answer different lifecycle questions.

`@Fork`/CLI can select a JVM and append/prepend/replace arguments. Confirm the pinned JMH API and
effective command; do not invent attributes such as `jvmVersion`. Run candidate JDKs as explicit
blocks with otherwise controlled factors and retain vendor/build, flags, feature status, and
hardware.

Controls such as equal `-Xms/-Xmx`, `AlwaysPreTouch`, fixed collector, affinity, performance
governor, disabled turbo, or isolated host can reduce selected variability while changing the
phenomenon. Use two layers when necessary:

1. mechanism experiment under controlled conditions;
2. representative experiment with production ergonomics and variance.

## Profiler selection

Discover the pinned harness/environment:

```bash
java -jar benchmarks.jar -lprof
java -jar benchmarks.jar -prof <profiler>:help
```

Profiler names, options, prerequisites, and availability change. See
`references/profilers-and-hsdis.md`. Separate:

- **decision runs**: minimal necessary instrumentation;
- **diagnostic runs**: profiler enabled to explain the mechanism;
- **calibration runs**: same workload with/without profiler to quantify interaction.

A profiler can change compilation, scheduling, allocation, cache pressure, timing, or the winner.
Agreement is evidence; disagreement is a finding to reconcile.

## Counters and denominators

Use secondary results only after defining their collection boundary and denominator:

- normalized allocation may reflect compiled escape context, TLAB accounting, rounding, and
  operations-per-invocation;
- hardware counters may multiplex, lack PMU support, include/exclude kernel/harness activity, and
  suffer skid;
- `@AuxCounters` are application observations whose update cost and sharing can perturb the path;
- total throughput can improve while successes per operation fall.

Report coverage/multiplex ratio, raw and normalized units, unsupported counters, and whether the
counter population matches the timed operations.

## Annotated assembly and compiler controls

Assembly profilers require a compatible OS collection path plus enough code/symbol/disassembly
support. Annotation may be absent or partial while the numeric benchmark still succeeds. Validate:

- target compiled method/version and code-cache address mapping;
- sample coverage and unknown/unmapped share;
- compilation level, inlining, deoptimization, and multiple nmethods;
- hardware-counter event and sampling skid;
- architecture-specific disassembler/tool compatibility.

Use `@CompilerControl` only to answer a compiler-context hypothesis. Forcing or preventing
inlining changes optimization scope, escape analysis, vectorization, register pressure, and call
shape; it does not automatically make two variants fair. Preserve an unforced representative run.

## Cold and transition experiments

`SingleShotTime` does not define “cold.” Declare which layers reset between observations:

```text
fresh invocation / iteration / JVM / container / host
class initialization and compilation state
CDS and code/data/page cache
heap/allocator/GC state
connection/TLS/DNS/dependency state
CPU frequency and storage state
```

If reset cannot be proven, call the result first-use-under-specified-state rather than cold start.
Startup questions often require process-level orchestration and JFR from launch, with JMH used only
for the isolated mechanism.

## Variance diagnostic tree

```text
fork clusters
  -> compilation/deoptimization/type profile? inspect compilation/JFR/assembly
  -> host/core/NUMA/frequency/throttle? inspect OS placement/counters
  -> data/seed/state drift? compare cohort and invariant artifacts
  -> GC/heap lifecycle? compare allocation/occupancy/GC per fork

profiled and unprofiled winner differs
  -> profiler overhead/engine/compiler interaction? calibrate and separate claims
  -> inadequate samples/unknown symbols? validate coverage

thread sweep scales unexpectedly
  -> realized success/mix changed? auxiliary counters
  -> contention/coherence/false sharing? topology + counters/profile
  -> quota/SMT/NUMA placement changed? OS evidence
  -> correctness/progress failure? dedicated concurrency tests
```

Do not respond to unexplained variance by only lengthening iterations. More observations of a
confounded state improve precision around the wrong mixture.

## Anti-patterns

| Anti-pattern                          | Why dangerous                    | Better alternative                                    | Narrow exception                  |
| ------------------------------------- | -------------------------------- | ----------------------------------------------------- | --------------------------------- |
| `Scope.Thread` for shared structure   | removes coordination             | model ownership graph explicitly                      | per-thread production shard       |
| Fixed five-fork publishing rule       | ignores effect/power/runtime     | pilot, power, raw fork analysis                       | documented local convention       |
| Force fixed heap/pre-touch everywhere | removes real lifecycle effects   | declared mechanism and representative layers          | isolating a specific compute path |
| Trust profiler availability by name   | initialization/coverage can fail | `-lprof`, help, positive control, artifact validation | none                              |
| Add every profiler at once            | interaction and attribution      | one discriminating profiler or calibrated combination | transient that cannot be replayed |
| Force inlining to “fairness”          | changes optimization context     | measure representative and forced hypotheses          | compiler mechanism experiment     |
| JMH percentiles as service SLO        | closed-loop isolated population  | load/system test                                      | isolated invocation distribution  |

## Definition of done

- [ ] State topology, actor mix, success counters, mutation, and invariants are explicit.
- [ ] Parameter matrix is feasible and interaction/seed strategy justified.
- [ ] Lifecycle/reset and environmental controls match the estimand.
- [ ] Fork/block/randomization and practical effect design are documented.
- [ ] Profiler/counter support, adequacy, overhead, and artifact integrity are validated.
- [ ] Diagnostic and decision runs are separated or combined with calibrated justification.
- [ ] Clusters, drift, and profiler sensitivity are explained, not averaged away.
- [ ] The claim is bounded and handed to the correct production/load/concurrency validation.

## References

- [Configuration recipes and variance diagnosis](references/configuration-recipes.md)
- [Profilers and annotated assembly](references/profilers-and-hsdis.md)
- [OpenJDK JMH project](https://github.com/openjdk/jmh)
- [JMH profiler sample](https://github.com/openjdk/jmh/blob/master/jmh-samples/src/main/java/org/openjdk/jmh/samples/JMHSample_35_Profilers.java)
- [JMH asymmetric benchmark sample](https://github.com/openjdk/jmh/blob/master/jmh-samples/src/main/java/org/openjdk/jmh/samples/JMHSample_15_Asymmetric.java)
- [JMH `Level` API warnings](https://javadoc.io/doc/org.openjdk.jmh/jmh-core/latest/org/openjdk/jmh/annotations/Level.html)
