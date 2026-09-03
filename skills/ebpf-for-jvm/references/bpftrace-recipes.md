# Probe and program patterns

These are review patterns, not universal copy-paste programs. Confirm syntax, event fields,
task state encoding, helper availability, and map semantics against the installed bpftrace and
kernel. Prefer tested upstream tools when they already implement the lifecycle.

## Preflight manifest

Capture:

```bash
uname -a
bpftrace --version
bpftool feature probe
mount | grep -E 'tracefs|debugfs'
test -r /sys/kernel/btf/vmlinux
cat /proc/sys/kernel/unprivileged_bpf_disabled
cat /proc/sys/kernel/perf_event_paranoid
```

Also retain cgroup version/path, host/container PID mapping, effective capabilities/seccomp/LSM
state, JVM/JDK build, target start time, and collector artifact digest. Do not print secrets or
broader host metadata into an externally shared incident record.

Discovery:

```bash
bpftrace -l 'tracepoint:syscalls:*futex*'
bpftrace -lv 'tracepoint:syscalls:sys_enter_futex'
bpftrace -lv 'tracepoint:sched:sched_switch'
bpftrace -lv 'tracepoint:block:block_rq_issue'
bpftrace -l 'usdt:/path/to/libjvm.so:hotspot:*'
readelf -n /path/to/libjvm.so
```

An empty list can mean unsupported kernel configuration, inaccessible tracefs/BTF/binary, or
no compiled USDT notes. Resolve that before changing filters.

## Current-context syscall latency

For a syscall tracepoint whose entry/exit run in the calling task, a TID-keyed start map is a
reasonable shape:

```bpftrace
tracepoint:syscalls:sys_enter_read
/pid == $1/
{
  @read_start[tid] = nsecs;
  @entered = count();
}

tracepoint:syscalls:sys_exit_read
/pid == $1/
{
  if (has_key(@read_start, tid)) {
    $d = nsecs - @read_start[tid];
    @read_us = hist($d / 1000);
    @read_sum_ns = sum($d);
    @paired = count();
    delete(@read_start[tid]);
  } else {
    @unmatched_exit = count();
  }
}

END
{
  print(@entered);
  print(@paired);
  print(@unmatched_exit);
  print(@read_us);
}
```

Adapt `has_key`/map syntax to the pinned bpftrace release. Define cleanup for thread/process
exit and report remaining starts. `read(2)` duration is time in the syscall; user-space queue,
buffer processing, later scheduling, async APIs, and work in other processes lie outside.

For nested/re-entrant probes or multiple in-flight operations per TID, TID alone is not enough.
Use a stack/counter or request pointer with verified lifetime.

## Futex command decoding

Do not hard-code raw equality. The conceptual pattern is:

```c
cmd = op & FUTEX_CMD_MASK;
is_wait = cmd == FUTEX_WAIT || cmd == FUTEX_WAIT_BITSET /* plus relevant PI/requeue variants */;
```

Use constants from headers compatible with the running kernel/tool compilation environment.
Decide whether the question includes only ordinary waits or all wait-like commands. Capture
return code: `EAGAIN`, `EINTR`, timeout, and successful wake have different meanings.

Pair enter/exit by TID, count each command and return category, and correlate Java object/lock
ownership separately. Avoid statements that glibc alone explains HotSpot futex usage.

## Scheduler lifecycle

Do not create a hand-written run-queue tool unless the question or target kernel exceeds a
tested upstream tool. Review an implementation for:

- wakeup and wakeup-new enqueue;
- involuntary switch-out while still runnable;
- migration and duplicate enqueue timestamps;
- target membership by cgroup or dynamic process/thread lifecycle;
- exit/TID reuse cleanup;
- state encoding for this tracepoint/kernel;
- idle/kernel-thread exclusions;
- lost events/map overwrites and histogram coverage.

The essential state machine is:

```text
target becomes runnable/enqueued -> queued_at[task identity] = now
target scheduled in              -> observe now - queued_at; delete
target exits                     -> delete
duplicate enqueue                -> count and apply declared policy
```

For process scoping via a TID map, maintain it with process/thread creation/exit events rather
than only a `BEGIN` snapshot, and guard against TID reuse using process start identity where
available. Prefer cgroup scoping when it matches service/pod ownership and the tool supports
subject-task cgroup lookup.

Correlate with:

