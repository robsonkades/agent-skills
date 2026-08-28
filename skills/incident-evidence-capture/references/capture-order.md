# Capture order

Ordered by cost. Work down the list until the budget is spent, then restore service.

| #   | Artefact                                        | Cost to take           | Disrupts?         | Survives a restart?         | Read with                                               |
| --- | ----------------------------------------------- | ---------------------- | ----------------- | --------------------------- | ------------------------------------------------------- |
| 0   | Take the instance out of rotation               | seconds                | no                | n/a                         | —                                                       |
| 1   | GC log, `hs_err`, existing JFR files            | a copy                 | no                | **yes**, if the volume does | `gc-log-analysis`, `jhsdb-and-core-dumps`               |
| 2   | Metrics and traces already exported             | nothing                | no                | **yes**                     | `metrics-and-cardinality`, `distributed-tracing-design` |
| 3   | `jcmd VM.info`, `VM.flags`, `VM.uptime`         | < 1 s                  | no                | no                          | `jvm-performance-review`                                |
| 4   | Three thread dumps, 5–10 s apart                | seconds                | negligible        | no                          | `concurrency-diagnostics`                               |
| 5   | `jcmd GC.heap_info`, `VM.native_memory summary` | < 1 s                  | no                | no                          | `jvm-memory-regions`, `metaspace-internals`             |
| 6   | A 60-second JFR recording                       | ~1 % CPU               | negligible        | as a file                   | `jfr-and-async-profiler`                                |
| 7   | Host view: CPU, run queue, memory, throttling   | seconds                | no                | no                          | `linux-for-jvm`                                         |
| 8   | Heap dump                                       | **seconds to minutes** | **stops the JVM** | as a file                   | `heap-dump-analysis`                                    |
| 9   | Core dump                                       | minutes                | kills or stops it | as a file                   | `jhsdb-and-core-dumps`                                  |

Rows 0–7 together are usually under a minute and cost the application almost nothing. Row 8 is a
different category and needs a decision. Row 9 is for the case where the JVM will not answer at
all.

## The commands

```bash
PID=$(pgrep -f 'java .*app.jar' | head -1)
OUT=/mnt/diagnostics/$(hostname)-$(date -u +%Y%m%dT%H%M%SZ)   # a path on a mounted volume
mkdir -p "$OUT"

# 3 — what this JVM is
jcmd $PID VM.info      > "$OUT/vm-info.txt"
jcmd $PID VM.flags     > "$OUT/vm-flags.txt"
jcmd $PID VM.uptime    > "$OUT/vm-uptime.txt"

# 4 — three dumps, spaced, each with its own timestamp
for i in 1 2 3; do
  date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/thread-$i.txt"
  jcmd $PID Thread.print -l >> "$OUT/thread-$i.txt"
  sleep 8
done

# 5 — memory, without touching the heap
jcmd $PID GC.heap_info                  > "$OUT/heap-info.txt"
jcmd $PID VM.native_memory summary      > "$OUT/nmt.txt"   # only if NMT was enabled at startup

# 6 — a short recording
jcmd $PID JFR.start name=incident settings=profile duration=60s filename="$OUT/incident.jfr"

# 8 — only after deciding; stops the JVM for the duration
jcmd $PID GC.heap_dump "$OUT/heap.hprof"
```

`Thread.print -l` includes lock ownership, which is what makes a deadlock visible. Without `-l`
the dump shows threads blocked and not what they are blocked on.

**`VM.native_memory` only works if `-XX:NativeMemoryTracking` was set at startup.** It cannot be
turned on during an incident, which puts it in the same category as the GC log: a decision made
earlier or not available at all.

## By symptom

| Symptom                             | Take, in order      | Skip                           |
| ----------------------------------- | ------------------- | ------------------------------ |
| Nothing is progressing, CPU idle    | 1–4, 7              | heap dump — it is not memory   |
| CPU pinned, GC normal               | 1–4, 6, 7           | heap dump                      |
| Latency climbing, GC pauses growing | 1–3, 5, 6           | thread dumps are secondary     |
| Heap climbing, OOM approaching      | 1–5, then **8**     | —                              |
| OOMKilled, no Java exception        | 1, 5, 7             | heap dump — it is not the heap |
| Process gone, no log                | `hs_err`, host logs | everything live                |
| JVM unresponsive, `jcmd` hangs      | 7, then **9**       | rows 3–8, they will not answer |

The two "skip" columns matter as much as the rest. A heap dump taken during a lock-contention
incident costs minutes of extra outage and answers nothing.

## The budget conversation

Say it in one sentence to whoever owns the incident:

> "Rows 1 to 7 cost about a minute and no downtime. A heap dump adds roughly N seconds of full
> stop and we only need it if this is memory. Do we take it?"

That sentence is the deliverable of this skill during an incident. It makes the trade explicit,
gives the decision to the person who owns it, and stops both failure modes — the restart with no
evidence, and the collection that quietly triples the outage.

## When the evidence already exists

Before running any of this, check:

- Is JFR running continuously? Then the incident window is already recorded — note the times.
- Is there a continuous profiler? `continuous-profiling` — the profile exists.
- Is the GC log on and rotating? Then row 1 is already satisfied.

If all three are true, the correct action is to note the window, copy the files, and restore
service now. The most valuable incident capture is the one that happened automatically.
