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
`jhsdb jmap --binaryheap` reads process memory externally (a ptrace-equivalent mechanism)
without a normal target-VM safepoint handshake, but live-process SA attach is invasive: it
suspends the target and concurrent serviceability attaches can corrupt the investigation or
leave the JVM unhealthy. Prefer `jhsdb` against a core dump; if live attach is the only
option, drain the instance, use one operator/tool and plan restart/recovery.

## The live-filter trade-off

| Choice                                            | What you get                                                    | What it costs                                                                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Full GC first (`jcmd` default, `jmap -dump:live`) | Objects reachable after that collection; less unreachable noise | A full GC on an already-pressured heap can take tens of seconds to minutes before the file is written; survivors are not thereby proven leaks |
| No forced GC (`-all`, plain `jmap -dump`)         | Fires immediately, raw state                                    | Larger file, polluted with garbage not yet swept                                                                                              |

A dump written by `-XX:+HeapDumpOnOutOfMemoryError` is not requested with the interactive
“live” filter. The failing allocation path may already have attempted collection, but the
resulting HPROF can still contain objects not useful to the retention question. Read it
through ownership/reachability evidence, not raw instance counts.

## What a dump costs in production

| Cost                     | Mechanism                                                                                                                                                                                                            | What to do before capturing                                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pause                    | `VM_HeapDumper` runs at a safepoint; every Java thread stays stopped until the last byte is written. Duration scales with live objects and with the write speed of the destination                                   | Drain the instance from the load balancer first. Record duration from `jdk.HeapDump` in JFR or `-Xlog:heapdump`; `-parallel=<n>` splits the walk across dumper threads                                                                 |
| Preceding full GC        | Without `-all` a full collection runs before the walk, on a heap that is already under pressure                                                                                                                      | See the live-filter table below; `-all` when the pause matters more than a clean histogram                                                                                                                                             |
| Disk                     | HPROF size depends on captured reachability, object/array payloads, identifiers, class records and encoding; one 25.0.3 array-heavy run produced 214 MB for ~210 MB of live arrays, which is not a universal ratio   | Budget from a representative dump with contingency up to the relevant heap/capture state. `-gz` compresses inline, but compression work occurs during the operation—measure pause/CPU before choosing a level above 1                  |
| Page cache in a cgroup   | Dirty file pages can be charged to the writer's cgroup. A heap-sized dump can push the cgroup over its limit while the JVM is paused, including on a persistent filesystem                                           | Leave measured memory/disk headroom and test accounting/writeback on the target runtime. A persistent volume preserves the file but does not by itself remove page-cache charging; never use memory-backed `emptyDir` for a large dump |
| Auto-dump is once-only   | `-XX:+HeapDumpOnOutOfMemoryError` writes on the **first** VM-raised `OutOfMemoryError` of the process and never again; an OOM constructed in Java code (`Cannot reserve … direct buffer memory`) does not trigger it | Do not let a caught-and-logged OOM consume the one shot. Pair with `-XX:+ExitOnOutOfMemoryError` so the dump is followed by a restart rather than a half-dead JVM (decision in jvm-memory-regions)                                     |
| Destination is ephemeral | `HeapDumpPath` pointing at the container's overlay filesystem vanishes with the pod                                                                                                                                  | Point it at a directory on a volume; a directory value yields `java_pid<pid>.hprof` inside it. `HeapDumpPath`, `HeapDumpGzipLevel` and the flag itself are settable live with `jcmd VM.set_flag`                                       |

Lower-artifact questions first when their impact fits: `jcmd <pid> GC.class_histogram`
(still a high-impact safepoint operation; filter behavior is command/version-specific, but
there is no HPROF file; `-parallel` on 25) estimates “which class”, and JFR's `jdk.OldObjectSample`
answers "which allocation site is retained" from a running process — see
java-reference-types-and-leaks for its settings and its ZGC caveat.

## From a container

```bash
# When the image already contains a compatible JDK tool:
docker exec container /opt/java/openjdk/bin/jcmd <pid> GC.heap_dump /dumps/dump.hprof
docker cp container:/dumps/dump.hprof ./dump.hprof
```

Do not copy only the `jcmd` executable into a minimal image: it depends on the matching JDK
runtime/libraries and attach permissions. Use a compatible diagnostic image/container that
shares the target PID namespace and credentials, or bake supported tools into the image;
test the platform-specific attach path before the incident.

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

Prefer a controlled representative baseline or lower-cost class/JFR statistics; archiving
a healthy production dump adds a global pause and creates a sensitive-data artifact. A
single count cannot distinguish normal working set from growth, but comparisons are valid
only when load, cache state, topology, JDK/layout and capture filter are normalized.

## Initial triage: leak or peak?

| Signal                                                                       | Reading                                                                                             |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Captured live bytes near the effective heap limit after a requested full GC  | Strong retention/capacity evidence; distinguish legitimate working set from leak                    |
| Captured live bytes materially below the effective limit                     | Capture may miss the peak/use another capacity basis, or the OOM may be non-heap; reconcile context |
| Taken at peak load versus at idle                                            | In-flight request objects are expected at peak; the same volume at idle is the real suspicion       |
| One dominator owns a material share and grows across normalized observations | High-value starting point; a business cache/index may legitimately dominate                         |
| Many medium objects, none dominant                                           | Legitimate fragmented usage, or several small simultaneous leaks                                    |

## Two dumps beat one

```bash
jcmd <pid> GC.heap_dump dump1.hprof
sleep 600
jcmd <pid> GC.heap_dump dump2.hprof

# MAT: Window -> Heap Dump -> Compare Baselines -> "Compare Histograms"
```

Monotonic normalized growth strengthens an unbounded-retention hypothesis; it does not by
itself prove a defect. Legitimate append-only state, changed traffic/cardinality, delayed
expiry and topology shifts can have the same shape. Conversely, two stable points do not
prove safety if the growth is bursty or the observation window misses its trigger. Trace
the strong ownership path and compare behavior with the declared capacity/lifecycle
contract.

Apply the same discipline to validating a fix: two post-fix dumps under equivalent load,
separated in time, showing the former dominator no longer growing. Then run long enough
in production or representative staging to see used heap stabilise — the absence of an
immediate OOM proves nothing.

## Dumps too large for a local MAT

MAT index memory can be comparable to or greater than dump size; “2×” is only a planning
heuristic and varies with object count, identifiers, parser version and indexes. Run a
representative parse with disk/RAM headroom and record the tool version. Beyond local
capacity:

- **HeapHero.io** — online `.hprof` analysis; the heap-dump sibling of GCeasy.io.
- **jxray.com** — commercial, aimed at very large dumps, with common leak patterns
  pre-computed.

JDK Mission Control and GCeasy.io are frequently cited as ways to "open the `.hprof`".
Neither does. JMC views JFR recordings; GCeasy.io analyses GC logs.
