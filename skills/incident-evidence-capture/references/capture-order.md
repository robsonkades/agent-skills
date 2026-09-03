# Adaptive capture protocol

## Triage matrix

Capture order depends on the symptom and remaining recovery budget. Preserve existing/exported
evidence and a timeline in every case.

| Symptom                        | First volatile evidence                                                  | Escalation                                                             | Usually low-value/risky first move              |
| ------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ----------------------------------------------- |
| No progress, low CPU           | repeated platform/virtual-thread state, lock/queue/dependency/OS state   | bounded JFR/wall/lock profile; core if truly unresponsive and approved | heap dump without memory evidence               |
| CPU saturated, GC not dominant | process/thread CPU deltas + CPU profile/JFR + cgroup/host CPU            | native/kernel profile, compiler/deopt evidence                         | class histogram                                 |
| GC pauses/frequency rising     | GC logs/JFR, heap/config, allocation rate/live-set trend                 | allocation profile; histogram/dump if retention suspected              | thread fleet dump as substitute for GC evidence |
| Heap near OOM                  | GC/JFR/heap info, OOM/cgroup events, existing allocation/continuous data | histogram or heap dump on approved target; automatic OOM dump          | repeated expensive actions on all replicas      |
| RSS/native growth              | cgroup/proc maps, NMT if enabled, direct-buffer/native/library evidence  | NMT detail/baseline diff, native allocation profile, core              | assume `-Xmx` explains RSS                      |
| Container OOMKilled            | cgroup/Kubernetes/node events, prior logs/JFR/dumps, limits/RSS history  | reproduce with pre-enabled evidence                                    | live heap dump—the process is gone              |
| Tail latency, CPU/GC normal    | JFR I/O/locks/safepoints, wall/off-CPU profile, queues/network/cgroup    | eBPF/kernel capture aligned to workload                                | CPU-only graph treated as negative proof        |
| Crash                          | `hs_err`, core/minidump, container/node logs, exit status/signal         | matching binaries/symbols; safe reproduction                           | restart before copying local artifacts          |
| Attach unresponsive            | namespace/UID/socket/filesystem/process/cgroup/OS state                  | approved core/freeze/host tooling                                      | repeated unbounded `jcmd` attempts              |

## Cost classes

Measure these on comparable systems; labels below are relative, not promises.

| Class               | Examples                                              | Risks                                                            |
| ------------------- | ----------------------------------------------------- | ---------------------------------------------------------------- |
| Preserve existing   | backend export, copy existing logs/JFR/fatal files    | query/retention mistakes, local-copy I/O, sensitive data         |
| Small bounded query | version/flags/uptime, cgroup/proc snapshot, JFR check | attach delay, output size, unavailable command                   |
| Repeated state      | thread dumps, OS thread CPU snapshots                 | safepoint/handshake/output cost, huge virtual-thread population  |
| Sampling recording  | default-like JFR, CPU profile                         | CPU/storage, signal/event loss, privilege, perturbation          |
| Heap inspection     | class histogram, object statistics                    | high-impact VM operation and output/CPU cost                     |
| Heap dump           | live/all heap traversal and HPROF write/compress      | long pause, disk/I/O saturation, secret payload, watchdog kill   |
| Core/freeze         | coredump/gcore/crash mechanism                        | stop/kill, disk≈address space, shared-node I/O, credentials/keys |

Commands marked “Impact: Low/Medium/High” by `jcmd` still require workload-specific bounds. The
rating is not a duration SLA.

## Safe command wrapper contract

Do not paste a monolithic shell script into production. The incident automation should wrap
each tool with:

```text
unique artifact path created on approved volume
UTC and process uptime before/after
tool/JDK version and exact arguments
per-command timeout and cancellation behavior tested
stdout/stderr/exit/signal status preserved
free bytes/inodes and write-rate guard
application SLO/CPU/I/O abort guard
checksum and format/readability verification
upload with retry, remote verification, and no premature local deletion
```

Timeout utilities can terminate the client while the JVM-side VM operation continues. Test
this for each command/JDK; “client timed out” does not prove capture stopped. Avoid issuing a
second expensive VM operation until target state is known.

## Baseline identity snapshot

Collect only approved/non-secret fields:

```bash
jcmd <pid> VM.version
jcmd <pid> VM.uptime
jcmd <pid> VM.flags
jcmd <pid> JFR.check
```

Some commands may be missing, renamed, or disabled. Run `jcmd <pid> help` against the target.
`VM.info` can be large/sensitive and command availability/impact varies; do not make it a
mandatory “subsecond” step.

