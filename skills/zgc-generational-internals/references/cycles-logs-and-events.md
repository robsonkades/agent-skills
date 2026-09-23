# Cycles, logs and events

## Phase families, not a universal per-generation sequence

```
Pause Mark Start (STW)              establishes cycle/root-marking state
Concurrent Mark                     traces the reachable graph with mutator barriers preserving invariants
Pause Mark End (STW)                completes marking and cycle-boundary processing
Concurrent Select Relocation Set    selects pages under generation-specific policy
Pause Relocate Start (STW)          starts concurrent relocation
Concurrent Relocate                 load barrier redirects through the forwarding table
// Remapping work can be folded into other phases; no separate label is promised.
```

The verified JDK 25 log exposes these three pause labels. `Pause Relocate Start` is often
dropped from simplified diagrams and measurement scripts. Treat names/count as
release-sensitive and validate them on the target build.

This is a schematic, not a log fixture. In inspected JDK 25, a major cycle starts both
generations with `Y: Pause Mark Start (Major)`; old marking does not emit its own separate
Pause Mark Start. Mark-end attempts can repeat if marking must continue. Do not assert
exactly three pause records for each generation or one fixed sequence for every cycle.

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
# Bash; MyApp is a project-specific launch placeholder, not a bounded test workload.
capture_dir=$(mktemp -d "${TMPDIR:-/tmp}/zgc-capture.XXXXXXXX") || exit 1
java -XX:+UseZGC \
     "-Xlog:gc*,gc+phases=debug:file=$capture_dir/zgc.log:time,uptime,level,tags:filecount=5,filesize=20M" \
     MyApp
```

On Temurin 25.0.3, `gc*=info` already includes these pause records at `[info][gc,phases]`.
Exact `gc=info` mostly exposes summaries; wildcard and level are independent. The additional
debug selector above enables more detail, not the existence of all pause lines. Quote the
full -Xlog argument for the target shell and set output/rotation for the capture contract.
The example rotation budget is illustrative; choose a window and retention that preserve its
complete inputs. Keep the directory and process status/stderr for review; do not overwrite a prior
capture or treat an evicted rotated segment as evidence of no pauses.

## Reading the log

Observed shape on Temurin 25.0.3 (durations illustrative): Y/O identify the generation;
Minor/Major also appear in cycle context. Preserve both cycle and generation identity.

```
[info][gc,phases] GC(42) Y: Pause Mark Start (Major) 0.011ms
[info][gc,phases] GC(42) Y: Pause Mark End 0.008ms
[info][gc,phases] GC(42) Y: Pause Relocate Start 0.005ms
[info][gc,phases] GC(42) Y: Young Generation 14M(11%)->26M(20%) 0.002s
[info][gc,phases] GC(42) O: Pause Mark End 0.005ms
[info][gc,phases] GC(42) O: Pause Relocate Start 0.006ms
[info][gc,phases] GC(42) O: Old Generation 28M(22%)->30M(23%) 0.001s
```

Equal old-generation occupancy before/after does not prove old collection was absent:
promotion, allocation and reclamation can balance during concurrent execution. Read the
generation's actual phase/cycle evidence rather than inferring collection from a byte delta.

## Extracting pauses safely

Exploratory Bash extraction for the inspected completed pause-line shape, not a production
coverage validator. Check the complete rotated input set/cycle coverage first. It reports a
pooled per-phase nearest-rank sample percentile, not per-cycle pause time, TTSP or request p99:

```bash
# Pass the selected input files as arguments; preserve their original cycle/generation records.
[ "$#" -gt 0 ] || { echo "supply the selected log files" >&2; exit 2; }
sample_dir=$(mktemp -d "${TMPDIR:-/tmp}/zgc-pauses.XXXXXXXX") || exit 1
if ! LC_ALL=C awk '
  /\[gc,phases[ ]*\].*Pause / {
    if ($0 !~ /\[gc,phases[ ]*\].*GC\([0-9]+\) [YO]: Pause (Mark Start( \(Major\))?|Mark End|Relocate Start) [0-9]+(\.[0-9]+)?ms[[:space:]]*$/) {
      print "unsupported or malformed pause record: " $0 > "/dev/stderr"; bad=1; next
    }
    value=$NF; sub(/\r$/, "", value); sub(/ms$/, "", value)
    if (sprintf("%.17g", value+0) !~ /^[0-9]/) {
      print "non-finite pause duration" > "/dev/stderr"; bad=1; next
    }
    print value
  }
  END { if (bad) exit 2 }
' "$@" > "$sample_dir/pauses.txt"; then
  echo "pause extraction failed; retain inputs and diagnostics" >&2
  exit 1
fi
if ! LC_ALL=C sort -g "$sample_dir/pauses.txt" > "$sample_dir/sorted.txt"; then
  echo "pause sorting failed" >&2; exit 1
fi
LC_ALL=C awk '{ value[NR]=$1 } END {
  if (NR == 0) print "count: 0; p99: undefined (no matched completed phases)"
  else print "p99:", value[int((99*NR + 99)/100)], "ms over", NR, "samples"
}' "$sample_dir/sorted.txt"
```

A successful zero count means no matching completed phases in the supplied inputs; a no-pause
window claim also needs adequate logging configuration, interval and coverage evidence. A nonzero
count does not establish coverage either: unknown schemas, truncated lines, loss or omitted rotated
files prevent a complete-population claim. This extractor rejects malformed recognized pause
records but is not a validator for every possible schema or missing record. Inspect unmatched
records, reconcile cycle context and retain counts by generation/phase. A verified subset can be
reported with its limits; enough samples and a representative interval are needed for interpretation.

## JFR

```bash
# Bash; choose an authorized bounded capture window and application lifecycle.
recording_dir=$(mktemp -d "${TMPDIR:-/tmp}/zgc-jfr.XXXXXXXX") || exit 1
if ! java -XX:+UseZGC \
     "-XX:StartFlightRecording=filename=$recording_dir/zgc.jfr,settings=profile" \
     MyApp; then
  echo "application/capture failed; retain diagnostics and any partial recording" >&2; exit 1
