# Sampling engines, coverage and events

## Why none of them has safepoint bias

Safepoint-based profilers (JVisualVM, some IDE defaults, historical `hprof`) can only ask
"where are you?" when a thread has already stopped for another reason. Tight loops with
no calls — fully inlined and vectorised — go a long time between safepoints, so they are
under-represented or invisible while consuming most of the CPU; code with frequent
safepoints is over-represented. The profiler then names the wrong method.

`AsyncGetCallTrace` is asynchronous: it can be called from a Unix signal handler
delivered at any point of execution, including inside C2-compiled code. `cpu`, `itimer`,
`ctimer` and `wall` all build on that (or the equivalent broad sweep), so none of them
depends on a safepoint. Attributing a difference between engines to safepoint bias is a
layer error — the real distinction is signal fairness, which is a different property.

## The three CPU engines

| Attribute                                | `cpu` (perf_events)                                                  | `itimer`                                                                              | `ctimer`                                  |
| ---------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------- |
| Kernel mechanism                         | `perf_event_open`, one fd per thread                                 | `setitimer(ITIMER_PROF)`, one per process                                             | `timer_create()`, one timer per thread    |
| Kernel stack traces                      | Yes                                                                  | No                                                                                    | No                                        |
| Resolution                               | High (CPU nanoseconds)                                               | Tick-limited (`1/HZ`, 1–10 ms) — POSIX CPU timers are expired from the scheduler tick | Tick-limited, same mechanism              |
| Fair distribution across threads         | Yes — signal goes to the thread whose counter overflowed             | No — one process-wide signal, uneven across active threads                            | Better than `itimer`, still jiffy-limited |
| Works under restrictive seccomp/paranoid | No, by default                                                       | Yes                                                                                   | Yes                                       |
| Consumes file descriptors                | Yes (one per thread)                                                 | No                                                                                    | No                                        |
| Works on macOS                           | No                                                                   | Yes (with limits)                                                                     | No (Linux-specific)                       |
| Automatic fallback                       | Falls back to `ctimer`, then `wall`, silently                        | —                                                                                     | —                                         |
| Native (C) stack                         | Yes — `--cstack vm` default since 4.2, `fp`/`dwarf`/`vmx` selectable | Yes, same walker                                                                      | Yes, same walker                          |

Practical reading: on an unrestricted Linux host use `-e cpu`. In a container with the
default seccomp profile, or when only Java/JIT frames are wanted, `-e ctimer` is
equivalent for Java-frame attribution and needs no capability. `itimer` is reserved for
platforms where `ctimer` does not exist, notably macOS.

## The wall engine

`-e wall` does not wait for a signal. A dedicated collector wakes on the configured
interval and iterates the JVM's internal list of Java threads, taking a sample from each
one regardless of its state. A thread in `Thread.sleep()`, blocked on `synchronized`, or
parked in `LockSupport.park()` still has an observable stack; it merely is not on a CPU.

Total coverage is inherent to the design, not an option. `-t` (`--threads`) appends a
thread-identifying frame to the end of each collected stack — output labelling, not
sample selection.

## Expected sample counts per 60 s

Order of magnitude for one thread at 100% CPU — measure it in the target environment.

| Engine            | Default interval            | Samples in 60 s                                   |
| ----------------- | --------------------------- | ------------------------------------------------- |
| `cpu`             | 10 ms (100 Hz)              | ~6,000                                            |
| `ctimer`/`itimer` | jiffy-limited (≥ 4 ms)      | ~6,000–15,000 depending on kernel `HZ`            |
| `wall`            | 10 ms, configurable by `-i` | ~6,000 **per visited thread**, idle ones included |

Different engines produce different sample counts for the same duration, so the relative
error of a narrow frame differs between them. Read the sample count before treating a
0.3% frame as signal — optimising it and seeing no throughput change is the profiler
keeping a promise it never made.

## What blocks `perf_events` in a container

Four independent layers, checked in this order by the kernel, and each fails with the
same `Perf events unavailable` message. Diagnose from the outside in.

| Layer                                          | What it does                                                                                                                                                                                                  | Check                                                                     | Fix                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| seccomp                                        | Docker's default profile allows `perf_event_open` (and `bpf`) **only when the container holds `CAP_SYS_ADMIN`**; there is no `CAP_PERFMON` rule, so `--cap-add PERFMON` alone still gets `EPERM` from seccomp | `grep Seccomp /proc/<pid>/status` (`2` = filter active)                   | `--security-opt seccomp=unconfined` or a custom profile, then the capability below. Kubernetes pods are `Unconfined` unless `seccompProfile: RuntimeDefault` is set |
| capability                                     | `CAP_PERFMON` (5.8+) or `CAP_SYS_ADMIN` makes the process privileged for `perf_events` and **bypasses `perf_event_paranoid`** (kernel `perf-security.rst`). Root inside a container has neither by default    | `grep CapEff /proc/<pid>/status`, decode with `capsh --decode`            | `--cap-add PERFMON` (with the seccomp fix) or `securityContext.capabilities.add: [PERFMON]`; `SYS_ADMIN` is the wide hammer                                         |
| `kernel.perf_event_paranoid`                   | Host sysctl, not namespaced. Unprivileged: ≤ 1 allows kernel stacks, 2 (upstream default) user-space only, 3 (Debian/Ubuntu patch) nothing                                                                    | `cat /proc/sys/kernel/perf_event_paranoid`                                | At 2: `--all-user` (async-profiler does not retry user-only by itself). At 3: `--fdtransfer`, a capability, or `-e ctimer`                                          |
| `kernel.kptr_restrict` + `perf_event_mlock_kb` | `kptr_restrict ≠ 0` zeroes `/proc/kallsyms` for the unprivileged, so kernel frames stay as addresses; the mmap limit caps the 8 kB per-thread buffers                                                         | `kernel symbols are unavailable` / `perf_event mmap failed` in the output | `sysctl kernel.kptr_restrict=0`; raise `ulimit -l` or `kernel.perf_event_mlock_kb`                                                                                  |

