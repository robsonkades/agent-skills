# Capturing a heap dump and triaging it

## The four capture methods

These are alternative recipes. Choose a fresh destination visible in the target JVM's
filesystem/namespace and preserve prior incident artifacts. Add `-overwrite` only for an
intentional, authorized replacement of owned disposable output; do not use it to replace
previous incident evidence. Gzip compression does not require overwrite.

```bash
# 1 — automatic on OOM (opt-in; off by default)
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/path/to/dump.hprof     # default: working dir, java_pid<pid>.hprof

# 2 — jcmd (modern, preferred interactively; options as printed by JDK 25 `help GC.heap_dump`)
jcmd <pid> GC.heap_dump /path/dump.hprof                 # no -all: full GC before the dump
jcmd <pid> GC.heap_dump -all /path/dump.hprof            # includes unreachable objects, no forced GC
jcmd <pid> GC.heap_dump -gz=1 /path/dump.hprof.gz        # gzip inline; 1 = fastest ("recommended"), 9 = smallest
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
of the object walk. In HotSpot 25 the final merge of dump fragments occurs outside the
safepoint; total command duration includes more than the pause. There is no safepoint-free
heap dump path through these tools.

Confirm the installed build's behaviour rather than trusting a runbook:

```bash
jcmd <pid> help GC.heap_dump
# Impact: High: Depends on Java heap size and content.
# Request a full GC unless the '-all' option is specified.
```

If attach processing or safepoint progress is stuck, `jcmd` and `jmap` can wait indefinitely.
A blocked native thread or application deadlock alone does not prove safepoints are
impossible: a thread in native state can already be safepoint-safe. Inspect thread/VM
state before escalating to SA.
`jhsdb jmap --binaryheap` reads process memory externally (a ptrace-equivalent mechanism)
without a normal target-VM safepoint handshake, but live-process SA attach is invasive: it
suspends the target and concurrent serviceability attaches can corrupt the investigation or
leave the JVM unhealthy. Prefer `jhsdb` against a core dump; if live attach is the only
option, drain the instance, use one operator/tool and plan restart/recovery.

## The live-filter trade-off

| Choice                                            | What you get                                                     | What it costs                                                                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Full GC first (`jcmd` default, `jmap -dump:live`) | Objects reachable after that collection; less unreachable noise  | A full GC on an already-pressured heap can take tens of seconds to minutes before the file is written; survivors are not thereby proven leaks |
| No forced GC (`-all`, plain `jmap -dump`)         | Raw state after attach/safepoint scheduling; no requested pre-GC | Still pauses for the object walk; may produce more unreachable-object noise and a larger file                                                 |

A dump written by `-XX:+HeapDumpOnOutOfMemoryError` is not requested with the interactive
“live” filter. The failing allocation path may already have attempted collection, but the
resulting HPROF can still contain objects not useful to the retention question. Read it
through ownership/reachability evidence, not raw instance counts.

## What a dump costs in production

| Cost                     | Mechanism                                                                                                                                                                  | What to do before capturing                                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pause                    | `VM_HeapDumper` captures at a safepoint; HotSpot 25 then merges fragments outside it. Object count, I/O and compression affect duration                                    | Drain within available capacity. Correlate safepoint logs with `jdk.HeapDump`/heapdump logs; the latter include total work, not just pause. `-parallel=<n>` splits the walk                                                            |
| Preceding full GC        | Without `-all` a full collection runs before the walk, on a heap that is already under pressure                                                                            | See the live-filter table below; `-all` when the pause matters more than a clean histogram                                                                                                                                             |
| Disk                     | HPROF size depends on object payloads, identifiers, class records and encoding; temporary fragments plus merged output can exceed final artifact size                      | Measure peak disk as well as final bytes. `-gz` compresses during capture; measure pause/CPU before choosing a level above 1                                                                                                           |
| Page cache in a cgroup   | Dirty file pages can be charged to the writer's cgroup. A heap-sized dump can push the cgroup over its limit while the JVM is paused, including on a persistent filesystem | Leave measured memory/disk headroom and test accounting/writeback on the target runtime. A persistent volume preserves the file but does not by itself remove page-cache charging; never use memory-backed `emptyDir` for a large dump |
| Auto-dump is once-only   | HotSpot attempts a dump on the first applicable VM-raised OOME; even a failed write consumes the attempt. Java-constructed direct-buffer OOME does not trigger it          | Verify destination/space in advance. Consider `-XX:+ExitOnOutOfMemoryError` only with the service's failover/restart policy; it exits, an external supervisor must restart                                                             |
| Destination is ephemeral | `HeapDumpPath` pointing at the container's overlay filesystem vanishes with the pod                                                                                        | Point it at a directory on a volume; a directory value yields `java_pid<pid>.hprof` inside it. `HeapDumpPath`, `HeapDumpGzipLevel` and the flag itself are settable live with `jcmd VM.set_flag`                                       |

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

Missing context limits comparisons; retain useful ownership evidence while collecting:

- `-Xmx`, actual occupancy/commitment and container limit — capacity context, not prerequisites
  for interpreting a strong ownership path.
- Wall-clock time, approximate load in req/s, and JVM uptime at capture.
- Whether `-XX:+UseCompactObjectHeaders` was enabled. JEP 519 is product in JDK 25 and off
  by default in JDK 25. Header representation changes, but alignment means some objects retain
  the same shallow size. Record parser support and sizing options; do not assume HPROF-derived
  sizes reproduce every target layout exactly or attribute all cross-layout deltas to code.

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

## Comparing captures when justified

```bash
# Only after the pause/data-exposure decision above, with fresh destinations:
jcmd <pid> GC.heap_dump dump1.hprof
# Wait for the relevant growth, expiry or reuse cycle under comparable conditions.
jcmd <pid> GC.heap_dump dump2.hprof
```

In MAT, open each dump and run its Histogram (or the same retained-set query). In each
dump's **Navigation History**, add the result to the **Compare Basket**. Put the baseline
first, execute the comparison, and choose absolute values or deltas. Record the grouping,
filters and retained-size calculation used; comparing different populations can manufacture
growth. This workflow compares aggregate results, not the identity of individual objects.
An HPROF address may change when GC moves an object, and MAT object IDs are local to their
snapshot. Match individual domain objects only with an independently justified stable key;
equal addresses or class names do not establish identity across captures.

Monotonic normalized growth strengthens an unbounded-retention hypothesis; it does not by
itself prove a defect. Legitimate append-only state, changed traffic/cardinality, delayed
expiry and topology shifts can have the same shape. Conversely, two stable points do not
prove safety if the growth is bursty or the observation window misses its trigger. Trace
the strong ownership path and compare behavior with the declared capacity/lifecycle
contract.

Validate the lifecycle fix and the original growth trigger under representative load for long
enough to exercise expiry/reuse cycles. Use lower-impact owner counts and post-GC live-set trends
when sufficient; collect additional comparable dumps only when they justify the pause and data
exposure. Two stable snapshots or absence of an immediate OOM do not prove the fix.

## Dumps too large for a local MAT

MAT index memory can be comparable to or greater than dump size; “2×” is only a planning
heuristic and varies with object count, identifiers, parser version and indexes. Run a
representative parse with disk/RAM headroom and record the tool version. Beyond local
capacity:

- **HeapHero.io** — online `.hprof` analysis; the heap-dump sibling of GCeasy.io.
- **jxray.com** — commercial, aimed at very large dumps, with common leak patterns
  pre-computed.

JMC's JFR views and GCeasy's GC-log analysis are different from HPROF analysis. JMC can
also provide the **JOverflow** plug-in: its JMC 9.1.0 editor registers `.hprof` support.
Check the installed distribution, plug-in and target-dump parser compatibility rather than
assuming it is present or supports every layout. Its analysis is not a promise of MAT's
OQL/retained-set workflow or of enough capacity for a particular large dump.

## Primary reference

- [HotSpot 25 heap dumper: safepoint capture, virtual-thread roots and subsequent merge](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/services/heapDumper.cpp)
- [HotSpot 25 VM-reported OOME once-only guard](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/utilities/debug.cpp)
- [JMC 9.1.0 JOverflow HPROF editor registration](https://github.com/openjdk/jmc/blob/9.1.0-ga/application/org.openjdk.jmc.joverflow.ui/plugin.xml)
- [MAT comparison workflow and limits of cross-dump object identity](https://help.eclipse.org/latest/topic/org.eclipse.mat.ui.help/tasks/comparingdata.html)
