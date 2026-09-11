# Measuring CAS contention

Use this evidence path when contention or a performance claim needs investigation. Reuse
matching profiles/counters first and select measurements that distinguish the unresolved
cause; an API-semantics review does not require new instrumentation or topology sweeps.

## Hypothesis chain

```text
useful throughput/tail regressed
  -> CPU is spent in the operation's retry/RMW/spin path
  -> failures/attempts per success grow with competing writers/hot keys
  -> coherence/topology evidence is compatible
  -> reducing sharing/retries improves the same outcome without correctness/fairness regression
```

Each arrow needs evidence. Cache misses alone do not identify CAS contention; a CAS instruction in
assembly alone does not prove it is hot.

## Instrumentation

In a diagnostic build or algorithm counters, collect:

```text
attempts, mismatches and spurious failures if distinguishable
successful useful operations and semantic failures
retries histogram/max per operation
helping/backoff/spin/yield/park counts and duration
key/shard/cell distribution without high-cardinality labels
deadline cancellation and operations continuing afterward
```

Counters can perturb contention. Use per-thread/striped diagnostic counters, sample when necessary,
and calibrate with/without instrumentation.

## Profiles and counters

- CPU profile: localize retry/spin/RMW and distinguish GC/JIT/native/application work.
- Annotated assembly: confirm compiled hot path and atomic instruction, accounting for inlining and
  multiple nmethods.
- PMU/perf: cycles/instructions/cache/coherence events where supported; validate multiplexing,
  event meaning, privilege, skid, process/thread/CPU scope and architecture.
- OS topology: core/socket/NUMA/SMT placement, migration, quota/throttle and frequency.
- Allocation/GC: failed speculative object creation can dominate before CAS itself.

There is no portable one-counter test for false sharing or CAS. HITM/snoop/coherence events are
microarchitecture/tool-specific. Treat them as supporting evidence and validate with a controlled
layout/ownership change.

## Benchmark design

For a performance comparison, vary the dimensions relevant to the proposed mechanism and
target deployment:

- 1 through saturation and overload thread counts;
- same-core/SMT/core/socket/NUMA placement where relevant;
- hot single key versus realistic skew/shards;
- read/write/update mix and payload work;
- low/high allocation and object reuse;
- lock/library/striped/batched alternatives.

Report useful success rate, retries/success, CPU/success, latency/tail, starvation distribution,
allocation/GC, power if material, and memory footprint. Preserve raw forks/topology. A throughput
gain with unchanged retries can be valid for another mechanism; do not claim CAS contention was
fixed without the mechanism result.

## Remediation decision

| Evidence                                                              | Candidate                       | Trade-off                               |
| --------------------------------------------------------------------- | ------------------------------- | --------------------------------------- |
| exact single value, modest contention                                 | atomic or lock                  | linearizable simplicity                 |
| exact multi-field invariant                                           | lock or immutable CAS aggregate | lock waiting versus allocation/retry    |
| cumulative telemetry, non-atomic live reads or exact quiescent totals | `LongAdder`/per-owner combine   | live snapshot/reset races, memory       |
| hot-key skew                                                          | partition/shard/batch/owner     | ordering and load balance               |
| short expected ownership delay                                        | bounded spin then backoff/park  | CPU/power versus wake latency           |
| stalled owner makes lock unacceptable                                 | proven lock-free/helping        | proof/reclamation/starvation complexity |

`LongAdder` is not statistical sampling: after writers stop and their updates are properly
observed, its sum is accurate subject to `long` overflow. That does not provide an atomic
check-and-update for concurrent admission. See [striped counters](lock-free-structures.md#striped-counters)
for reset/observation conditions.

## Failure tests

Select cases that challenge the changed protocol and claimed lifecycle/progress assumptions:

- actor paused after reading and before CAS;
- actor paused after publication but before housekeeping/help;
- maximum contention/hot key and one starved participant;
- interrupt/cancel/shutdown during retry;
- version wrap and pooled-node reuse;
- OOME/exception while deriving candidate;
- false-sharing/layout and cross-socket placement;
- long-running memory retention/reclamation.

## Authoritative references

- [OpenJDK JMH](https://github.com/openjdk/jmh)
- [async-profiler](https://github.com/async-profiler/async-profiler)
- [Linux perf security](https://docs.kernel.org/admin-guide/perf-security.html)
- [OpenJDK jcstress](https://github.com/openjdk/jcstress)
