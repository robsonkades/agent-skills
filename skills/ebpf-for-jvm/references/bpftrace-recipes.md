# bpftrace recipes for a running JVM

All of these assume root (or `CAP_BPF` + `CAP_PERFMON`) on kernel 5.8+, with tracefs at
`/sys/kernel/tracing` (kernel 4.1+; `/sys/kernel/debug/tracing` is the older debugfs
path, and bpftrace checks both). Tracepoint `args` come from the tracefs `format` files;
kprobe struct arguments need BTF (`/sys/kernel/btf/vmlinux`, `CONFIG_DEBUG_INFO_BTF`) or
kernel headers. `args.field` is the current syntax; `args->field` is a legacy alias and
still accepted. Confirm the toolchain works before anything else:

```bash
uname -r
ls /sys/kernel/btf/vmlinux /sys/kernel/tracing/events/sched/sched_switch/format
sudo bpftrace -e 'BEGIN { print("bpftrace OK\n"); }'
```

From a container: the pod needs the **host PID namespace** (`hostPID: true`), `CAP_BPF`
and `CAP_PERFMON` (older kernels: `CAP_SYS_ADMIN`), and `/sys/kernel/tracing` mounted;
`kubectl debug node/<node> -it --image=...` or a privileged DaemonSet is the usual shape.
Docker's default seccomp profile allows the `bpf` and `perf_event_open` syscalls only
with `CAP_SYS_ADMIN` — the same trap as for `asprof -e cpu` (`async-profiler-advanced`).

## Discovery — always before writing a filter

```bash
bpftrace -l 'tracepoint:syscalls:*futex*'
bpftrace -l 'tracepoint:sched:*'

# Confirms the field exists and its type on THIS kernel build:
bpftrace -lv 'tracepoint:sched:sched_switch'
bpftrace -lv 'tracepoint:syscalls:sys_enter_futex'

tplist -l /usr/lib/jvm/java-25-openjdk/lib/server/libjvm.so | grep hotspot
```

## 1 — Which syscalls the JVM makes

```bash
sudo bpftrace -e '
tracepoint:raw_syscalls:sys_enter
/comm == "java"/
{
    @syscalls[args.id] = count();
}
END { print(@syscalls); }'
```

`args.id` is the syscall **number** (0 = `read`, 1 = `write`, 202 = `futex` on x86-64), not
an address. Decode it offline with `ausyscall x86_64 <number>` — never with `ksym()`.

## 2 — read/write latency, kernel side

```bash
sudo bpftrace -e '
tracepoint:syscalls:sys_enter_read
/pid == $1/
{ @start[tid] = nsecs; }

tracepoint:syscalls:sys_exit_read
/pid == $1 && @start[tid]/
{
    @read_latency_us = hist((nsecs - @start[tid]) / 1000);
    delete(@start[tid]);
}' $(pgrep java | head -1)
```

The builtin `pid` is the process (tgid), so `/pid == $1/` is correct here.

## 3 — Futex contention (`synchronized`, `ReentrantLock`)

```bash
sudo bpftrace -e '
tracepoint:syscalls:sys_enter_futex
/pid == $1 && (args.op & 0x7f) == 0/    # FUTEX_WAIT, masking FUTEX_PRIVATE_FLAG (0x80)
{ @futex_wait[tid] = nsecs; }

tracepoint:syscalls:sys_exit_futex
/pid == $1 && @futex_wait[tid]/
{
    @futex_latency_ms = hist((nsecs - @futex_wait[tid]) / 1000000);
    delete(@futex_wait[tid]);
}' $(pgrep java | head -1)
```

Drop the `& 0x7f` and the histogram is empty no matter how contended the application is.

## 4 — Run queue latency, for every thread of the process

`args.pid` / `args.next_pid` on `sched:*` are TIDs, so the filter has to come from a map of
the process's threads rather than from `$1`. A thread enters the run queue on three
events, and a histogram that records only the first one under-counts exactly the case it is
run for:

| Event                                            | Meaning                                                  | Dominates when                       |
| ------------------------------------------------ | -------------------------------------------------------- | ------------------------------------ |
| `sched_wakeup`                                   | Blocked thread became runnable (I/O done, lock released) | I/O-bound, lightly loaded host       |
| `sched_wakeup_new`                               | New thread's first schedule                              | Thread churn, elastic pools          |
| `sched_switch` with `prev_state == TASK_RUNNING` | Thread was **preempted** — still runnable, re-queued     | CPU saturation, CFS quota throttling |

```bash
PID=$1
TID_FILTER=""
for tid_dir in /proc/"$PID"/task/*; do
    TID_FILTER+="@target_tid[$(basename "$tid_dir")] = 1; "
done

sudo bpftrace -e '
#include <linux/sched.h>
BEGIN { '"$TID_FILTER"' }

tracepoint:sched:sched_wakeup,
tracepoint:sched:sched_wakeup_new
/@target_tid[args.pid]/
{ @queued[args.pid] = nsecs; }

tracepoint:sched:sched_switch
{
    // preempted: switched out while still runnable -> back in the queue, no wakeup
    if (args.prev_state == TASK_RUNNING && @target_tid[args.prev_pid]) {
        @queued[args.prev_pid] = nsecs;
    }
    if (@target_tid[args.next_pid] && @queued[args.next_pid]) {
        @runq_lat_us = hist((nsecs - @queued[args.next_pid]) / 1000);
        delete(@queued[args.next_pid]);
    }
}'
```

