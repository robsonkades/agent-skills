# Sampling engines, events, and access

## Engine semantics

Do not reduce engine choice to “works/does not work.” The selection mechanism determines the
population and weight of observations.

| Mechanism                                        | Selects                                                      | Useful for                                           | Costs and omissions                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Linux perf-events CPU                            | thread after configured CPU/event count                      | on-CPU Java/native/kernel attribution; PMU events    | perf access, per-thread resources, PMU/skid/multiplexing, kernel-symbol policy       |
| Per-thread CPU timer (`ctimer`, where supported) | CPU time consumed by each thread                             | on-CPU attribution without perf-event access         | no perf kernel call chain; timer/platform resolution; signal overhead                |
| Process CPU timer (`itimer`)                     | process CPU timer expiration delivered to an eligible thread | fallback/portable compatibility                      | uneven thread selection; no perf kernel chain; timer resolution                      |
| Wall-clock                                       | eligible thread set on elapsed-time schedule                 | running plus off-CPU residency                       | volume/overhead scales with thread population; sampled state is not causal wait time |
| JVMTI/JVM allocation event                       | sampled allocation activity                                  | allocation sites/estimated volume                    | sampling/threshold semantics; does not establish retention                           |
| Lock event                                       | thresholded/sampled contended waits                          | monitor/park contention supported by release         | omits uncontended cost and non-lock queues                                           |
| Instrumentation/hooking                          | selected calls/allocations                                   | exact selected call count/latency or native lifetime | perturbation scales with event frequency; semantic coverage depends on hooks         |

All stack-sampling modes aim to avoid classic safepoint-only observation, but that does not
make them unbiased. Signal coalescing, unsafe points, unwinder failure, eligibility, timer
resolution, skid, event thresholds, rate limiting, lost events, and thread-state transitions
still shape the sample.

## Proving the engine

For every recording retain:

```text
asprof version and package checksum
target JVM version/build and PID namespace
`asprof list <pid>` output
exact start/stop command and profiler log
requested event and interval/threshold
reported status/metrics
output event classes, counts, weights, lost/dropped indicators
```

A generic `cpu` request can map/fall back differently by release and platform. If the precise
engine is part of the experiment, request it explicitly where the pinned version permits and
fail or label the recording when unavailable. Kernel-frame absence alone is not definitive:
user-only mode and symbol restrictions can produce the same appearance.

## CPU, wall, and wait interpretation

CPU sampling probability is approximately proportional to CPU/event consumption, so idle
threads contribute little or nothing. Wall sampling visits eligible threads by elapsed time,
so a large idle pool can dominate counts. A wall stack at `park` means the thread resided
there when sampled; it does not say whether the cause was healthy idleness, a saturated
connection pool, rate limiting, or downstream delay.

Thread grouping and filtering are distinct:

- `--threads` retains/group-labels thread identity in supported non-JFR outputs;
- JFR output carries event thread metadata under its own schema;
- `--filter` restricts collection to supported thread IDs/modes;
- include/exclude frame filters change retained output, not necessarily collection overhead.

Validate behavior on the pinned release, especially for batched wall events and virtual
threads. An application thread name can be reused; keep thread ID, lifecycle, state, and
request/task context when correlation matters.

## Linux perf access: independent layers

`perf_event_open` can fail at several layers. The exact order and errno depend on kernel,
container runtime, LSM, and profile, so inspect the deployed configuration rather than using
a universal container table.

| Layer                     | Inspect                                                                   | Engineering choice                                                                |
| ------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Kernel/PMU support        | kernel logs, virtualization PMU exposure, a minimal `perf`/profiler probe | enable PMU or use supported software/timer event                                  |
| `perf_event_paranoid`     | host `/proc/sys/kernel/perf_event_paranoid`; distro kernel docs           | user-only event, lower policy, or privileged helper according to threat model     |
| Capabilities              | actual effective/bounding/ambient sets                                    | narrow `CAP_PERFMON` where kernel/runtime support it; avoid broad `CAP_SYS_ADMIN` |
| Seccomp/LSM               | effective seccomp profile, audit/AppArmor/SELinux logs                    | allow the exact syscall/access or choose another engine                           |
| Limits/resources          | file-descriptor and locked-memory limits, thread count                    | raise scoped limit, reduce population, or use timer engine                        |
| PID/filesystem namespaces | target visibility and shared `/tmp`/library/output paths                  | align namespaces or use approved host/sidecar/startup route                       |
| Symbols                   | kernel restrictions, build IDs, debug packages, map files                 | collect matching symbols or explicitly report unresolved frames                   |

