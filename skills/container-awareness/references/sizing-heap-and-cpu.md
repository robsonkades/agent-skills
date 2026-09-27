# Sizing heap and CPU limits

## Fixed `-Xmx` or `MaxRAMPercentage`

| Criterion                                    | Fixed `-Xmx` / `-Xms`                             | `MaxRAMPercentage` / `MinRAMPercentage`                          |
| -------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| One image across pods of different sizes     | Same image with per-size runtime configuration    | Scales heap from detected memory at startup                      |
| Predictability of native headroom            | Fixed maximum heap; remaining charges still vary  | Absolute remainder varies with container size                    |
| Limits changed while JVM is running          | Heap maximum does not automatically recompute     | Percentage was resolved at startup; restart is normally required |
| Native footprint already measured and stable | Size using reconciled process/cgroup measurements | Acceptable, but revalidate the real headroom                     |

Choose percentage sizing when startup memory-relative sizing is useful; choose fixed `-Xmx`
when the heap budget is explicit. Neither provides automatic adaptation to in-place limit
changes. Set `-Xms` separately from the maximum, based on startup/footprint needs; fixed
maximum sizing does not require equal initial size. If `-Xmx` is explicit, do not expect
`MaxRAMPercentage` to override it. Never assign the entire memory limit to the maximum heap.

