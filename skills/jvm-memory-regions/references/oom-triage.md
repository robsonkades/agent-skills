# OOM triage by region

## The message names the region

Message texts as JDK 25.0.3 emits them:

| Message                                                                                     | Region                  | Raising `-Xmx` does                                                     | Raised by                                                                                                                                                            |
| ------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Java heap space`                                                                           | heap                    | may help—or hide ownership pressure                                     | VM-reported failed heap allocation after collector-specific recovery attempts; not every path is literally one Full GC                                               |
| `GC overhead limit exceeded`                                                                | heap/policy             | may postpone                                                            | Applicable HotSpot overhead-limit policy detected little progress under extreme GC time; verify selected collector and effective flag rather than generalizing to G1 |
| `Requested array size exceeds VM limit`                                                     | heap (array length)     | nothing                                                                 | the VM: a length near `Integer.MAX_VALUE`, independent of free memory                                                                                                |
| `Metaspace`                                                                                 | Metaspace               | nothing                                                                 | metadata allocation failed at a configured/effective limit or native commit boundary                                                                                 |
| `Compressed class space`                                                                    | compressed class space  | nothing                                                                 | class-space allocation/reservation limit; commonly 1 GiB by default but release/layout configurable                                                                  |
| `Cannot reserve N bytes of direct buffer memory (allocated: A, limit: L)`                   | direct/native           | may raise the implicit direct limit; does not create native headroom    | **Java code** (`Bits.reserveMemory`) — see the flag coverage below                                                                                                   |
| `unable to create native thread: possibly out of memory or process/resource limits reached` | threads/native/OS       | does not create native headroom; reducing proven heap pressure may help | the VM, when native thread creation fails—PID/rlimit, cgroup memory, commit/address space and stack requirements compete                                             |
| no Java exception, exit code 137                                                            | SIGKILL (cause unknown) | larger heap can increase memory-kill risk                               | kernel delivered SIGKILL; distinguish cgroup/node OOM, orchestrator timeout and manual action externally                                                             |

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

Via JFR: the stock JDK 25 `profile` settings disable `jdk.ClassLoad`; explicitly enable it
for a bounded loading capture. An empty event list is evidence only within the enabled
events and collection window.

```bash
jcmd <pid> JFR.start name=mem_capture duration=60s settings=profile "jdk.ClassLoad#enabled=true" filename=/secure/diagnostics/mem.jfr
# Wait for this recording to finish, or take a supported dump of its verified ID.
# Copy the completed artifact from the target JVM's filesystem to the analysis host.

