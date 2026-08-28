# Session recipes, output formats and conversion

## Basic sessions

```bash
jps -l                                           # find the pid

asprof -e cpu -d 30 -f cpu.html <pid>            # 30 s CPU profile, HTML flame graph

asprof start -e cpu -f cpu.jfr <pid>             # manual window, aligned to a load test
# ... drive the load ...
asprof stop <pid>
```

Only one profiling session may be active per JVM; concurrent sessions fail.

Start the target JVM with `-XX:+UnlockDiagnosticVMOptions -XX:+DebugNonSafepoints`
whenever the agent is not loaded at boot with `-agentpath`. Without them the profiler
still works — it loses attribution granularity in small inlined methods.

## Wall-clock

```bash
# All threads sampled by definition; -t groups the output per thread.
asprof -e wall -t -i 10ms -d 30 -f wall.html <pid>

# Restrict COLLECTION to a subset of thread ids:
asprof -e wall -t --filter 120-127,132 -d 30 -f wall-subset.html <pid>

# Filter the OUTPUT by thread name after collection — works because -t appends
# the thread name as the final frame:
asprof -e wall -t -d 30 -o collapsed -f wall.collapsed <pid>
grep '^http-nio' wall.collapsed | sort | uniq -c
```

`-e wall` is also the mode the official documentation recommends for measuring start-up
time, over a short window.

## Several events in one recording

```bash
# CPU + allocation + lock in one JFR file, each with its own threshold:
asprof -e cpu --alloc 2m --lock 10ms -f profile.jfr -d 60 <pid>

# CPU and wall from ONE collection, separated afterwards:
asprof -e cpu --wall 100ms -d 60 -o jfr -f prof.jfr <pid>
jfrconv --cpu  prof.jfr oncpu.html
jfrconv --wall prof.jfr wall.html
```

JFR is the only format that supports multiple event types in a single recording; HTML and
collapsed need one session per event, or a filtered conversion as above.

## Lock, native lock, native memory, method tracing

```bash
# Java monitors and j.u.c.locks together:
asprof -e lock --lock 1ms -t -d 60 -f lock.html <pid>

# Native pthread mutex/rwlock contention (4.3+) — for JNI/native bottlenecks:
asprof --nativelock 5ms -t -f natlock.html <pid>

# Unfreed native allocation, outside the Java heap (JNI, FFM, direct buffers):
asprof --nativemem 1m --nofree -f natmem.jfr -d 300 <pid>
jfrconv --total --nativemem --leak natmem.jfr leak.html

# Per-invocation latency of one boundary method, threshold 50 ms:
asprof --trace com.example.PaymentService.charge:50ms -f trace.jfr -d 120 <pid>
```

`--nativemem` matches `malloc`/`calloc`/`realloc`/`free` and reports what is still
outstanding at the end of the window, discounting roughly the last 10% so recent
allocations are not penalised.

`--trace` redefines bytecode; its cost scales with how often the method is called, not
with elapsed time. It answers "which specific invocations were slow", not "where does
aggregate time go". Option granularity (for example `--ratelimit` per category) has
changed between minor 4.x releases — check `asprof -v` against the installed CHANGELOG.

## Output formats

```bash
-f app.html                    # interactive HTML flame graph (default for .html)
-f app.jfr -o jfr              # JFR — multi-event, opens in JMC
-f app.collapsed -o collapsed  # collapsed stacks — interoperable with flamegraph.pl and jfrconv --diff
```

Native output formats are HTML, JFR, collapsed, pprof, heatmap and OTLP. SVG requires an
external conversion step.

`asprof -o` (what to write when the session ends) and `jfrconv -o`/`--output` (the
conversion's output format) are different option namespaces that happen to share a
character. Convert an already-recorded `.jfr` with `jfrconv`.

## Differential flame graphs

```bash
# Same load, same warm-up, same duration on both sides — non-negotiable:
asprof -e cpu -d 60 -o collapsed -f before.collapsed <pid_v1>
asprof -e cpu -d 60 -o collapsed -f after.collapsed  <pid_v2>

jfrconv --diff before.collapsed after.collapsed diff.html          # native, 4.4+
perl difffolded.pl -n before.collapsed after.collapsed | perl flamegraph.pl > diff.svg
```

| Colour           | Meaning                                                |
| ---------------- | ------------------------------------------------------ |
| Red              | More samples in the new version — candidate regression |
| Blue             | Fewer samples — candidate improvement                  |
| Yellow           | Frame absent from the baseline — new                   |
| Colour intensity | Proportional to the size of the delta                  |

Omitting `-n` (or using a tool without internal normalisation) on two profiles with
different sample totals tints the whole graph one colour. That is arithmetic, not signal.
`jfrconv --diff` normalises internally.

## Continuous profiling

```bash
asprof --loop 1h -e cpu -f "/var/log/profiles/app-%t.jfr" <pid>
```

The filename pattern must contain `%t` (timestamp) or `%n` (sequence). Without one, each
iteration overwrites the previous file and the history is lost silently.

## Reading broken or truncated stacks

`[unknown_Java]` frames, the absence of a per-frame compilation level, and the fact that
native frames _preceding_ the Java frames cannot be recovered (only those that follow
them) are all limitations of `AsyncGetCallTrace`, the undocumented internal API these
engines are built on. They are not defects in async-profiler.

JEP 435 proposed `AsyncGetStackTrace` as a public replacement with a stable header, a
synchronous calling mode, per-frame compilation level and native frames at any stack
position. Its status is **Closed / Withdrawn** — it is in no released JDK, including 25.
Treat it as historical context that explains why the limitations persist, never as an
available API.

## Validating that a fix worked

A before/after pair is evidence only when all four hold:

1. The same load in both collections — same generator, intensity and duration.
2. Both JVMs equally warmed up before collection started.
3. The sample count in each compared frame supports the claim being made.
4. A business metric (throughput, p50/p99/p99.9) confirms the direction the flame graph
   suggests. The graph shows where, not how much.

Also check that no new frame appeared in yellow or red as an unplanned side effect of the
change.