Normalize units before comparing budgets. HotSpot `-Xmx1g` denotes 1,073,741,824 bytes,
equivalent to Kubernetes `1Gi`; Kubernetes `1G` denotes 1,000,000,000 bytes. With that heap
maximum, a limit of `1100M` leaves only 26,258,176 bytes for all other charges, not 100 MB.
This is a budget calculation, not measured resident headroom; inspect the actual resolved
`MaxHeapSize` and effective cgroup limit. Kubernetes memory `m` means millibytes, unlike
HotSpot's `m` heap suffix; CPU `m` is a different quantity again. See the
[launcher size examples](https://docs.oracle.com/en/java/javase/17/docs/specs/man/java.html)
and [Kubernetes memory units](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/#memory-resource-units).

## Memory headroom procedure

1. Reuse representative captures when available. If new NMT evidence is needed, enable
   `-XX:NativeMemoryTracking=summary` at startup and run under representative load.
2. Collect `jcmd <pid> VM.native_memory summary` **near peak usage**, not only at boot.
   After a kill, use historical captures or plan a representative reproduction; the new
   JVM's summary does not recover the old process's memory history.
3. Reconcile NMT committed categories with process RSS/PSS and cgroup `memory.stat`. Do not
   sum reservations or equate NMT committed with resident/charged memory. Record target
   identity and capture times: separate reads are not one atomic memory snapshot.
4. Set `limits.memory` with margin over measured high-water behavior, covering plausible load
   variation — more connections, more dynamically generated classes.
5. Re-measure after any library, framework or load-pattern change. Native footprint is not
   static.

Why no fixed multiplier works: native footprint is driven by thread count, dynamically
generated classes, allocators, agents and direct buffers, while cgroups can charge cache and
kernel memory that NMT does not own. These are application/runtime properties, not a fixed
function of `Xmx`.

When `memory.current` grows while heap, NMT and process RSS stay broadly stable, inspect
the charged memory types before blaming JNI or direct buffers. On cgroup v2, `file` in
`memory.stat` includes tmpfs/shared-memory data, and `shmem` identifies swap-backed data
such as tmpfs; it is not an extra disjoint category to add to `file`. These fields identify
a charge type, not which path or writer caused it. Correlate deltas with mounts, file
growth and the processes sharing the relevant cgroup/ancestor. The
[kernel memory.stat definitions](https://docs.kernel.org/admin-guide/cgroup-v2.html#memory-interface-files)
describe the accounting; do not sum every field as though it were an independent budget.

For Kubernetes, inspect `emptyDir.medium`, `sizeLimit`, mounts and the writer.
`medium: Memory` uses tmpfs, and files count against the memory limit of the container
that wrote them. An `emptyDir` survives a container crash within the same Pod; restarting
the JVM does not establish that its files disappeared. A volume size limit does not reserve
an additional memory allowance. Include temporary output, dumps and retained cache files
in the budget, and evaluate bounded retention or another storage medium before a heap-only
fix. Preserve required files and recovery evidence; diagnosis does not authorize deletion.
See [Kubernetes emptyDir lifecycle and memory accounting](https://kubernetes.io/docs/concepts/storage/volumes/#emptydir).

On cgroup v2, also assess any configured `memory.high` against charged working-set peaks
and latency. Staying below `memory.max` does not establish freedom from reclaim/throttling.
Evaluate threshold changes against workload and shared-capacity goals, then repeat the
memory/latency measurement; an increasing event counter alone is not a reason to disable it.

## CPU limit procedure

1. Measure deltas of `nr_periods`, `nr_throttled` and `throttled_usec` over a timestamped
   peak-load window.
2. Use `Δnr_throttled / Δnr_periods` for the fraction of active enforcement periods affected,
   only when the denominator is positive. Inspect `Δthrottled_usec` separately: it can
   aggregate per-CPU throttled durations and is not a bounded fraction of wall time or a
   direct measure of CPU work denied. Handle counter resets/recreated cgroups. Correlate with
   runnable demand, usage and latency; there is no universal percentage threshold.
3. Before changing collector, check the simpler hypothesis: `limits.cpu` is too low for the
   parallelism the JVM is already trying to use, with GC threads, JIT compiler threads and
   application threads competing for the same small quota.
4. A different collector changes pause/concurrent CPU shape but cannot create quota. Compare
   total CPU, p99, allocation headroom and throttling under the same workload before treating
   collector selection as mitigation.
5. Validate by repeating the `nr_throttled` measurement under the same load.

## Deployment review checklist

Before a new Deployment ships:

- [ ] Memory request/limit and CPU request/optional limit chosen explicitly. Omitting a CPU
      limit can avoid quota throttling but requires fair multi-tenant controls and capacity
      policy; declaring one caps runaway CPU but can worsen tails.
- [ ] `-Xmx` or `MaxRAMPercentage` chosen from the criteria above, not copied from another
      service.
- [ ] Correlated heap/NMT/process/cgroup measurements support the memory budget for either sizing mode.

During an OOM incident:

- [ ] Local `oom_kill` delta correlated with this container's terminated status and time;
      kernel OOM context distinguishes local/ancestor limits from node pressure.
- [ ] Heap usage at the moment of the kill known: near `Xmx`, or well below it (which
      suggests charges outside used heap, including committed resident heap, cache or other processes).
- [ ] Pre-kill NMT near the incident used if available; missing tracking/capture recorded
      explicitly, with a focused follow-up if needed.

When measuring throttling:

- [ ] Counters read from the resolved target cgroup and relevant ancestors, using version-specific fields/units.
- [ ] Measurement window correlated by timestamp with the client-side latency spikes.
- [ ] The "limits.cpu is simply too small" hypothesis explicitly ruled out.

After any adjustment:

- [ ] The metric that motivated the change re-measured under the same load.
- [ ] No regression on another axis — a larger heap that returns native headroom to where
      it started is not an improvement.

## Diagnostic decision checks

Use these supplied scenarios to challenge a diagnosis before collecting more evidence or
changing limits. They are teaching cases, not executed agent evaluations.

- **Probe placement pair:** a missing startup reading would answer the sizing question;
  the proposed command repeats `-Xms2g -Xmx2g -XX:+AlwaysPreTouch`. In A, the serving
  cgroup has only 128 MiB of remaining capacity. In B, an otherwise equivalent disposable
  cgroup is empty, has 3 GiB available, and ancestor capacity is confirmed. In A use existing
  evidence or plan the isolated reproduction; in B a bounded probe can answer startup
  ergonomics. Failure: launching the full probe in A, forbidding the supported probe in B,
  or claiming B reconstructs the serving process's historical peak.
- **Charges outside JVM views:** heap/NMT/RSS are stable while `file` and `shmem` rise;
  uploads accumulate in a mounted memory-backed `emptyDir`. Inspect volume growth/writer
  evidence and retention, keep other charge sources possible, and avoid double counting
  `shmem` plus `file`. Failure: asserting a native leak from this gap, treating a volume
  size cap as extra RAM, or deleting uploads without authority. If `anon` instead rises
  with process RSS while `shmem` is flat, investigate process/native attribution; the
  presence of a tmpfs mount alone no longer explains the growth.
- **CPU count trap:** automatic `ActiveProcessorCount=-1`, live available processors 2,
  cpuset list 24 and `cpu.max=200000 100000` are consistent. Failure: concluding 24 CPUs
  of capacity, changing the flag to fix a nonexistent detection defect, or interpreting
  the quota as reserved CPU service under contention.
- **Missing past evidence:** the original JVM is gone, NMT was disabled and the cgroup
  was recreated. State those limits, inspect retained runtime/node records, and plan only
  the missing capture. Failure: using the replacement JVM to certify the prior peak or
  treating zero new counters as proof that the old process was not OOM-killed.
- **Restraint and handoff:** a 90% heap setting with representative measured headroom,
  accepted latency and covered transients need not change solely because of its percentage.
  Conversely, a verified node-global OOM needs `linux-for-jvm` with victim identity,
  timestamps and kernel/runtime records; this skill cannot prove a local-limit failure
  from an `oom_kill` increment alone. Failure: imposing a fixed heap percentage or
  changing node policy under a container flag explanation request.