`--fdtransfer` sidesteps seccomp, capability and paranoid at once: a privileged helper
opens the descriptor and passes it to the unprivileged target over a Unix socket
(`SCM_RIGHTS`). The kernel only ever sees the privileged process calling
`perf_event_open`. It needs one privileged process somewhere — on the host or in a
sidecar sharing the PID namespace.

## Attach is a different mechanism

HotSpot's dynamic attach is a Unix socket at `/tmp/.java_pid<PID>` that the JVM creates
on `SIGQUIT` when it finds `.attach_pid<PID>`. The JVM accepts a peer only with its own
effective uid and gid; `asprof` switches credentials to match when it runs as root, and
fails with `Failed to change credentials to match the target process` otherwise. Nothing
here touches `perf_events`, and nothing in `perf_events` touches this — which is why
"I added the recommended capability and it still does not work" is so common: a
capability was granted for the wrong mechanism. From a sidecar, share the PID namespace
(`shareProcessNamespace: true`) and run as the JVM's uid; from the host, run as root.

## Error message to cause

| `asprof` output                                               | Cause                                                                                                               | Remedy                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `Perf events unavailable`                                     | One of the four layers above; also WSL and hypervisors without PMU virtualisation                                   | Walk the table top-down; `--fdtransfer` or `-e ctimer` when the host cannot be changed                 |
| `perf_event mmap failed: Operation not permitted`             | 8 kB × threads exceeds the locked-memory limit                                                                      | `ulimit -l`, `kernel.perf_event_mlock_kb`, or fewer threads in `--filter`                              |
| `Could not start attach mechanism: No such file or directory` | `/tmp/.java_pid*` deleted by a tmp cleaner, `-XX:+DisableAttachMechanism`, or a different `/tmp` (chroot/container) | `lsof -p <pid> \| grep java_pid`; `kill -3 <pid>` to confirm the JVM responds; use the target's `/tmp` |
| `Failed to change credentials to match the target process`    | Profiler uid/gid differs from the JVM's and the profiler is not root                                                | Run as the JVM's user, or as root                                                                      |
| `Target JVM failed to load libasyncProfiler.so`               | The **JVM**, not `asprof`, opens the library and the output file                                                    | Absolute path readable by the JVM's uid; `-f` path writable by the JVM                                 |
| `VMStructs unavailable. Unsupported JVM?`                     | No `gHotSpotVMStructs` symbols — non-HotSpot, stripped, or missing debug symbols                                    | Install the JDK's debug symbols; `--cstack fp` as a fallback                                           |
| Kernel frames as raw addresses                                | `kptr_restrict ≠ 0`, or paranoid 2 without a capability                                                             | `sysctl kernel.kptr_restrict=0 kernel.perf_event_paranoid=1`                                           |
| Java stacks missing, native only                              | `-XX:MaxJavaStackTraceDepth=0`, or attach after JIT without `DebugNonSafepoints` (inlined frames only)              | `--cstack vm` ignores `MaxJavaStackTraceDepth`; restart with the diagnostic flags                      |

## Thread state to JFR event

| State seen in `wall`                | Cause in code                                  | JFR equivalent                      | In `-e lock`? |
| ----------------------------------- | ---------------------------------------------- | ----------------------------------- | ------------- |
| `java.lang.Thread.sleep`            | explicit `Thread.sleep()`                      | `jdk.ThreadSleep`                   | No            |
| `sun.nio.ch.EPollSelectorImpl.wait` | async socket/NIO I/O                           | `jdk.SocketRead`/`SocketWrite`      | No            |
| `java.lang.Object.wait`             | `wait()`/`notify()`                            | `jdk.JavaMonitorWait`               | No            |
| entering `synchronized`             | contended Java monitor                         | `jdk.JavaMonitorEnter`              | **Yes**       |
| `j.u.c.locks.LockSupport.park`      | `ReentrantLock`, `Semaphore`, pools (HikariCP) | `jdk.ThreadPark`                    | **Yes**       |
| `ForkJoinPool.awaitWork`/`.scan`    | FJP worker with no work                        | no dedicated event — idle in `wall` | No            |

`-e lock` with JFR output emits both `jdk.JavaMonitorEnter` and `jdk.ThreadPark` under
the same event category. One session covers `synchronized` and `j.u.c.locks` contention
together — broader than the naive reading of "lock means synchronized", and it is what
stops connection-pool waiting being misattributed to monitor contention.

## Hardware PMU counters

`-e <counter>` (`cache-misses`, `branch-misses`, `cycles`, …) configures
`perf_event_open` for that counter. A core has only 4–8 general-purpose performance
registers depending on microarchitecture; asking for more simultaneous events than that
forces the kernel to time-multiplex the counters and extrapolate each total from the
fraction of time it was actually counting. async-profiler applies the scale correction
automatically, but the variance of each individual estimate rises with every extra event.
For a high-confidence cache- or branch-miss investigation, run one hardware event at a
time.
