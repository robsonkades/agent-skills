# Host and container configuration

Review the areas affected by the requested change or observed failure. Reuse representative
measurements already supplied; an adequate current configuration needs no tuning. The checklist
below supports a full deployment review when that is the task, not every Linux/JVM question.

## Memory

```yaml
# ❌ no room for anything outside the heap
resources:
  limits:
    memory: 4Gi
# with -Xmx4g
```

The cgroup can invoke OOM handling when all charged memory reaches its hard limit. The budget
includes heap, metaspace, code cache, native allocations, thread stacks, direct buffers and
cgroup-charged cache/kernel categories; NMT does not account for all of them. Reconcile NMT,
RSS/PSS and cgroup v2 `memory.stat` under representative load, then select explicit heap or
percentage ergonomics with measured headroom. These counters have different scopes: NMT
committed is not resident memory, and RSS minus NMT is not untracked native allocation.

- Swap policy chosen at node/cgroup level from latency-versus-survival goals; monitor
  `memory.swap.current`, swap-in/out, faults and PSI where enabled.
- Evaluate `-XX:+AlwaysPreTouch` against the workload's first-touch and startup requirements. Verify the
  collector/build, initial and maximum heap, commitment behavior and page policy. It can move
  work into startup or later heap commitment and increase resident-memory pressure; it does
  not touch every process mapping, eliminate all later faults or prevent swap. Compare those
  costs with the observed latency benefit before changing the setting.
- Choose an OOME exit/capture policy for the deployed HotSpot build and failure path. These
  flags do not handle kernel SIGKILL or every Java-thrown OOME (for example, direct-buffer
  failures). Automatic heap dump attempts are not retried indefinitely; provide writable,
  protected storage with capacity and retention. See `jvm-memory-regions` for exact coverage.

## Transparent huge pages

| `enabled` | `defrag`  | Effect                                                                  |
| --------- | --------- | ----------------------------------------------------------------------- |
| `always`  | `always`  | may enter direct reclaim/compaction on allocation failure               |
| `always`  | `madvise` | broad THP eligibility; direct work focused on advised regions           |
| `madvise` | `madvise` | only advised regions eligible; still measure reclaim/compaction cost    |
| `never`   | any       | disables ordinary allocation/collapse paths, with documented exceptions |

```bash
cat /sys/kernel/mm/transparent_hugepage/enabled
cat /sys/kernel/mm/transparent_hugepage/defrag
```

Verify the current mode before changing it. "Disable THP" copied from a 2014 checklist
can discard a TLB benefit to fix a problem the host may not have; measure both effects.

## CPU

- Inspect the JVM effective available processor count inside its container and any
  `ActiveProcessorCount` override; the default flag value is not the detected processor count.
  Collector/JIT thread ergonomics also depend on their own flags and collector rules.
- `ParallelGCThreads` evaluated against the CPU quota. A collector sized for the host's
  cores inside a two-core quota can exhaust quota during runnable bursts; thread count
  alone does not prove throttling.
- Verify NUMA policy for the actual collector/build; Linux ZGC in JDK 25 uses `UseNUMA`
  too. Confirm topology, effective flags and allocation behavior before claiming benefit.
- Kernel 6.6 began the transition from CFS selection toward EEVDF. Check the node's exact
  kernel and available scheduler interfaces before applying a tuning recipe.

## Limits

```ini
# Illustrative systemd unit; derive limits from measured demand and UID/service scope
[Service]
LimitNOFILE=65536
TasksMax=4096
```

`TasksMax` limits service tasks through the pids controller, including threads.
`LimitNPROC` instead applies to the real UID across services and has privileged exemptions.
Check inherited and ancestor limits; increasing a limit does not repair leaking descriptors
or threads. Shell ulimit settings apply to descendants, not independent systemd launches.

## Alerting

```yaml
- alert: OOMKillDetected
  expr: increase(node_vmstat_oom_kill[5m]) > 0
  annotations:
    summary: 'OOM killer fired on {{ $labels.instance }}'

# Corroborating Kubernetes attribution; last reason is a retained gauge, not an event log
- alert: PodOOMKilled
  expr: increase(kube_pod_container_status_restarts_total[10m]) > 0
    and on(namespace, pod, uid, container)
    (kube_pod_container_status_last_terminated_reason{reason="OOMKilled"} == 1)
```

The host OOM counter includes kernel memcg OOM victims; it does not identify the failed
cgroup. The Kubernetes expression is a correlation heuristic: the last reason can be stale
or overwritten between scrapes. Match the actual exporter labels; add a common cluster label
when querying multiple clusters, and deduplicate HA scrapes. Reconcile with timestamps,
cgroup events and runtime records before assigning cause to a restart.

Also alert on throttling frequency **and duration**, swap activity, and host/cgroup PSI.
Lifetime counters need rate/delta queries and workload baselines.

## Pre-deploy checklist

Select applicable items for the changed configuration, workload and deployment environment.
Record reused evidence and unresolved gaps; retain adequate settings rather than tuning by list.

- [ ] NMT-tracked memory, process residency and cgroup charges compared under real load,
      with untracked coverage and scope differences recorded
- [ ] `-Xmx` or `MaxRAMPercentage` leaves that measured headroom inside `memory.max`
- [ ] OOME exit/capture policy and protected dump storage verified for relevant failure paths
- [ ] Swap policy and failure trade-off recorded; swap/fault/PSI evidence observable
- [ ] THP mode and sizes **verified**; JDK flag support and measured outcome recorded
- [ ] Effective descriptor, service task and real-UID limits checked for the actual launcher
- [ ] Effective processor count and any `ActiveProcessorCount` override checked inside the container
- [ ] Alerts for OOM kill, pod `OOMKilled`, `nr_throttled/nr_periods` and `VmSwap`
- [ ] `/proc/pressure/*` exported as a metric
- [ ] `-Xlog:gc*` with rotation, retained long enough to cover the interval between
      incidents
- [ ] `terminationGracePeriodSeconds` consistent with the real drain time

## Sources

- [JDK 25 Java launcher](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html): AlwaysPreTouch requests heap-page touching before application use.
- [OpenJDK 25 G1 region commitment](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/g1/g1RegionToSpaceMapper.cpp): pre-touch on committed ranges; not a guarantee that all process faults disappear.
- [Linux 6.12 THP](https://www.kernel.org/doc/html/v6.12/admin-guide/mm/transhuge.html): allocation, defrag modes and multiple page sizes; check the deployed kernel.
- [Linux 6.12 OOM accounting](https://github.com/torvalds/linux/blob/v6.12/mm/oom_kill.c): `__oom_kill_process` records both VM and memcg kill events.
- [systemd v257 limits](https://github.com/systemd/systemd/blob/v257/man/systemd.exec.xml): LimitNPROC scope and TasksMax preference.
- [JDK 25 Linux ZGC NUMA](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/os/linux/gc/z/zNUMA_linux.cpp): actual UseNUMA consumption.
- [kube-state-metrics v2.17 pod metrics](https://github.com/kubernetes/kube-state-metrics/blob/v2.17.0/docs/metrics/workload/pod-metrics.md): restart counter and last-reason labels.
