---
name: incident-evidence-capture
description: >
  Preserving decision-grade JVM incident evidence before remediation destroys it: setting an
  explicit recovery/evidence budget, selecting representative and control instances, copying
  existing telemetry first, capturing repeated low-risk state, escalating to JFR, heap, or
  core evidence only by symptom and approval, surviving containers/restarts, and recording
  integrity, clocks, provenance, privacy, and capture failures. Use during live degradation,
  impending restart/OOM, an unresponsive JVM, or runbook design. Owns ordering and safety;
  artifact-specific analysis belongs to heap-dump-analysis, concurrency-diagnostics,
  jfr-and-async-profiler, gc-log-analysis, and jhsdb-and-core-dumps.
---

# Incident Evidence Capture

## Purpose

Preserve the smallest set of volatile evidence that can distinguish credible causes before a
restart, failover, autoscaler, OOM killer, or operator action destroys it—without making user
impact materially worse or delaying recovery without explicit authority.

This skill owns orchestration under pressure. It does not diagnose from the artifacts and does
not authorize draining, freezing, dumping, signaling, killing, relabeling, or extending an
outage. Those actions require the incident commander's declared recovery policy and the
platform's safety controls.

## First-minute contract

State and record:

```text
incident ID, UTC time source, commander, capture operator:
user impact and current error/latency/saturation:
recovery objective/deadline and evidence budget:
minimum healthy serving capacity and failure-domain constraints:
suspected symptom class and discriminating artifacts:
target instance(s), healthy control, and why representative:
per-command timeout/cancel/abort threshold:
durable destination, free space, encryption/access/retention:
approved disruptive actions and rollback owner:
```

If recovery time is already exhausted, preserve exported/existing evidence and restore service.
Do not improvise a heap/core dump because it might be useful later.

## Priority model

Order candidates by:

```text
expected diagnostic value
  * probability capture completes before remediation
  * probability artifact survives and is readable
  / (user-impact risk + runtime perturbation + time + storage + privilege/privacy risk)
```

The ordering is conditional, not a fixed “rows 1–9” list. A deadlock can be proven by one
thread dump; a fast-growing heap may justify an early histogram or dump; a JVM that cannot
attach may require OS/core evidence immediately. See [Adaptive capture protocol](references/capture-order.md).

## Default workflow

1. **Freeze the timeline, not necessarily the process.** Mark incident start, deploy/config/
   autoscaling events, affected instances, UTC/monotonic offsets, workload and SLO state.
2. **Preserve evidence that already exists.** Snapshot backend queries/dashboard definitions,
   logs, metrics, traces, continuous profiles, GC/JVM logs, fatal-error files, prior dumps, and
   JFR repositories/files. Record query/filter/time zone, not only screenshots.
3. **Check survivability and capacity.** Confirm whether pod/node/process replacement will
   delete local artifacts; verify durable path, quota, inode/free space, upload path, and
   encryption. Never write a heap/core dump to a nearly full application filesystem.
4. **Select targets.** Prefer one clearly affected instance and, when cheap and comparable,
   one healthy control. For heterogeneous failure domains or rolling versions, sample each
   relevant cohort. Do not dump the fleet by default.
5. **Apply load isolation only if approved and capacity-safe.** Draining traffic can preserve
   evidence, but can overload replicas, change the symptom, trigger controllers, or violate
   quorum/PDB/stateful ownership. Verify endpoints/readiness and rollback.
6. **Capture low-perturbation state with timeouts.** Effective JVM flags/version/uptime,
   process/container/cgroup/host state, and symptom-driven repeated thread/JFR/GC evidence.
7. **Escalate by hypothesis.** Histograms, NMT detail, high-frequency profiles, heap dumps,
   process freezes, and core dumps need explicit cost/risk approval and fallback.
8. **Verify artifacts before remediation.** File closed/readable, nonzero/expected size,
   checksum, tool/runtime metadata, capture status, and durable remote receipt.
9. **Restore service on deadline.** Record what was not captured and why. Afterward, route each
   artifact to its owning diagnostic skill and repair pre-incident observability gaps.

## Existing evidence first

“Already exists” does not mean “survives.” Determine:

- whether JFR is memory-only, disk-backed, has a destination, dumps on exit, or only has a
  temporary repository;
