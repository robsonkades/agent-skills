# OOM triage by region

## The message names the region

| Message                          | Region              | Raising `-Xmx` does       |
| -------------------------------- | ------------------- | ------------------------- |
| `Java heap space`                | heap                | may help — or hide a leak |
| `Metaspace`                      | Metaspace           | nothing                   |
| `Compressed class space`         | class space (≤1 GB) | nothing                   |
| `Direct buffer memory`           | direct/native       | nothing                   |
| `unable to create native thread` | stacks / OS limits  | **makes it worse**        |
| no Java exception, exit code 137 | cgroup OOM kill     | makes it worse            |

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

## Preventive configuration

- [ ] `-XX:+HeapDumpOnOutOfMemoryError` with `-XX:HeapDumpPath` on a volume that survives
      the restart
- [ ] `-XX:+ExitOnOutOfMemoryError`, so a partially dead JVM does not linger
- [ ] For Metaspace suspicion: track classloader count over time, not just usage

Judge the **trend**, not the instant: the number that matters is the floor after a full
collection, and whether that floor rises cycle over cycle. A rising floor is retention,
and no flag fixes retention.
