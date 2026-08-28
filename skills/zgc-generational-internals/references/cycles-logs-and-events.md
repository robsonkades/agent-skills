# Cycles, logs and events

## The cycle, with the phase diagrams omit

```
Pause Mark Start (STW)              marks GC roots; fixes the good colour for this mark
Concurrent Mark                     load barrier marks objects as they are read
Pause Mark End (STW)                finalises marking; processes pending references
Concurrent Prepare for Relocate     selects candidate pages, most garbage first
Pause Relocate Start (STW)          starts concurrent relocation
Concurrent Relocate                 load barrier redirects through the forwarding table
Concurrent Remap                    updates remaining pointers; may defer to the next cycle
```

Three phases are stop-the-world, not two. `Pause Relocate Start` sits between two larger
concurrent phases, is sub-millisecond, and is the one routinely dropped from simplified
diagrams — and therefore from measurement scripts.

| STW phase            | What it does                                              |
| -------------------- | --------------------------------------------------------- |
| Pause Mark Start     | Marks GC roots (stacks, registers); fixes the good colour |
| Pause Mark End       | Finalises marking; processes weak references and friends  |
| Pause Relocate Start | Starts concurrent relocation                              |

Durations are sub-millisecond as an expected order of magnitude. Measure them on the
workload in question rather than quoting a figure.

Young cycles run far more often than old cycles — in a healthy service, young every few
hundred milliseconds against old every tens of minutes. The remembered set is what lets a
young cycle avoid scanning all of old as a root; that is the throughput gain the generational
mode exists for.

## Enabling the log

```bash
java -XX:+UseZGC \
     -Xlog:gc*,gc+phases=debug:file=zgc.log:time,uptime,level,tags \
     MyApp
```

`gc+phases=debug` is what makes the individual phases appear. Without it the log carries
cycle summaries only, and `Pause Relocate Start` is not in them.

## Reading the log

The generational log labels by **generation** — `Young Generation` / `Old Generation`. It has
never used "Minor"/"Major"; neither does the JFR event set. Shape (verify the exact format
against the build in use before publishing it as a reference):

```
[gc,heap]   GC(42) Young Generation: 512M(25%)->64M(3%)
[gc,heap]   GC(42) Old Generation:   2048M(64%)->2048M(64%)
[gc,phases] GC(42) Pause Mark Start                   0.234ms
[gc,phases] GC(42) Concurrent Mark                   32.145ms
[gc,phases] GC(42) Pause Mark End                     0.189ms
[gc,phases] GC(42) Concurrent Prepare for Relocate    4.012ms
[gc,phases] GC(42) Pause Relocate Start               0.201ms
[gc,phases] GC(42) Concurrent Relocate               24.023ms
[gc,phases] GC(42) Concurrent Remap                  18.877ms
[gc]        GC(42) GC time: 1.2%
```

An old generation line whose before and after are identical means that cycle did not collect
old — normal, and the reason a young-only reading of the log looks like nothing is being
reclaimed from the long-lived set.

## Extracting pauses safely

The pattern must cover all three phases, and the script must refuse to report a percentile it
has no samples for:

```bash
grep -E 'Pause (Mark Start|Mark End|Relocate Start)' zgc.log \
  | grep -oE '[0-9]+\.[0-9]+ms' | tr -d 'ms' > pauses.txt

n=$(wc -l < pauses.txt)
if [ "$n" -eq 0 ]; then
  echo "no pause samples matched — check the pattern and that gc+phases=debug is on" >&2
  exit 1
fi
sort -g pauses.txt | awk -v n="$n" 'NR == int(n*0.99)+0 { print "p99:", $1, "ms over", n, "samples" }'
```

A zero-sample run is the failure mode this guards: a mistyped pattern produces an empty set,
and an empty set silently reports a perfect p99.

## JFR

```bash
java -XX:+UseZGC \
     -XX:StartFlightRecording=filename=zgc.jfr,settings=profile \
     MyApp

jfr print --events jdk.ZYoungGarbageCollection,jdk.ZOldGarbageCollection zgc.jfr
jfr print --events jdk.ZAllocationStall zgc.jfr
```

| Event                         | Fires when                              | Use                                                  |
| ----------------------------- | --------------------------------------- | ---------------------------------------------------- |
| `jdk.ZYoungGarbageCollection` | End of each young cycle                 | Young cycle frequency and duration                   |
| `jdk.ZOldGarbageCollection`   | End of each old cycle                   | Old cycle frequency and duration; promotion pressure |
| `jdk.ZAllocationStall`        | A thread blocks for want of a free page | Undersized heap or bursty allocation                 |
| `jdk.ZPageAllocation`         | The collector allocates a new page      | Correlate allocation rate with page creation         |

There is no combined `jdk.ZGCGarbageCollection`. The **field names inside** these events vary
by release, because the cycle was redesigned between JEP 439 and the post-JEP-490 state —
check them with `jfr print --events ... --stack-depth 0` on the build in use before writing a
parser against them.

## Flags, checked rather than assumed

```bash
jcmd <pid> GC.heap_info
jcmd <pid> VM.flags -all | grep -i -E "usezgc|zproactive|zcollectioninterval|zallocationspiketolerance"
```

| Flag                          | Meaning                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `ZCollectionInterval=N`       | Minimum seconds between cycles; `0` disables, collecting only on allocation pressure       |
| `ZAllocationSpikeTolerance=N` | Multiplier of tolerance over the observed mean allocation rate used by the start heuristic |
| `ZProactive`                  | Already `true`; starts a cycle proactively under **idleness or low allocation**            |

`ZCollectionInterval` forces a periodic cycle even when allocation is low — useful when the
SLO caps how old retained garbage may get. `ZAllocationSpikeTolerance` decides how much margin
above the recent mean the heuristic reserves before starting a cycle; raising it reacts
earlier to accelerating allocation at the cost of potentially more frequent cycles.

## Thread-level CPU

```bash
jcmd <pid> Thread.print | grep -i zgc                          # state and stack, not CPU
jcmd <pid> Thread.dump_to_file -format=json threads.json       # same data, parseable

top -H -p <pid>            # per-thread CPU
pidstat -t -p <pid> 1      # same, tabular; match TID against "tid=" from Thread.print
```

`RUNNABLE` in a thread dump means "running or ready to run". It quantifies nothing. Reading
"ZGC threads RUNNABLE" as "ZGC threads consuming CPU" is the error; `top -H` answers the
question the dump cannot.