fi

jfr metadata --events 'jdk.Z*' "$recording_dir/zgc.jfr" || exit 1
jfr print --events jdk.ZYoungGarbageCollection,jdk.ZOldGarbageCollection "$recording_dir/zgc.jfr" || exit 1
jfr print --events jdk.ZAllocationStall "$recording_dir/zgc.jfr"
```

StartFlightRecording without duration normally writes its destination at JVM exit. For a
running application, obtain a supported JFR.dump or wait for bounded recording completion;
confirm a complete artifact before printing. Inspect effective event settings and metadata.

| Event                         | Fires when                                          | Use                                                               |
| ----------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| `jdk.ZYoungGarbageCollection` | End of each young cycle                             | Young cycle frequency and duration                                |
| `jdk.ZOldGarbageCollection`   | End of each old cycle                               | Old cycle frequency/duration; correlate aging/live set            |
| `jdk.ZAllocationStall`        | Allocation wait finishes and the event is committed | Completed stall evidence; classify heap, rate, CPU and page cause |
| `jdk.ZPageAllocation`         | A ZGC heap-page allocation is reported              | Page allocator activity, not one event per Java object            |

JDK 25 also exposes relocation-set, statistics, thread-phase and uncommit events. There is no
combined `jdk.ZGCGarbageCollection` on that build. The **field names inside** events vary
by release, because the cycle was redesigned between JEP 439 and the post-JEP-490 state —
inspect `jfr metadata --events 'jdk.Z*'` with the target tool/recording before writing a parser.
Metadata can describe events even with no recorded instances; it does not prove enablement or
capture. In the inspected JDK 25 allocator, the stall event commits after `allocation->wait()`
returns and synchronization completes. A stall still in progress at a recording boundary may be
absent. Check thresholds, event settings, loss and interval completeness before using event absence.

## Flags, checked rather than assumed

```bash
# Use an authorized pid; retain producer status before filtering.
flags_dir=$(mktemp -d "${TMPDIR:-/tmp}/zgc-flags.XXXXXXXX") || exit 1
if ! jcmd "$pid" GC.heap_info; then
  echo "GC.heap_info failed; no heap-state conclusion" >&2; exit 1
fi
if ! jcmd "$pid" VM.flags -all > "$flags_dir/vm-flags.txt"; then
  echo "VM.flags failed; no effective-flag conclusion" >&2; exit 1
fi
grep -i -E 'usezgc|zproactive|zcollectioninterval|zallocationspiketolerance' "$flags_dir/vm-flags.txt"
```

| Flag                          | Meaning                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `ZCollectionInterval=N`       | JDK 25 compatibility alias for `ZCollectionIntervalMajor`, applied only while the major option is default       |
| `ZAllocationSpikeTolerance=N` | Spike-tolerance factor in allocation-rate prediction; the selected heuristic also uses other uncertainty terms  |
| `ZProactive`                  | Default `true` on inspected JDK 25; enables a major-cycle rule with warm-up, growth/time and modeled cost gates |

An enabled major/minor interval makes its timer rule eligible after the measured time since the
previous cycle; it is not a hard start/completion deadline. Driver availability, scheduling and
other rules still matter. Nonpositive intervals disable that timer rule, not all other GC triggers.
An explicitly set `ZCollectionIntervalMajor` takes precedence over the alias on inspected JDK 25.
Use intervals only for a measured requirement and verify generation-specific options on the build.
The proactive rule also depends on `ZCollectionIntervalOnly`, warmed-up old-cycle data, heap growth
or elapsed time and estimated collection cost. It is not simply an idle/low-allocation detector.
`ZAllocationSpikeTolerance` influences heuristic reserve for spikes; changing it can start
cycles earlier/more often and consume CPU. Validate rather than treating either as a stall fix.

## Thread-level CPU

```bash
thread_dir=$(mktemp -d "${TMPDIR:-/tmp}/zgc-threads.XXXXXXXX") || exit 1
if ! jcmd "$pid" Thread.print > "$thread_dir/threads.txt"; then
  echo "Thread.print failed" >&2; exit 1
fi
grep -i zgc "$thread_dir/threads.txt"                         # no match is not zero CPU
jcmd "$pid" Thread.dump_to_file -format=json "$thread_dir/threads.json"

top -H -p "$pid"           # per-thread CPU
pidstat -t -p "$pid" 1     # Linux native TID; compare converted hexadecimal nid, not tid
```

Thread.print's `tid` is not the Linux native TID; native `nid` is commonly hexadecimal.
Internal GC workers need not appear as ordinary Java threads in either dump. Resolve OS
thread identities with native tooling and the exact build. A Java RUNNABLE thread can also
be waiting inside native/OS work; the state does not quantify CPU. Reading
"ZGC threads RUNNABLE" as "ZGC threads consuming CPU" is the error; `top -H` answers the
question the dump cannot.

Sources: [JDK 25 phase definitions](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/z/zGeneration.cpp),
[JFR metadata](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/jfr/metadata/metadata.xml),
[JDK 25 director rules](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/z/zDirector.cpp),
[interval alias](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/z/zArguments.cpp),
[allocation-stall event commit](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/z/zPageAllocator.cpp),
[JEP 490 flag lifecycle](https://openjdk.org/jeps/490).
