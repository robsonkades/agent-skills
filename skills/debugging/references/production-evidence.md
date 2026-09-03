# Evidence from a running system

## What each source can answer

| Source             | Answers                                                     | Cannot answer                                    | Volatility          | Cost to collect            |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------ | ------------------- | -------------------------- |
| Logs               | What the code decided to say happened, with correlation ids | Anything nobody logged; state between statements | Retained            | Low                        |
| Metrics            | Rates, saturation, latency distribution, when it started    | Which request; why                               | Retained            | Low                        |
| Traces             | Where the time went across services; which hop failed       | What the code was doing inside a span            | Sampled             | Low, if sampling caught it |
| Thread dump        | What every thread is doing _right now_; lock ownership      | What happened a second ago                       | **Lost on restart** | Seconds, near-zero impact  |
| Heap dump          | Every live object and reference chain                       | Anything about time or threads                   | **Lost on restart** | Long pause, large file     |
| JFR recording      | Allocation, GC, locks, I/O, exceptions over a window        | Fine detail outside the enabled events           | Rolling buffer      | Low overhead               |
| Database state     | What was actually committed                                 | What was attempted and rolled back               | Mutating            | Low; beware read locks     |
| Deployment history | What changed and when                                       | Whether the change is the cause                  | Retained            | Free                       |

The two rows in bold are the ones people destroy. A restart is the standard first response to
an incident, and it takes the thread and heap state with it permanently.

## Collection order during an incident

Mitigation and diagnosis compete. The resolution is that the cheap, fast, non-disruptive
evidence is collected _first_, because it costs seconds:

1. **Note the time and the deploy version.** Free, and irreplaceable later.
2. **Thread dump** — three of them, a few seconds apart, so you can tell a stuck thread from a
   busy one. `jcmd <pid> Thread.print`. Near-zero impact; safe on a live node.
3. **Metrics screenshot or query** for the window, before dashboards roll off.
4. **One node out of rotation, left running**, if the cluster can spare it. This converts every
   piece of volatile evidence into evidence you can take your time with — the single highest
   value action available in an incident, and the one that must be decided early.
5. **Heap dump** only if the symptom is memory and you have accepted the pause:
   `jcmd <pid> GC.heap_dump`. It stops the world for the duration and writes a file the size of
   the live set.
6. **Then mitigate** — restart, roll back, shed load — only when the service-impact budget permits
   this collection sequence. Safety, data integrity, and incident command can require mitigation at
   step 1; record the evidence traded away.

If the cluster cannot spare a node, mitigate first and say explicitly in the incident record
that the evidence was traded away. That is a legitimate decision; leaving it unrecorded is what
turns "we could not find the cause" into a recurring incident.

## Reading the sources against each other

A single source is usually ambiguous; two together are usually decisive.

- **Latency up, CPU flat, threads blocked** → waiting on something: a lock, a pool, a
  downstream call. Thread dump names it (concurrency-diagnostics).
- **Latency up, CPU up, allocation up** → doing more work per request, or GC. GC log separates
  the two (java-performance, jvm-gc-tuning).
- **Errors on one node only** → configuration, image version, or hardware. Compare the node's
  environment before reading any code.
- **Errors start exactly at a deploy** → the deploy is the leading hypothesis, not proof. Compare
  config, traffic, dependency, and infrastructure changes on the same boundary. Roll back when it
  is safe, reversible, and likely to reduce impact; do not roll back an irreversible migration or
  known-incompatible contract blindly.
- **Errors start with no deploy** → data, traffic, time, or a dependency's own change. Work the
  "what changed" table in `method.md`.
- **Traces show the time inside one span with no child spans** → the missing instrumentation
  _is_ the finding; you cannot debug what is not observable, and adding the span is the fix
  before the next occurrence (distributed-tracing-design).

## What the logs will not tell you

Logs record what someone anticipated. The gap between the last log line before the failure and
the first one after is where the fault lives, and by construction nobody instrumented it.

When a fault falls in that gap, resist adding a hundred log lines to production. Prefer:

- reproducing in an environment where a debugger or a fuller log level is acceptable;
- a JFR recording, which captures exceptions, allocation and locks without code changes;
- one carefully chosen structured log line at the boundary, shipped deliberately, with the
  correlation id (structured-logging).

## After the incident

The cause is not established until it explains the timing, the distribution across nodes and
customers, and why it did not happen before. Write that down while it is fresh.

Then: the reproduction becomes a regression test at the narrowest level that reproduces it
(java-testing-strategy), and any evidence you wished you had had becomes an instrumentation
change — a metric, a span, a log field. An incident that produces neither is an incident you
will have again.
