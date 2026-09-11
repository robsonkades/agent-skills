# Log analysis recipes

These recipes use POSIX awk syntax plus shell utilities; check their availability (Windows may
need an existing Unix tool environment). Unsupported awk extensions can fail at parse time.
Use `LC_ALL=C`, inspect stderr and stage exit codes; pipeline success alone can hide earlier failure.
Apply the locale to every stage (for example, `export LC_ALL=C` in the analysis shell).

The recipes below deliberately target G1 unified logs with tags, GC IDs and millisecond completion
summaries. First create `completed.log` in an analysis-owned directory, preserving the source:

```bash
LC_ALL=C awk '{ sub(/\r$/, "") }
/\[gc *\]/ && / Pause / {
  if (!match($0, /GC\([0-9]+\) Pause (Young|Full|Remark|Cleanup) /) ||
      $0 !~ / [0-9]+([.][0-9]+)?ms$/) { bad++; next }
  key=substr($0,RSTART,RLENGTH)
  if (seen[key]++) { bad++; next }
  print; n++
} END {
  if (bad || !n) {
    print "duplicate/unsupported pause records or no supported G1 pause completions; discard output"
    exit 1
  }
}' gc.log > completed.log
```

Use `completed.log` only after this stage succeeds; inspect its diagnostic and discard the
partial output on failure. The diagnostic goes to that file too, avoiding a nonportable
`/dev/stderr` assumption. Check stderr separately for awk/tool failures.
Verify collector/process identity separately; split other collectors and unsupported formats rather
than feeding their phase lines into this filter. Remark and Cleanup may share a concurrent-cycle
ID, so uniqueness is by ID and pause type. Reconcile counts against raw logs and drop notices;
the filter cannot detect events missing entirely or an unrecognised tag layout. Unrelated tags
and concurrent-cycle summaries are outside this pause population, not parser failures.

## Pause distribution

```bash
awk '/Pause/ && match($0, /[0-9]+([.][0-9]+)?ms$/) {
       print substr($0, RSTART, RLENGTH - 2) }' completed.log \
| sort -n \
| awk '{ v[n++] = $1; total += $1 }
       END {
         if (n == 0) { print "no pauses found"; exit 1 }
         r50 = int(0.50 * n); if (r50 < 0.50 * n) r50++
         r99 = int(0.99 * n); if (r99 < 0.99 * n) r99++
         printf "pauses=%d  p50_nearest_rank=%.2fms  p99_nearest_rank=%.2fms  max=%.2fms  total=%.1fms\n",
                n, v[r50-1], v[r99-1], v[n-1], total
       }'
```

`total` divided by an explicitly measured wall-clock window covering those pauses is the logged
stop-the-world pause share. Use the same units; do not include the first pause in a denominator
starting at its completion. If the window clips a pause, report the boundary treatment:
use its overlap for time share and keep full-event durations separate for quantiles. Do not
add nested phase or safepoint times to the same GC pause. It does not include concurrent GC
CPU or barrier cost. The sample count is essential: under
nearest-rank estimation, p99 is the maximum until at least 100 observations and remains a
noisy tail estimate for small windows.

## Counts by type and by cause

```bash
# Pause types
awk '/Pause/ { for (i = 1; i <= NF; i++)
                 if ($i == "Pause") { print $i, $(i+1); break } }' completed.log \
  | sort | uniq -c | sort -rn

# G1 causes: strip event type first; retain the remainder, including nested parentheses.
# Failure suffixes remain labelled context rather than being confused with the cause.
awk '{ s=$0; sub(/.*GC\([0-9]+\) Pause /,"",s)
       sub(/^Young \([^)]*\) /,"",s); sub(/^(Full|Remark|Cleanup) /,"",s)
       sub(/ [0-9]+[KMG]->.*/,"",s); sub(/ [0-9]+([.][0-9]+)?ms$/,"",s)
       if (s !~ /^\(/) s="(no explicit cause)"
       print s }' completed.log | sort | uniq -c | sort -rn
```

```bash
grep -c "Pause Full" completed.log # one completion per event; grep exits 1 for zero matches
grep -i humongous gc.log           # occupancy/candidates/causes, not an allocation-event count
```

## Headroom after each collection

```bash
awk 'match($0, / [0-9]+M->[0-9]+M\([0-9]+M\)/) {
       matched++
       s = substr($0, RSTART, RLENGTH)
       sub(/M->.*/, "", s);  before = s + 0
       t = substr($0, RSTART, RLENGTH)
       sub(/.*->/, "", t); sub(/M\(.*/, "", t);  after = t + 0
       u = substr($0, RSTART, RLENGTH)
       sub(/.*\(/, "", u); sub(/M\)/, "", u);    capacity = u + 0
       if (capacity > 0)
         printf "after=%dM  headroom=%dM (%.0f%%)\n",
                after, capacity - after, (capacity - after) * 100 / capacity
     }
     END { if (!matched) { print "no supported integer-M heap summaries"; exit 1 } }' completed.log
```

This narrow integer-M recipe does not normalize K/G or fractional units. Inspect and report skipped
formats before using totals; convert units explicitly if present. Headroom is rounded committed
capacity minus occupancy, not a guarantee of usable evacuation/contiguous space. A rising floor at
comparable reclamation points supports a retention hypothesis, not a verdict independent of workload.

## Premature promotion

```bash
-Xlog:gc+age=trace:file=age.log:time,uptime
```

A `new threshold` below `max threshold` means adaptive tenuring selected an earlier age; it
does not by itself prove harm. Correlate age-table bytes with promotion/old pressure and
downstream pause cost. When survivor pressure is causal, a larger young/survivor budget is
one candidate; lowering `MaxGCPauseMillis` can instead shrink young and worsen it.

## When the log cannot answer: who allocated

Pass the existing log, recording and workload context to `allocation-profiling`. If a new
recording is needed, the following is a bounded example: substitute the known authorized PID
and an approved output path writable by that JVM. Inspect start failure and wait for the
recording to finish before printing it; do not read a stale file as this capture's result.

```bash
jcmd <pid> JFR.start duration=60s settings=profile filename=/tmp/gc.jfr

jfr print --events jdk.GarbageCollection      /tmp/gc.jfr   # cycle, cause, duration
jfr print --events jdk.GCPhasePause           /tmp/gc.jfr   # phases
jfr print --events jdk.ObjectAllocationSample /tmp/gc.jfr   # WHO allocated
```

On JDK 16+, `jdk.ObjectAllocationSample` provides sampled attribution. The shipped OpenJDK 25
profile enables it with throttling and disables the two TLAB allocation events by default;
custom settings can differ. Inspect recording settings and event counts rather than treating
empty output as no allocation. Samples identify observed sites, not every allocation.

Sources: [OpenJDK 25 profile settings](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/jdk.jfr/share/conf/jfr/profile.jfc)
and [Java 25 logging configuration](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html).

## Visual analysers

GCViewer runs locally; GCEasy is a web service. Prefer local by default — a production GC
log discloses heap size, daily load pattern, peak hours, deploy frequency and, indirectly,
installed capacity. If an external service is used, confirm the organisation's policy and
consider anonymising timestamps first.
