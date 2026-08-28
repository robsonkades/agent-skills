---
name: java-performance
description: >
  Triage entry point for JVM performance problems: turn a reported symptom into the one
  investigation that can resolve it, and hand off to the specialist skill that owns it. Use
  when a performance problem arrives without a known cause — "it got slow", a p99 regression
  after a deploy, high CPU, memory growth, a slow start — and the next step is unclear.
  Routes to performance-methodology for the process, jfr-and-async-profiler for evidence,
  jvm-gc-tuning for collectors, sql-query-performance and orm-fetch-and-batching-performance
  for the database, incident-evidence-capture when a restart is imminent, and the rest of
  the family for each specific cause. Does not itself cover the investigation process,
  profiling commands, GC, JIT, concurrency, the database, load testing, pools or caches —
  each of those is its own skill.
---

# Java Performance

## Purpose

Be the first skill a vague performance report reaches, and the last one to stay loaded.
Its job is classification: take a symptom, ask the two or three questions that separate the
candidate causes, and route to the skill that owns the resulting investigation.

The failure this prevents is the investigation that starts in the wrong place — tuning GC
flags on a service whose problem is a lock, or profiling CPU on a service whose problem is
waiting.

## Workflow

1. **Make the symptom precise.** Latency at which percentile? Throughput at which
   concurrency? Startup, steady state, or a specific load shape? A symptom stated as "it's
   slow" cannot be falsified and cannot be routed.
2. **Ask the separating questions** in `references/triage-map.md` and read off the owning
   skill.
3. **Hand off.** The specialist skill carries the workflow, the commands and the rules for
   that cause.
4. **If two candidates remain**, collect the cheapest discriminating evidence first — the
   GC log and a two-minute JFR recording answer most of them — rather than guessing between
   them.

## The routing table

| Symptom                                           | Owning skill                         |
| ------------------------------------------------- | ------------------------------------ |
| No process yet — where do I even start?           | `performance-methodology`            |
| A flag set, GC log or JFR handed over to audit    | `jvm-performance-review`             |
| The numbers themselves look wrong or unbelievable | `latency-statistics`                 |
| Which profile do I take, and how?                 | `jfr-and-async-profiler`             |
| I have a flame graph and do not know what to fix  | `flame-graph-analysis`               |
| High CPU, GC normal                               | `flame-graph-analysis`               |
| High latency, **low** CPU                         | `littles-law-and-queueing`           |
| GC pauses confirmed on the critical path          | `jvm-gc-tuning`                      |
| Why is this collection expensive?                 | `gc-fundamentals`                    |
| I have a GC log to read                           | `gc-log-analysis`                    |
| `-Xlog` is set but the file is empty or missing   | `unified-logging`                    |
| Bad only for the first minutes after deploy       | `jit-compilation`                    |
| Degraded permanently until restart                | `jit-compilation` (code cache)       |
| High allocation rate on a hot path                | `jit-inlining-and-escape-analysis`   |
| OOMKilled, or an OOM naming a non-heap region     | `jvm-memory-regions`                 |
| Metaspace grows across redeploys                  | `jvm-class-loading`                  |
| Exit code 137, throttling, page faults, swap      | `linux-for-jvm`                      |
| Throughput gets **worse** as threads are added    | `cpu-cache-and-numa`                 |
| Intermittent wrong results under concurrency      | `java-memory-model`                  |
| Pool sizing, virtual threads, pinning             | `thread-sizing-and-virtual-threads`  |
| Which concurrency construct fits this work        | `java-concurrency`                   |
| Nothing progresses; a thread dump must be read    | `concurrency-diagnostics`            |
| Threads waiting on the database                   | `connection-pool-sizing`             |
| One SQL statement is slow; the plan needs reading | `sql-query-performance`              |
| The query count scales with rows rendered         | `orm-fetch-and-batching-performance` |
| Should we cache this, and how?                    | `caching-strategies`                 |
| The load test's numbers look like the generator's | `load-testing`                       |
| Is this micro-optimisation worth anything?        | `jmh-microbenchmarks`                |
| What will N of these cost in bytes?               | `object-layout-and-footprint`        |
| It changed after a JDK upgrade                    | `jdk-upgrade-impact`                 |
| It is degrading now and about to be restarted     | `incident-evidence-capture`          |

## Rules

- Classify before optimising. Nearly every JVM performance problem is one of: allocation
  pressure, lock contention, an algorithmic problem, I/O waiting, or warm-up. The class
  determines the fix; the symptom rarely does.
- Route on evidence, not on the first plausible story. The GC log and a two-minute JFR
  recording are cheap enough that guessing is never justified.
- **Low CPU with high latency is a queue, not idleness.** It is the most common shape and
  the one most often misrouted to code profiling.
- Do not stay in this skill once the class is known. Its content stops being useful at the
  point of hand-off, and the specialist skill carries the depth.
- Two symptoms that look alike but route differently: bad-after-deploy that recovers is
  warm-up; bad-after-deploy that never recovers is the code cache or a genuine regression.
- The table above routes to the **introductory** owner of each area. Every area also has an
  advanced and often an expert skill behind it; go down that ladder only when the
  introductory skill has been applied and the question survives.

## References

- [Triage map](references/triage-map.md) — the separating questions for each ambiguous
  symptom, and the cheapest evidence that resolves each fork. Read when the routing table
  above gives two candidates rather than one.
- [Depth ladder](references/depth-ladder.md) — for each area, the introductory, advanced and
  expert skill, and the condition that justifies descending. Read when the introductory
  skill has been applied and the question is still open.
- [Worked example: a p99 regression](references/latency-regression.md) — read when pause
  frequency changed but pause duration did not, or when a regression followed a deploy with
  no obvious cause.
