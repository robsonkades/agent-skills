# Reading the container

Shell examples assume Linux tools inside the target container. A new `java` process only
probes its own binary, flags and cgroup; use the application's binary/options, including
environment-injected options, or inspect the live JVM. A debug container may have a different
cgroup. `jcmd` requires a compatible tool, target attach access and the actual JVM PID.

## One question, one command

| Question                               | Command                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| Is container support on?               | `java -XX:+PrintFlagsFinal -version 2>&1 \| grep -w UseContainerSupport`           |
| How many CPUs did the JVM detect?      | `java -XshowSettings:system -version 2>&1 \| grep -i "effective cpu count"`        |
| Count used by the live JVM             | `Runtime.getRuntime().availableProcessors()` from application code                 |
| What did the JVM read from the cgroup? | `java -Xlog:os+container=trace -version 2>&1 \| grep -iE "container\|cpu\|memory"` |
| What heap did ergonomics resolve to?   | `java -XX:+PrintFlagsFinal -version 2>&1 \| grep -w MaxHeapSize`                   |
| What are the RAM percentage defaults?  | `java -XX:+PrintFlagsFinal -version 2>&1 \| grep -E "RAMPercentage"`               |
| Which flags is a live process using?   | `jcmd <pid> VM.flags -all`                                                         |
| What native memory does NMT track?     | `jcmd <pid> VM.native_memory summary` (requires startup enablement; not RSS)       |

Parsing traps in that table:

- `grep -w` is not optional. Without it, `MaxHeapSize` also matches `SoftMaxHeapSize`.
- The `PrintFlagsFinal` line is `<type> <name> = <value> {tags}` — the value is field `$4`,
  in bytes, not `$1` and not `$NF`.
- `grep -i` on the container trace is not optional either: the real output mixes cases
  (`[os,container]`, `Memory Limit is:`).

On JDK 17–25 HotSpot the RAM percentage defaults read (verify the actual build):

```
double InitialRAMPercentage = 1.562500  {product}   # JDK <= 25 only
double MinRAMPercentage     = 50.000000 {product}
double MaxRAMPercentage     = 25.000000 {product}
```

**JDK 26 changes the default `InitialRAMPercentage` to `0`** (JDK-8371986); the option
remains available. Without an explicit initial size, heap ergonomics still account for
minimum/generation sizes, maximum heap and collector constraints; do not assume
`InitialHeapSize` always equals `MinHeapSize`. Inspect the resolved flags. If the startup
profile needs the old percentage, test `-XX:InitialRAMPercentage=1.5625` explicitly against
its startup and footprint goals rather than restoring it automatically.

`MinRAMPercentage` applies when the detected memory is small. The threshold at which the
JVM switches between the two is internal and not exposed as a flag — measure with
`PrintFlagsFinal` at the container size you actually deploy rather than assuming a cut-off.

## cgroup v1 to v2 map

v2 is a single unified hierarchy: no per-controller subdirectory, and several fields were
renamed. A v1 command run on a v2 host simply finds no file.

| Quantity           | cgroups v1                                                           | cgroups v2                                                  |
| ------------------ | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| Memory limit       | `memory/memory.limit_in_bytes`                                       | `memory.max`                                                |
| Memory in use      | `memory/memory.usage_in_bytes`                                       | `memory.current`                                            |
| OOM evidence       | controller/version-specific event files                              | `memory.events.local` → `oom` / `oom_kill`                  |
| CPU quota + period | `cpu/cpu.cfs_quota_us`, `cpu/cpu.cfs_period_us`                      | `cpu.max` as `"$QUOTA $PERIOD"`                             |
| Throttle counters  | `cpu/cpu.stat` → `nr_periods`, `nr_throttled`, `throttled_time` (ns) | `cpu.stat` → `nr_periods`, `nr_throttled`, `throttled_usec` |

The paths above are schematic. Resolve `/proc/<pid>/cgroup` against the appropriate
mount root and mount point from `/proc/<pid>/mountinfo`, in the same namespace. For v1,
controller mounts may be combined or differently named. For v2, mount-root examples below
apply only when it exposes the target's cgroup as its root. Otherwise use the resolved
subdirectory. Inspect visible ancestor limits as well; `memory.max=max` or `cpu.max=max ...`
at the leaf does not establish unlimited effective resources.

