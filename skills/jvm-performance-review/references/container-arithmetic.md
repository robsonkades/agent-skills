# Container and memory arithmetic

This protocol targets Linux containers. Kubernetes declarations, Linux cgroups, JVM resource
discovery, and runtime consumption are four distinct layers.

## Reconciliation map

| Layer                    | Evidence                                    | Question                                                |
| ------------------------ | ------------------------------------------- | ------------------------------------------------------- |
| Kubernetes desired state | pod spec, LimitRange, admission output      | what was requested/limited after mutation?              |
| scheduler/QoS            | requests, limits, node placement, QoS class | how is placement/competition/eviction influenced?       |
| cgroup enforcement       | v1/v2 controller files and paths            | what is actually enforced/charged now?                  |
| JVM interpretation       | container log/runtime info/effective flags  | what processors/memory did this JVM use for ergonomics? |
| process behavior         | RSS/PSS/maps/NMT/JFR/GC                     | which component consumes memory/CPU?                    |

Requests are not hard memory/CPU limits. CPU request commonly affects scheduling and cgroup
weight/shares; CPU limit commonly becomes quota/period. Memory request affects scheduling/QoS;
memory limit becomes enforcement. Admission policy and runtime can change details, so inspect the
deployed pod and cgroup rather than deriving runtime behavior from YAML alone.

## Identity first

Record pod UID, container ID, node, process PID/start time, cgroup namespace/path, cgroup version,
JDK build, and timestamp. `/proc/self/cgroup` from a debug container may describe the debugger, not
the Java process, unless namespaces/cgroup placement are shared as intended.

Use the target JDK's container diagnostics where supported, for example a bounded startup in a
representative container with:

```bash
java -Xlog:os+container=trace -version
```

Logging tags/options vary. For a running target, discover `jcmd` commands and capture effective
flags/runtime info. Do not expose secrets from command/environment output.

## CPU

Capture:

```text
host online CPUs and topology
cpuset allowed CPUs
quota and period (or unlimited)
weight/shares and competing workloads
throttled periods/time and pressure
JVM active processor count and relevant pool/worker sizes
```

Do not equate `quota/period`, cpuset cardinality, Kubernetes request, or available processors.
Fractional quotas, rounding, release-specific detection, startup versus changed limits, and explicit
`ActiveProcessorCount` can produce different values. Even if the JVM reports N processors, quota
can throttle bursts and GC/JIT/application threads competing inside those N logical workers.

Review consequences across collector selection/threads, JIT threads, common pool, virtual-thread
scheduler, framework pools, and application concurrency limits. Correcting one pool can overload a
downstream dependency.

## Memory

Capture from the correct cgroup version/path:

```text
configured maximum/high/low/swap values
current and peak usage where available
memory.events / memory.events.local and OOM/kill counters
memory pressure and reclaim behavior
process RSS/PSS/maps and other processes charged to cgroup
JVM heap sizes/commit/live set, native/non-heap evidence, collector headroom
```

Do not treat `-Xmx` as RSS or `memory.current`. File-backed mappings/page cache, shared memory,
kernel accounting, sidecars/other processes, and cgroup hierarchy affect totals. NMT “reserved” is
not resident; “committed” is still not a perfect RSS decomposition; NMT is incomplete for some
native/library allocations.

### Headroom model

Use aligned lifecycle percentiles/peaks, not addition of unrelated maxima unless designing a strict
worst case:

```text
required limit = concurrent peak(heap resident + native/non-heap + charged mappings/other)
               + rollout/failure/diagnostic allowance
               + uncertainty margin
```

Test startup, steady state, burst, concurrent GC/relocation, thread surge, direct-buffer pressure,
classloading/redeploy, profiler/heap-dump path, graceful shutdown, and restart overlap.

## OOM diagnostic tree

```text
cgroup OOM/kill event
  -> which cgroup/process and timestamp? correlate kube status/kernel/runtime events
  -> memory.current components and concurrent lifecycle
  -> heap committed/live, native/NMT/maps, stacks/direct/metaspace/code/GC, sidecars

Java heap OOME without cgroup kill
  -> live set/retention/allocation/heap policy and dump feasibility
direct-buffer/native OOME
  -> direct/reference cleanup, native budget and caller
RSS grows while heap/live set is flat
  -> native allocation/leak/fragmentation, mappings/page cache, threads/classes
no retained evidence after restart
  -> add bounded pre-OOM/cgroup/JFR/NMT/log artifact strategy for next occurrence
```

Never infer “heap leak” from `OOMKilled` alone. Never lower heap blindly when native growth is
unattributed; it may reduce GC headroom and make failure earlier.

## Dynamic resource changes

Vertical resizing, cgroup migration, node changes, and runtime updates may or may not be re-read by
the JVM/subsystems on the target release. Test the exact update workflow. Capture values before and
after and determine which pools/ergonomics remain initialized from startup. A mutable cgroup file
does not prove an already-sized executor or collector adapted.

## Production failure tests

- memory pressure approaching high/max and actual cgroup kill;
- heap/native/direct/metaspace/thread pressure separately;
- CPU quota throttle during startup, GC, JIT, and peak traffic;
- cpuset/quota change and pod/node migration;
- sidecar/debug/profiler added under the same envelope;
- heap dump/core/JFR destination full or larger than headroom;
- SIGTERM and restart overlap under pressure;
- missing permissions/controllers and cgroup v1/v2 parser differences.

## Authoritative references

- [Linux cgroup v2 administration guide](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [Linux cgroup v1 controllers](https://docs.kernel.org/admin-guide/cgroup-v1/)
- [Kubernetes resource management](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Kubernetes pod QoS](https://kubernetes.io/docs/concepts/workloads/pods/pod-qos/)
- [OpenJDK container metrics source](https://github.com/openjdk/jdk/tree/master/src/hotspot/os/linux)
- [JEP 8182070: Container Awareness](https://openjdk.org/jeps/8182070)
