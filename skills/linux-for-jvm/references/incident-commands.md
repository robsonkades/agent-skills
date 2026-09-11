# Incident commands

Before running fragments, replace `<pid>` with the verified PID in the current PID namespace.
Resolve its cgroup using `/proc/<pid>/cgroup` and the relevant cgroup2 mount root from
`/proc/self/mountinfo`; set `CGROUP` to that verified directory. Check ancestor limits too.
A container mount may hide ancestors; collect their evidence from the host when available.
Use only the sections relevant to the symptom, reusing current evidence. These examples use
Bash and Linux utilities; check command status and diagnostics before interpreting output.
Missing files, denied access, failed producers and unmatched fields are unavailable evidence.

## "It died with no log"

```bash
echo $?                                   # only immediately after the command/wait of interest
journalctl -k --since '-15 min'            # kernel record, if authorized and retained
cat "$CGROUP/memory.events"          # cgroup v2: compare oom/oom_kill deltas
```

Exit code 137 supports `SIGKILL`; it does not identify who sent it or why. A JVM killed this
way cannot run hooks or emit a Java heap dump at termination, though earlier application logs
can still contain precursors. Confirm OOM with cgroup/kernel/orchestrator evidence; absence
of a `dmesg` line is not proof against it. `memory.events` normally includes descendants;
the `memory_localevents` mount option changes it to local-only reporting. Check the mount.
`memory.events.local` isolates local events where available. `oom` is not a kill count and
`oom_kill` counts members killed by any OOM killer, including global OOM. Neither alone
identifies which limit caused the incident. Userspace killers such as systemd-oomd require
their own journal evidence.

## Memory pressure

```bash
grep VmSwap /proc/<pid>/status            # is the process swapped?
grep VmHWM  /proc/<pid>/status            # peak RSS (NOT VmPeak, which is virtual)
cat /proc/<pid>/stat                      # parse comm safely as described below
cat /proc/pressure/memory                 # PSI: time actually stalled
```

Do not split the entire stat record on whitespace: field 2 (`comm`) can contain spaces and
parentheses. Read the complete record, locate its final `)`, and split the remaining suffix;
that suffix begins at field 3, so zero-based indexes 7 and 9 are `minflt` and `majflt`.
Verify PID/start time across samples to reject PID reuse. `VmSwap` excludes shmem swap;
zero does not exclude all swap-related pressure.

Take `majflt` twice around the pause and use the **delta**. Attribute its cost with block-I/O,
reclaim and wall-clock evidence on this host; device labels do not determine queueing latency.

## CPU throttling

```bash
cat "$CGROUP/cpu.stat"               # nr_periods, nr_throttled, throttled_usec
cat /proc/pressure/cpu
```

Throttling can inflate observed pauses without appearing as a GC cause. Compare counter
deltas: `nr_throttled / nr_periods` describes throttling frequency when the period delta is
positive. `throttled_usec` aggregates run-queue intervals across CPUs; its elapsed-time ratio
can exceed 100% and is not CPU time the application would otherwise have received. Inspect
`cpu.max`, ancestor quotas, affinity and runnable demand. Then test collector/thread ergonomics, quota and
period; changing the period alters burst and tail behaviour and is not a generic remedy.

## Descriptors and threads

```bash
# Emit a count only after successful enumeration; proc entry names here are numeric.
count_proc_entries() {
  local entries
  if entries=$(LC_ALL=C ls -1 -- "$1"); then
    printf '%s\n' "$entries" | awk 'NF {n++} END {print n+0}'
  else
    printf 'unavailable: cannot enumerate %s\n' "$1" >&2
    return 1
  fi
}

# java.net.SocketException: Too many open files
grep "Max open files" /proc/<pid>/limits
count_proc_entries /proc/<pid>/fd

# java.lang.OutOfMemoryError: unable to create native thread
grep "Max processes" /proc/<pid>/limits
count_proc_entries /proc/<pid>/task
cat "$CGROUP/pids.current" "$CGROUP/pids.max" "$CGROUP/pids.events"
```

An `ls | wc -l` pipeline can print zero and succeed even when `ls` failed. `pipefail` alone
changes the status but still leaves misleading numeric output; gate the count on producer
success. Even successful counts are snapshots subject to descriptor/thread churn and PID
reuse; compare the verified process identity and scope with the applicable limits.

The second error is not necessarily heap exhaustion. Distinguish cgroup `pids.max`, user
`RLIMIT_NPROC`, system thread/PID limits, native stack/address-space exhaustion and commit
failure. A heap dump is secondary unless retained Java objects explain excessive thread
creation.

## Unexplained pause

```bash
cat /proc/pressure/{cpu,memory,io}
if thread_snapshot=$(ps -eLo pid,tid,stat,wchan:32,comm); then
  printf '%s\n' "$thread_snapshot" | awk '$3 ~ /^D/' # uninterruptible sleep
else
  printf 'unavailable: cannot collect thread states\n' >&2
  false # retain failure status instead of reporting an empty successful observation
fi
```

Compare the pause the GC log reports with the pause the client observed, and attribute the
difference only when a common timeline supports it: Time-To-SafePoint, throttling, swap,
I/O or queueing. D-state is often I/O-related but does not identify a disk or prove I/O is
the cause; inspect per-thread wait channels/stacks where permitted. Leave missing attribution
explicit rather than inventing a diagnosis.

## Graceful shutdown

Prefer the owning service manager or orchestrator's bounded stop protocol. For a manually
owned process, use an identity-safe mechanism such as pidfd-aware tooling supported on the
host; a numeric PID polled with kill -0 can disappear and be reused before escalation.
Inspect the supervisor timeout, stop signal, signal forwarding and cleanup budget first.
If the established containment/recovery contract requires immediate forced termination, use
that identity-safe path and record the reason and lost cleanup/evidence. Do not delay that
deadline for a new graceful wait or optional diagnostic capture.

SIGKILL prevents hooks and final dump-on-exit, but does not invalidate earlier completed JFR
dumps or every repository chunk. Preserve surviving artifacts and verify readability.
In Kubernetes, derive the grace period from all shutdown phases and routing drain.

## Triage order

Apply the relevant checks for the symptom and evidence gaps, within the recovery deadline.
Successful existing records can satisfy a check; unavailable evidence is not a negative result.

- [ ] Exit code checked **before** searching application logs
- [ ] `dmesg` and cgroup `memory.events` consulted
- [ ] `VmSwap` and the `majflt` delta measured around the pause
- [ ] `nr_throttled / nr_periods` compared with baseline
- [ ] `/proc/pressure/*` collected
- [ ] Logged GC pause compared with client-observed pause, supported attribution or explicit unresolved hypotheses
- [ ] Descriptor and thread counts compared with their limits
- [ ] Thread states checked for `D`

## Sources

- [Linux cgroup v2](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html): hierarchy, events and controller counters; use the deployed kernel documentation.
- [Linux stat fields](https://man7.org/linux/man-pages/man5/proc_pid_stat.5.html): comm and fault fields.
- [Linux 6.12 throttling accounting](https://github.com/torvalds/linux/blob/v6.12/kernel/sched/fair.c): per-run-queue intervals added to bandwidth throttled time.
- [PSI documentation](https://www.kernel.org/doc/html/latest/accounting/psi.html): units, scope and CPU full caveat.
- [Bash pipeline status](https://www.gnu.org/software/bash/manual/html_node/Pipelines.html): the last command normally determines status; producer failure needs explicit handling.
- [systemd v257 stop signals](https://github.com/systemd/systemd/blob/v257/man/systemd.kill.xml): configurable initial signal, bounded wait and final escalation; inspect the actual unit.
