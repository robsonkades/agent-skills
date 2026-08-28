---
name: concurrency-diagnostics
description: >
  Collecting evidence for a concurrency problem and knowing each tool's blind spot: the two
  thread-dump formats and why neither is a superset of the other, jstack not listing virtual
  threads, ThreadMXBean not detecting virtual-thread deadlocks, the JFR events for parking,
  monitors, pinning and submission failure, and reading a dump with a hundred thousand
  threads. Use when nothing is progressing and the cause is unknown, when a dump comes back
  suspiciously short, when a deadlock is suspected but no detector reports one, when threads
  are BLOCKED or the CPU is idle while latency climbs, when work submitted to an executor
  disappears, when a runbook still says jstack or -Djdk.tracePinnedThreads, or when a
  symptom has to be classified before it can be routed to an owner. Not choosing and running
  a profiler (jfr-and-async-profiler), reading a flame graph (flame-graph-analysis), monitor
  internals (lock-inflation), pinning internals (virtual-threads-internals), or
  happens-before (java-memory-model).
---

# Concurrency Diagnostics

## Purpose

Replace "it looks like a deadlock" with evidence that distinguishes deadlock from
starvation, from saturation, from a downstream that is simply slow. All four present the
same way — requests not completing, CPU low — and each has a different fix, so guessing costs
a deploy cycle per guess.

The second purpose is knowing what each tool cannot see. Every standard concurrency tool has
a blind spot that widened when virtual threads arrived, and several of them fail by returning
plausible, incomplete answers rather than errors.

## Workflow

1. **Classify the symptom** into one of four shapes before collecting anything: nothing
   progresses, everything is slow, work disappears, or memory grows with in-flight work.
2. **Take both dumps.** `Thread.print` for lock ownership and deadlock detection,
   `Thread.dump_to_file -format=json` for virtual threads and scope hierarchy. Neither
   contains the other's information.
3. **Take the second dump 10–30 seconds later.** Identical stacks mean stuck; changing stacks
   mean slow. This one comparison resolves more incidents than any single tool.
4. **Reach for JFR when the question is "how often" or "for how long"** rather than "what is
   happening right now" — parking, monitor waits, pinning, socket and file I/O all have
   events with durations.
5. **Use a wall-clock profile, never a CPU profile, for waiting.** A CPU profile of a service
   that is waiting is empty by construction, and the emptiness is often misread as health.
6. **Route to the owning skill** once the class is established, and stop collecting.

## Symptom to evidence

| Symptom                                          | First evidence                                                 | Then                                              |
| ------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------- |
| Nothing completes, CPU near zero                 | two `Thread.print` dumps + the JSON dump                       | deadlock, starvation or a stuck downstream        |
| Everything slow, CPU near zero                   | executor queue depth, pool wait time, in-flight count          | `littles-law-and-queueing`                        |
| Everything slow, CPU high, GC normal             | wall-clock and CPU flame graphs side by side                   | `flame-graph-analysis`, `lock-inflation`          |
| Threads BLOCKED on a monitor                     | `jdk.JavaMonitorEnter` durations, `Thread.print`               | `lock-inflation`                                  |
| Throughput flat as threads are added             | scaling curve, `jdk.JavaMonitorEnter`, CAS retry counters      | `universal-scalability-law`, `lock-free-patterns` |
| Carrier count climbing towards `maxPoolSize`     | JSON dump over time, `jdk.VirtualThreadPinned`                 | `blocking-and-nonblocking-io`                     |
| Submitted work never runs and nothing is logged  | executor queue depth, rejection count, code review of `submit` | `executors-and-task-lifecycle`                    |
| A periodic job stopped without an error          | last-success freshness metric                                  | `executors-and-task-lifecycle`                    |
| Memory grows in proportion to in-flight requests | heap after full GC, in-flight gauge                            | `concurrency-limiting-and-bulkheads`              |
| Scope closes far later than it fails             | JSON dump during close; look for uninterruptible subtasks      | `cancellation-and-interruption`                   |

## Rules

- **`jstack` and `jcmd Thread.print` do not list virtual threads.** The dump comes back short,
  which reads as "not many threads" — the opposite of the truth. Any runbook that stops here
  is misleading, not merely incomplete.
- **The JSON dump does not contain lock information.** It deliberately omits object addresses,
  monitors and JNI statistics, so it cannot answer "who holds this lock" and cannot detect a
  deadlock. Use both formats; neither is a superset.
- **`ThreadMXBean.findDeadlockedThreads()` finds cycles of platform threads only.** A
  deadlock among virtual threads is invisible to it and to everything built on it, including
  most APM deadlock alerts. There is no automatic detector for that case — it must be found
  by reading the JSON dump.
- `-Djdk.trackAllThreads=false` makes virtual threads created directly through
  `Thread.Builder` potentially absent from the JSON dump. If a dump seems to be missing
  threads you know exist, check the command line before disbelieving the tool.
- **`-Djdk.tracePinnedThreads` was removed in JDK 24.** It is still accepted on the command
  line and does nothing, which is worse than an error. The only source of truth for pinning
  is the JFR event `jdk.VirtualThreadPinned` — whose default 20 ms threshold hides the
  frequent short pins that matter most.
- **A CPU profile cannot see waiting.** For latency questions collect wall-clock samples
  (`asprof -e wall`) or JFR, and compare the two: work that appears in the wall-clock graph
  and not in the CPU graph _is_ the waiting.
- **Two dumps beat one dump every time.** A single dump shows where threads are; two show
  whether they are moving. Take three if the answer is ambiguous.
- With tens of thousands of virtual threads, do not read the dump — **aggregate it**. Group
  by stack signature and count; the interesting stacks are the ones with a surprising count,
  not the ones at the top of the file.
- `jdk.VirtualThreadSubmitFailed` is enabled by default and means the scheduler could not
  accept a virtual thread — a resource problem that will otherwise surface as an unexplained
  failure much later.
- An idle-looking service with a full queue is not idle. Always pair CPU with a queue-depth or
  in-flight metric; either one alone supports the wrong conclusion.
- Diagnose before tuning. Raising `jdk.virtualThreadScheduler.maxPoolSize`, growing a pool or
  adding a retry in response to an unclassified symptom changes the shape of the evidence and
  usually removes the signal that would have identified the cause.

## References

- [Reading a thread dump](references/thread-dump-reading.md) — the commands for both formats,
  what each contains, the deadlock and starvation signatures, aggregating a dump with a
  hundred thousand virtual threads, reading a `StructuredTaskScope` hierarchy, and the JFR
  event list with thresholds. Read while collecting evidence.
- [Failure-mode catalogue](references/failure-mode-triage.md) — deadlock, livelock,
  starvation, saturation, task leak, forgotten cancellation, permit leak, pool exhaustion,
  retry storm and unbounded fan-out, each with its symptoms, the measurement that confirms
  it, the fix and the prevention. Read once the class is known, or to identify it from a
  symptom.