This is the shape of bpftrace's own `tools/runqlat.bt`, plus the process filter. The TID
list is a snapshot taken at `BEGIN`. Threads created afterwards — an elastic pool growing
during collection — are not in the filter (their `sched_wakeup_new` is dropped). For
fixed-size production pools that is acceptable; for ephemeral threads, re-snapshot over
short windows and accept some under-counting.

Read the histogram against the cgroup first: `cat /sys/fs/cgroup/<path>/cpu.stat`
(`nr_throttled`, `throttled_usec`) rising over the same window means the queueing is the
CFS quota, not a busy host, and the fix is the limit, not the code (`linux-for-jvm`).

## 5 — Block I/O latency, to compare against the JVM's own view

```bash
sudo bpftrace -e '
tracepoint:block:block_rq_issue { @issue[args.dev, args.sector] = nsecs; }
tracepoint:block:block_rq_complete {
    if (@issue[args.dev, args.sector]) {
        @disk_latency_us = hist((nsecs - @issue[args.dev, args.sector]) / 1000);
        delete(@issue[args.dev, args.sector]);
    }
}'
```

Collect the JVM's side over the same window:

```bash
jcmd <pid> JFR.start duration=30s filename=io.jfr    # jdk.SocketRead, jdk.FileRead
```

Disk latency exceeding the JFR event duration means the gap is kernel buffering, scheduler
and copy time — the case where Direct I/O or io_uring becomes a candidate.

## 6 — Page faults and context switches

```bash
software:major-faults:1 /pid == $PID/ { @major_faults++; }
software:minor-faults:1 /pid == $PID/ { @minor_faults++; }

tracepoint:sched:sched_switch /@target_tid[args.prev_pid]/ {
    @ctx_switches_from++;
    @ctx_switch_reason[args.prev_state] = count();
}
```

Rising major faults on a Java process means the heap is being paged out; check `free -h`
and `vmstat` and compare `-Xmx` against the memory actually available.

## USDT probes on the JVM

```bash
# Is the production libjvm.so built with SDT probes at all? 0 means no usdt: will attach.
readelf -n /usr/lib/jvm/java-25-openjdk/lib/server/libjvm.so | grep -c stapsdt

# Lifecycle probes (gc__begin/end, thread__start/stop, class__loaded, ...) fire without
# any flag. Monitor, method and allocation probes need their own product flag — the
# umbrella -XX:+ExtendedDTraceProbes was obsoleted in JDK 20 and JDK 25 refuses it.
java -XX:+DTraceMonitorProbes -jar app.jar &

sudo bpftrace -p "$(pgrep -f app.jar)" -e '
usdt:/usr/lib/jvm/java-25-openjdk/lib/server/libjvm.so:hotspot:gc__begin { printf("GC start\n"); }
usdt:/usr/lib/jvm/java-25-openjdk/lib/server/libjvm.so:hotspot:monitor__contended__enter {
    @contended[tid] = count();
}'
```

`-XX:+DTraceMethodProbes` and `-XX:+DTraceAllocProbes` exist too, but they route every
method entry/exit and every allocation through a runtime call — reproduction JVMs only.

uprobes cannot see JIT-compiled code — it is generated in memory at addresses that appear in
no ELF symbol table. Native JDK functions do have symbols:

```bash
uprobe:/usr/lib/jvm/java-25-openjdk/lib/server/libjvm.so:G1CollectedHeap::collect
```

## Mixed kernel + JIT flame graphs

```bash
# 1. The JVM must have started with frame pointers preserved, or perf's fp unwinder
#    stops at the first JIT frame. DWARF cannot help: JIT code has no .eh_frame.
java -XX:+PreserveFramePointer -jar app.jar

# 2. Symbolise JIT code with the JDK's own perf map (JDK 17+, Linux only).
#    It is a snapshot: dump right before perf script, not before perf record.
perf record -F 99 -p "$(pgrep -f app.jar)" --call-graph fp -- sleep 30
jcmd "$(pgrep -f app.jar)" Compiler.perfmap          # writes /tmp/perf-<pid>.map
perf script | stackcollapse-perf.pl | flamegraph.pl > jvm-flamegraph.svg

# Alternative for a JVM that will exit: -XX:+UnlockDiagnosticVMOptions -XX:+DumpPerfMapAtExit

# Simpler, and no frame-pointer requirement: async-profiler's VMStructs walker
# (--cstack vm, default since 4.2) reads JIT frames from the JVM's own frame layout;
# kernel frames are included whenever perf_events is available.
asprof -e cpu -d 30 -o flamegraph -f flamegraph.html "$(pgrep -f app.jar)"
asprof -e lock -d 30 -f locks.html <pid>
```

`perf` is worth the extra steps only when the question spans processes — the JVM plus the
sidecar plus the kernel on one graph. For one JVM, `asprof` answers the same question
without `PreserveFramePointer` and without a map file.
