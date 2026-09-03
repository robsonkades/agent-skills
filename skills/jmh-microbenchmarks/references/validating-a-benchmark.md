# Validating a benchmark

Validation is an argument that the harness measured the intended population and can distinguish
the decision-relevant effect. It is not a checklist of universal fork counts or error percentages.

## Semantic oracle and boundary

Before timing, test results/invariants against a trusted implementation, cover relevant boundary
and failure cases, and prove baseline/candidate implement the same contract. A fast wrong
implementation is not a performance result.

Create a boundary ledger:

| Work item             | Production frequency/owner | Baseline | Candidate | Measured/excluded reason |
| --------------------- | -------------------------- | -------- | --------- | ------------------------ |
| input construction    |                            |          |           |                          |
| conversion/validation |                            |          |           |                          |
| core operation        |                            |          |           |                          |
| allocation/copy       |                            |          |           |                          |
| result consumption    |                            |          |           |                          |
| cleanup/reset         |                            |          |           |                          |

If an excluded cost changes between variants or is not amortized in production, redesign the
boundary. Setup outside timing still affects cache, heap, type profile, and contention state.

## Anti-optimization controls

Use several discriminating controls; none is sufficient alone:

1. Return/consume the semantic result and mutate inputs as production does.
2. Compare generated machine code or compilation logs when folding/elimination/inlining matters.
3. Change problem size and compare with expected complexity, including fixed-cost regions.
4. Insert a known extra operation whose effect should be visible.
5. Run an empty/no-op diagnostic to identify clock/harness floor, without blindly subtracting it.
6. Confirm secondary counters move consistently with the hypothesis.

Unexpected controls invalidate the current explanation, not automatically the harness.

## Lifecycle evidence

Preserve verbose/raw output per fork and inspect:

```text
warm-up and measurement score trajectory
compilation/deoptimization during each phase
GC/allocation/heap occupancy and pauses
CPU frequency/throttling/steal and competing work
fork order, process start, temperature and host changes
```

Plateau-looking throughput alone does not prove stable compiled state. Compilation in measurement
may also be intentional for a lifecycle benchmark; state which lifecycle is being estimated.

## Comparison design

Define the experimental unit before analysis. Usually a fresh fork/process run is closer to an
independent unit than an iteration inside one fork. Decide whether baseline and candidate are run
in randomized blocks, paired within a controlled block, distributed across workers with worker as
a factor, or compared as an explicit factorial JDK/hardware experiment.

Avoid “all baseline, then all candidate” when drift can alias with the change. Preserve failed and
timed-out runs; declare exclusion rules before observing scores.

Report:

```text
ratio or difference per fork/block
practical regression/improvement/equivalence thresholds
interval/model and assumptions
independent units versus within-unit iterations
raw distribution, drift, bimodality, and exclusions
```

JMH's displayed error describes its aggregation; it does not replace experimental design.
Interval overlap is not an equivalence test. Equivalence needs predeclared margins and a suitable
test or interval.

## Environment and provenance

Record at minimum:

```yaml
benchmark_source_commit: ''
artifact_digest: ''
jmh_version: ''
jdk_vendor_version_build: ''
jvm_args: []
mode_unit_threads_operations_per_invocation: ''
warmup_measurement_forks: ''
params_and_input_generation: ''
host_cpu_topology_memory_os_kernel: ''
container_cgroup_cpuset_limits: ''
power_frequency_turbo_smt_numa_controls: ''
profilers_and_agents: []
run_order_and_randomization: ''
raw_result_artifact: ''
```

Container quota/cpuset, NUMA placement, security mitigations, JDK build, and profiler can all
change the result. “Same instance type” is insufficient provenance.

## Diagnostic trees

### Implausibly fast or flat across input sizes

```text
result unobserved / input constant / work hoisted / loop partly eliminated
  -> return/consume, vary state, inspect compilation, add positive work control
wrong operations-per-invocation denominator
  -> compare raw batch time and annotation arithmetic
timer/harness floor dominates
  -> enlarge legitimate work batch and test scaling without changing semantics
```

### Forks form separate clusters

```text
different compilation/type profiles/deoptimization
  -> compilation/JFR/assembly evidence per fork
host placement/frequency/NUMA/noisy neighbor
  -> OS counters and controlled blocks
GC/heap lifecycle differs
  -> allocation/GC/occupancy evidence
unordered workload or mutable fixture drift
  -> seed/order/state audit
```

Do not average clusters away before explaining them.

### Allocation metric surprises

```text
zero/near zero
  -> escape/scalar replacement, rounding, denominator, profiler support
larger than expected
  -> boxing, copies, exception/logging, fixture leakage, compiler path
time improves but allocation worsens
  -> decide using CPU/GC/live-set/production impact; neither metric dominates universally
```

### Profiler changes the winner

```text
profiler overhead interacts with variant
  -> unprofiled decision run plus separate diagnostic run
different compilation or event engine
  -> compare compilation/environment and profiler configuration
insufficient samples or symbol quality
  -> adequacy/loss/unknown-frame validation
```

## Publishing claim

```text
Under [JDK/JMH/hardware/OS/JVM flags], for [input/state/thread topology] and boundary
[included work], candidate changed [metric/unit] by [effect interval] versus baseline across
[independent units/blocks]. The practical threshold was [threshold]. Controls [list] behaved as
expected. This supports [narrow decision], not [load/queueing/GC/retention/etc.]. Next-layer
validation [result or pending].
```

For automation, hand raw results, provenance, experimental-unit identity, thresholds,
inconclusive behavior, retry budget, and baseline governance to `performance-regression-ci`.

## Authoritative references

- [OpenJDK JMH repository](https://github.com/openjdk/jmh)
- [JMH samples](https://github.com/openjdk/jmh/tree/master/jmh-samples/src/main/java/org/openjdk/jmh/samples)
- [JMH annotation APIs](https://javadoc.io/doc/org.openjdk.jmh/jmh-core/latest/org/openjdk/jmh/annotations/package-summary.html)
- [JMH `Level` warnings](https://javadoc.io/doc/org.openjdk.jmh/jmh-core/latest/org/openjdk/jmh/annotations/Level.html)
- [JMH statistics implementation](https://github.com/openjdk/jmh/tree/master/jmh-core/src/main/java/org/openjdk/jmh/util)
