# OOM triage by region

## The message names the region

Message texts as JDK 25.0.3 emits them:

| Message                                                                                     | Region                  | Raising `-Xmx` does                                      | Raised by                                                                                                                                                            |
| ------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Java heap space`                                                                           | heap                    | may help—or hide ownership pressure                      | VM-reported failed heap allocation after collector-specific recovery attempts; not every path is literally one Full GC                                               |
| `GC overhead limit exceeded`                                                                | heap/policy             | may postpone                                             | Applicable HotSpot overhead-limit policy detected little progress under extreme GC time; verify selected collector and effective flag rather than generalizing to G1 |
| `Requested array size exceeds VM limit`                                                     | heap (array length)     | nothing                                                  | the VM: a length near `Integer.MAX_VALUE`, independent of free memory                                                                                                |
| `Metaspace`                                                                                 | Metaspace               | nothing                                                  | metadata allocation failed at a configured/effective limit or native commit boundary                                                                                 |
| `Compressed class space`                                                                    | compressed class space  | nothing                                                  | class-space allocation/reservation limit; commonly 1 GiB by default but release/layout configurable                                                                  |
| `Cannot reserve N bytes of direct buffer memory (allocated: A, limit: L)`                   | direct/native           | nothing                                                  | **Java code** (`Bits.reserveMemory`) — see the flag coverage below                                                                                                   |
| `unable to create native thread: possibly out of memory or process/resource limits reached` | threads/native/OS       | helps only if heap consumes the proven limiting resource | the VM, when native thread creation fails—PID/rlimit, cgroup memory, commit/address space and stack requirements compete                                             |
| no Java exception, exit code 137                                                            | SIGKILL (cause unknown) | larger heap can increase memory-kill risk                | kernel delivered SIGKILL; distinguish cgroup/node OOM, orchestrator timeout and manual action externally                                                             |

The last row is not an `OutOfMemoryError`: exit 137 conventionally means SIGKILL, which the
JVM cannot intercept. It does **not** identify who sent it. Check cgroup `memory.events`,
kernel/node logs and orchestrator events before attributing it to memory.

## Confirming each

```bash
jcmd <pid> VM.native_memory summary   # JVM-tracked category view (needs NMT at start)
jcmd <pid> VM.metaspace               # usage, capacity, and class space separately
jcmd <pid> Compiler.codecache         # size / used / max_used / free
jcmd <pid> VM.classloader_stats       # loader count and classes per loader
jcmd <pid> GC.heap_info               # heap summary by generation
```

Via JFR:

```bash
jcmd <pid> JFR.start duration=60s settings=profile filename=/tmp/mem.jfr

jfr print --events jdk.GCHeapSummary  /tmp/mem.jfr   # heap over time
jfr print --events jdk.CodeCacheFull  /tmp/mem.jfr   # code cache exhausted
jfr print --events jdk.ClassLoad      /tmp/mem.jfr   # class loading
```

`jdk.CodeCacheFull` deserves special attention, but its presence proves an exhaustion
event—not that every later method remained interpreted or that it was the sole degradation
cause. Inspect event count/timestamps, segmented occupancy, compiler stop/restart/flushing
logs and throughput (`code-cache-segments`).

## Class space, specifically

With compressed class pointers, `Klass` metadata uses the compressed class space. Its
commonly observed default reservation is 1 GiB, but the effective reservation/maximum is
flag-, layout- and release-dependent (including compact headers); read
`CompressedClassSpaceSize`/`VM.metaspace`. Proxy generation can exhaust class space while
non-class Metaspace looks comfortable. `MaxMetaspaceSize` and class-space reservation are
distinct constraints that can fail in different orders.

## What the JVM does on the next OOM

Left alone, an `OutOfMemoryError` is an exception like any other: the thread that hit it
dies or catches it, and the process keeps running with whatever state the failed allocation
left behind — a half-initialised request, a pool with a missing connection, a thread pool
one worker short. Three flags change that, and they fire in this order, once per process
(executed on 25.0.3): heap dump, then the `OnOutOfMemoryError` command, then crash or
exit.

| Flag                              | Effect                                                                                                                                      | Prefer when                                                                                                                                | Becomes problematic when                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `-XX:+ExitOnOutOfMemoryError`     | Terminates after a covered VM-reported OOM; observed HotSpot builds may use exit status 3, which is not an application portability contract | An orchestrator restarts and replacement is safer than unknown partial state                                                               | Availability/restart loop or an intentionally handled bounded task failure requires a different policy                          |
| `-XX:+CrashOnOutOfMemoryError`    | Fatal error: hs_err written (`fatal error: OutOfMemory encountered: …`) and a core if `CreateCoredumpOnCrash` and the ulimit allow          | A core with the heap _and_ native memory is wanted for correlation — a suspected native leak alongside the Java OOM (jhsdb-and-core-dumps) | The core's size (whole address space) on a node with no room; the hs_err is mistaken for a native crash                         |
| `-XX:OnOutOfMemoryError="cmd %p"` | Runs the command before exiting or crashing                                                                                                 | Something must be captured that the JVM cannot write itself — an NMT report, a thread dump to a sidecar                                    | The command needs the JVM's cooperation (it is inside the failing process) or takes longer than the orchestrator's kill timeout |
| none of the three                 | Exception propagates; the failing thread may catch it, terminate, or bring down the process depending on thread/application structure       | An explicitly tested recovery contract exists for that OOM class                                                                           | Partial state, lost critical thread or repeated OOM can make health checks misleading                                           |

Coverage limits, all executed on 25.0.3: the three flags and the automatic heap dump fire
for errors the VM raises — `Java heap space`, `Metaspace`, `Requested array size exceeds VM
limit` — and **not** for `Cannot reserve N bytes of direct buffer memory`, which is a plain
`new OutOfMemoryError` in Java code: a direct-memory exhaustion leaves the process running
whatever the flags say, which is why off-heap-memory tells you to bound and monitor the
pool instead. `unable to create native thread` was not exercised here; treat it as
uncovered until tested on the target. The dump's own once-only behaviour and its cost are
heap-dump-analysis.

## Preventive configuration

- [ ] If data governance, pause, disk and cgroup page-cache budget permit,
      `-XX:+HeapDumpOnOutOfMemoryError` with `HeapDumpPath` on durable restricted storage—both `manageable`, so a running JVM can be armed with
      `jcmd <pid> VM.set_flag`
- [ ] `-XX:+ExitOnOutOfMemoryError` or `CrashOnOutOfMemoryError`, chosen by the table above
- [ ] For Metaspace suspicion: track classloader count over time, not just usage

Judge comparable trends, not an instant: equivalent post-reclamation occupancy, load,
class count, native categories and cgroup charges. A rising heap floor means more remains
reachable under those conditions; it may be legitimate working set, cache or a defect. A
collector flag cannot remove an unwanted strong owner.
