---
name: ebpf-for-jvm
description: >
  Using eBPF/bpftrace to measure kernel-visible behavior around a JVM without inventing
  attribution: selecting stable tracepoints versus kprobes/uprobes/USDT, scoping by
  process/thread/cgroup, tracking syscall/futex/scheduler/block-I/O lifecycles, managing BPF
  map loss and cardinality, resolving native and time-varying JIT code, and correlating—not
  summing—kernel, JFR, profile, and application evidence. Use when scheduler delay, kernel
  I/O, faults, networking, or cross-process interference may explain JVM symptoms, or when a
  BPF script is empty/plausible-but-wrong. Does not own ordinary host diagnosis
  (linux-for-jvm), JVM-local profiling (jfr-and-async-profiler), or continuous profile
  operations (continuous-profiling).
---

# eBPF for JVM

## Purpose

Use kernel instrumentation to answer a narrowly defined question about events visible at the
kernel boundary, while preserving scope, lifecycle, loss, and attribution. A BPF program can
load, run, and print a plausible histogram while measuring the wrong task, pairing unrelated
events, losing state, or observing a different layer than the JVM duration being compared.

eBPF complements JVM evidence; it is not only a last resort. For transient incidents, align a
bounded kernel capture with JFR, profiles, workload markers, cgroup metrics, and application
telemetry when the combined cost is safe. The layers have different clocks, boundaries, and
selection rules, so correlate them on a timeline and never add durations by default.

## Ownership boundary

This Category C skill owns measurement design, probe selection, scoping, correctness, loss,
and evidence correlation. `linux-for-jvm`, `tcp-tuning`, `cpu-cache-and-numa`, and
`io-uring-and-zero-copy` own the underlying OS/hardware mechanisms and remedies.

## Observation contract

Before writing a program, declare:

```text
hypothesis and decision:
kernel event/lifecycle being observed:
target scope: process, thread set, cgroup, pod, device, socket, or host:
start/end keys and cleanup events:
value/units and histogram aggregation:
expected event rate, map entries, stack bytes, and output rate:
kernel/tool/runtime versions and probe ABI:
loss, eviction, PID reuse, restart, and clock behavior:
corroborating JVM/application signal:
privilege, duration, stop and rollback plan:
```

If the script cannot describe which population contributes to numerator and denominator, it
is exploratory—not a quantitative production result.

## Choose the least fragile probe

| Probe            | Strength                                                      | Main compatibility risk                                     |
| ---------------- | ------------------------------------------------------------- | ----------------------------------------------------------- |
| Tracepoint       | kernel-defined trace event and format discoverable in tracefs | fields/availability can still vary by kernel/configuration  |
| Raw tracepoint   | lower-level/stable attachment point with raw arguments        | manual decoding and kernel semantic coupling                |
| fentry/fexit     | typed BTF-enabled kernel function entry/exit                  | BTF, function availability/inlining, kernel version         |
| kprobe/kretprobe | broad kernel function access                                  | internal ABI and optimized/inlined function instability     |
| Uprobe/uretprobe | ELF/native user function                                      | binary/build/offset/PLT/inlining and return-pairing issues  |
| USDT             | application/JVM-declared semantic probe                       | probe compiled into that binary and runtime enablement/cost |
| perf event       | counters/sampling                                             | PMU, privilege, multiplexing, skid, virtualization          |

Prefer tracepoints or supported semantic probes when they answer the question. Use
kprobes/uprobes only with an explicit kernel/binary compatibility matrix and a validation
fixture. CO-RE relocates BTF-described field layouts; it does not make function semantics,
tracepoint meaning, or user-space JVM internals stable.

Always inspect the deployed probe:

```bash
bpftrace --version
bpftrace -l 'tracepoint:sched:*'
bpftrace -lv 'tracepoint:sched:sched_switch'
cat /sys/kernel/tracing/events/sched/sched_switch/format
```

Syntax and builtins differ across bpftrace releases. Pin the script's minimum/maximum tested
versions and compile/load it in CI against representative kernels where possible.

## Scope correctly

Linux kernel `task_struct.pid` identifies a thread ID and `task_struct.tgid` a thread-group
(process) ID. bpftrace's `pid`/`tid` builtins expose process/thread semantics for the current
probe context, but tracepoint fields such as scheduler `prev_pid`, `next_pid`, or wakeup `pid`
are TIDs. Read the tracepoint format and event semantics.

Scoping choices:

- current-context syscall probes can often use process/cgroup builtins;
- scheduler events describe arbitrary `prev`/`next` tasks, so current-process builtins do not
  identify both event subjects;
- a snapshot of `/proc/<tgid>/task` misses threads created afterward and risks TID reuse;
- cgroup identity is often the more durable pod/service scope, but migration/reuse and helper
  support must be tested;
