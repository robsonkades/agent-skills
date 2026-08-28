# Incident commands

## "It died with no log"

```bash
echo $?                                   # 137 = SIGKILL, 143 = SIGTERM
dmesg -T | grep -i "killed process"       # global OOM killer
cat /sys/fs/cgroup/memory.events          # cgroup OOM (oom_kill counter)
```

Exit code 137 closes the question: the kernel sent `SIGKILL`. There is no
`OutOfMemoryError`, no shutdown hook and no heap dump, because the JVM never learned it was
dying. Application logs cannot contain the cause.

## Memory pressure

```bash
grep VmSwap /proc/<pid>/status            # is the process swapped?
grep VmHWM  /proc/<pid>/status            # peak RSS (NOT VmPeak, which is virtual)
awk '{print "minflt="$10, "majflt="$12}' /proc/<pid>/stat
cat /proc/pressure/memory                 # PSI: time actually stalled
```

Take `majflt` twice around the pause and use the **delta**. Major faults cost what the
medium costs: ~50–200 µs on NVMe, ~5–10 ms on a spinning disk.

## CPU throttling

```bash
cat /sys/fs/cgroup/cpu.stat               # nr_periods, nr_throttled, throttled_usec
cat /proc/pressure/cpu
```

Throttling inflates GC pauses and leaves **no trace in the GC log**. Compare
`nr_throttled / nr_periods` against baseline. Raising the quota is the third-best response;
before it come sizing `ParallelGCThreads` for the quota and widening the period.

## Descriptors and threads

```bash
# java.net.SocketException: Too many open files
grep "Max open files" /proc/<pid>/limits
ls /proc/<pid>/fd | wc -l

# java.lang.OutOfMemoryError: unable to create native thread
grep "Max processes" /proc/<pid>/limits
ls /proc/<pid>/task | wc -l
```

The second error misleads by its name. It is not a heap problem, so a heap dump does not
help — it is a task limit or native memory exhaustion.

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