jfr print --events jdk.GCHeapSummary  /secure/diagnostics/mem.jfr   # heap over time
jfr print --events jdk.CodeCacheFull  /secure/diagnostics/mem.jfr   # code cache exhausted
jfr print --events jdk.ClassLoad      /secure/diagnostics/mem.jfr   # class loading
```

`jdk.CodeCacheFull` deserves special attention, but its presence proves an exhaustion
event—not that every later method remained interpreted or that it was the sole degradation
cause. Inspect event count/timestamps, segmented occupancy, compiler stop/restart/reclamation
logs and throughput (`code-cache-segments`).

## Class space, specifically

With compressed class pointers, `Klass` metadata uses the compressed class space. Its
commonly observed default reservation is 1 GiB, but the effective reservation/maximum is
flag-, layout- and release-dependent (including compact headers); read
`CompressedClassSpaceSize`/`VM.metaspace`. Proxy generation can exhaust class space while
non-class Metaspace looks comfortable. `MaxMetaspaceSize` and class-space reservation are
distinct constraints that can fail in different orders.

## What the JVM does on the next OOM

An `OutOfMemoryError` is an Error whose propagation depends on application/thread handling:
the task/thread may fail or catch it, and the process may continue with partial state —
a half-initialised request, a pool with a missing connection, a thread pool
one worker short. On HotSpot's covered `report_java_out_of_memory` path, enabled handlers
run in this order: heap dump, OnOutOfMemoryError command, then crash (which takes precedence)
or immediate exit. This is not a hook for every VM/native allocation failure.

| Flag                              | Effect                                                                                                                                                       | Prefer when                                                                                                                                | Becomes problematic when                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-XX:+ExitOnOutOfMemoryError`     | Terminates after a covered VM-reported OOM; observed HotSpot builds may use exit status 3, which is not an application portability contract                  | An orchestrator restarts and replacement is safer than unknown partial state                                                               | Availability/restart loop or an intentionally handled bounded task failure requires a different policy                                            |
| `-XX:+CrashOnOutOfMemoryError`    | Fatal error: hs_err written (`fatal error: OutOfMemory encountered: …`) and a core if enabled and permitted by OS, dumpability, collector and storage policy | A core with the heap _and_ native memory is wanted for correlation — a suspected native leak alongside the Java OOM (jhsdb-and-core-dumps) | The potentially large core/dump size (OS filters and policy determine contents) on a node with no room; the hs_err is mistaken for a native crash |
| `-XX:OnOutOfMemoryError="cmd %p"` | Runs the command before exiting or crashing                                                                                                                  | A bounded external notification/capture needs no attach response from the failing JVM                                                      | The external command needs attach/JVM cooperation while the failing JVM is handling OOM or takes longer than the orchestrator's kill timeout      |
| none of the three                 | Exception propagates; the failing thread may catch it, terminate, or bring down the process depending on thread/application structure                        | An explicitly tested recovery contract exists for that OOM class                                                                           | Partial state, lost critical thread or repeated OOM can make health checks misleading                                                             |

Coverage examples previously exercised on 25.0.3: these handlers fire on covered report paths — `Java heap space`, `Metaspace`, `Requested array size exceeds VM
limit` — and **not** for `Cannot reserve N bytes of direct buffer memory`, which is a plain
`new OutOfMemoryError` in Java code: these flags alone do not terminate for that direct-buffer OOME; uncaught propagation
or application policy can still terminate the process, which is why off-heap-memory tells you to bound and monitor the
pool instead. `unable to create native thread` was not exercised here; treat it as
uncovered until tested on the target. The shared reporting gate is consumed at the first covered report, even if dumping is
then disabled or its file write fails. Arming HeapDumpOnOutOfMemoryError afterwards does not
reset it. Budget a unique writable destination beforehand; a later manual dump is a separate
operation with its own safety constraints (`heap-dump-analysis`).

## Preventive configuration

- [ ] If data governance, pause, disk and cgroup page-cache budget permit,
      `-XX:+HeapDumpOnOutOfMemoryError` with `HeapDumpPath` on durable restricted storage—both `manageable`, so a running JVM can be armed with
      `jcmd <pid> VM.set_flag`
- [ ] `-XX:+ExitOnOutOfMemoryError` or `CrashOnOutOfMemoryError`, chosen by the table above
- [ ] For Metaspace suspicion: track classloader count over time, not just usage

Judge comparable trends, not an instant: equivalent post-reclamation occupancy, load,
class count, native categories and cgroup charges. A rising heap floor shows higher observed
occupancy, not by itself greater reachable or retained size: a young collection can leave
unreachable old objects untouched. Check which regions were reclaimed and use dominators/root
paths when retention matters (`heap-dump-analysis`). Confirmed retention may be legitimate
working set, cache or a defect; a collector flag cannot remove an unwanted strong owner.

## Primary sources

- [HotSpot JDK 25 OOM reporting](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/utilities/debug.cpp)
  — once-only report gate and handler ordering.
- [JDK 25 Bits.reserveMemory](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/share/classes/java/nio/Bits.java)
  — Java-thrown direct-buffer OOME and reservation accounting.
- [JDK 25 G1 collection cycle and collection set](https://docs.oracle.com/en/java/javase/25/gctuning/garbage-first-g1-garbage-collector1.html)
  — incremental reclamation and the limits of post-young-GC occupancy as retention evidence.