```bash
cat /sys/fs/cgroup/<target>/cpu.stat
cat /sys/fs/cgroup/<target>/cpu.pressure
cat /proc/<pid>/status
```

Paths/fields differ by cgroup version and kernel. Capture deltas over the same interval, not
cumulative numbers without start/end.

## Block I/O lifecycle

Avoid `(dev, sector)` as a unique key. Review the target tracepoint schema for a request
pointer/identity and use an upstream tool designed for that kernel. Preserve:

```text
request identity
device major/minor and partition mapping
operation/flags, bytes, sector
insert/issue/requeue/complete timestamps as required
merge/requeue/error outcomes
attribution availability at each stage
```

Completion context generally does not make `pid` the original submitting JVM. Attribute by
cgroup at an appropriate earlier layer where supported, or state that the result is
device-wide. Filesystem/page-cache/writeback and async I/O require different probes.

## Fault attribution

Count hardware/software fault events only as a first screen. To interpret a target fault,
capture or join the address with that process's VMA map and fault kind/return result, taking
care with map changes and privacy. Classify anonymous heap, stack, mapped file/JAR/library,
shared memory, code cache, and other mappings. Major fault means I/O was needed; it does not
mean the Java heap was swapped.

## USDT validation

Use the exact target library and PID:

```bash
bpftrace -l 'usdt:/exact/libjvm.so:hotspot:*'
readelf -n /exact/libjvm.so
java -XX:+PrintFlagsFinal -version | grep DTrace
```

Then trigger one known event in a disposable JVM and count probe hits. Probe argument layout
comes from the target JDK's generated/provider definitions, not from memory. Some flags may be
diagnostic or unsupported and can impose high-frequency overhead; verify startup and measure.

Uprobes on exported/native functions have binary ABI issues: attach to the correct inode/build,
distinguish PLT from implementation, account for inlining/tail calls, and remember that
uretprobes can mispair under unusual control flow. They cannot directly attach by Java method
name to anonymous JIT code.

## Mixed native/kernel/Java stacks

Choose the mechanism based on temporal fidelity:

- **perf map:** simple snapshot/current address→symbol ranges; vulnerable to later recompilation,
  unload/address reuse and usually limited metadata;
- **jitdump/perf JIT interface:** time-ordered code load/unload/move plus richer metadata where
  the JDK/tool supports it;
- **in-process profiler:** VM-aware Java/JIT stack walking with its own event/privilege limits;
- **JFR:** JVM event chronology and Java stack metadata, not a generic host kernel stack.

With `perf`, test frame-pointer unwinding on the exact JDK/architecture and preserve matching
native build IDs/debug symbols. If enabling `-XX:+PreserveFramePointer`, measure application
throughput/latency and start a new comparison epoch. Do not claim DWARF native unwind metadata
automatically spans generated JIT frames.

## Ring buffer and map safety

For high-rate event export:

- use fixed-size records and bounded strings/stacks;
- reserve/submit failures increment per-reason counters;
- size buffers from peak rate and consumer stall, then test saturation;
- use LRU only when eviction semantics are acceptable and observable;
- bound key cardinality—raw addresses, thread IDs, sockets, and request pointers churn;
- clear interval maps intentionally without racing producers;
- avoid synchronous per-event `printf`, symbolization, or stack rendering in production.

Aggregation in kernel reduces output but hides individual timestamps and may increase map
cardinality. Exported events preserve detail but can flood user space. Select according to the
question and validate loss.

## Positive and negative controls

Every program needs:

- a target workload that deterministically emits the event;
- a same-host non-target workload that must be excluded;
- a dynamic-thread/restart test;
- concurrent/nested events to test pairing;
- forced map/buffer pressure to verify loss counters;
- start/stop mid-operation to test unmatched state;
- an overhead comparison under peak event rate.

Store expected counts/ranges and kernel/tool matrix with the script. “It printed something” is
not validation.

## Authoritative references

- [bpftrace standard library](https://bpftrace.org/docs/release_024/stdlib) — choose the installed release documentation.
- [bpftrace reference guide](https://bpftrace.org/docs/release_024/reference_guide)
- [Linux tracepoints](https://docs.kernel.org/trace/tracepoints.html)
- [Linux BPF maps](https://docs.kernel.org/bpf/maps.html)
- [libbpf CO-RE reference](https://nakryiko.com/posts/bpf-core-reference-guide/) — primary maintainer guide; validate against libbpf docs/source.