`--all-user` excludes kernel events/call-chain contribution where supported; it is a
fidelity/security trade, not a capability. An fd-transfer helper moves privileged descriptor
creation outside the target, but the helper itself is a privileged component with socket,
namespace, lifecycle, and authorization obligations.

Never change a host-wide sysctl merely to obtain one profile without evaluating all tenants.
Document the previous value and rollback if a policy exception is approved.

## Dynamic attach

Attach failures and perf failures are orthogonal. Diagnose:

1. Is the target PID visible in the profiler's namespace?
2. Do profiler and target see the same attach rendezvous filesystem (commonly `/tmp`)?
3. Is HotSpot attach enabled and responsive on this runtime?
4. Are credentials accepted by the OS/HotSpot attach implementation?
5. Can the target process—not merely the `asprof` client—read and load the library and write
   the output path?
6. Do container policies permit the signals, socket, ptrace-like observation, and filesystem
   access involved in this deployment?

Do not send diagnostic signals blindly: JVM signal use, process supervisors, and application
handlers can differ. Prefer official `asprof` diagnostics and the target runtime's attach
documentation.

## Native and kernel stacks

Native stack quality depends on every frame in the chain. Frame-pointer walking is fast but
breaks when any relevant binary omits/repurposes frame pointers. Unwind metadata may be more
complete but costlier and has platform/tool support constraints. VM-aware walkers understand
HotSpot transitions but are coupled to exported VM metadata and tested JVM layouts.

Keep these separate:

- **collection:** was the instruction pointer/call chain captured?
- **unwinding:** could frames be reconstructed?
- **symbolization:** could addresses be mapped to names/lines?
- **semantic attribution:** does that stack represent application ownership?

Unknown names are not zero cost, and symbols do not prove causality. Store module maps,
build IDs, container image digest, debug-symbol source, and ASLR-relevant metadata with the
recording where offline symbolization is required.

## PMU events

Hardware counter names and meanings are microarchitecture-specific. Generic events can map
imperfectly; virtualized and heterogeneous cores complicate interpretation. Counter overflow
samples have skid, and simultaneous events may be multiplexed when physical counters are
insufficient. Scaling corrects counts for time enabled/running but does not restore lost
temporal precision or remove variance.

Protocol:

1. identify CPU model/topology and event encoding;
2. state whether the metric is sampled location or counted rate;
3. record time-enabled/time-running or equivalent multiplexing evidence;
4. collect cycles/instructions/context when interpreting misses or branches;
5. repeat on pinned cores/host class when the claim depends on hardware;
6. corroborate with end-to-end throughput/latency and a causal experiment.

“This method has many cache-miss samples” is not the same as “optimizing it reduces cache
miss rate or latency.”

## Java allocation, live objects, native memory, and locks

- Allocation mode attributes creation; it does not identify retained dominators. Sampling
  intervals and TLAB/outside-TLAB mechanisms affect coverage.
- Live allocation filtering at recording end is window- and GC-dependent. Surviving a short
  recording does not prove a leak; dying before the end does not prove harmlessness.
- Native-memory hooks cover the allocator APIs/interposition paths the profiler implements.
  Custom arenas, direct syscalls, device memory, other processes, and ownership transfers may
  be absent.
- Lock thresholds weight supported contended waits, not all latency. Queueing before a lock,
  I/O, condition protocols, and scheduler delay require other evidence.

## Version-sensitive checks

Before adopting a command from this repository, check the pinned tag's release notes and
help for:

- supported platforms/architectures and JDKs;
- default and available stack walkers (`dwarf` may be an alias in newer releases);
- virtual-thread reconstruction limitations;
- event-combination syntax and `--all` behavior;
- batching, rate-limit categories, memory/chunk limits;
- converter package/options and OTLP/JFR schema behavior;
- removed commands and renamed options.

## Authoritative references

- [async-profiler README](https://github.com/async-profiler/async-profiler/blob/master/README.md)
- [Profiler options](https://github.com/async-profiler/async-profiler/blob/master/docs/ProfilerOptions.md)
- [Release changelog](https://github.com/async-profiler/async-profiler/blob/master/CHANGELOG.md)
- [Linux kernel perf security](https://docs.kernel.org/admin-guide/perf-security.html)
- [`perf_event_open(2)`](https://man7.org/linux/man-pages/man2/perf_event_open.2.html) — Linux
  man-pages project documentation for event attributes, permissions, and errors.
