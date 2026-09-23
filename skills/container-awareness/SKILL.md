---
name: container-awareness
description: >
  What the JVM actually detects inside a container: cgroup v1 versus v2 detection,
  ActiveProcessorCount and how a CPU quota becomes a processor count, MaxRAMPercentage and
  every ergonomic derived from it, GC and JIT thread counts sized from the wrong number, and
  verifying all of it from inside the running container. Use when a pod is OOMKilled while
  heap usage is well below Xmx, when a Deployment has no resources.limits or sets
  limits.memory equal to Xmx, when MaxRAMPercentage is pushed to 90, when someone reads
  ActiveProcessorCount out of PrintFlagsFinal or jcmd VM.flags and gets -1, when a cgroup
  command reads /sys/fs/cgroup/cpu/cpu.stat and finds nothing, or when latency spikes have
  no matching GC pause. Does not cover host-side kernel behaviour such as the node OOM
  killer, page faults, swap, PSI or signals (linux-for-jvm), the memory-region budget itself
  (jvm-memory-regions), or CPU topology and pinning (numa-and-cpu-affinity).
---

# Container Awareness

## Purpose

Decide whether the JVM's automatic sizing inside this container is the sizing you
actually want. HotSpot's `UseContainerSupport` — on by default since JDK 10 on supported
Linux builds — incorporates cgroup memory and CPU constraints into ergonomics, using
version-specific detection. It does not make the resulting heap, GC thread
count or JIT thread count right for the workload.

The failure this prevents is the confidently wrong container diagnosis: a pod killed for
non-heap charges while the heap sat at 70%, diagnosed without reconciling memory views;
or a detected CPU count inferred from the default `ActiveProcessorCount=-1` sentinel.

## Workflow

This is Linux HotSpot guidance, with JDK 17–25 as the main command baseline and a JDK 26
heap-default note in the reference. Inspect the runtime image's vendor/update, launch flags,
deployment resources and kernel/cgroup version; a build toolchain alone does not identify
production ergonomics. Do not upgrade the runtime to match these examples.

Start with the requested decision and existing deployment, runtime and measurement artifacts.
Reuse evidence that matches the target and workload; collect only gaps that could change the
answer. A flag explanation needs no new load test, and a budget that already meets its
headroom and latency goals may need no change.

1. **Establish what the target JVM detected, from inside its container.** A fresh
   `java -XshowSettings:system` is a probe, not proof of the live JVM's settings: match binary,
   options and cgroup, and prefer in-process `availableProcessors()` plus live flags.
   Use `-Xlog:os+container=trace` for the raw
   cgroup reads, `jcmd <pid> VM.flags -all` for ergonomically resolved flags. See
   `references/reading-the-container.md`.
2. **Confirm the cgroup version before running any cgroup command.** v2 is a unified
   hierarchy with different file names _and_ different field names; a v1 command does not
   fail loudly on v2, it finds nothing.
3. **Separate the memory question from the CPU question.** They have different evidence:
   `memory.current` / `memory.events` for one, `cpu.max` / `cpu.stat` for the other.
4. **For a kill, take deltas from the process's actual cgroup.** An `oom_kill` increment in
   cgroup v2 `memory.events.local` records a member killed by an OOM killer, including a
   global OOM killer; it does not prove this cgroup's limit triggered the kill. The
   hierarchical `memory.events` may include descendants. Correlate pod/container status and
   timestamps and kernel OOM context to establish victim and cause. Absence routes investigation to runtime, node and
   signal evidence in `linux-for-jvm`.
5. **Reconcile memory views under load**, not at boot, before changing any limit. NMT tracks
   many JVM-native reservations/commitments but not all process or cgroup charges, and
   committed bytes are not identical to RSS. Compare heap, NMT, RSS/PSS, direct-memory
   metrics and cgroup `memory.stat`; lowering `-Xmx` may create headroom at the cost of more
   GC, so validate both rather than calling it intrinsically wrong.
6. **For latency spikes with no matching GC pause, measure throttling**: `nr_throttled`
   over `nr_periods` from `cpu.stat`, at peak load, timestamp-correlated with the
   client-side spikes. When memory pressure is plausible on cgroup v2, also inspect
   `memory.high` and `high` event deltas: memory reclaim/throttling can occur without an OOM
   or CPU-bandwidth throttling. See `references/reading-the-container.md`.
7. **Re-measure the metric that motivated the change, under the same load.** A container
   change is not validated by the absence of the old symptom in a different run.

## Rules

- Read `ActiveProcessorCount` to discover an explicit override, not an automatically
  detected count. It is a HotSpot product flag; default `-1` requests automatic detection
  and is not rewritten with its result. Use `Runtime.getRuntime().availableProcessors()`
  in the target JVM; `java -XshowSettings:system` is a Linux probe available on the JDK 17 baseline.
