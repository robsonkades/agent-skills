# Capturing a heap dump and triaging it

## The four capture methods

```bash
# 1 — automatic on OOM (opt-in; off by default)
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/path/to/dump.hprof     # default: working dir, java_pid<pid>.hprof

# 2 — jcmd (modern, preferred interactively; options as printed by JDK 25 `help GC.heap_dump`)
jcmd <pid> GC.heap_dump /path/dump.hprof                 # no -all: full GC before the dump
jcmd <pid> GC.heap_dump -all /path/dump.hprof            # includes unreachable objects, no forced GC
jcmd <pid> GC.heap_dump -gz=1 -overwrite /path/dump.hprof.gz   # gzip inline; 1 = fastest ("recommended"), 9 = smallest
jcmd <pid> GC.heap_dump -parallel=4 /path/dump.hprof     # dumper threads; default 1, the VM may use fewer

# 3 — jmap (legacy, same underlying mechanism; also accepts gz=<1-9>)
jmap -dump:live,format=b,file=dump.hprof <pid>           # forces full GC — survivors only
jmap -dump:format=b,file=dump.hprof <pid>                # unfiltered, includes uncollected garbage

# 4 — JVM that cannot reach a safepoint, via the Serviceability Agent
jhsdb jmap --pid <pid> --binaryheap
```

Methods 2 and 3 both deliver a command through the Dynamic Attach API to the target's
Attach Listener thread, which schedules the `VM_HeapDumper` VM operation on the
`VMThread`. That operation requires a safepoint: every Java thread stops for the duration
of the capture. There is no safepoint-free heap dump path through these tools.

Confirm the installed build's behaviour rather than trusting a runbook:

```bash
jcmd <pid> help GC.heap_dump
# Impact: High: Depends on Java heap size and content.
# Request a full GC unless the '-all' option is specified.
```

If the JVM is wedged such that no thread reaches a safepoint — a native deadlock, for
instance — `jcmd` and `jmap` both hang waiting for an operation that will never run.
`jhsdb jmap --binaryheap` reads the process memory externally (a ptrace-equivalent
mechanism) without needing the target's cooperation.

## The live-filter trade-off

| Choice                                            | What you get                            | What it costs                                                                                                                                                                 |
| ------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full GC first (`jcmd` default, `jmap -dump:live`) | Only surviving objects — no false leaks | A full GC on an already-pressured heap can take tens of seconds to minutes before the file is written; during a live incident that pause may itself be the user-visible event |
| No forced GC (`-all`, plain `jmap -dump`)         | Fires immediately, raw state            | Larger file, polluted with garbage not yet swept                                                                                                                              |

A dump written by `-XX:+HeapDumpOnOutOfMemoryError` never gets the filter: the JVM has
already failed to allocate, and running another full GC would risk both freeing enough
memory to destroy the evidence and failing again. Read those dumps through the Dominator
Tree, never through raw instance counts.

## What a dump costs in production

| Cost                     | Mechanism                                                                                                                                                                                                            | What to do before capturing                                                                                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pause                    | `VM_HeapDumper` runs at a safepoint; every Java thread stays stopped until the last byte is written. Duration scales with live objects and with the write speed of the destination                                   | Drain the instance from the load balancer first. Record duration from `jdk.HeapDump` in JFR or `-Xlog:heapdump`; `-parallel=<n>` splits the walk across dumper threads                                                        |
| Preceding full GC        | Without `-all` a full collection runs before the walk, on a heap that is already under pressure                                                                                                                      | See the live-filter table below; `-all` when the pause matters more than a clean histogram                                                                                                                                    |
| Disk                     | HPROF writes each object's fields and array payload raw, so the uncompressed file is about the live set (here: a 214 MB file for 210 MB of live arrays on 25.0.3). `-all` adds the garbage not yet collected         | `df` the destination for a full `-Xmx` worth of bytes. `-gz` compresses inline, but the compression work happens inside the safepoint — measure before choosing a level above 1                                               |
| Page cache in a cgroup   | Dirty file pages are charged to the container's memory. A heap-sized file written into the container's own filesystem can push the cgroup over its limit while the JVM is paused — the dump OOMKills the pod         | Write to a volume that is not `medium: Memory`, leave headroom of the dump's size under the limit, or stream out (`kubectl cp` after the fact is too late if the pod is already gone). Page-cache accounting is linux-for-jvm |
| Auto-dump is once-only   | `-XX:+HeapDumpOnOutOfMemoryError` writes on the **first** VM-raised `OutOfMemoryError` of the process and never again; an OOM constructed in Java code (`Cannot reserve … direct buffer memory`) does not trigger it | Do not let a caught-and-logged OOM consume the one shot. Pair with `-XX:+ExitOnOutOfMemoryError` so the dump is followed by a restart rather than a half-dead JVM (decision in jvm-memory-regions)                            |
| Destination is ephemeral | `HeapDumpPath` pointing at the container's overlay filesystem vanishes with the pod                                                                                                                                  | Point it at a directory on a volume; a directory value yields `java_pid<pid>.hprof` inside it. `HeapDumpPath`, `HeapDumpGzipLevel` and the flag itself are settable live with `jcmd VM.set_flag`                              |

