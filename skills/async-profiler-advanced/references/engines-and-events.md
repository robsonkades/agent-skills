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

| Attribute                                | `cpu` (perf_events)                                      | `itimer`                                                   | `ctimer`                                  |
| ---------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------- |
| Kernel mechanism                         | `perf_event_open`, one fd per thread                     | `setitimer(ITIMER_PROF)`, one per process                  | `timer_create()`, one timer per thread    |
| Kernel stack traces                      | Yes                                                      | No                                                         | No                                        |
| Resolution                               | High (CPU nanoseconds)                                   | Jiffy-limited (~4–10 ms)                                   | Jiffy-limited (~4–10 ms)                  |
| Fair distribution across threads         | Yes — signal goes to the thread whose counter overflowed | No — one process-wide signal, uneven across active threads | Better than `itimer`, still jiffy-limited |
| Works under restrictive seccomp/paranoid | No, by default                                           | Yes                                                        | Yes                                       |
| Consumes file descriptors                | Yes (one per thread)                                     | No                                                         | No                                        |
| Works on macOS                           | No                                                       | Yes (with limits)                                          | No (Linux-specific)                       |
| Automatic fallback                       | Falls back to `ctimer` when `perf_events` is unavailable | —                                                          | —                                         |

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

Three independent layers, and they fail differently:

1. **seccomp.** Docker's default profile does not list `perf_event_open`. Incidental, not
   a policy against profiling.
2. **`kernel.perf_event_paranoid`.** A **host** sysctl; in restricted mode (≥ 2) access is
   denied regardless of capability.
3. **Capabilities.** Kernel-visibility events need `CAP_SYS_ADMIN`, or the narrower
   `CAP_PERFMON` on kernels 5.8+.

Attach is a separate mechanism: HotSpot's dynamic attach protocol over a Unix socket at
`/tmp/.java_pid<PID>`. Under a restrictive Yama `ptrace_scope`, attaching across UIDs or
outside a direct ancestry relation may need `CAP_SYS_PTRACE` — even for `wall` or
`ctimer`, which never touch `perf_events`. This is why "I added the recommended
capability and it still does not work" is so common: `SYS_PTRACE` was granted for a
`perf_events` problem.

`--fdtransfer` sidesteps the whole question: a privileged helper opens the descriptor and
passes it to the unprivileged target over a Unix socket (`SCM_RIGHTS`). The kernel only
ever sees the privileged process calling `perf_event_open`.

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
