# Evidence from a running system

## What each source can answer

| Source             | Answers                                                     | Cannot answer                                    | Volatility          | Cost to collect                  |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------ | ------------------- | -------------------------------- |
| Logs               | What the code decided to say happened, with correlation ids | Anything nobody logged; state between statements | Retained            | Low                              |
| Metrics            | Rates, saturation, latency distribution, when it started    | Which request; why                               | Retained            | Low                              |
| Traces             | Where the time went across services; which hop failed       | What the code was doing inside a span            | Sampled             | Low, if sampling caught it       |
| Thread dump        | Captured thread stacks and supported lock information       | Past execution; threads omitted by the mechanism | **Lost on restart** | Target/thread-count dependent    |
| Heap dump          | Captured objects and reference graph                        | Allocation history without other evidence        | **Lost on restart** | Potential long pause, large file |
| JFR recording      | Allocation, GC, locks, I/O, exceptions over a window        | Fine detail outside the enabled events           | Rolling buffer      | Low overhead                     |
| Database state     | What was actually committed                                 | What was attempted and rolled back               | Mutating            | Low; beware read locks           |
| Deployment history | What changed and when                                       | Whether the change is the cause                  | Retained            | Free                             |

The two rows in bold are the ones people destroy. A restart is the standard first response to
an incident, and it takes the thread and heap state with it permanently.

## Collection order during an incident

Mitigation and diagnosis compete. Choose cheap, relevant evidence within the incident budget;
this order is a candidate, not a prerequisite to mitigation:

1. **Note the time and the deploy version.** Free, and irreplaceable later.
2. **Thread evidence**, when relevant — repeated captures a few seconds apart can show persistence,
   but unchanged stacks do not alone prove no progress. `jcmd <pid> Thread.print` has medium
   documented impact depending on thread count. On virtual-thread workloads, choose a supported
   dump mechanism with the needed coverage; traditional thread dumps omit virtual threads.
3. **Metrics screenshot or query** for the window, before dashboards roll off.
4. **One node out of rotation, left running**, if the cluster can spare it. This may reduce
   traffic-induced effects, but it does not freeze state: GC, background jobs, timeouts and caches
   continue, and draining can destroy the reproduction. Capture or record that change deliberately.
5. **Heap dump** only if the symptom is memory and you have accepted the pause:
   `jcmd <pid> GC.heap_dump /approved/path/incident-<id>.hprof`. A filename is required. This is
   a high-impact operation; by default it requests full GC unless `-all` is specified, and dump
   size is not exactly live-set size. Inspect target help, disk headroom and supported options;
   route detailed collection decisions to `heap-dump-analysis`.
6. **Then mitigate** — restart, roll back, shed load — only when the service-impact budget permits
   this collection sequence. Safety, data integrity, and incident command can require mitigation at
   step 1; record the evidence traded away.

If the cluster cannot spare a node, mitigate first and say explicitly in the incident record
that the evidence was traded away. That is a legitimate decision; leaving it unrecorded is what
turns "we could not find the cause" into a recurring incident.

Command examples contain placeholders; paths are on the target host and must be writable by the
target JVM. Check `jcmd <pid> help <command>` with compatible tools. Preserve identity, time range,
configuration and raw artifacts securely; dumps/logs may contain credentials or personal data.
Copy an existing rolling JFR window before it expires when relevant, rather than assuming a new
recording can recover history. JFR contents and overhead depend on enabled events/settings.

## Reading the sources against each other

Correlate independent sources to test hypotheses; two agreeing signals can still share a confounder.

- **Latency up, CPU flat, threads blocked** → waiting on something: a lock, a pool, a
  downstream call. Thread dump names it (concurrency-diagnostics).
- **Latency up, CPU up, allocation up** → increased work, load/mix or GC are candidates. Normalize
  by completed work and combine GC logs with allocation/CPU evidence (java-performance).
- **Errors on one node only** → configuration, image version, or hardware. Compare the node's
  environment before reading any code.
- **Errors start exactly at a deploy** → the deploy is the leading hypothesis, not proof. Compare
  config, traffic, dependency, and infrastructure changes on the same boundary. Roll back when it
  is safe, reversible, and likely to reduce impact; do not roll back an irreversible migration or
  known-incompatible contract blindly.
- **Errors start with no deploy** → data, traffic, time, or a dependency's own change. Work the
  "what changed" table in `method.md`.
- **Time inside one span with no children** → local work, missing/dropped instrumentation or
  propagation failure are candidates. Correlate with profiles/logs before choosing an additional
  span; instrumentation is a diagnostic improvement, not proof of a functional fix.

## What the logs will not tell you

Logs record selected observations. A gap may locate investigation work, but buffering, dropped
records, missing correlation or earlier corruption can put the initiating fault elsewhere.

When a fault falls in that gap, resist adding a hundred log lines to production. Prefer:

- reproducing in an environment where a debugger or a fuller log level is acceptable;
- a JFR recording, which captures exceptions, allocation and locks without code changes;
- one carefully chosen structured log line at the boundary, shipped deliberately, with the
  correlation id (structured-logging).

## After the incident

The cause is not established until it explains the timing, the distribution across nodes and
customers, and why it did not happen before. Write that down while it is fresh.

Then: where feasible the reproduction becomes a regression test at the narrowest level that reproduces it
(java-testing-strategy). For a remaining evidence gap, identify which observation would distinguish
the unresolved causes; first check existing coverage, retention and correlation. Add a targeted
metric, span or log field only when its diagnostic value justifies its cost. Record targeted follow-up;
do not claim recurrence is prevented merely because a test or dashboard was added.

Sources: [JDK 25 jcmd command impact and syntax](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
and [JEP 444 thread-dump coverage](https://openjdk.org/jeps/444). Verify the deployed JDK's behavior.