Cheaper questions first: `jcmd <pid> GC.class_histogram` (also a safepoint operation, but no
file; `-parallel` on 25) answers "which class" without a dump, and JFR's `jdk.OldObjectSample`
answers "which allocation site is retained" from a running process — see
java-reference-types-and-leaks for its settings and its ZGC caveat.

## From a container

```bash
docker cp "$JAVA_HOME/bin/jcmd" container:/tmp/          # if jcmd is not in the image
docker exec container /tmp/jcmd <pid> GC.heap_dump /tmp/dump.hprof
docker cp container:/tmp/dump.hprof ./dump.hprof
```

Check free disk first: an uncompressed dump can approach the size of the used heap, and
`/tmp` inside the container is charged to the pod's memory while the pages are dirty.

## Context to record with the file

Without these, the dump cannot be compared to anything and its numbers cannot be read:

- `-Xmx` of the process — the dump is only meaningful in proportion to the configured heap.
- Wall-clock time, approximate load in req/s, and JVM uptime at capture.
- Whether `-XX:+UseCompactObjectHeaders` was enabled. JEP 519 is product in JDK 25 and off
  by default; with it on, every object's header drops from 12–16 bytes to a single 8-byte
  header, shifting the shallow size of the entire heap. A histogram diff across that flag
  shows a delta that came from layout, not from code.

Archive a baseline dump from a healthy system shortly after the first stable production
deploy. 10,000 `UserSession` instances may be normal or may be a nascent leak; a single
dump cannot tell the difference, and MAT's "Compare Histograms" against a baseline can.

## Initial triage: leak or peak?

| Signal                                                                  | Reading                                                                                       |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Dump size ≈ 90–95%+ of configured `-Xmx`, taken after a full GC         | Heap genuinely exhausted — real retention, not pending garbage                                |
| Dump size ≈ 60–70% of `-Xmx`, taken after a full GC                     | The heap is not at its limit; check whether `-Xmx` is oversized or the dump missed the peak   |
| Taken at peak load versus at idle                                       | In-flight request objects are expected at peak; the same volume at idle is the real suspicion |
| One object at the top of the Dominator Tree retaining > 30% of the heap | Probable single root cause — start there                                                      |
| Many medium objects, none dominant                                      | Legitimate fragmented usage, or several small simultaneous leaks                              |

## Two dumps beat one

```bash
jcmd <pid> GC.heap_dump dump1.hprof
sleep 600
jcmd <pid> GC.heap_dump dump2.hprof

# MAT: Window -> Heap Dump -> Compare Baselines -> "Compare Histograms"
```

Growth that is monotonic and proportional to elapsed time confirms a leak. A high
instance count that stabilises between the two captures is load, not retention.

Apply the same discipline to validating a fix: two post-fix dumps under equivalent load,
separated in time, showing the former dominator no longer growing. Then run long enough
in production or representative staging to see used heap stabilise — the absence of an
immediate OOM proves nothing.

## Dumps too large for a local MAT

MAT typically needs about 2× the dump size as `-Xmx` in its own `MemoryAnalyzer.ini` to
index comfortably. Beyond that:

- **HeapHero.io** — online `.hprof` analysis; the heap-dump sibling of GCeasy.io.
- **jxray.com** — commercial, aimed at very large dumps, with common leak patterns
  pre-computed.

JDK Mission Control and GCeasy.io are frequently cited as ways to "open the `.hprof`".
Neither does. JMC views JFR recordings; GCeasy.io analyses GC logs.
