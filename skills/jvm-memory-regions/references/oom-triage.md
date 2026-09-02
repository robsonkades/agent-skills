# OOM triage by region

## The message names the region

Message texts as JDK 25.0.3 emits them:

| Message                                                                                     | Region              | Raising `-Xmx` does       | Raised by                                                                                                                                                           |
| ------------------------------------------------------------------------------------------- | ------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Java heap space`                                                                           | heap                | may help — or hide a leak | the VM, on a failed allocation after a full collection                                                                                                              |
| `GC overhead limit exceeded`                                                                | heap                | postpones                 | Parallel's `UseGCOverheadLimit` checker: the heap is effectively full, the process is still alive; G1 shows the same state as back-to-back full collections instead |
| `Requested array size exceeds VM limit`                                                     | heap (array length) | nothing                   | the VM: a length near `Integer.MAX_VALUE`, independent of free memory                                                                                               |
| `Metaspace`                                                                                 | Metaspace           | nothing                   | the VM, at `MaxMetaspaceSize`                                                                                                                                       |
| `Compressed class space`                                                                    | class space (≤1 GB) | nothing                   | the VM, at `CompressedClassSpaceSize`                                                                                                                               |
| `Cannot reserve N bytes of direct buffer memory (allocated: A, limit: L)`                   | direct/native       | nothing                   | **Java code** (`Bits.reserveMemory`) — see the flag coverage below                                                                                                  |
| `unable to create native thread: possibly out of memory or process/resource limits reached` | stacks / OS limits  | **makes it worse**        | the VM, when the OS refuses the thread — `ulimit -u`, `pids.max`, address space                                                                                     |
| no Java exception, exit code 137                                                            | cgroup OOM kill     | makes it worse            | the kernel                                                                                                                                                          |

The last row is not an `OutOfMemoryError` at all: the kernel sent `SIGKILL`, so there is
no stack trace and no heap dump by construction. Check the exit code before searching
application logs for a cause that cannot be there.

## Confirming each

```bash
jcmd <pid> VM.native_memory summary   # authoritative per-region view (needs NMT at start)
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

`jdk.CodeCacheFull` deserves special attention: it fires **once** and its effect is
permanent. If it exists in the recording, "it degraded after a while" is already
diagnosed.

## Class space, specifically

`InstanceKlass` lives in the Metaspace **class space**, whose default ceiling is 1 GB —
not in the non-class space. An application that generates many proxies can exhaust it
while total Metaspace still looks comfortable, and `MaxMetaspaceSize` will have no effect
on that ceiling.

## What the JVM does on the next OOM

Left alone, an `OutOfMemoryError` is an exception like any other: the thread that hit it
dies or catches it, and the process keeps running with whatever state the failed allocation
left behind — a half-initialised request, a pool with a missing connection, a thread pool
one worker short. Three flags change that, and they fire in this order, once per process
(executed on 25.0.3): heap dump, then the `OnOutOfMemoryError` command, then crash or
exit.

| Flag                              | Effect                                                                                                                             | Prefer when                                                                                                                                | Becomes problematic when                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `-XX:+ExitOnOutOfMemoryError`     | `Terminating due to java.lang.OutOfMemoryError: …` on stdout, exit status **3**, no hs_err                                         | An orchestrator restarts the process and a clean replacement beats a half-dead survivor — the usual production choice                      | The process is the only replica and a degraded survivor is still better than none; or the OOM is a per-task condition the code handles |
| `-XX:+CrashOnOutOfMemoryError`    | Fatal error: hs_err written (`fatal error: OutOfMemory encountered: …`) and a core if `CreateCoredumpOnCrash` and the ulimit allow | A core with the heap _and_ native memory is wanted for correlation — a suspected native leak alongside the Java OOM (jhsdb-and-core-dumps) | The core's size (whole address space) on a node with no room; the hs_err is mistaken for a native crash                                |
| `-XX:OnOutOfMemoryError="cmd %p"` | Runs the command before exiting or crashing                                                                                        | Something must be captured that the JVM cannot write itself — an NMT report, a thread dump to a sidecar                                    | The command needs the JVM's cooperation (it is inside the failing process) or takes longer than the orchestrator's kill timeout        |
| none of the three                 | Exception propagates; process lives                                                                                                | Single replica and no restart automation, with alerting on the OOM count                                                                   | Every other case: the failure is silent and the survivor lies to its health checks                                                     |

Coverage limits, all executed on 25.0.3: the three flags and the automatic heap dump fire
for errors the VM raises — `Java heap space`, `Metaspace`, `Requested array size exceeds VM
limit` — and **not** for `Cannot reserve N bytes of direct buffer memory`, which is a plain
`new OutOfMemoryError` in Java code: a direct-memory exhaustion leaves the process running
whatever the flags say, which is why off-heap-memory tells you to bound and monitor the
pool instead. `unable to create native thread` was not exercised here; treat it as
uncovered until tested on the target. The dump's own once-only behaviour and its cost are
heap-dump-analysis.

## Preventive configuration

- [ ] `-XX:+HeapDumpOnOutOfMemoryError` with `-XX:HeapDumpPath` on a volume that survives
      the restart — both `manageable`, so a running JVM can be armed with
      `jcmd <pid> VM.set_flag`
- [ ] `-XX:+ExitOnOutOfMemoryError` or `CrashOnOutOfMemoryError`, chosen by the table above
- [ ] For Metaspace suspicion: track classloader count over time, not just usage

Judge the **trend**, not the instant: the number that matters is the floor after a full
collection, and whether that floor rises cycle over cycle. A rising floor is retention,
and no flag fixes retention.
