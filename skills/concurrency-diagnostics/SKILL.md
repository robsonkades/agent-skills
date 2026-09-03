---
name: concurrency-diagnostics
description: >
  Evidence-led diagnosis of deadlock, starvation, livelock, saturation, leaks and virtual-thread
  scheduler problems. Compares traditional platform-thread dumps, jcmd all-thread dumps,
  ThreadMXBean, VirtualThreadSchedulerMXBean, JFR, wall/CPU profiles and application telemetry,
  including each tool's visibility and consistency limits. Use when progress stops, CPU and
  latency disagree, tasks disappear, shutdown hangs, or a virtual-thread dump is inconclusive.
---

# Concurrency Diagnostics

## Purpose

Classify loss of progress before changing concurrency policy. Deadlock, starvation, saturation,
livelock, a slow dependency and leaked work can all produce high latency with little useful CPU,
but their confirming evidence and remediation differ.

This skill owns evidence collection and classification. It routes proven causes to the skills that
own JMM correctness, lock internals, executor lifecycle, virtual-thread mechanics or capacity.

## Evidence workflow

1. Freeze the incident interval: timestamps, deployment/JDK build, traffic, CPU quota, changes and
   affected operation/tenant.
2. Define progress numerically: completions, queue age, successful state transitions or durable
   offsets—not “threads look stuck.”
3. Capture application state: accepted/started/completed/failed/cancelled/rejected counts, queue age
   and depth, in-flight work, resource permits/connections and downstream latency.
4. Capture multiple thread views several seconds apart. Use traditional dumps for platform-thread
   locks/deadlock detection and `Thread.dump_to_file` for virtual threads/containers.
5. Record JFR with inspected event settings and pair CPU with wall-clock profiling when off-CPU time
   matters.
6. Form competing hypotheses and list the signal each predicts. Change nothing until evidence can
   discriminate at least the leading alternatives.
7. Apply the smallest reversible remediation, then validate progress, latency, residual work and
   resource recovery.

Sampling twice does not prove a thread is permanently stuck: long waits and slow operations can show
identical stacks. Use a duration appropriate to the operation deadline and corroborate ownership and
progress counters.

## Tool capability matrix (Java 25)

| Evidence                                           | Includes virtual threads                                      | Lock ownership/deadlock                                                                               | Consistency and blind spot                                                          |
| -------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `jcmd <pid> Thread.print -l` / `jstack`            | no                                                            | monitors/ownable synchronizers for platform threads; HotSpot may print detected cycles                | stop-the-world style snapshot; high thread count/attach conditions affect impact    |
| `jcmd <pid> Thread.dump_to_file -format=json file` | normally all tracked platform/virtual threads plus containers | Java 25 simple dump omits traditional object/lock detail and performs no automatic deadlock detection | not one globally simultaneous snapshot; per-thread timestamps/schema/runtime matter |
| `ThreadMXBean`                                     | no                                                            | platform-thread monitor/ownable-synchronizer cycles only                                              | explicitly does not manage virtual threads; methods may be expensive                |
| Java 24+ `VirtualThreadSchedulerMXBean`            | scheduler aggregates                                          | none                                                                                                  | pool/mounted/queued values are estimates and may return `-1`                        |
| JFR                                                | duration/frequency events when configured                     | stacks for observed monitor/park/pin events, not a complete wait-for graph                            | disabled events and thresholds censor short/absent samples                          |
| CPU profile                                        | running sampled work                                          | no                                                                                                    | cannot attribute most parked time                                                   |
| wall-clock profile                                 | sampled on/off-CPU stacks subject to profiler support         | no ownership graph                                                                                    | sampling and thread filters can bias high-cardinality VT workloads                  |

The HotSpot diagnostic MXBean contract says an all-thread dump includes all platform threads and may
include some or all virtual threads. Tracking/runtime configuration therefore matters. A missing
virtual thread is not proof it did not exist.

Java 26 improves simple-dump lock information; do not silently apply Java 26 interpretation to a
Java 21/25 incident. Record the exact runtime and dump schema.

## Classification table

| Candidate                       | Progress/CPU shape                                    | Evidence that strengthens it                                            | Evidence that weakens it                                         |
| ------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| lock deadlock                   | relevant completions flat; usually low CPU            | stable wait-for cycle with owners, or platform detector output          | stacks move and operation completions continue                   |
| liveness wait on external event | completions flat; low CPU                             | waiters share a resource/event whose producer is absent or failed       | owner/producer continues signalling successfully                 |
| starvation/unfairness           | some class progresses while another ages              | per-class queue age/service counts diverge with sustained contention    | all classes degrade together at a saturated resource             |
| executor/resource saturation    | completions continue below arrivals; queue age grows  | utilization, queueing and protected-resource occupancy correlate        | queue remains empty and capacity idle                            |
| livelock/retry spin             | attempts/CPU high, commits flat                       | retry/CAS failure or state-transition attempts increase without success | useful completion rises with attempts                            |
| pinning/carrier pressure        | VT scheduler queue grows while carriers unavailable   | scheduler MXBean + pinned/native/foreign stack evidence                 | scheduler queue is low or CPU is simply saturated                |
| leaked/late work                | caller completes/cancels but operation remains active | operation IDs persist past owner deadline; resources not returned       | provider confirms cancellation and in-flight returns to baseline |

