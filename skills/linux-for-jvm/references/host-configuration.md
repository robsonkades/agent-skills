# Host and container configuration

## Memory

```yaml
# ❌ no room for anything outside the heap
resources:
  limits:
    memory: 4Gi
# with -Xmx4g
```

The process is `SIGKILL`ed by the cgroup as soon as heap + metaspace + code cache + stacks

- direct buffers exceed the limit. Budget the non-heap regions **with NMT measured under
  your own load**, then use `-XX:MaxRAMPercentage` to leave that headroom.

* `vm.swappiness ≤ 1`, or no swap at all (the Kubernetes node default), persisted in
  `sysctl.d` rather than set once by hand.
* `-XX:+AlwaysPreTouch` for predictability, understanding it pre-empts minor faults only.
* `-XX:+ExitOnOutOfMemoryError` and `-XX:+HeapDumpOnOutOfMemoryError` with `HeapDumpPath`
  on a volume that survives the restart.

## Transparent huge pages

| `enabled` | `defrag`  | Effect                                                               |
| --------- | --------- | -------------------------------------------------------------------- |
| `always`  | `always`  | synchronous compaction — the classic latency disaster                |
| `always`  | `madvise` | huge pages everywhere, compaction only when asked                    |
| `madvise` | `madvise` | **recommended for large heaps**, with `-XX:+UseTransparentHugePages` |
| `never`   | —         | defensible for ultra-low latency, as a measured decision             |

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
- The CFS scheduler was replaced by EEVDF in kernel 6.6 — the `vruntime` mental model still
  applies, the latency sysctls do not.

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

Also alert on `nr_throttled / nr_periods`, on `VmSwap`, and export `/proc/pressure/*` — PSI
is the earliest saturation signal available and the least used.

## Pre-deploy checklist

- [ ] Non-heap memory **measured** with `-XX:NativeMemoryTracking=summary` under real load,
      not estimated from a rule of thumb
- [ ] `-Xmx` or `MaxRAMPercentage` leaves that measured headroom inside `memory.max`
- [ ] `-XX:+ExitOnOutOfMemoryError` and heap dump path on a surviving volume
- [ ] `vm.swappiness ≤ 1` persisted in `sysctl.d`
- [ ] THP mode **verified**, decision recorded, `-XX:+UseTransparentHugePages` set if the
      mode is `madvise`
- [ ] `LimitNOFILE` and `LimitNPROC` in the systemd unit
- [ ] `ActiveProcessorCount` checked from inside the container
- [ ] Alerts for OOM kill, pod `OOMKilled`, `nr_throttled/nr_periods` and `VmSwap`
- [ ] `/proc/pressure/*` exported as a metric
- [ ] `-Xlog:gc*` with rotation, retained long enough to cover the interval between
      incidents
- [ ] `terminationGracePeriodSeconds` consistent with the real drain time