Also capture orchestrator desired/ready/available replicas, pod/node/version/image identity,
recent events, restart count/reason, cgroup limits/stat/pressure, process status/maps/limits,
host load/memory/I/O/network, and exact SLO query window. Use approved platform commands and
redact secrets.

## Thread capture protocol

1. Determine platform and approximate virtual-thread counts and output budget.
2. Discover target commands: `jcmd <pid> help Thread.print` and, if present,
   `Thread.dump_to_file` help.
3. Select lock/concurrent-lock detail only if needed and supported.
4. Capture OS per-thread CPU with TID and monotonic/UTC markers.
5. Repeat based on symptom timescale; preserve failed/partial dumps.
6. Confirm the target remained responsive and service impact stayed below abort threshold.

Do not assume `Thread.print` includes virtual threads, that JSON is available on Java 17/21,
or that every textual dump carries CPU/elapsed fields. Treat output as version-specific. Match
HotSpot `nid` to OS TID using documented radix/format rather than visual guessing.

For very large virtual-thread populations, JFR events and bounded `Thread.dump_to_file` can be
more appropriate than terminal output, but measure file size and stop cost.

## JFR protocol

First inspect active recordings and configuration. If the incident is already within a rolling
recording, dump only the needed supported time range to a unique durable path while preserving
the ongoing recording where possible.

If starting a new recording:

- choose settings/events from the symptom and target JDK;
- include a finite duration/stop plan and output bound;
- verify disk repository/destination and free space;
- mark workload/incident/deploy window;
- avoid enabling expensive events wholesale under peak distress;
- confirm file readability with `jfr summary`/metadata after completion.

`settings=profile` is not a universal incident default. It collects more than `default` and can
cost more; a custom JFC may be safer and more discriminating.

## Heap protocol

Before histogram/dump:

```text
memory hypothesis and why heap evidence distinguishes it
target drained/serving state and minimum capacity
live-only versus all-object semantics
measured comparable capture duration/bytes and worst-case margin
volume free bytes/inodes, IOPS/blast radius, upload bandwidth
liveness/watchdog/termination/OOM risk during capture
JDK-supported compression/parallel options and their measured trade-offs
privacy classification and authorized analysts
abort/cancel semantics and partial-file handling
```

Never pipe the dump through a network connection as the only copy unless interruption behavior
and partial detection are proven. Prefer local durable completion plus verified upload when
capacity permits.

An automatic `HeapDumpOnOutOfMemoryError` dump is only useful if the process has enough
headroom/storage/time to create it and the destination survives the failure. Test the exact OOM
mode; native/container OOM can kill the process before the JVM action.

## Core protocol

Core mechanisms differ: kernel core dump on crash, `gcore`/ptrace capture, `jcmd`-related tools,
or orchestrator/runtime facilities. They may freeze or kill the target and can write address-
space-sized sensitive files. Require incident/security approval, exact target/process-start
identity, sufficient isolated storage, matching executable/libraries/debug symbols/JDK, and
post-capture integrity.

If the JVM is already destined for termination, coordinate core capture with recovery so a
replacement restores capacity first when possible. Do not assume core collection is “last and
therefore harmless.”

## Healthy controls and fleet sampling

One affected + one healthy instance is a useful default only when versions, load, uptime,
hardware, region, and configuration are comparable. Some failures are fleet-wide, host-specific,
or heterogeneous. Select cohorts from evidence:

- affected and unaffected within same version/host class;
- old versus new rollout version;
- throttled versus unthrottled cgroup/node;
- leader/shard/partition roles;
- warm versus newly started instances.

Avoid disruptive artifacts from controls unless the comparison value exceeds risk. Existing
metrics/JFR/profile data may supply the control.

## Capture completeness report

At handoff list every attempted artifact:

| Artifact      | Target/window | Result                  | Integrity       | Perturbation     | Durable URI     | Owner            |
| ------------- | ------------- | ----------------------- | --------------- | ---------------- | --------------- | ---------------- |
| thread series | pod/process   | complete/partial/failed | checksum/read   | observed SLO/CPU | restricted link | concurrency      |
| JFR           | time range    | ...                     | `jfr summary`   | ...              | ...             | performance      |
| heap/core     | ...           | ...                     | tool/read check | pause/I/O        | ...             | memory/forensics |

Absence and failed capture are evidence about observability and must appear in the incident
timeline.

## Authoritative references

- [JDK 25 `jcmd`](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
- [JDK 25 troubleshooting guide](https://docs.oracle.com/en/java/javase/25/troubleshoot/)
- [Kubernetes debug running pods](https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/)
- [Kubernetes resource metrics pipeline](https://kubernetes.io/docs/tasks/debug/debug-cluster/resource-metrics-pipeline/)
