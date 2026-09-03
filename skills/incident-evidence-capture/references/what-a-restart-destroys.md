# Survival, durability, and pre-incident design

## Survival is a chain

An artifact survives only if every link succeeds:

```text
event was collected
  -> producer retained it
  -> snapshot/file completed
  -> filesystem survived target/node action
  -> upload completed and was verified
  -> backend retained/indexed it
  -> symbols/config/provenance remained available
  -> authorized analysts can query/read it
```

“Written to disk” is not synonymous with durable; “exported” is not synonymous with accepted;
“dashboard visible” is not synonymous with complete.

## Evidence lifecycle matrix

| Evidence                                | JVM restart                                        | Container/pod replacement | Node loss                  | Requirement to survive                                   |
| --------------------------------------- | -------------------------------------------------- | ------------------------- | -------------------------- | -------------------------------------------------------- |
| current threads/locks/in-flight work    | destroyed                                          | destroyed                 | destroyed                  | capture/export before action                             |
| heap/object identities                  | destroyed                                          | destroyed                 | destroyed                  | completed heap/core dump                                 |
| JIT profile/code-cache/runtime counters | destroyed                                          | destroyed                 | destroyed                  | JFR/JIT logs/core/profile captured before action         |
| native mappings/NMT live state          | destroyed                                          | destroyed                 | destroyed                  | proc/NMT/core evidence before action                     |
| JFR in-memory data                      | destroyed                                          | destroyed                 | destroyed                  | dump/destination before abrupt exit                      |
| JFR disk repository                     | implementation/config/exit dependent               | storage dependent         | storage dependent          | tested repository preservation/dump plus complete chunks |
| writable container-layer file           | can survive process only                           | destroyed                 | destroyed                  | verified copy/export before replacement                  |
| `emptyDir` file                         | process/container dependent                        | destroyed with pod        | destroyed                  | copy/export before pod deletion/node loss                |
| node/host path                          | survives pod                                       | often survives pod        | lost/unavailable with node | node recovery or remote export                           |
| persistent volume                       | survives according to reclaim/attach/storage class | usually                   | storage-dependent          | correct PV policy, capacity, access, backup              |
| remote logs/metrics/traces/profiles     | survives process                                   | survives pod              | survives node              | authenticated accepted ingest and retention/query health |
| heap/core/fatal file                    | only if file complete/storage survives             | storage dependent         | storage dependent          | integrity + durable verified upload                      |

Test actual runtime/orchestrator/storage behavior. Normal SIGTERM, crash, SIGKILL, kernel OOM,
node loss, and forced deletion take different paths.

## JFR repository nuance

Disk-backed JFR uses a repository of chunks and a recording can also have a destination or
dump-on-exit behavior. Cleanup/preservation, chunk completion, repository path, destination,
and supported commands/options are JDK-version/configuration-specific.

Do not assert “continuous JFR is not a file” or “repository always deletes on exit” as universal
truth. Instead test the deployed design under:

- normal `JFR.stop` and JVM shutdown;
- SIGTERM within the termination grace period;
- SIGKILL and container/kernel OOM;
- process/pod/node restart;
- repository full/unwritable;
- dump during chunk rotation;
- partial/corrupt chunk and `jfr assemble`/read behavior.

Record `JFR.check`, effective settings, repository/destination paths, and JDK build. Preserve
only complete/readable artifacts and label salvageable partial evidence accurately.

## Container storage questions

Before relying on a path, answer:

```text
which filesystem/mount backs it?
who owns permissions and quota?
does another debug/uploader container see the same mount?
what controller action deletes it?
does rescheduling attach the same volume?
what happens on node failure?
does dumping contend with application/database/log I/O?
what is the reclaim/snapshot/backup policy?
how are bytes encrypted and access audited?
```

`kubectl cp` may require `tar` and can transfer a changing file. Freeze only through approved
means or copy after producer completion, then compare source/remote size and cryptographic
checksum. Streaming through `kubectl exec` needs exit-status/length/checksum handling and can be
interrupted by API-server/network/pod lifecycle.

## Pre-incident evidence package

Design and test a bounded package, selecting only justified items:

- rotating GC and safepoint/unified logs with verified selectors, size/age and durable export;
- low-overhead rolling JFR configuration with measured overhead, repository/destination and
  trigger/dump/upload path;
- continuous profiling where retroactive stack questions justify its permanent cost;
- OOM/fatal error paths on a durable capacity-guarded destination;
- NMT level if native attribution value exceeds overhead;
- process/container/cgroup/node metrics and lifecycle events;
- build/JDK/image/config/deploy provenance and symbol retention;
- authenticated artifact upload, checksums, privacy classification and retention.

