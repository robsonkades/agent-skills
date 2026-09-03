# Interpretation and correlation

## Evidence envelope

Every result should carry:

```text
collector/script source digest and parameters
kernel/release/config, architecture, bpftrace/libbpf versions
probe type/name and discovered format/ABI
target membership rule and PID/cgroup lifecycle
clock, UTC start/end, host/node/pod/process start identity
event opportunities where knowable; entered/paired/unmatched/lost/evicted counts
histogram count/sum/unit and stack-symbol coverage
overhead trial and privilege used
```

Without coverage and loss, an empty histogram means “no retained observations,” not “the
event never happened.”

## PID/TID/cgroup semantics

Linux uses:

| Concept                 | Kernel task field | User-facing meaning |
| ----------------------- | ----------------- | ------------------- |
| `pid` in `task_struct`  | per-task ID       | thread ID (TID)     |
| `tgid` in `task_struct` | thread-group ID   | process ID (PID)    |

bpftrace builtins and tracepoint fields are separate APIs. For a current-task probe, builtin
`pid` may represent the process and `tid` the thread. A scheduler tracepoint's `prev_pid`,
`next_pid`, or wakeup `pid` names subject TIDs encoded by that tracepoint. A raw tracepoint may
have different arguments. Always use `-lv`/tracefs format and the matching documentation.

PID/TID values can be reused. Add process start identity, cgroup generation, or a bounded
collection window/cleanup strategy when stale map entries could cross lifetimes.

Cgroup scoping avoids chasing dynamic threads but introduces its own semantics: which cgroup
hierarchy/version, whether the subject task can be queried at that hook, task migration, pod
sidecars, and cgroup-ID reuse. Verify membership against `/proc/<tid>/cgroup`/runtime metadata
during the capture.

## Time semantics

`bpf_ktime_get_ns`/bpftrace `nsecs` generally use a monotonic kernel clock; JFR and application
events expose timestamps through their own mapping. Align with start/end markers captured in
both systems and retain clock metadata. Wall-clock/NTP steps should not change monotonic
durations but can shift displayed UTC alignment.

Do not sum independently observed durations unless their interval boundaries define disjoint
parts of the same operation. Usually they overlap or nest:

```text
application request duration
  contains user work, queues, syscalls, scheduling, remote waits
one read syscall duration
  contains kernel work and possible blocking/scheduling
block request duration
  may overlap the syscall, occur asynchronously, or belong to writeback
run-queue sample
  may occur inside any of the above
```

Use temporal co-occurrence to generate hypotheses; use identifiers/state machines or a causal
experiment to claim attribution.

## Interpreting common signals

| Signal                       | Supports                                         | Does not establish                          | Corroborate                                                         |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------- |
| Futex wait syscall tail      | kernel futex wait behavior for selected commands | Java lock identity or full lock wait        | JFR monitor/park events, async-profiler lock stacks, owner evidence |
| Wakeup→schedule delay        | selected runnable task waited before executing   | why it waited; all requeue paths            | cgroup quota/PSI, host run queue, affinity, preemption-aware tool   |
| Cgroup throttled time/events | CPU controller enforced quota in interval        | user impact or which code demanded CPU      | CPU profiles, runnable demand, latency/throughput                   |
| Block request latency        | device/block-layer request lifetime              | submitting JVM/request or file-read latency | filesystem/cgroup I/O, device stats, JFR file events, workload      |
| Major fault                  | fault needed I/O                                 | heap swap                                   | fault address/VMA/file, memory pressure and reclaim evidence        |
| Context switches             | scheduling transitions                           | harmful contention or right pool size       | voluntary/involuntary reason, state, CPU/wait profiles              |
| TCP retransmit/drop          | network stack event                              | remote service root cause                   | socket tuple/cgroup ownership, packet/host/remote telemetry         |
| USDT hit                     | target JVM emitted that semantic probe           | complete event population or low overhead   | flag/config, expected control count, lost-event metrics             |
| Kernel stack sample          | sampled kernel path                              | time exclusively caused by leaf function    | sample total, event semantics, off-CPU/application outcome          |

Never attach universal remediation thresholds such as “run queue >5 ms means resize” or “futex

> 1 ms means a lock bug.” Compare with SLO, workload, CPU quota, service time, and baseline for
> that system.

## Scheduler reasoning

Distinguish:

- host CPU saturation/competition;
- cgroup quota throttling;
- affinity/cpuset constraints or imbalance;
- priority/scheduling-policy effects;
- stop-the-world or JVM-coordinated suspension;
- blocked threads incorrectly classified as runnable by the chosen observation;
- virtual-thread carrier availability versus logical task pinning/parking.

Evidence chain:

```text
latency window
  -> target runnable demand and run-queue distribution
  -> cgroup cpu.stat/pressure deltas and cpuset/quota
  -> per-CPU utilization/run queue and migrations
  -> target CPU stacks and JFR safepoint/GC/task evidence
  -> controlled quota/affinity/load change
```

