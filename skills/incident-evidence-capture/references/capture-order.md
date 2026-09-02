# Capture order

Ordered by cost. Work down the list until the budget is spent, then restore service.

| #   | Artefact                                        | Cost to take           | Disrupts?         | Survives a restart?         | Read with                                               |
| --- | ----------------------------------------------- | ---------------------- | ----------------- | --------------------------- | ------------------------------------------------------- |
| 0   | Take the instance out of rotation               | seconds                | no                | n/a                         | —                                                       |
| 1   | GC log, `hs_err`, existing JFR files            | a copy                 | no                | **yes**, if the volume does | `gc-log-analysis`, `jhsdb-and-core-dumps`               |
| 1b  | `JFR.dump` of the continuous recording          | seconds                | no                | as a file                   | `jfr-and-async-profiler`                                |
| 2   | Metrics and traces already exported             | nothing                | no                | **yes**                     | `metrics-and-cardinality`, `distributed-tracing-design` |
| 3   | `jcmd VM.info`, `VM.flags`, `VM.uptime`         | < 1 s                  | no                | no                          | `jvm-performance-review`                                |
| 4   | Three thread dumps, 5–10 s apart                | seconds                | negligible        | no                          | `concurrency-diagnostics`                               |
| 5   | `jcmd GC.heap_info`, `VM.native_memory summary` | < 1 s                  | no                | no                          | `jvm-memory-regions`, `metaspace-internals`             |
| 6   | A 60-second JFR recording                       | ~1 % CPU               | negligible        | as a file                   | `jfr-and-async-profiler`                                |
| 7   | Host view: CPU, run queue, memory, throttling   | seconds                | no                | no                          | `linux-for-jvm`                                         |
| 7b  | `jcmd GC.class_histogram`, twice, minutes apart | seconds, **pauses**    | a safepoint       | no                          | `heap-dump-analysis`                                    |
| 8   | Heap dump                                       | **seconds to minutes** | **stops the JVM** | as a file                   | `heap-dump-analysis`                                    |
| 9   | Core dump                                       | minutes                | kills or stops it | as a file                   | `jhsdb-and-core-dumps`                                  |

Rows 0–7 together are usually under a minute and cost the application almost nothing. Row 7b
walks the heap under a safepoint (`jcmd` rates it _Impact: High_) but writes nothing and needs no
disk; two of them, spaced, show which class grows. Row 8 is a different category and needs a
decision. Row 9 is for the case where the JVM will not answer at all.

## The commands

```bash
PID=$(pgrep -f 'java .*app.jar' | head -1)
OUT=/mnt/diagnostics/$(hostname)-$(date -u +%Y%m%dT%H%M%SZ)   # a path on a mounted volume
mkdir -p "$OUT"

# 1b — the continuous recording becomes a file only here; begin= bounds the window
jcmd $PID JFR.dump filename="$OUT/continuous.jfr" begin=-30m

# 3 — what this JVM is
jcmd $PID VM.info      > "$OUT/vm-info.txt"
jcmd $PID VM.flags     > "$OUT/vm-flags.txt"
jcmd $PID VM.uptime    > "$OUT/vm-uptime.txt"

# 4 — three dumps, spaced, each with its own timestamp; the JSON dump adds virtual threads
for i in 1 2 3; do
  date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/thread-$i.txt"
  jcmd $PID Thread.print -l >> "$OUT/thread-$i.txt"
  jcmd $PID Thread.dump_to_file -format=json "$OUT/threads-$i.json"
  top -H -b -n 1 -p $PID | head -40 > "$OUT/top-threads-$i.txt"   # CPU per OS thread
  sleep 8
done

# 5 — memory, without touching the heap
jcmd $PID GC.heap_info                  > "$OUT/heap-info.txt"
jcmd $PID VM.native_memory summary      > "$OUT/nmt.txt"   # only if NMT was enabled at startup

# 6 — a short recording
jcmd $PID JFR.start name=incident settings=profile duration=60s filename="$OUT/incident.jfr"

# 7b — what grows, without a file: run it again after a few minutes and diff the top rows
jcmd $PID GC.class_histogram | head -40 > "$OUT/histogram-$(date -u +%H%M%S).txt"

# 8 — only after deciding; stops the JVM for the duration
jcmd $PID GC.heap_dump -gz=1 -parallel=4 "$OUT/heap.hprof.gz"
```

