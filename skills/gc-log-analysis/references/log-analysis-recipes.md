# Log analysis recipes

Every script here uses **POSIX awk only** — it works on Linux, macOS and BSD with nothing
installed. The three-argument `match($0, /re/, arr)` form found in most examples online is
a GNU extension: elsewhere it silently populates nothing and the script prints zero, which
in a diagnostic tool is the worst possible failure.

## Pause distribution

```bash
awk '/Pause/ && match($0, /[0-9]+\.[0-9]+ms/) {
       print substr($0, RSTART, RLENGTH - 2) }' gc.log \
| sort -n \
| awk '{ v[n++] = $1; total += $1 }
       END {
         if (n == 0) { print "no pauses found"; exit 1 }
         printf "pauses=%d  p50=%.2fms  p99=%.2fms  max=%.2fms  total=%.1fms\n",
                n, v[int(n * 0.50)], v[int(n * 0.99)], v[n-1], total
       }'
```

`total` divided by the log's wall-clock span is the GC overhead — the number that catches
the "many short pauses" case that per-pause alerting never fires on.

## Counts by type and by cause

```bash
# Pause types
awk '/Pause/ { for (i = 1; i <= NF; i++)
                 if ($i == "Pause") { print $i, $(i+1); break } }' gc.log \
  | sort | uniq -c | sort -rn

# Causes (the parenthesised field)
grep -oE '\([A-Za-z0-9 ]+\)' gc.log | sort | uniq -c | sort -rn | head
```

```bash
grep -c "Pause Full" gc.log     # zero is the expected number in healthy production
grep -i humongous gc.log        # humongous allocations
```

## Headroom after each collection

```bash
awk 'match($0, /[0-9]+M->[0-9]+M\([0-9]+M\)/) {
       s = substr($0, RSTART, RLENGTH)
       sub(/M->.*/, "", s);  before = s + 0
       t = substr($0, RSTART, RLENGTH)
       sub(/.*->/, "", t); sub(/M\(.*/, "", t);  after = t + 0
       u = substr($0, RSTART, RLENGTH)
       sub(/.*\(/, "", u); sub(/M\)/, "", u);    capacity = u + 0
       if (capacity > 0)
         printf "after=%dM  headroom=%dM (%.0f%%)\n",
                after, capacity - after, (capacity - after) * 100 / capacity
     }' gc.log
```

The number that matters is `after`, and more than the value, its **trend**. A floor that
rises after every complete cycle is retention.

## Premature promotion

```bash
-Xlog:gc+age=trace:file=age.log:time,uptime
```

A `new threshold` below `max threshold` means objects are being promoted before they had
a chance to die in the young generation. The usual fix is a larger young generation, not a
lower pause target — lowering `MaxGCPauseMillis` shrinks young and makes it worse.

## When the log cannot answer: who allocated

```bash
jcmd <pid> JFR.start duration=60s settings=profile filename=/tmp/gc.jfr

jfr print --events jdk.GarbageCollection      /tmp/gc.jfr   # cycle, cause, duration
jfr print --events jdk.GCPhasePause           /tmp/gc.jfr   # phases
jfr print --events jdk.ObjectAllocationSample /tmp/gc.jfr   # WHO allocated
```

On JDK 16+, use `jdk.ObjectAllocationSample` — enabled by default and throttled.
`jdk.ObjectAllocationInNewTLAB` and `jdk.ObjectAllocationOutsideTLAB` still exist but have
been **disabled by default** since JDK 16 (JDK-8257602): requesting them in a `profile`
recording returns empty, which is easily misread as "no significant allocation".

## Visual analysers

GCViewer runs locally; GCEasy is a web service. Prefer local by default — a production GC
log discloses heap size, daily load pattern, peak hours, deploy frequency and, indirectly,
installed capacity. If an external service is used, confirm the organisation's policy and
consider anonymising timestamps first.
