---
name: incident-evidence-capture
description: >
  What to collect from a degrading JVM before someone restarts it, in what order, and what the
  restart destroys: the artefacts that already exist and survive, three spaced thread dumps
  rather than one, the heap dump as the last and most disruptive item, capturing to a path that
  outlives the container, and the timestamps that make any of it correlatable afterwards. Use
  when a service is degrading right now and the instinct is to restart, when an incident is over
  and nobody captured anything, when a runbook says "restart the pod" with no collection step,
  when a dump was taken and made the outage worse, when jcmd or jmap hangs against a wedged JVM,
  or when evidence was written inside a container that was then replaced. Owns the order and the
  budget; each tool's own use belongs elsewhere — heap-dump-analysis, concurrency-diagnostics,
  jfr-and-async-profiler, jhsdb-and-core-dumps, gc-log-analysis. Not diagnosis (java-performance)
  or postmortem writing (engineering-communication).
---

# Incident Evidence Capture

## Purpose

Decide, in the first minute of a degrading JVM, what to collect and in what order — so that the
restart that follows does not also destroy the only chance of knowing why.

This skill owns the **ordering under time pressure**, not the tools. Every artefact below has a
skill that knows how to read it. What is missing everywhere else is the sequence: which evidence
is free, which is expensive, which the restart takes with it, and how much of the outage the
collection is allowed to consume.

The failure this prevents is the recurring incident with no evidence: restarted quickly, resolved
apparently, and unexplained — so it happens again, and the second time nobody captured anything
either.

## Workflow

1. **Say the budget out loud, in minutes.** "We restore service in three minutes" is a different
   list from "we can hold this instance out of rotation". The budget chooses the list; an
   unstated budget means collection expands until somebody loses patience, which is the worst of
   both outcomes.
2. **Take one instance out of rotation instead of collecting from a serving one**, if the
   deployment allows it. A pod removed from the load balancer but not killed preserves everything
   and costs nothing further. This is the single highest-value move available and it is
   frequently possible.
3. **Collect what already exists first.** GC log, JFR recording, `hs_err` file, exported metrics
   and traces cost nothing to preserve and are lost only if the container is replaced. Copy them
   off before anything else. See `references/what-a-restart-destroys.md`.
4. **Take three thread dumps, five to ten seconds apart.** One dump cannot distinguish a thread
   stuck from a thread busy; three make it obvious. Seconds of cost, and the highest information
   per second of any volatile capture.
5. **Take the heap dump last, and only if the symptom is memory.** It stops the JVM for the
   duration and writes bytes proportional to the live set. On a large heap the capture is itself
   an outage — decide deliberately, not reflexively.
6. **Record the context in the same place as the artefacts**: wall-clock timestamps for every
   capture, the build version, the load at the time, and what changed recently. Uncorrelatable
   evidence is close to no evidence.
7. **Restore service.** Then analyse, with the skill that owns the artefact.

## Rules

- **Name what the restart will destroy before you take it.** Thread state, heap contents,
  compiled code and JIT profile, native memory state, in-flight requests, and every JVM counter —
  all of it. What survives is on disk or already exported.
- **One thread dump is close to worthless for a hang.** It shows where threads are, not whether
  they are moving. Three spaced dumps showing the same stack at the same line is evidence; one
  dump showing it is a screenshot.
- **A heap dump is not a free action.** It triggers a full collection and writes the live set to
  disk while the application is stopped. Budget for it, write it somewhere with room, and never
  take one on every replica.
- **If `jcmd` or `jmap` hangs, stop trying.** The JVM cannot reach a safepoint, which is itself a
  finding. The evidence is then a core dump or the OS's view — `jhsdb-and-core-dumps`.
- **Write to a path that outlives the process.** A dump written to a container's own filesystem
  dies with the pod, and a pod being restarted is precisely the case. A mounted volume, or a
  copy off the node before termination.
- **Collect from one representative instance, plus one healthy one as a control.** Dumping the
  whole fleet multiplies the disruption and produces one artefact nobody has time to read
  instead of two that answer a question by difference.
- **Timestamp everything against one clock.** Correlating a GC pause with a latency spike, a
  thread dump and a deploy is the whole point, and it is impossible after the fact if the
  captures carry no times or times from different sources.
- **Check whether the evidence already exists before collecting.** If JFR is running continuously
  or a profiler is always on, the incident is already recorded and the correct action is to note
  the window and restore service immediately.
- **Do not extend an outage silently.** Collection that lengthens the incident is sometimes right,
  but it is a decision with a cost that the person running the incident must make explicitly.
- **The best capture is the one configured before the incident.** `-XX:+HeapDumpOnOutOfMemoryError`
  with a path on a mounted volume, a GC log with rotation, and a continuous JFR recording all
  cost close to nothing and turn this whole workflow into a copy operation. Every incident that
  ends with "we have nothing" is a configuration decision made earlier.

## References

- [Capture order](references/capture-order.md) — the ordered list with the cost, the disruption
  and the owning skill for each artefact, plus the decision table by symptom. Read during the
  incident.
- [What a restart destroys](references/what-a-restart-destroys.md) — the survival matrix, and
  preserving artefacts from a container that is about to be replaced. Read before the incident,
  and when deciding what to configure in advance.