- process name (`comm == "java"`) is neither unique nor durable;
- PID namespaces change visible identifiers; record host and container mappings.

System-wide probes are legitimate for interference/capacity questions, but require stronger
privacy, overhead, and tenant authorization. “Always filter by PID” is wrong for host-level
questions and insufficient for dynamic JVM thread populations.

## Correlation state is a data structure

Entry/exit latency programs need a key and lifecycle. Key by the smallest identity that
prevents overlap—often TID plus request/pointer/operation—and handle nesting, restart, missing
exit, cancellation, timeout, and key reuse. Maps can overflow or evict; a missing start must
increment a counter rather than silently disappear.

Track:

- entry, exit, unmatched-entry, unmatched-exit counts;
- active/high-water map entries, update/delete failures, evictions;
- ring-buffer/perf-buffer reserves and lost records;
- histogram count/sum/max in addition to buckets;
- program runtime/event rate and probe recursion/skips;
- collection start/end/clock metadata.

The histogram is only valid for successfully paired events. Report the coverage fraction.

## Key domains

### Futex

`futex` operation arguments are bit fields. Decode the command with the deployed kernel
headers (`FUTEX_CMD_MASK`) rather than comparing the raw value. Java/HotSpot synchronization
can use multiple futex commands and may spin, park, or avoid a syscall; ReentrantLock and
monitor semantics are not recoverable from a futex histogram alone.

Measure kernel futex wait/wake behavior, then use JFR/async-profiler lock events and Java
stacks to attribute logical locks. A futex syscall duration includes kernel behavior of that
call; application wait may begin before it and include scheduling after wakeup.

### Scheduler delay

Run-queue latency needs all relevant enqueue paths and a precise timestamp definition.
Wakeup-to-switch captures blocked→runnable delay but misses already-runnable tasks requeued by
preemption. A robust tool handles wakeups/new tasks, preempted `TASK_RUNNING` transitions,
migration, duplicate enqueue, exit, TID reuse, and target membership changes—or uses a tested
reference tool such as the bpftrace/BCC run-queue tools for the supported kernel.

Cgroup CPU throttling is not necessarily visible as ordinary host run-queue competition.
Correlate with the target cgroup's `cpu.stat`, CPU pressure, runnable count, CPU affinity, and
host utilization. A Java `RUNNABLE` thread means eligible/running at JVM state level, not that
the scheduler currently grants CPU.

### Block I/O

Block request issue→complete measures device/block-layer request lifetime. It is not a Java
read latency and often lacks durable process attribution at completion. Requests can merge,
split, requeue, reuse sectors, and span devices; `(device, sector)` is not generally a unique
lifecycle key. Use a request identity or a tested tool appropriate to the kernel tracepoint
schema, and preserve operation/bytes/device/queue data.

Page cache, filesystem, writeback, asynchronous I/O, device queues, and application buffering
make block and JFR file/socket durations non-additive. A file read can cause no block request;
a block writeback can be unrelated to the thread that dirtied the page.

### Page faults and syscalls

Major/minor faults need address mapping and file/anonymous context before being called “heap
paging.” Faults can come from mapped JARs, shared libraries, code, files, stacks, page cache,
or heap. Syscall numbers are architecture/ABI-specific integers, not kernel addresses; decode
with the matching syscall table and include architecture/personality.

### JVM USDT

Probe presence is a property of the exact `libjvm` build. Enumerate ELF notes/probes on the
deployed binary and generate argument decoding from its provider definition/source. Some
HotSpot probe families require diagnostic/product flags whose availability and cost are
JDK-build/version dependent. Listing a dormant probe proves discoverability, not emission.

High-frequency method/allocation probes can materially perturb execution. Validate on a
reproduction or canary and prefer sampling/JFR events where they answer the question.

## JVM stacks and JIT symbols

Kernel/user stack capture and Java symbolization are separate problems. Compiled Java code is
generated, recompiled, moved/invalidated, and address-reused over time. A point-in-time
`/tmp/perf-<pid>.map` can name current ranges but lacks the full time-ordered load/unload
semantics needed for long recordings. `perf jitdump`/JIT interfaces, supported agent output,
or an in-process profiler may preserve more lifecycle information.

For perf frame-pointer unwinding, both JVM-generated and native frames must obey the chosen
unwind contract. `-XX:+PreserveFramePointer` affects generated code and has platform/JDK
performance consequences to measure. DWARF metadata from native libraries does not by itself
describe JIT code. async-profiler's current VM-aware walkers provide another trade-off; their
semantics are release-specific.

Virtual threads add a logical-versus-carrier boundary. A kernel sample sees an OS thread; it
cannot observe an unmounted virtual thread and may not reconstruct mounted task ancestry.
Correlate with JFR/application task context and never label carrier CPU as one request merely
from the carrier name.