Thread state alone is not classification. `BLOCKED` specifically means monitor entry, while
`WAITING`/`TIMED_WAITING` can be healthy queue, join, condition or I/O protocol behavior. Virtual
threads can be unmounted while waiting; OS thread count is not their concurrency count.

## Virtual-thread evidence

On Java 24+, use `VirtualThreadSchedulerMXBean` for target parallelism, current scheduler platform
threads, mounted virtual threads and queued virtual threads. Values are estimates; trends aligned to
latency are more useful than one sample. Do not grep generic `ForkJoinPool-*-worker` names to count
carriers: other pools share that naming shape.

JDK 24 eliminated pinning caused by `synchronized`/`Object.wait`, but virtual threads can still pin
during native methods or foreign-function calls. File-system operations may capture/temporarily add
carrier threads without being the same mechanism as pinning. Route exact mechanics to
`virtual-threads-internals` and `blocking-and-nonblocking-io`.

Relevant JFR events include `jdk.VirtualThreadPinned`, `jdk.VirtualThreadSubmitFailed`, and optional
start/end events. Default enablement/thresholds are template- and release-dependent operational
settings; inspect the recording metadata/configuration. `SubmitFailed` points to failure starting or
unparking a virtual thread, probably resource-related; correlate it with the initiating failure.

## Deadlock limits

`ThreadMXBean.findDeadlockedThreads()` explicitly excludes cycles containing virtual threads. A Java
25 JSON/simple dump provides stacks and hierarchy but insufficient ownership data to prove many lock
cycles by itself. Combine application lock/resource identifiers, owner instrumentation, JFR events,
platform-thread information and reproducible wait-for edges. “No detector result” means only “no
supported platform-thread cycle found.”

Timeouts can bound impact but do not prove absence of deadlock, and retries can multiply held work.
Fix the wait-for graph: ordering, ownership, nested acquisition or alien calls.

## Production guardrails

- Instrument lifecycle conservation: `accepted = running + queued + terminal` for a clearly defined
  instant/model; label rejection and cancellation separately. Snapshot races require tolerances.
- Track queue _age_ as well as depth. A short deep burst and one ancient item require different action.
- Use monotonic deadlines for waits and correlate caller timeout with actual provider cancellation.
- Preserve incident artifacts before tuning parallelism, capacity or retries.
- Avoid high-cardinality thread/task metrics; attach operation/resource identities to traces or
  sampled diagnostic events.
- Sanitize dumps: names, stack arguments, paths and context can disclose tenant/security data.

## Symptom-driven response

| Symptom                              | Next discriminating evidence                                            | Route after confirmation                       |
| ------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------- |
| queue age grows, CPU low             | worker stacks plus protected resource wait/occupancy                    | executor lifecycle, limiting, connection pools |
| high CPU, few completions            | CPU profile plus attempt/success counters                               | lock-free/livelock or hot computation          |
| shutdown exceeds grace period        | owner-to-task IDs, interrupt state, provider active work                | cancellation and executor lifecycle            |
| periodic effect stops                | scheduled future outcome, last-attempt/last-success, executor rejection | executors and task lifecycle                   |
| virtual-thread scheduler queue rises | scheduler MXBean, CPU, pin/native/foreign and blocking stacks           | virtual-thread internals or CPU capacity       |
| memory follows in-flight/queue       | heap dominators plus lifecycle counters                                 | concurrency limiting and heap analysis         |

## Review checklist

- [ ] Progress is defined by business/task completion, not thread state.
- [ ] JDK build, dump type, recording settings and collection timestamps are recorded.
- [ ] Platform and virtual-thread visibility limitations are explicit.
- [ ] At least two competing hypotheses and discriminating signals were considered.
- [ ] Queue age, lifecycle counts and scarce-resource occupancy accompany stack evidence.
- [ ] Absence of JFR/detector events is not treated as absence without configuration coverage.
- [ ] Remediation was validated for useful progress, tail latency, residual work and resource return.

## References

- [Thread dump interpretation](references/thread-dump-reading.md)
- [Failure-mode triage](references/failure-mode-triage.md)
- [Java 25 `ThreadMXBean`](https://docs.oracle.com/en/java/javase/25/docs/api/java.management/java/lang/management/ThreadMXBean.html)
- [Java 25 `VirtualThreadSchedulerMXBean`](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.management/jdk/management/VirtualThreadSchedulerMXBean.html)
- [Java 25 virtual-thread guide](https://docs.oracle.com/en/java/javase/25/core/virtual-threads.html)
- [JEP 491: Synchronize Virtual Threads without Pinning](https://openjdk.org/jeps/491)
