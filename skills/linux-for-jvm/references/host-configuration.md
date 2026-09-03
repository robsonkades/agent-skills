# Host and container configuration

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
percentage ergonomics with measured headroom.

- Swap policy chosen at node/cgroup level from latency-versus-survival goals; monitor
  `memory.swap.current`, swap-in/out, faults and PSI where enabled.
- `-XX:+AlwaysPreTouch` for predictability, understanding it pre-empts minor faults only.
- `-XX:+ExitOnOutOfMemoryError` and `-XX:+HeapDumpOnOutOfMemoryError` with `HeapDumpPath`
  on a volume that survives the restart.

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
throws away the TLB benefit to fix a problem the host may not have.

## CPU

- `ActiveProcessorCount` checked **from inside the container** — ergonomics sizes GC and
  JIT threads from it.
- `ParallelGCThreads` evaluated against the CPU quota. A collector sized for the host's
  cores inside a two-core quota generates throttling by itself.
- `-XX:+UseNUMA` only does something under Parallel GC or G1 (JEP 345, JDK 14, Linux);
  under ZGC or Shenandoah it is accepted and inert.
- Kernel 6.6 began the transition from CFS selection toward EEVDF. Check the node's exact
  kernel and available scheduler interfaces before applying a tuning recipe.

## Limits

```ini
# systemd unit — ulimit in a shell does not survive the next start
[Service]
LimitNOFILE=65536
LimitNPROC=4096
```

## Alerting

```yaml
- alert: OOMKillDetected
  expr: increase(node_vmstat_oom_kill[5m]) > 0
  annotations:
    summary: 'OOM killer fired on {{ $labels.instance }}'

# Kubernetes: cgroup OOM, which the above does not see
- alert: PodOOMKilled
  expr: increase(kube_pod_container_status_restarts_total[10m]) > 0
    and on(pod) kube_pod_container_status_last_terminated_reason{reason="OOMKilled"} == 1
```

Also alert on throttling frequency **and duration**, swap activity, and host/cgroup PSI.
Lifetime counters need rate/delta queries and workload baselines.

## Pre-deploy checklist

- [ ] Non-heap memory **measured** with `-XX:NativeMemoryTracking=summary` under real load,
      not estimated from a rule of thumb
- [ ] `-Xmx` or `MaxRAMPercentage` leaves that measured headroom inside `memory.max`
- [ ] `-XX:+ExitOnOutOfMemoryError` and heap dump path on a surviving volume
- [ ] Swap policy and failure trade-off recorded; swap/fault/PSI evidence observable
- [ ] THP mode and sizes **verified**; JDK flag support and measured outcome recorded
- [ ] `LimitNOFILE` and `LimitNPROC` in the systemd unit
- [ ] `ActiveProcessorCount` checked from inside the container
- [ ] Alerts for OOM kill, pod `OOMKilled`, `nr_throttled/nr_periods` and `VmSwap`
- [ ] `/proc/pressure/*` exported as a metric
- [ ] `-Xlog:gc*` with rotation, retained long enough to cover the interval between
      incidents
- [ ] `terminationGracePeriodSeconds` consistent with the real drain time
