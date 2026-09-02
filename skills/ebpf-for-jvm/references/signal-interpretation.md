# Reading eBPF output against a JVM

## Environment prerequisites

| Requirement                                                  | Why it matters                                                                                                             |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Linux kernel 5.8+                                            | `CAP_BPF` / `CAP_PERFMON` exist as separate capabilities from full root; older kernels need `CAP_SYS_ADMIN`                |
| root, or `CAP_BPF` + `CAP_PERFMON`                           | Loading and attaching a BPF program; `kernel.unprivileged_bpf_disabled` is irrelevant once the capability is held          |
| tracefs at `/sys/kernel/tracing` (or the debugfs path)       | Tracepoint discovery and the `args` struct layout for `tracepoint:` probes                                                 |
| BTF at `/sys/kernel/btf/vmlinux`                             | Kernel struct types for `kprobe:` arguments without headers (CO-RE); not needed for `tracepoint:` or `usdt:`               |
| Host PID namespace, when run from a pod                      | `pid`, `/proc/<pid>/task` and `-p` all refer to host PIDs; a pod in its own PID namespace sees none of the JVM's           |
| Docker seccomp: `bpf`/`perf_event_open` need `CAP_SYS_ADMIN` | The default profile has no `CAP_BPF`/`CAP_PERFMON` rule; `--cap-add BPF` alone still fails with `EPERM`                    |
| `bpftrace`, `linux-tools-common`, `linux-perf`               | `apt-get` on Ubuntu 20.04+; `dnf install bpftrace` on Fedora 32+                                                           |
| JVM built with DTrace/SDT support                            | Prerequisite for any `usdt:` probe, independent of the JDK version — `readelf -n libjvm.so \| grep -c stapsdt` is the test |

## PID versus TID

The kernel's internal naming is inverted relative to user space: in `task_struct`, `pid`
identifies the **thread** and `tgid` identifies the **process**. bpftrace translates this for
its builtins but not for raw tracepoint fields.

| Reference                                                   | Source                                       | What it actually is                            |
| ----------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------- |
| builtin `pid`                                               | `bpf_get_current_pid_tgid() >> 32`           | tgid — the process id user space means         |
| builtin `tid`                                               | `bpf_get_current_pid_tgid() & 0xffffffff`    | the kernel's internal `pid` — the thread's TID |
| `args->pid` on `sched:sched_wakeup`                         | tracepoint format field (`task_struct->pid`) | TID of the woken thread, **not** the process   |
| `args->next_pid` / `args->prev_pid` on `sched:sched_switch` | same                                         | TIDs of the threads being switched             |

Consequence: `/pid == $1/` is correct on `tracepoint:syscalls:sys_enter_futex`, and
`/args->next_pid == $1/` on `tracepoint:sched:sched_switch` silently narrows the trace to the
main thread.

## Futex operation bitmask

`args->op` is a bitmask: the low 7 bits carry the operation, bit `0x80` is
`FUTEX_PRIVATE_FLAG`, set by glibc's `pthread_mutex` — which is what `synchronized` and
`ReentrantLock` end up using.

| Raw `args->op` | `args->op & 0x7f` | Constant             | Context                           |
| -------------- | ----------------- | -------------------- | --------------------------------- |
| 0              | 0                 | `FUTEX_WAIT`         | Non-private futex — rare in Java  |
| 128            | 0                 | `FUTEX_WAIT_PRIVATE` | The common Java lock case         |
| 1              | 1                 | `FUTEX_WAKE`         | Non-private                       |
| 129            | 1                 | `FUTEX_WAKE_PRIVATE` | Waking a waiter on a private lock |

## USDT probe activation

| Probe                                                                                                                                       | Fires by default | Flag that enables it (JDK 25 product flag) | Cost of the flag                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------ | ------------------------------------------------------------- |
| `vm__init__begin/end`, `thread__start/stop`, `class__loaded/unloaded`, `gc__begin/end`, `mem__pool__gc__*`, `compiled__method__load/unload` | Yes              | —                                          | None beyond the probe itself                                  |
| `monitor__contended__enter/entered/exit`, `monitor__wait/waited`, `monitor__notify`                                                         | No — dormant     | `-XX:+DTraceMonitorProbes`                 | A check per monitor event; tolerable for a reproduction run   |
| `method__entry`, `method__return`                                                                                                           | No — dormant     | `-XX:+DTraceMethodProbes`                  | Runtime call on every method entry/exit — never in production |
| `object__alloc`                                                                                                                             | No — dormant     | `-XX:+DTraceAllocProbes`                   | Runtime call per allocation — never in production             |

`-XX:+ExtendedDTraceProbes`, the umbrella that used to switch all three on, was deprecated
in JDK 19 (JDK-8279629) and obsoleted in JDK 20 (JDK-8279913); JDK 25 exits with
`Unrecognized VM option 'ExtendedDTraceProbes'`. `tplist` lists what exists in the binary,
not what emits. A dormant probe produces no events and no error.

## Signal to next step

| Signal                                             | Probable cause                                                                                  | Next step                                                                                                                                    |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Futex latency above 1 ms                           | `synchronized` / `ReentrantLock` contention                                                     | Correlate with `asprof -e lock`                                                                                                              |
| Run queue latency above 5 ms                       | Saturated CPU, CFS throttling, or poor affinity                                                 | `cpu.stat` `nr_throttled`/`throttled_usec` first — the quota is the cause when they rise with the histogram; then `mpstat -P ALL`, `taskset` |
| Run queue histogram flat while p99 is bad          | Only `sched_wakeup` recorded — preemption re-queues (`prev_state == TASK_RUNNING`) were dropped | Use recipe 4's three-event form; compare `nr_throttled` again                                                                                |
| Rising major page faults                           | Heap being paged out                                                                            | Check `free -h` / `vmstat`; compare `-Xmx` with available memory                                                                             |
| High context switches leaving the process          | Threads blocking on I/O or locks frequently                                                     | Resize the pool, or reconsider virtual threads                                                                                               |
| Disk latency above the JFR `jdk.FileRead` duration | Kernel buffering, scheduler and copy overhead                                                   | Candidate for Direct I/O or io_uring                                                                                                         |

## Checklist before a production PID

Before running:

- [ ] Is the filter scoped to the whole process (`/proc/$PID/task` map) or to one thread —
      and is that what the probe's fields actually give you?
- [ ] Did `bpftrace -lv` confirm each `args->` field on this kernel build?
- [ ] If futex is involved, is `& 0x7f` applied to `args->op`?
- [ ] Does the production JVM binary have the DTrace/SDT support (`readelf -n … | grep -c
stapsdt`) and the `DTrace*Probes` flag any `usdt:` probe needs — not just the
      development one?
- [ ] If the pod is not in the host PID namespace, is the PID you are filtering the host's?

While developing:

- [ ] Did the script produce non-empty output against a synthetic load with known contention?
- [ ] Is `ksym()` absent from anything that is not a memory address?
- [ ] Is the installed async-profiler `asprof`, and is the command written for it?

When reading results:

- [ ] Are the histogram buckets non-overlapping powers of two? Overlapping buckets are a
      transcription error, not bpftrace output.
- [ ] Is the overhead figure labelled as an estimate unless measured here, with and without
      the script?
- [ ] Are kernel-side and JVM-side durations kept as separate quantities rather than summed?

Running:

- [ ] Is there a stop plan — killing the `bpftrace` process — if overhead exceeds budget?
