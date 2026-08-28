# bpftrace recipes for a running JVM

All of these assume root (or `CAP_BPF` + `CAP_PERFMON`) on kernel 5.8+, with debugfs mounted
at `/sys/kernel/debug/tracing/`. Confirm the toolchain works before anything else:

```bash
uname -r
sudo bpftrace -e 'BEGIN { print("bpftrace OK\n"); }'
```

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
    @syscalls[args->id] = count();
}
END { print(@syscalls); }'
```

`args->id` is the syscall **number** (0 = `read`, 1 = `write`, 202 = `futex` on x86-64), not
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
/pid == $1 && (args->op & 0x7f) == 0/    # FUTEX_WAIT, masking FUTEX_PRIVATE_FLAG (0x80)
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

`args->pid` / `args->next_pid` on `sched:*` are TIDs, so the filter has to come from a map of
the process's threads rather than from `$1`.

```bash
PID=$1
TID_FILTER=""
for tid_dir in /proc/"$PID"/task/*; do
    TID_FILTER+="@target_tid[$(basename "$tid_dir")] = 1; "
done

sudo bpftrace -e '
BEGIN { '"$TID_FILTER"' }

tracepoint:sched:sched_wakeup
/@target_tid[args->pid]/
{ @wakeup[args->pid] = nsecs; }

tracepoint:sched:sched_switch
/@target_tid[args->next_pid]/
{
    if (@wakeup[args->next_pid]) {
        @runq_lat_us = hist((nsecs - @wakeup[args->next_pid]) / 1000);
        delete(@wakeup[args->next_pid]);
    }
}'
```

The TID list is a snapshot taken at `BEGIN`. Threads created afterwards — an elastic pool
growing during collection — are not in the filter. For fixed-size production pools that is
acceptable; for ephemeral threads, re-snapshot over short windows and accept some
under-counting.

## 5 — Block I/O latency, to compare against the JVM's own view

```bash
sudo bpftrace -e '
tracepoint:block:block_rq_issue { @issue[args->dev, args->sector] = nsecs; }
tracepoint:block:block_rq_complete {
    if (@issue[args->dev, args->sector]) {
        @disk_latency_us = hist((nsecs - @issue[args->dev, args->sector]) / 1000);
        delete(@issue[args->dev, args->sector]);
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

tracepoint:sched:sched_switch /@target_tid[args->prev_pid]/ {
    @ctx_switches_from++;
    @ctx_switch_reason[args->prev_state] = count();
}
```

Rising major faults on a Java process means the heap is being paged out; check `free -h`
and `vmstat` and compare `-Xmx` against the memory actually available.

## USDT probes on the JVM

```bash
# Without the flag: only gc__begin / gc__end fire.
java -XX:+ExtendedDTraceProbes -jar app.jar &

sudo bpftrace -e '
usdt:/usr/lib/jvm/java-25-openjdk/lib/server/libjvm.so:hotspot:gc__begin {
    printf("GC start\n");
}'
```

uprobes cannot see JIT-compiled code — it is generated in memory at addresses that appear in
no ELF symbol table. Native JDK functions do have symbols:

```bash
uprobe:/usr/lib/jvm/java-25-openjdk/lib/server/libjvm.so:G1CollectedHeap::collect
```

## Mixed kernel + JIT flame graphs

```bash
git clone https://github.com/jvm-profiling-tools/perf-map-agent
cd perf-map-agent && cmake . && make

# Attach to a process already running — -agentpath: would start a second JVM:
jcmd <pid> JVMTI.agent_load ./out/libperfmap.so unfoldall

# fp is the correct partner of -XX:+PreserveFramePointer; dwarf needs unwind
# tables the build may not emit and costs more CPU:
perf record -F 99 -p $(pgrep java) --call-graph fp -g -- sleep 30
perf script | stackcollapse-perf.pl | flamegraph.pl > jvm-flamegraph.svg

# Simpler alternative (async-profiler 3.0+; profiler.sh was removed there):
asprof -e cpu -d 30 -o flamegraph -f flamegraph.html --all-user --kernel $(pgrep java)
asprof -e lock -d 30 -f locks.html <pid>
```

The JVM needs `-XX:+PreserveFramePointer` at start for the `perf` path to unwind through
JIT frames.
