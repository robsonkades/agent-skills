# Pause layer decision table

Use this only after timestamps are on one clock and the safepoint `Total` has been reconstructed.
The table assigns the next investigation; no single signal proves root cause by itself.

| Observed shape                                                                       | Evidence that distinguishes it                                                                                                           | Likely owner                                                           | Next skill                                                                                                                           |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `At safepoint` dominates and the VM operation is a GC operation                      | Unified GC and safepoint events agree on start, duration, collector cause, and affected cycle                                            | Collector or allocation pressure                                       | **gc-log-analysis**, then the collector-specific skill                                                                               |
| `At safepoint` dominates and `jdk.ExecuteVMOperation` names a non-GC operation       | Same operation and interval recur; GC events do not cover the time                                                                       | VM subsystem named by the operation                                    | **safepoints** or the relevant class-loading/JIT skill                                                                               |
| `Reaching safepoint` dominates                                                       | `SafepointTimeout` identifies non-arrived threads; wall-clock samples over the same interval show their stacks                           | Thread failing to poll promptly, native transition, or host scheduling | **safepoints**, **jni-and-ffm**, or **linux-for-jvm**                                                                                |
| Safepoint log is clean but one application thread stalls                             | JFR/thread samples show deoptimisation, class loading, allocation stall, monitor wait, parking, or blocking I/O on that thread           | Execution, memory, concurrency, or I/O—not global STW                  | **deoptimization**, **jvm-class-loading**, **allocation-profiling**, **concurrency-diagnostics**, or **blocking-and-nonblocking-io** |
| Concurrent collector shows allocation stalls or degenerated/full cycles              | Collector events and allocation rate cover the latency interval even though ordinary concurrent work is not STW                          | Heap sizing, allocation rate, or collector headroom                    | **zgc-and-shenandoah**, **epsilon-and-shenandoah-internals**, or **jvm-gc-tuning**                                                   |
| Monitor or park time dominates                                                       | `jdk.JavaMonitorEnter` or `jdk.ThreadPark` identifies the contended object/stack; safepoint time does not cover the stall                | Application concurrency                                                | **concurrency-diagnostics** or **lock-inflation**                                                                                    |
| Virtual-thread work stops progressing                                                | Scheduler/virtual-thread events and carrier stacks distinguish pinning, carrier starvation, pool/permit waits, and downstream saturation | Scheduling or bounded dependency, not automatically pinning            | **virtual-threads-internals** and **thread-sizing-and-virtual-threads**                                                              |
| JVM clocks show a gap or all process activity is delayed without matching JVM events | cgroup throttling, run-queue delay, steal time, major faults, swap, suspend/resume, or host telemetry overlaps the interval              | OS, container, hypervisor, or node                                     | **linux-for-jvm**, **container-awareness**, or **cpu-cache-and-numa**                                                                |

## Decision sequence

1. Prove whether the interval is process-wide or limited to a request/thread. A high endpoint
   percentile is not evidence of stop-the-world behaviour.
2. If process-wide, compare application telemetry, safepoint `Total`, and OS scheduling on aligned
   timestamps. Treat clock drift and aggregation windows as competing explanations.
3. If `Total` covers the interval, split it into reaching, operation, and leaving time and identify
   the VM operation. If it does not, do not tune GC to explain the residual.
4. For a per-thread stall, use the event carrying the blocked thread and stack. Distinguish monitor
   contention, parking, I/O, allocation, class loading, compilation/deoptimisation, and deadline
   expiry before selecting an owner.
5. Validate remediation by re-running the same workload and showing that the attributed term moved
   without violating throughput, CPU, memory, or correctness constraints.

## Common false attributions

- A GC event overlaps latency, therefore GC caused all of it. Overlap is necessary, not sufficient.
- No safepoint events were parsed, therefore none occurred. First validate decorators, event names,
  thresholds, recording loss, and clock alignment.
- A parked virtual thread is pinned. Parking normally unmounts; inspect carrier stacks and the
  runtime/version-specific pinning events.
- CPU throttling is “JVM pause.” It can delay JVM progress without being a VM safepoint and needs an
  OS/container remediation.
- Lowering a safepoint poll interval is free. It may reduce time-to-safepoint while reducing
  optimisation opportunities or throughput; measure both sides.
