# Flag cost and ergonomic interactions

The effective default is computed by one exact JVM under one resource envelope. Extract it; do not
rely on this document for numeric defaults.

## Review ledger

| Choice                      | Potential benefit                                           | Potential cost/interactions                                          | Evidence                                                  |
| --------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| `-Xmx` / max-RAM sizing     | capacity for live set/allocation bursts                     | native/non-heap headroom, reference width, GC work, cgroup kill      | live set, commitment/RSS, NMT/mappings, cgroup events, GC |
| `-Xms` / initial-RAM sizing | fewer expansions, stable heap policy                        | startup/RSS/rollout and unused footprint                             | startup timeline, expansion, RSS, GC                      |
| `AlwaysPreTouch`            | move first-touch/page work earlier                          | startup CPU/bandwidth, commitment, NUMA placement                    | faults, startup/readiness, RSS, NUMA, tail after deploy   |
| collector selection         | pause/throughput/footprint objective                        | CPU headroom, barriers, live-set/concurrency needs                   | GC logs/JFR + workload SLO/capacity                       |
| GC worker overrides         | alter pause/concurrent progress                             | application competition under quota, oversubscription                | GC CPU/phase timing, allocation pressure, throttle        |
| `ActiveProcessorCount`      | correct deliberate CPU planning/detection                   | changes multiple JVM/library ergonomics; may diverge from quota      | effective CPUs, quota/cpuset, pools/threads, SLO          |
| compilation tier/stop       | startup/compiler resource reduction                         | lower peak optimization/throughput, code-cache/profile changes       | startup plus steady-state compilation/CPU/SLO             |
| explicit-GC controls        | avoid disruptive requested collection                       | reference/direct-memory/recovery semantics and collector support     | caller/event, direct/native pressure, GC behavior         |
| `-Xss`                      | deeper platform/virtual execution stacks per implementation | address/RSS or heap stack chunks, fewer threads, masks recursion bug | overflow stack, thread count, NMT/heap, failure test      |
| large pages/NUMA            | TLB/locality improvements                                   | reservation/fallback/startup/placement/operational complexity        | OS allocation, topology, faults/counters, paired workload |
| logging/JFR/NMT             | diagnosis and recovery                                      | CPU/memory/disk/privacy                                              | calibrated overhead, loss, retention, incident need       |

Mechanism alone does not determine sign or magnitude.

## Memory envelope

Model peak concurrent demand, not only nominal maxima:

```text
container/process memory demand =
  heap committed/resident
  + metaspace/class space
  + code cache and compiler/runtime arenas
  + thread stacks
  + direct/native/library allocations
  + GC metadata/remembered sets/marking/relocation headroom
  + mapped/file-backed resident pages charged to cgroup
  + agents/profilers and other processes/sidecars if sharing the limit
  + fragmentation and safety margin
```

Reserved, committed, RSS/PSS, cgroup `memory.current`, and live data are different. NMT does not
cover every native allocation and must be enabled at startup for its supported accounting. Reconcile
NMT with process maps/RSS and cgroup totals; unexplained residual is itself a finding.

Avoid universal percentage policies. Use distributions across startup, steady load, burst, GC,
redeploy, shutdown, and failure. Validate OOM path: Java OOME, heap-dump feasibility, cgroup kill,
restart/backoff, and data/recovery consequences.

## Compressed references and object headers

Compressed ordinary/class pointers and compact object headers are release- and configuration-
dependent. Heap base/range, object alignment, collector, architecture, max/initial/min heap, and
feature constraints matter. Do not infer from a “31/32 GB rule.” Read the effective flags and heap
configuration from the target build, then measure object/live-set/GC/CPU effects with representative
data. Feature JEP benchmark numbers are design evidence, not promises for an application.

## CPU and thread ergonomics

One effective processor count can influence GC/JIT workers, common-pool parallelism, virtual-thread
scheduling defaults, and libraries that consult available processors. CPU quota controls runnable
time per period; cpuset controls placement; weight/shares influence competition. These are not
interchangeable.

Prefer correcting the resource contract when it is wrong. Override `ActiveProcessorCount` only
when the intended logical planning count is explicit and all downstream consequences are tested.
Direct GC-thread overrides may be justified when collector phase evidence shows under/over-
parallelism, but they require CPU competition and failure-progress tests.

## Startup versus steady state

Compilation tier limits, AOT/CDS, heap commitment/pre-touch, class initialization, dependency
connection, and orchestration throttling affect different phases. Evaluate:

```text
process start -> application main -> readiness -> first traffic -> warm throughput -> peak load
```

Measure startup CPU, throttling, allocation/GC, class loading, compilation/deoptimization, code
cache, page faults, dependency waits, and rollout concurrency. A faster readiness time that causes a
later CPU/capacity regression is a trade, not an optimization.

## Explicit GC

Before suppressing or converting explicit collection, identify caller, reason, collector behavior,
pause/concurrent impact, and native/direct/reference pressure. Some code requests GC as part of a
best-effort recovery path; suppressing it can change failure timing. Conversely, uncontrolled calls
can produce severe pauses. Prefer fixing the caller or selecting a collector-supported behavior only
after measuring both paths. Test direct-memory exhaustion and cleanup explicitly.

## Extract a defaults snapshot

For every supported JDK/resource class, retain:

```bash
java -version
java -XX:+PrintCommandLineFlags -version
java -XX:+PrintFlagsFinal -version
```

For the running workload, add effective runtime flags and subsystem evidence. Diff snapshots across
JDK builds as data. Do not assume printed product defaults describe values later changed by
ergonomics, constraints, attach-manageable updates, or resource discovery.

## Decision rules

Prefer an explicit flag when:

- it expresses a tested constraint or compatibility requirement;
- the target default/effective value is demonstrated insufficient;
- interaction, upgrade, failure, and rollback tests exist;
- the owner accepts the operational cost.

Prefer ergonomics/minimal configuration when:

- no workload evidence supports an override;
- the fleet/resource envelope varies and adaptation is valuable;
- pinning would fossilize a release-specific workaround.

Remove a flag when exact-build tests show it is dead, redundant without intended pinning, harmful,
or superseded, and rollout evidence verifies behavior. Do not remove solely because it looks old.

## Authoritative references

- [JDK 25 `java` command](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html)
- [OpenJDK HotSpot flag declarations and ergonomics](https://github.com/openjdk/jdk/tree/master/src/hotspot)
- [JDK Flight Recorder runtime guide](https://docs.oracle.com/en/java/javase/25/jfapi/flight-recorder-runtime-guide/index.html)
- [Linux proc process memory](https://docs.kernel.org/filesystems/proc.html)
- [cgroup v2 memory controller](https://docs.kernel.org/admin-guide/cgroup-v2.html#memory)
