# Incident commands

## "It died with no log"

```bash
echo $?                                   # convention: 137 = SIGKILL, 143 = SIGTERM
journalctl -k --since '-15 min'            # kernel record, if authorized and retained
cat /sys/fs/cgroup/memory.events          # cgroup v2: compare oom/oom_kill deltas
```

Exit code 137 supports `SIGKILL`; it does not identify who sent it or why. A JVM killed this
way cannot run hooks or emit a Java heap dump at termination, though earlier application logs
can still contain precursors. Confirm OOM with cgroup/kernel/orchestrator evidence; absence
of a `dmesg` line is not proof against it.

## Memory pressure

```bash
grep VmSwap /proc/<pid>/status            # is the process swapped?
grep VmHWM  /proc/<pid>/status            # peak RSS (NOT VmPeak, which is virtual)
awk '{print "minflt="$10, "majflt="$12}' /proc/<pid>/stat
cat /proc/pressure/memory                 # PSI: time actually stalled
```

Take `majflt` twice around the pause and use the **delta**. Attribute its cost with block-I/O,
reclaim and wall-clock evidence on this host; device labels do not determine queueing latency.

## CPU throttling

```bash
cat /sys/fs/cgroup/cpu.stat               # nr_periods, nr_throttled, throttled_usec
cat /proc/pressure/cpu
```

Throttling can inflate observed pauses without appearing as a GC cause. Compare counter
deltas: throttled periods show frequency, while throttled microseconds over elapsed time show
denied CPU. Then test collector/thread ergonomics, application runnable demand, quota and
period; changing the period alters burst and tail behaviour and is not a generic remedy.

## Descriptors and threads

```bash
# java.net.SocketException: Too many open files
grep "Max open files" /proc/<pid>/limits
ls /proc/<pid>/fd | wc -l

# java.lang.OutOfMemoryError: unable to create native thread
grep "Max processes" /proc/<pid>/limits
ls /proc/<pid>/task | wc -l
cat /sys/fs/cgroup/pids.current /sys/fs/cgroup/pids.max /sys/fs/cgroup/pids.events
```

The second error is not necessarily heap exhaustion. Distinguish cgroup `pids.max`, user
`RLIMIT_NPROC`, system thread/PID limits, native stack/address-space exhaustion and commit
failure. A heap dump is secondary unless retained Java objects explain excessive thread
creation.

## Unexplained pause

```bash
cat /proc/pressure/{cpu,memory,io}
ps -eo pid,stat,comm | awk '$2 ~ /D/'     # D state = uninterruptible sleep = waiting on I/O
```

Compare the pause the GC log reports with the pause the client observed, and attribute the
difference to a specific layer: Time-To-SafePoint, cgroup throttling, swap, or I/O stall.
Do not leave it unattributed — an unattributed difference is where tuning goes wrong.

## Graceful shutdown

```bash
kill -TERM <pid>
for i in $(seq 30); do kill -0 <pid> 2>/dev/null || break; sleep 1; done
kill -0 <pid> 2>/dev/null && kill -9 <pid>
```

`kill -9` as a first response loses shutdown hooks, connection drain, heap dump, and
truncates any JFR file. In Kubernetes, make `terminationGracePeriodSeconds` match the real
drain time rather than the default.

## Triage order

- [ ] Exit code checked **before** searching application logs
- [ ] `dmesg` and cgroup `memory.events` consulted
- [ ] `VmSwap` and the `majflt` delta measured around the pause
- [ ] `nr_throttled / nr_periods` compared with baseline
- [ ] `/proc/pressure/*` collected
- [ ] Logged GC pause compared with client-observed pause, difference attributed
- [ ] Descriptor and thread counts compared with their limits
- [ ] Thread states checked for `D`
