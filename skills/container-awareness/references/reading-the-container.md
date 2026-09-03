# Reading the container

Every command below is run **inside** the container. Numbers taken from the host answer a
different question.

## One question, one command

| Question                               | Command                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------- |
| Is container support on?               | `java -XX:+PrintFlagsFinal -version 2>&1 \| grep -w UseContainerSupport`           |
| How many CPUs did the JVM detect?      | `java -XshowSettings:system -version 2>&1 \| grep -i "effective cpu count"`        |
| Same, from JDK 17 or older             | `Runtime.getRuntime().availableProcessors()` from application code                 |
| What did the JVM read from the cgroup? | `java -Xlog:os+container=trace -version 2>&1 \| grep -iE "container\|cpu\|memory"` |
| What heap did ergonomics resolve to?   | `java -XX:+PrintFlagsFinal -version 2>&1 \| grep -w MaxHeapSize`                   |
| What are the RAM percentage defaults?  | `java -XX:+PrintFlagsFinal -version 2>&1 \| grep -E "RAMPercentage"`               |
| Which flags is a live process using?   | `jcmd <pid> VM.flags -all`                                                         |
| What is the RSS made of?               | `jcmd <pid> VM.native_memory summary`                                              |

Two parsing traps in that table:

- `grep -w` is not optional. Without it, `MaxHeapSize` also matches `SoftMaxHeapSize`.
- The `PrintFlagsFinal` line is `<type> <name> = <value> {tags}` — the value is field `$4`,
  in bytes, not `$1` and not `$NF`.
- `grep -i` on the container trace is not optional either: the real output mixes cases
  (`[os,container]`, `Memory Limit is:`).

On the baseline the RAM percentage defaults read:

```
double InitialRAMPercentage = 1.562500  {product}   # JDK <= 25 only
double MinRAMPercentage     = 50.000000 {product}
double MaxRAMPercentage     = 25.000000 {product}
```

**From JDK 26 the default value of `InitialRAMPercentage` is removed** (JDK-8371986): with
no `-Xms`, the initial heap is `MinHeapSize` instead. If a startup profile depended on the
old behaviour, ask for it explicitly with `-XX:InitialRAMPercentage=1.5625`.

`MinRAMPercentage` applies when the detected memory is small. The threshold at which the
JVM switches between the two is internal and not exposed as a flag — measure with
`PrintFlagsFinal` at the container size you actually deploy rather than assuming a cut-off.

## cgroup v1 to v2 map

v2 is a single unified hierarchy: no per-controller subdirectory, and several fields were
renamed. A v1 command run on a v2 host simply finds no file.

| Quantity           | cgroups v1                                      | cgroups v2                                                  |
| ------------------ | ----------------------------------------------- | ----------------------------------------------------------- |
| Memory limit       | `memory/memory.limit_in_bytes`                  | `memory.max`                                                |
| Memory in use      | `memory/memory.usage_in_bytes`                  | `memory.current`                                            |
| OOM evidence       | controller/version-specific event files         | `memory.events.local` → `oom` / `oom_kill`                  |
| CPU quota + period | `cpu/cpu.cfs_quota_us`, `cpu/cpu.cfs_period_us` | `cpu.max` as `"$QUOTA $PERIOD"`                             |
| Throttle counters  | `cpu/cpu.stat` → `throttled_periods`            | `cpu.stat` → `nr_periods`, `nr_throttled`, `throttled_usec` |

All v2 paths are directly under `/sys/fs/cgroup/`:

```bash
cat /sys/fs/cgroup/memory.max                 # bytes, or the literal "max"
cat /sys/fs/cgroup/memory.current
cat /sys/fs/cgroup/memory.events.local | grep oom # local oom / oom_kill
cat /sys/fs/cgroup/cpu.max                    # "$QUOTA $PERIOD", microseconds
cat /sys/fs/cgroup/cpu.stat | grep -E "nr_periods|nr_throttled|throttled_usec"
```

`limits.cpu: "2"` becomes `cpu.max = "200000 100000"` — 200 ms of CPU time per 100 ms
period.

## From outside the pod

```bash
kubectl exec <pod> -- jcmd 1 VM.flags -all
kubectl exec <pod> -- jcmd 1 VM.native_memory summary
kubectl exec <pod> -- cat /sys/fs/cgroup/memory.current
kubectl exec <pod> -- cat /sys/fs/cgroup/memory.stat
```

## Enabling Native Memory Tracking

```bash
java -XX:NativeMemoryTracking=summary -jar app.jar   # at startup
jcmd <pid> VM.native_memory summary                  # JVM-tracked native view, not RSS
```

## Version notes worth checking before trusting a reading

- Container detection appeared experimentally in JDK 9 (JDK-8146115);
  `UseContainerSupport` has been on by default since JDK 10.
- **Complete** cgroups v2 support landed in JDK 15 (JDK-8230305). On JDK 11–14 against a v2
  host, the JVM can fall back to host values in some scenarios.
- `-XshowSettings:system` is Linux-only and JDK 19+.
