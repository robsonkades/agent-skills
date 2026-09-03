# Profilers and annotated assembly

JMH profiler names and availability are version/environment facts. Discover them from the pinned
benchmark artifact:

```bash
java -jar benchmarks.jar -lprof
java -jar benchmarks.jar -prof <name>:help
java -jar benchmarks.jar -h
```

Do not use `-prof list`; `-lprof` is the profiler-list option in current JMH.

## Question-to-profiler map

The exact names below are commonly present, but the runtime list is authoritative.

| Question                     | Candidate profiler/evidence         | Validate                                                          |
| ---------------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| allocation/GC per operation  | `gc`                                | counter meaning, TLAB/EA context, denominator, perturbation       |
| compilation during phases    | `comp`                              | profiled versus total window, per-fork compilation state          |
| coarse Java stacks           | `stack`                             | sampling bias/adequacy; not a full profiler replacement           |
| Linux PMU/process counters   | `perf`, `perfnorm`                  | support, multiplex, kernel policy, event scope, normalization     |
| sampled annotated code       | `perfasm` on supported Linux path   | perf access, symbols, code mapping, disassembler, sample coverage |
| Windows annotated code       | `xperfasm` when available           | ETW/WPT access and compatible disassembly                         |
| macOS annotated code         | `dtraceasm` when available          | DTrace policy/access and compatible disassembly                   |
| JFR chronology               | `jfr` when available                | settings, phase boundaries, artifact integrity                    |
| async-profiler stacks/events | `async` when integration is present | library/version, engine, output, access, adequacy                 |

Profiler output is a diagnostic secondary result. Run an unprofiled decision measurement unless
the profiler is part of the production condition or calibration proves the effect negligible for
the decision.

## Hardware counters

Before interpreting cycles, instructions, cache misses, or branches:

- confirm the PMU event is supported and not reported as unsupported;
- preserve time-enabled/time-running or equivalent multiplex coverage;
- establish process/thread/CPU/cgroup scope and user/kernel inclusion;
- state whether counters include warm-up, setup, harness, JVM service threads, and profiler work;
- normalize only by a denominator collected over the same population;
- account for migration, SMT, NUMA, frequency/throttling, and virtualization;
- avoid treating IPC, cache-miss rate, or branch misses as causal without a controlled hypothesis.

`perfnorm` does not make an unsuitable event meaningful merely by dividing it by operations.

## Annotated assembly pipeline

The useful mental model is:

```text
PMU/timer samples
  -> instruction pointer and event skid
  -> process/code-cache mapping
  -> nmethod/version/symbol resolution
  -> machine-code disassembly
  -> source/assembly region attribution
```

Failures at any stage can leave numeric benchmark results intact while annotation is incomplete.
Validate total samples, mapped/unknown share, hottest-region coverage, compilation level, multiple
compiled versions, and whether the desired method was inlined into another nmethod.

## Disassembler support

HotSpot diagnostic assembly paths may use an `hsdis` plugin or other support available in the
specific JDK distribution/version. Do not assume every JDK bundles a compatible binary or that a
library built for another JDK/architecture works. Discover effective JVM output and profiler
diagnostics.

OpenJDK maintains hsdis source and build instructions under `src/utils/hsdis`. If an organization
builds or distributes it:

- pin source revision, toolchain/binutils, target architecture, and artifact digest;
- follow the target JDK's library-loading convention;
- review supply-chain/licensing requirements;
- validate with a known compiled method and recognizable instructions;
- never copy an arbitrary binary into a production JDK during an incident.

Assembly interpretation belongs to `reading-jit-assembly`; a register name or `lock` prefix alone
is not a sufficient performance diagnosis.

## Async-profiler and JFR integration

The JMH integration version and async-profiler native library must be mutually compatible. A
profile can capture warm-up, measurement, or both depending on options/integration. Record phase
boundaries and do not compare a whole-fork profile to a measurement-only score as if populations
matched.

For async-profiler, validate event engine, CPU versus wall semantics, Java/native/kernel frame
coverage, stack mode, interval, lost events, unknown frames, and access policy. For JFR, validate
event settings/thresholds/periods, recording interval, count/opportunity, and file integrity.

Use `jfr-and-async-profiler`, `async-profiler-advanced`, and `jfr-advanced` for instrument-specific
decisions.

## Safe run protocol

```text
1. Run unprofiled pilot and retain raw fork trajectories.
2. Discover profiler and its version-specific help.
3. Run a short positive control; validate expected event/counter/frames.
4. Run one bounded diagnostic cell and inspect overhead, loss, coverage, output size.
5. Collect the minimum matrix that discriminates the mechanism.
6. Repeat unprofiled decision cells in randomized/blocked order.
7. Reconcile diagnostic mechanism with unprofiled effect.
```

Do not enable many profilers concurrently by default. When a transient requires simultaneous
capture, calibrate combined cost and preserve each instrument's population and timestamps.

## Failure tree

```text
profiler absent from -lprof
  -> JMH artifact/version lacks integration or prerequisite initialization failed
profiler listed but run fails
  -> target access, platform tool, native library, policy, output path, incompatible option
numeric score but no assembly
  -> no samples, missing mapping/symbol/disassembler, method inlined/not compiled, wrong event
mostly unknown/unmapped frames
  -> unwind/stack/symbol/JIT mapping mismatch; do not infer source hotspot
counters vary implausibly across forks
  -> multiplex/migration/scope/normalization/host variation or true compilation clusters
profile changes benchmark ranking
  -> interaction; use separate diagnostic and decision claims
```

## Artifact manifest

```yaml
jmh_version: ''
jdk_build: ''
profiler_name_and_options: ''
native_tool_version_digest: ''
os_kernel_hardware: ''
access_and_counter_scope: ''
benchmark_cell_fork_phase: ''
event_counter_and_denominator: ''
coverage_multiplex_loss_unknown: ''
output_digest: ''
unprofiled_comparison: ''
```

## Authoritative references

- [JMH profiler sample and `-lprof`](https://github.com/openjdk/jmh/blob/master/jmh-samples/src/main/java/org/openjdk/jmh/samples/JMHSample_35_Profilers.java)
- [JMH profiler implementations](https://github.com/openjdk/jmh/tree/master/jmh-core/src/main/java/org/openjdk/jmh/profile)
- [OpenJDK hsdis source and instructions](https://github.com/openjdk/jdk/tree/master/src/utils/hsdis)
- [Linux perf security](https://docs.kernel.org/admin-guide/perf-security.html)
- [Linux perf event ABI](https://docs.kernel.org/userspace-api/perf_ring_buffer.html)
- [async-profiler](https://github.com/async-profiler/async-profiler)
- [JDK Flight Recorder](https://docs.oracle.com/en/java/javase/25/jfapi/flight-recorder-runtime-guide/index.html)