`Thread.print` lines carry `cpu=<ms> elapsed=<s>` per thread, so three spaced dumps also give
each thread's CPU delta — the CPU-pinned case is solved by the same three files plus `top -H`
matched on the OS thread id (`nid=`). `Thread.print` omits virtual threads;
`Thread.dump_to_file -format=json` includes them, and `concurrency-diagnostics` reads both.

`GC.heap_dump` options that change the budget: `-gz=1` shrinks the bytes written (the pause is
dominated by the write on a large heap); `-parallel=N` uses N threads for the dump; `-all` skips
the full collection that a live-only dump performs first, at the cost of dumping garbage too.

`Thread.print -l` includes lock ownership, which is what makes a deadlock visible. Without `-l`
the dump shows threads blocked and not what they are blocked on.

**`VM.native_memory` only works if `-XX:NativeMemoryTracking` was set at startup.** It cannot be
turned on during an incident, which puts it in the same category as the GC log: a decision made
earlier or not available at all.

## By symptom

| Symptom                             | Take, in order      | Skip                           |
| ----------------------------------- | ------------------- | ------------------------------ |
| Nothing is progressing, CPU idle    | 1, 1b, 3, 4, 7      | heap dump — it is not memory   |
| CPU pinned, GC normal               | 1, 1b, 3, 4, 6, 7   | heap dump                      |
| Latency climbing, GC pauses growing | 1, 1b, 3, 5, 6      | thread dumps are secondary     |
| Heap climbing, OOM approaching      | 1–5, 7b, then **8** | —                              |
| OOMKilled, no Java exception        | 1, 5, 7             | heap dump — it is not the heap |
| Process gone, no log                | `hs_err`, host logs | everything live                |
| JVM unresponsive, `jcmd` hangs      | 7, then **9**       | rows 3–8, they will not answer |

The two "skip" columns matter as much as the rest. A heap dump taken during a lock-contention
incident costs minutes of extra outage and answers nothing.

## The budget conversation

Say it in one sentence to whoever owns the incident:

> "Rows 1 to 7 cost about a minute and no downtime. A heap dump adds roughly N seconds of full
> stop and we only need it if this is memory. Do we take it?"

N comes from the last dump of a comparable heap, not from a guess, and it is bounded by the
liveness probe: a container that does not answer for longer than `failureThreshold ×
periodSeconds` is killed by the kubelet while the file is still being written
(`kubernetes-service-lifecycle` owns the probe arithmetic). If N does not fit, the answer is
row 7b now and `-XX:+HeapDumpOnOutOfMemoryError` for next time.

That sentence is the deliverable of this skill during an incident. It makes the trade explicit,
gives the decision to the person who owns it, and stops both failure modes — the restart with no
evidence, and the collection that quietly triples the outage.

## When the evidence already exists

Before running any of this, check:

- Is JFR running continuously? Then the incident window is already recorded — note the times,
  and run row 1b before anything else, because the recording is not a file until dumped.
- Is there a continuous profiler? `continuous-profiling` — the profile exists.
- Is the GC log on and rotating? Then row 1 is already satisfied.

If all three are true, the correct action is to note the window, copy the files, and restore
service now. The most valuable incident capture is the one that happened automatically.

## When `jcmd` is not in the container

A distroless or JRE-only image has no `jcmd`. Run it from an ephemeral container built on the
same JDK image, sharing the process namespace:

```bash
kubectl debug -it <pod> --image=<same-jdk-image> --target=<container> -- jcmd <pid> Thread.print
```

The attach mechanism resolves the target's socket through `/proc/<pid>/root/tmp` (JDK 10+),
so the two containers need not share `/tmp`; they do need the same UID, or the JVM refuses the
attach. `kubectl cp` needs `tar` inside the target container, which distroless lacks — write
artefacts to a volume both containers mount, or stream them out with
`kubectl exec <pod> -c <container> -- cat <file> > local`.