None is “close to free” without measurement. NMT detail, stack-rich JFR, verbose unified logs,
heap-on-OOM, and continuous profilers can impose CPU/memory/I/O/storage or privacy cost.

## OOM modes

Prepare separately for:

| Mode                                                  | JVM hook opportunity                               | Primary evidence                                                               |
| ----------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------ |
| Java heap OOME with JVM alive                         | heap dump/on-OOM commands may run                  | GC/JFR/allocation history, heap dump if completion succeeds                    |
| Metaspace/code-cache/direct/native allocation failure | heap dump may be irrelevant/incomplete             | NMT/JFR/logs/maps/error and owning native evidence                             |
| Container cgroup OOM kill                             | JVM may receive no recoverable Java OOME/hook time | cgroup events, node/kernel/runtime/Kubernetes history, prior exported evidence |
| Host OOM/eviction                                     | target/node data may vanish                        | node/control-plane/backend evidence and durable prior artifacts                |
| Disk full during dump/logging                         | artifact incomplete and app may worsen             | storage metrics/events, partial status, protected separate quota               |

Exercise each relevant failure mode in a safe environment. A flag's presence does not prove an
artifact will be complete.

## Drain and preservation design

Create an explicit platform operation rather than generic label mutation:

1. identify stateful/leader/shard/quorum and disruption constraints;
2. verify remaining ready capacity and load headroom by failure domain;
3. initiate approved connection draining/readiness route;
4. verify new traffic stopped and in-flight policy completed/timed out;
5. prevent automatic termination only through an authorized bounded mechanism;
6. launch/schedule replacement and verify readiness/capacity;
7. capture while recording that workload changed after drain;
8. delete/rejoin the quarantined instance by owner/deadline.

Service meshes, external load balancers, long-lived connections, consumers, cron/queue workers,
and direct pod addressing may ignore Service endpoint removal. Verify actual traffic.

## Evidence manifests and chain of custody

Use a machine-readable manifest:

```json
{
  "schemaVersion": 1,
  "incidentId": "INC-...",
  "artifactId": "...",
  "target": {
    "service": "...",
    "version": "...",
    "podUid": "...",
    "containerId": "...",
    "processId": 123,
    "processStart": "...",
    "node": "..."
  },
  "capture": {
    "startedUtc": "...",
    "endedUtc": "...",
    "tool": "...",
    "commandDigest": "...",
    "exitStatus": "complete|partial|failed|timed_out"
  },
  "file": {
    "bytes": 0,
    "sha256": "...",
    "formatValidation": "...",
    "durableUri": "..."
  },
  "classification": "restricted",
  "retentionUntil": "...",
  "knownPerturbation": "..."
}
```

Avoid storing raw secret-bearing commands/environment in a broadly accessible manifest. For
forensic/legal chain of custody, use the organization's evidence system, immutable audit logs,
authorized handlers, signing/timestamps, and documented transfers—not an ad hoc checksum alone.

## Evidence-quality drills

Regularly test:

- dump rolling JFR for a known historical marker and read it;
- trigger supported OOM/crash modes and verify artifact completion/upload;
- fill or remove backend/disk and verify bounded failure;
- replace pod and node and verify intended survival;
- use distroless image plus approved ephemeral tooling;
- capture large platform/virtual-thread populations within budget;
- rotate JDK/image and verify commands/options/symbols;
- enforce access, deletion, retention expiry, and incident hold;
- time restore versus capture and verify abort thresholds.

The drill output should update measured duration/size distributions used during incidents.

## After an evidence-poor incident

Create concrete work with owner/deadline:

- missing signal and the decision it would have enabled;
- pre-enabled channel/configuration and measured cost;
- durable location/export and failure behavior;
- trigger/runbook/automation and authority;
- evidence-quality alert and drill;
- retention/privacy/symbol/provenance requirements.

Do not respond by turning on every diagnostic channel fleet-wide.

## Authoritative references

- [JFR runtime guide](https://docs.oracle.com/en/java/javase/25/jfapi/runtime.html)
- [JDK `jfr` command](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jfr.html)
- [Kubernetes volumes](https://kubernetes.io/docs/concepts/storage/volumes/)
- [Kubernetes pod lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
- [Kubernetes node-pressure eviction](https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/)
- [Linux core dump](https://man7.org/linux/man-pages/man5/core.5.html)