- whether GC/application/fatal logs are on container writable layer, `emptyDir`, host path,
  persistent volume, or shipped backend;
- whether backend retention will expire during the investigation;
- whether a continuous profiler/exporter is current and loss-free;
- whether OOM/fatal hooks wrote a complete file;
- whether node loss or rescheduling removes the destination.

For an active rolling JFR recording, a bounded `JFR.dump` may preserve the incident window
without stopping the recording, subject to target-JDK support and storage. A configured
destination/dump-on-exit may behave differently; inspect `JFR.check` and effective settings.

## Thread evidence

One dump can prove a reported deadlock or capture a unique stack; it is not worthless. Repeated
dumps distinguish persistence/progress and estimate state transitions. Choose count and spacing
from the symptom timescale:

- subsecond stalls may need JFR/profiling rather than manually spaced dumps;
- a multi-second hang might use 3–5 dumps across the interval;
- a long periodic stall needs trigger-aligned capture, not arbitrary eight-second spacing.

Thread-dump cost/output grows with thread count and stack/lock detail. Virtual threads can make
full dumps very large, and `Thread.print` may not include them depending on JDK/tool. Discover
`jcmd <pid> help Thread.print` and `Thread.dump_to_file` on the target. Capture process/thread CPU
and OS TID mapping over the same windows. Preserve partial output and timeout status.

Use `concurrency-diagnostics` to interpret progress, ownership, deadlocks, carrier pinning, and
state distributions.

## Memory evidence escalation

Choose the artifact that answers the hypothesis:

| Question                     | Candidate                                    | Important cost/limit                                             |
| ---------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| Heap capacity/config now     | `GC.heap_info`, GC/JFR/log metrics           | low detail, attach required                                      |
| Which classes/counts grow    | repeated class histograms                    | high-impact heap inspection; no instance retention paths         |
| Who retains objects/paths    | heap dump                                    | potentially long stop/high CPU-I/O/disk; sensitive payloads      |
| Where native categories grow | NMT baseline/diff/summary/detail             | NMT must have been enabled; coverage/overhead level-dependent    |
| Container/process RSS grows  | proc/cgroup maps/smaps/status and OS metrics | attribution across heap/native/page cache/shared mappings needed |

A live-object heap dump commonly requests a collection and heap traversal; `-all`, compression,
and parallel options change semantics, CPU, bytes, and pause and are JDK-version-specific.
Compression can reduce bytes while increasing CPU/elapsed time. Benchmark a comparable safe
environment; never promise “seconds” or “write time dominates.”

Before a heap dump verify available disk against worst-case output plus safety margin, volume/
node I/O blast radius, liveness/watchdog/termination deadlines, uploader bandwidth, encryption,
and who may access object contents. Prefer a drained sacrificial replica only when draining is
capacity-safe and the instance remains representative.

Two class histograms show class-count/byte deltas, not which same objects survived or why.
They are a lower-storage directional screen, not a heap-dump substitute for retention paths.

## When attach or commands fail

A hung/failed `jcmd` does not by itself prove failure to reach a safepoint. Distinguish:

- wrong PID/PID namespace, credentials, `/tmp`/attach socket, disabled attach;
- absent/mismatched tools or target library/output permissions;
- command-specific VM operation delay or safepoint/handshake obstruction;
- target CPU starvation/cgroup throttling, process stop state, severe memory pressure;
- output pipe/filesystem/network blockage;
- JVM crash or unresponsive runtime.

Set per-command timeouts and avoid stacking multiple attach requests blindly. Capture process
state, scheduler/cgroup/memory pressure, signals, sockets/files, and command stderr. If approved,
use a startup agent or OS/core path. Core capture may pause, clone, exhaust disk, expose secrets,
or kill the process depending on mechanism; follow `jhsdb-and-core-dumps` and incident authority.

## Container and orchestrator safety

Taking a pod out of Service is not “free.” It can:

- reduce capacity and overload remaining replicas;
- alter or eliminate the failure condition;
- interact with readiness, EndpointSlice propagation, meshes, load balancers, PDBs, Deployments,
  StatefulSets, leases, and autoscalers;
- create a replacement that cannot schedule;
- leave an unmanaged/charged pod or duplicate stateful owner.