```bash
cat /sys/fs/cgroup/memory.max                 # bytes, or the literal "max"
cat /sys/fs/cgroup/memory.high                # reclaim/throttling boundary, or "max"
cat /sys/fs/cgroup/memory.current
cat /sys/fs/cgroup/memory.events.local        # local high / max / oom / oom_kill counters
cat /sys/fs/cgroup/cpu.max                    # "$QUOTA $PERIOD", microseconds
cat /sys/fs/cgroup/cpu.stat | grep -E "nr_periods|nr_throttled|throttled_usec"
```

`memory.high` is a separate cgroup v2 reclaim/throttling boundary. Exceeding it can force
tasks into direct reclaim and slow the application below `memory.max`; crossing `high`
does not itself invoke the OOM killer. Compare timestamped `high` counter deltas with
charged memory and latency, including relevant visible ancestors. The count is neither a
stall duration nor proof that reclaim caused every latency spike. Read the effective file:
its default is `max`, and a Kubernetes request alone does not prove a finite threshold was
configured. Do not assume a platform memory-throttling feature is enabled. Route deeper
reclaim/pressure attribution to `linux-for-jvm`.

With a configured 100 ms period, `limits.cpu: "2"` commonly becomes
`cpu.max = "200000 100000"` — 200 ms of CPU time per period. Read both fields; the period
is configurable. Fractional quota is CPU-time capacity, whereas JVM processor counts are
integers (typically rounded up, bounded by affinity/cpuset). A count of 1 can still throttle
heavily under a 500m quota. `ActiveProcessorCount` changes ergonomics, not the kernel quota.

## From outside the pod

```bash
kubectl exec <pod> -c <container> -- jcmd <jvm-pid> VM.flags -all
kubectl exec <pod> -c <container> -- jcmd <jvm-pid> VM.native_memory summary
kubectl exec <pod> -c <container> -- cat <resolved-cgroup-directory>/memory.current
kubectl exec <pod> -c <container> -- cat <resolved-cgroup-directory>/memory.stat
```

## Enabling Native Memory Tracking

```bash
java -XX:NativeMemoryTracking=summary -jar app.jar   # at startup
jcmd <pid> VM.native_memory summary                  # JVM-tracked native view, not RSS
```

`jcmd` cannot start or restart NMT. A killed JVM cannot be attached to; use historical
captures for that incident, or enable NMT at startup for a subsequent bounded capture.
State which evidence belongs to the original process and which belongs to a reproduction.

## Version notes worth checking before trusting a reading

- `UseContainerSupport` defaults on in supported Linux HotSpot builds since JDK 10;
  older update trains have backports, so inspect the exact vendor/update.
- Cgroups v2 support landed in JDK 15 (JDK-8230305), with backports including 11.0.16.
  Detection fixes continued afterward; major version alone is not sufficient evidence.
- `-XshowSettings:system` is Linux-only and already documented in JDK 17, not a JDK 19 feature.
- CPU-share-based processor sizing changed in JDK 19 with backports to update trains
  (JDK-8281181/JDK-8281571). Check runtime behavior before diagnosing a requests/limits mismatch.

## Sources

- [JDK 17 launcher options](https://docs.oracle.com/en/java/javase/17/docs/specs/man/java.html)
- [JDK 11.0.16 fixes, including cgroups v2](https://www.oracle.com/java/technologies/javase/11-0-16-bugfixes.html)
- [JDK 26 initial heap change](https://inside.java/2026/03/02/jdk-26-rn-ops/)
- [JDK 26 initial heap sizing implementation](https://github.com/openjdk/jdk/blob/jdk-26%2B35/src/hotspot/share/runtime/arguments.cpp#L1623-L1647)
- [JDK 25 NMT enablement and coverage](https://docs.oracle.com/en/java/javase/25/vm/native-memory-tracking.html)
- [Kubernetes resource requests and limits](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Kernel cgroup v2 paths, hierarchy and OOM counters](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)
- [CFS bandwidth control and v1 statistics](https://docs.kernel.org/scheduler/sched-bwc.html)
- [HotSpot CPU shares change](https://bugs.openjdk.org/browse/JDK-8281571)