## Privilege and production safety

Capabilities are not a portable checklist. Kernel version/config, user namespace, lockdown,
`unprivileged_bpf_disabled`, LSM, seccomp, tracefs/BTF visibility, perf policy, memlock/resource
limits, and container runtime all participate. Modern kernels separate `CAP_BPF` and
`CAP_PERFMON`, but individual tools/features can need additional rights. Prove exact load and
attach operations in the deployed security profile.

Prefer an ephemeral, signed, allowlisted collector with read-only target access, bounded maps
and buffers, no arbitrary script upload, and auditable activation. Host-wide BPF privilege can
observe other tenants and kernel memory; do not grant it to an application container by
default.

## Decision and validation workflow

1. Collect baseline JVM/OS evidence and define the missing layer/question.
2. Select the least fragile probe and inspect its runtime schema.
3. Define target scope, pairing keys, map/buffer bounds, loss counters, and stop condition.
4. Validate against synthetic positive and negative controls, including dynamic threads.
5. Measure overhead and lost-event behavior at peak event rate.
6. Capture alongside timestamped JVM/application/cgroup evidence.
7. Report population, coverage/loss, units, kernel/tool versions, and confounders.
8. Change one suspected mechanism and verify the user/resource outcome independently.

## Troubleshooting

| Symptom                          | Likely ambiguity                                                                        | Next evidence                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Empty program                    | unavailable/dormant probe, wrong PID namespace/TID filter, optimized function, no event | list/format probe; synthetic trigger; attach/load log and counters          |
| Plausible but too few events     | process snapshot misses new TIDs, map loss, sampling/rate limit                         | membership churn and coverage counters; cgroup/tested tool                  |
| Latency has impossible tails     | start overwritten, nested call, missing exit, key reuse/PID reuse                       | entry/exit/unmatched/map metrics; stronger lifecycle key                    |
| Run queue flat during throttling | incomplete enqueue paths or wrong cgroup population                                     | tested runqlat tool + `cpu.stat`/PSI/affinity                               |
| Block latency blamed on one JVM  | completion lacks submitter attribution, merged/writeback I/O                            | block request lifecycle + filesystem/cgroup I/O + JFR timeline              |
| Many major faults                | heap assumption without mapping                                                         | fault address→VMA/file/anonymous evidence and memory pressure               |
| Hex Java frames                  | missing/stale JIT lifecycle, unwinder failure                                           | build IDs/map/jitdump timing, frame-pointer contract, in-process profile    |
| BPF load denied                  | wrong capability folklore                                                               | verifier/log/audit output, kernel security/config and exact helper/map type |

## Anti-patterns

**Anti-pattern: runnable snippet copied from another kernel.** Probe fields and semantics can
change; kprobe functions can vanish or inline. Discover locally, pin compatibility, compile
test, and validate with known events.

**Anti-pattern: infer Java lock ownership from `FUTEX_WAIT_PRIVATE`.** Futex commands describe
kernel primitives, not Java object identities or whole wait duration. Correlate with JVM lock
events/stacks.

**Anti-pattern: key block requests by device and sector.** Concurrent/merged/requeued requests
can collide. Use a tested request-lifecycle tool/schema and report attribution limitations.

**Anti-pattern: high context switches imply resize pool/use virtual threads.** Context switches
may reflect healthy blocking, preemption, throttling, or churn. Diagnose cause and measure the
candidate remedy.

## Production checklist

- [ ] Kernel, architecture, bpftrace/libbpf, BTF/tracefs, JVM build, and security profile are
      recorded.
- [ ] Probe ABI/format and exact target population were discovered on the deployed system.
- [ ] Correlation keys handle concurrency, nesting, missing exits, dynamic membership, and
      reuse.
- [ ] Maps/buffers/output are bounded; loss and coverage are reported.
- [ ] Synthetic positive/negative controls and peak-rate overhead tests pass.
- [ ] JIT/native/kernel symbol provenance and virtual-thread limitations are explicit.
- [ ] Kernel and JVM quantities remain separate and are aligned by time/workload.
- [ ] Privilege is least-scope, time-bounded, auditable, and removed after capture.

## References

- [Probe and program patterns](references/bpftrace-recipes.md)
- [Interpretation and correlation](references/signal-interpretation.md)
- [bpftrace documentation](https://bpftrace.org/docs/) — use the documentation matching the installed release.
- [Linux BPF documentation](https://docs.kernel.org/bpf/)
- [Linux tracing documentation](https://docs.kernel.org/trace/)
- [Linux perf security](https://docs.kernel.org/admin-guide/perf-security.html)
- [OpenJDK HotSpot DTrace probes](https://github.com/openjdk/jdk/tree/master/src/hotspot/share/runtime) — inspect the target JDK tag/build and platform sources.