- In `-XshowSettings:system`, the answer is the **`Effective CPU Count`** field. The
  `List of Effective Processors, N total` line reports an effective processor set, not a
  quota-derived count: with unrestricted cpuset under `--cpus=2` on a 24-CPU host it can read
  `Effective CPU Count: 2` and `List of Effective Processors, 24 total`. Quoting the `24` is the same mistake as reading
  the flag, one line lower.
- `jcmd <pid> VM.flags` shows selected non-default flags, including ergonomic choices.
  Use `-all` for the full flag table and origins; neither form converts the automatic
  `ActiveProcessorCount` sentinel into the detected count.
- Use `grep -w` when extracting a flag from `PrintFlagsFinal`. `MaxHeapSize` without `-w`
  also matches `SoftMaxHeapSize` and returns the wrong line. The value is field `$4` of
  `<type> <name> = <value> {tags}`, in bytes.
- On cgroups v2, controllers share a hierarchy; resolve the target's actual cgroup directory
  before reading `cpu.stat`, rather than assuming either a `/cpu/` controller or mount root.
  Both versions use `nr_periods` and `nr_throttled`; time is `throttled_time` (ns) in v1,
  `throttled_usec` in v2.
- Kubernetes CPU requests influence pod placement and CPU scheduling weight under contention;
  they are not a hard CPU quota. Older HotSpot updates nevertheless used shares for sizing;
  verify the deployed update's behavior. Updated HotSpot derives an effective count from applicable
  quota, cpuset/affinity and host constraints (or an explicit `ActiveProcessorCount`). A pod
  with request `500m` and limit `4` can therefore size parallel facilities near four even
  though actual CPU service depends on contention and scheduler weights.
- Require an explicit memory capacity policy. If the container has no memory limit, inspect
  inherited cgroup constraints and live heap sizing; host memory may drive ergonomics. Do
  not infer an exact 25% heap or absent effective limits from a missing manifest block alone.
- Compare resolved heap and container capacity in bytes: HotSpot and Kubernetes suffixes
  differ. Never assign the entire memory limit to `-Xmx`; equal byte values leave zero
  budget for everything that is not heap. See the unit example in `references/sizing-heap-and-cpu.md`.
- Reject any fixed multiplier over `Xmx` as a universal memory-limit rule. Native footprint
  is workload-dependent. Size from correlated heap, NMT, process RSS/PSS and cgroup charges
  at representative peaks, with restart/dump/traffic transients included.
- Treat `MaxRAMPercentage=90` as a high-risk hypothesis, not automatically a bug. It can be
  viable for a simple low-native-footprint process and disastrous for many threads, direct
  buffers or agents. Absolute headroom and kill probability decide; no 60–70% default is an
  answer either.
- CPU bandwidth exhaustion can deschedule application, GC and JIT work governed by that
  quota. It is not a distinct GC event, but can lengthen a GC pause's recorded wall time.
  Do not require the absence of a GC pause before investigating throttling; ancestor quotas
  and per-CPU runtime accounting also matter.
- Confirm the JDK version against the cluster's cgroup version before trusting detection.
  Cgroups v2 support landed in JDK 15 and was backported, including to 11.0.16. Major version
  alone cannot establish support or exclude later detection bugs; verify vendor/update and logs.
- Boot-only NMT does not establish memory usage at a later kill. Use a capture near the
  relevant peak when available; if the JVM has exited or NMT was disabled, report that gap
  and plan only the missing capture or representative reproduction. A replacement JVM's
  readings do not reconstruct its predecessor's peak.

For a diagnosis or sizing decision, deliver the target/runtime/cgroup identity, available
memory or CPU evidence, competing explanations where unresolved, and the proposed change
or reason to retain the current sizing. A change needs a same-load validation metric;
report whether it was actually checked. For a flag explanation, a scoped interpretation
and its evidence suffice. Missing access or counters leave the diagnosis conditional;
an empty command output is not a healthy reading.

## References

- [Reading the container](references/reading-the-container.md) — the commands that answer
  each detection question, the cgroup v1 to v2 file and field map, and the `kubectl exec`
  forms. Read before running any diagnostic inside a container, and whenever a cgroup path
  returns nothing.
- [Sizing heap and CPU limits](references/sizing-heap-and-cpu.md) — the fixed `-Xmx`
  versus `MaxRAMPercentage` decision table, the NMT headroom procedure, and the throttling
  measurement procedure. Read when choosing or changing `resources.limits`, or when
  deciding whether a latency problem is a CPU-quota problem.