Use the platform's approved drain/debug workflow; verify traffic has stopped and replacement is
healthy. Do not mutate arbitrary selector labels in a generic runbook. Keep the target from
automatic restart/eviction only through an explicitly approved mechanism.

Ephemeral containers can provide tools, but must share/see the correct PID namespace and target
filesystem/UID/attach path, and may not share mounts automatically. Use the same compatible JDK
tooling where required. `kubectl cp` depends on container tooling such as `tar`; streaming a file
can fail mid-transfer and needs checksum verification.

## Integrity and correlation

Every artifact needs a sidecar manifest:

```text
incident/artifact ID, target identity and process start time
service/version/image/source commit/JDK
node/pod/container/cgroup and failure-domain identity
UTC start/end plus local monotonic uptime markers
exact command/config/tool version and exit/timeout status
load, successes/errors/timeouts, capacity and lifecycle state
file size, checksum, completion/readability validation
durable URI, encryption/access classification and retention/hold
known perturbation and missing evidence
```

Sanitize commands and manifests: environment, command lines, thread names, heap/core/JFR/logs
can contain credentials, personal data, request payloads, endpoints, and source information.
Restrict sharing and preserve chain of custody where legal/security investigation requires it.

## Failure modes

| Failure                                | Detection                                            | Response                                                                           |
| -------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Capture worsens outage                 | SLO/CPU/I/O/queue crosses abort threshold            | cancel if safe, restore capacity, record partial artifact                          |
| Kubelet/watchdog kills target mid-dump | deadline versus measured capture, termination events | use approved probe override/drain or lower-cost artifact; never assume disablement |
| Disk fills                             | free bytes/inodes and write rate                     | abort/redirect safely; protect app/log filesystem                                  |
| File exists but incomplete             | tool exit, footer/read test, expected size/checksum  | label invalid/partial; retain for forensic salvage                                 |
| Upload appears successful              | remote size/checksum/read test                       | do not delete local copy until verified                                            |
| Control not comparable                 | version/load/uptime/host differs                     | label exploratory; sample correct cohort if budget permits                         |
| Evidence changes after drain           | workload/state transition recorded                   | retain pre-drain telemetry and avoid treating drained state as original symptom    |
| Sensitive artifact over-shared         | classification/access audit                          | quarantine/revoke, follow security incident policy                                 |

## Anti-patterns

**Anti-pattern: always take three dumps 5–10 seconds apart.** The cadence must match the event;
one can prove a deadlock, while thousands of virtual threads can make each dump disruptive.

**Anti-pattern: `jcmd` hang means no safepoint.** Attach, namespace, permissions, output, and
scheduling can fail independently. Gather OS/attach evidence before escalating.

**Anti-pattern: relabel a pod to remove it from service.** Selector shape and controllers are
deployment-specific. Use an authorized drain/isolation mechanism with capacity and rollback
checks.

**Anti-pattern: preconfigured evidence costs almost nothing.** GC logging, NMT, JFR, heap-on-OOM,
storage, and exporters have measured CPU/memory/I/O/privacy costs and failure modes. Budget and
exercise them before the incident.

## Definition of done

- [ ] Recovery and evidence budgets, authority, abort thresholds, and target cohorts are explicit.
- [ ] Existing backend/local evidence and exact query windows are preserved first.
- [ ] Storage survives intended failure and has capacity, integrity, encryption, and retention.
- [ ] Commands are target-version-discovered, bounded by timeout, and symptom-driven.
- [ ] Disruptive/draining/heap/core actions have approval, capacity proof, and rollback.
- [ ] Every artifact has provenance, clocks, completion status, checksum, and privacy class.
- [ ] Service recovery occurs by the declared deadline; uncaptured evidence is documented.
- [ ] Follow-up closes the observability/runbook gap and tests capture in a safe environment.

## References

- [Adaptive capture protocol](references/capture-order.md)
- [Survival, durability, and pre-incident design](references/what-a-restart-destroys.md)
- [JDK 25 `jcmd`](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html) — use the target JDK's command help/documentation.
- [JDK 25 `jfr`](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jfr.html)
- [Kubernetes debugging running pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/)
- [Kubernetes probes](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/)
