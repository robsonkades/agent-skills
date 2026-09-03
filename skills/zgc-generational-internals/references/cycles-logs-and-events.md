# Cycles, logs and events

## The cycle, with the phase diagrams omit

```
Pause Mark Start (STW)              establishes cycle/root-marking state
Concurrent Mark                     traces the reachable graph with mutator barriers preserving invariants
Pause Mark End (STW)                completes marking and cycle-boundary processing
Concurrent Prepare for Relocate     selects candidate pages, most garbage first
Pause Relocate Start (STW)          starts concurrent relocation
Concurrent Relocate                 load barrier redirects through the forwarding table
Concurrent Remap                    updates remaining pointers; may defer to the next cycle
```

The verified JDK 25 log exposes these three pause labels. `Pause Relocate Start` is often
dropped from simplified diagrams and measurement scripts. Treat names/count as
release-sensitive and validate them on the target build.

| STW phase            | What it does                                    |
| -------------------- | ----------------------------------------------- |
| Pause Mark Start     | Establishes marking/root state for the cycle    |
| Pause Mark End       | Completes marking and cycle-boundary processing |
| Pause Relocate Start | Starts concurrent relocation                    |

Short durations are a design goal, not an SLO guarantee. Root count, platform, scheduling and
workload matter; measure distributions and safepoint TTSP on the target.

Young and old-cycle cadence is selected from allocation, aging/live-set and ergonomics. The
remembered set lets young tracing avoid treating all old objects as roots, but no universal
“hundreds of milliseconds versus tens of minutes” ratio defines health.

## Enabling the log

```bash
java -XX:+UseZGC \
     -Xlog:gc*,gc+phases=debug:file=zgc.log:time,uptime,level,tags \
     MyApp
```

`gc+phases=debug` is what makes the individual phases appear. Without it the log carries
cycle summaries only, and `Pause Relocate Start` is not in them.

## Reading the log

The verified generational log labels by **generation** — `Young Generation` / `Old Generation`.
Do not build a parser around remembered “Minor/Major” terminology. Shape (verify the exact format
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
sort -g pauses.txt | awk -v n="$n" 'NR == int((99*n + 99)/100) { print "p99:", $1, "ms over", n, "samples" }'
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

| Event                         | Fires when                              | Use                                                     |
| ----------------------------- | --------------------------------------- | ------------------------------------------------------- |
| `jdk.ZYoungGarbageCollection` | End of each young cycle                 | Young cycle frequency and duration                      |
| `jdk.ZOldGarbageCollection`   | End of each old cycle                   | Old cycle frequency/duration; correlate aging/live set  |
| `jdk.ZAllocationStall`        | A thread blocks for want of a free page | Stall evidence; classify heap, rate, CPU and page cause |
| `jdk.ZPageAllocation`         | The collector allocates a new page      | Correlate allocation rate with page creation            |

JDK 25 also exposes relocation-set, statistics, thread-phase and uncommit events. There is no
combined `jdk.ZGCGarbageCollection` on that build. The **field names inside** events vary
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
| `ZCollectionInterval=N`       | General interval control; `0` removes that periodic trigger, not every proactive heuristic |
| `ZAllocationSpikeTolerance=N` | Multiplier of tolerance over the observed mean allocation rate used by the start heuristic |
| `ZProactive`                  | Already `true`; starts a cycle proactively under **idleness or low allocation**            |

`ZCollectionInterval` can bound time between cycles even when allocation is low; use only for
a measured requirement and verify generation-specific interval options on the build.
`ZAllocationSpikeTolerance` influences heuristic reserve for spikes; changing it can start
cycles earlier/more often and consume CPU. Validate rather than treating either as a stall fix.

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
