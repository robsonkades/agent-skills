# Evidence selection for common requests

Choose evidence that separates the live hypotheses with acceptable perturbation. Commands and JFR
views/events differ by JDK; discover them on the target (`jcmd <pid> help`, `jfr help`, `jfr view
types`, event metadata/settings) and validate a positive control.

## Minimum context packet

Before flag advice, request:

```text
exact JDK/vendor/build and image
received command plus effective flags/origins
pod/cgroup CPU and memory envelope/events
collector and heap configuration
affected time/load/deploy cohort and SLO symptom
one aligned JVM + OS + application evidence window
```

One command is not always enough. Select the smallest set that discriminates the plausible causes.

## High p99, CPU not saturated

Competing hypotheses: queue/pool/downstream wait, lock/park, safepoint/GC, cgroup throttle, request
mix/skew, instrumentation/client timing.

Start with aligned service/trace/queue metrics, cgroup CPU throttling/pressure, and a bounded JFR or
wall/off-CPU capture with event settings verified. CPU profiles alone answer on-CPU work, not elapsed
request critical path.

Decision branches:

```text
queue/pool wait grows -> capacity/concurrency/dependency owner, not JVM flag first
throttle aligns -> resource envelope/planning experiment
GC/safepoint aligns -> gc-log-analysis / pause-attribution
monitor/park evidence aligns -> concurrency-diagnostics plus logical owner
none -> validate capture opportunity, thresholds, loss, target and client timing
```

## CPU saturated or cost per request rose

Collect CPU by process/thread/cgroup, completed-work denominator, CPU stacks, GC/JIT chronology, and
throttling/steal/frequency context. Compare affected and matched control.

```text
application stacks -> local mechanism/source investigation
GC CPU -> allocation/live set/collector evidence
compiler/deopt -> lifecycle/JDK/code-cache investigation
native/kernel -> async-profiler/eBPF/OS path with scope validation
spin/lock -> concurrency evidence and progress counters
```

Do not infer thread-count/collector changes from CPU utilization alone.

## OOMKilled or rising RSS

Collect cgroup memory current/peak/events, process maps/RSS/PSS, heap commit/live/post-GC trend, NMT
if already enabled, thread/class/direct/native evidence, and other charged processes.

```text
heap live/retained grows -> heap retention path and dump after impact review
heap commit grows but live flat -> sizing/ergonomics/allocation behavior
native category/maps grow -> owning allocator/library/subsystem
thread/class count grows -> lifecycle leak
cgroup total unexplained -> mappings/page cache/other process/accounting residual
```

NMT cannot be retroactively enabled with full history. Plan the next occurrence instead of claiming
the current incident is explained.

## Slow startup/readiness

Capture from process launch: phase markers/readiness, cgroup CPU throttle, class loading/
initialization, compilation/AOT/CDS, allocation/GC, page faults/IO, dependency/DNS/TLS/connectivity,
and framework/application startup tasks.

Compare startup-to-main, main-to-ready, ready-to-stable and first-traffic behavior. Pre-touch or
fixed heap may intentionally move later work into startup. A low CPU quota can throttle concurrent
classloading/JIT/application startup without being visible as high normalized CPU.

## GC blamed

First establish effective collector, heap configuration, allocation/load, live-set/occupancy,
pause/concurrent phase timing, GC CPU, safepoints, and cgroup CPU/memory. Then route:

```text
pause aligns with SLO -> pause-attribution and collector phase cause
concurrent cycle loses allocation race -> heap/allocation/concurrent CPU headroom
GC CPU high but pauses acceptable -> throughput/cost trade-off
latency not aligned -> do not tune GC from aggregate GC presence
```

The existence of GC events is normal; causal alignment and opportunity matter.

## Startup/configuration mismatch

When a static option appears ineffective:

1. Capture `VM.command_line` and option sources/entrypoint expansion.
2. Capture effective flags with origins and runtime subsystem state.
3. Check duplicates, unlock/masking, constraints, aliases, and ergonomic overrides.
4. Reproduce on exact build without masking in a disposable startup test.
5. Compare every fleet/upgrade variant.

## Artifact adequacy checklist

- [ ] Target PID/start time/container and time window are correct.
- [ ] Workload/event opportunity existed and a positive control was observed.
- [ ] JFR/log/profile settings, thresholds, periods, stacks, buffers, loss, and output are known.
- [ ] Cgroup path/version and units are correct.
- [ ] Metrics share aligned clocks/windows and appropriate business-work denominators.
- [ ] Artifact parses, is complete, checksummed, access-controlled, and retained.
- [ ] Absence is reported as “no qualifying observation under this configuration,” not proof of no
      mechanism.

## Recommendation branch template

```text
If evidence A exceeds/aligned-with criterion X:
  mechanism supported; route/change/experiment Y with guardrails.
If evidence B instead:
  alternative mechanism; action Z.
If neither or capture inadequate:
  do not change flags; repair evidence and repeat.
```

## Authoritative references

- [JDK 25 `jcmd`](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html)
- [JDK 25 `jfr`](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jfr.html)
- [JFR runtime guide](https://docs.oracle.com/en/java/javase/25/jfapi/flight-recorder-runtime-guide/index.html)
- [JDK unified logging](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html#enable-logging-with-the-jvm-unified-logging-framework)
- [Linux cgroup v2](https://docs.kernel.org/admin-guide/cgroup-v2.html)
- [Linux proc filesystem](https://docs.kernel.org/filesystems/proc.html)
