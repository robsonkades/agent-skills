# Capturing a heap dump and triaging it

## The four capture methods

```bash
# 1 — automatic on OOM (opt-in; off by default)
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/path/to/dump.hprof     # default: working dir, java_pid<pid>.hprof

# 2 — jcmd (modern, preferred interactively)
jcmd <pid> GC.heap_dump /path/dump.hprof                 # no -all: full GC before the dump
jcmd <pid> GC.heap_dump -all /path/dump.hprof            # includes unreachable objects, no forced GC
jcmd <pid> GC.heap_dump -gz=6 -overwrite /path/dump.hprof.gz

# 3 — jmap (legacy, same underlying mechanism)
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

## From a container

```bash
docker cp "$JAVA_HOME/bin/jcmd" container:/tmp/          # if jcmd is not in the image
docker exec container /tmp/jcmd <pid> GC.heap_dump /tmp/dump.hprof
docker cp container:/tmp/dump.hprof ./dump.hprof
```

Check free disk first: an uncompressed dump can approach the size of the used heap.

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