A change that reduces queue delay but also reduces offered work or increases errors is not a
capacity fix.

## I/O reasoning

Separate layers:

```text
application queue/serialization
  -> Java/JFR operation
  -> libc/JNI/syscall
  -> VFS/filesystem/page cache
  -> block scheduler/device
  -> remote/network storage if present
```

Choose probes around the suspected boundary. For buffered reads, a cache hit may never reach
block I/O. For dirty writes, completion can happen after the application returns. For direct or
async I/O, submission/completion occurs through different tasks and identifiers. For sockets,
block-I/O tracepoints are irrelevant.

Do not recommend direct I/O or `io_uring` from a block/JFR duration mismatch. First quantify
copy/cache/syscall/device/queue costs and evaluate correctness, buffering, batching, and
operational complexity under `blocking-and-nonblocking-io` or `io-uring-and-zero-copy`.

## Memory-fault reasoning

Fault classification needs:

- minor versus major and success/error;
- address→VMA at the relevant time;
- anonymous/file/shared mapping and file identity;
- cgroup memory current/max/events/pressure;
- reclaim, swap, page-cache, NUMA migration where relevant;
- JVM heap/metaspace/code cache/native map context.

Major faults can reflect normal demand paging of mapped binaries after startup, cold page
cache, or memory pressure. A rising count alone does not identify the heap or justify changing
`-Xmx`.

## Stack evidence

Report:

```text
event that selected the stack
sample/event weight and total
user/kernel/native/JIT frame coverage
unresolved/truncated/lost fraction
unwind method and flags
symbol/JIT map source, timestamp, build IDs
virtual-thread/carrier limitation
```

Sampling bias differs by event. A CPU-stack percentage cannot be compared numerically with a
wall or futex-stack percentage. A stack tells where the sampled thread was, not necessarily
the owner of the resource or request that caused another thread to wait.

## Empty-output decision tree

```text
no output
  -> program failed to compile/load/attach? inspect stderr/verifier/audit
  -> probe exists in this kernel/binary? list and inspect format/notes
  -> target membership matches subject fields/namespaces? verify live
  -> positive control emits this exact event/command/path? run it
  -> runtime flag enables the semantic probe? verify effective flags
  -> filters/constants/ABI decode correct? count before filtering
  -> maps/buffers/rate limits losing data? inspect counters
  -> event really absent within a bounded, sufficiently long window? report that scope
```

Add progressively: first count all probe hits briefly in an authorized test, then target scope,
then command/state predicates, then aggregation. This identifies which condition empties the
population.

## Plausible-but-wrong decision tree

```text
histogram looks plausible
  -> entries approximately equal exits/paired + unmatched?
  -> key supports concurrent/nested lifecycle?
  -> map high-water/eviction/loss acceptable?
  -> target includes dynamic threads and excludes non-targets?
  -> units/clock and bucket count/sum consistent?
  -> tracepoint subject attribution correct at both ends?
  -> positive/negative controls produce expected directional change?
```

Synthetic validation should include two processes with distinguishable behavior. Otherwise a
host-wide result can accidentally look like the target.

## Security review

Before production collection:

- enumerate exact BPF program/map types, helpers, tracepoints/functions, filesystem and perf
  access required;
- run under a controlled collector identity rather than arbitrary application-supplied code;
- bound stack/string data and prevent arguments/payloads/secrets from export;
- restrict node/tenant scope and query access;
- sign scripts/objects and log who activated them, where, why, and for how long;
- test detach/cleanup and confirm no pinned program/map/link remains;
- restore sysctl/capability/seccomp/host changes and verify the previous state.

`CAP_BPF` is not harmless: combined with other rights and helpers, BPF can observe sensitive
host activity. Kernel lockdown and LSM policy may intentionally deny a technically possible
probe.

## Report template

```text
Question:
Scope and population:
Probe/schema/tool/kernel:
Window and workload:
Counts: entered / paired / unmatched / lost / evicted:
Distribution and units:
Stack/symbol coverage:
Correlated JVM/cgroup/application evidence:
Interpretation:
Alternative explanations:
Overhead and privileges:
Next discriminating experiment:
```

## Authoritative references

- [Linux scheduler tracepoints source](https://github.com/torvalds/linux/blob/master/include/trace/events/sched.h) — inspect the running kernel tag/config.
- [Linux block tracepoints source](https://github.com/torvalds/linux/blob/master/include/trace/events/block.h)
- [Linux futex UAPI](https://github.com/torvalds/linux/blob/master/include/uapi/linux/futex.h)
- [Cgroup v2 CPU controller](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [PSI documentation](https://docs.kernel.org/accounting/psi.html)
- [BPF security and verifier](https://docs.kernel.org/bpf/verifier.html)
