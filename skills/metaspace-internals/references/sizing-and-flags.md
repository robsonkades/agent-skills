# Metaspace flags and the sizing protocol

## Reference values and exact-build checks

The numeric values below are retained from earlier JDK 25 examples and were independently
rechecked on Temurin 25.0.3+9 Windows x64 with a 16 MiB initial / 64 MiB maximum heap on
2026-09-11. They are observed effective values for that startup, not portable defaults for
every vendor, architecture, collector or flag combination. Earlier printouts elsewhere in this
package remain historical; their missing vendor/architecture details cannot be reconstructed.

| Flag                              | Default                           | What it actually is                                                                      |
| --------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------- |
| `-XX:MetaspaceSize`               | 22020096 bytes (≈ 21.0 MB)        | Threshold that triggers the first metaspace-driven collection — **not** a size cap       |
| `-XX:MaxMetaspaceSize`            | 18446744073709551615 (`SIZE_MAX`) | Overall commitment limit on this build; effectively unbounded by default                 |
| `-XX:MinMetaspaceFreeRatio`       | 40                                | Minimum desired free % in GC high-water-mark policy; can raise the threshold             |
| `-XX:MaxMetaspaceFreeRatio`       | 70                                | Maximum desired free % in GC high-water-mark policy; can lower the threshold             |
| `-XX:MinMetaspaceExpansion`       | 327680 bytes (320 KB)             | Lower increment used in GC high-water-mark adjustment, not every arena/OS allocation     |
| `-XX:MaxMetaspaceExpansion`       | 5439488 bytes (≈ 5.19 MB)         | GC high-water-mark expansion-policy parameter, not a hard cap on each allocation         |
| `-XX:CompressedClassSpaceSize`    | 1073741824 bytes (1024 MB)        | Requested reservation/limit for compressed class metadata; verify the effective value    |
| `-XX:+UseCompressedClassPointers` | `true`                            | Separate mechanism; effective mode can depend on build, architecture and heap ergonomics |

The JDK 25 ratio policy adjusts `capacity_until_GC`, using committed metadata as its
occupied baseline. A lower high-water mark changes when another metaspace-driven GC is
requested; it does not itself uncommit pages or reduce RSS. For a footprint objective,
compare threshold changes separately with used/committed memory, reusable blocks/chunks
and actual reclamation. Do not interpret a threshold-shrink message as bytes returned to the OS.

**`-XX:MetaspaceExpansionSize` is unrecognized on the checked build.** `java -XX:MetaspaceExpansionSize=5m -version`
answers `Unrecognized VM option 'MetaspaceExpansionSize=5m'. Did you mean
'MinMetaspaceExpansion=<value>'?`. Material that quotes it as a single expansion-increment
flag is wrong; there are two flags, both listed above.

**`-XX:MetaspaceReclaimPolicy` is obsolete on the checked build.** JDK 21 and 25 source
mark it obsolete from 21. The fresh 25.0.3 startup accepted `balanced` with a warning that
support was removed in 21.0 and ignored the option; it was absent from `PrintFlagsFinal`.
Parser acceptance does not mean the policy is active. Check stderr and effective settings
instead of treating every absent option as an unrecognized-option failure.

The pinned JDK 25 implementation commits/uncommits OS memory in 64 KiB granules
(`commit_granule_bytes: 65536`). This is not the unit of every displayed `committed` field:
an individual chunk/CLD can account for a smaller part of a shared committed granule.

**`CompressedClassSpaceSize` has a floor.** `-XX:CompressedClassSpaceSize=1m` starts with
`CompressedClassSpaceSize adjusted from user input 1048576 bytes to 16777216 bytes`, so a
value under 16 MB is raised with an adjustment warning on this build — a "tiny class space" experiment is not testing what it
claims.

## Which ceiling does the error name?

| Symptom                                        | Failed domain / next check                                               | Relevant control                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| `OutOfMemoryError: Metaspace`                  | overall metadata allocation; confirm usage and unloading                 | `MaxMetaspaceSize`, only after diagnosing growth                 |
| `OutOfMemoryError: Compressed class space`     | compressed class metadata reservation                                    | `CompressedClassSpaceSize` and class cardinality/lifetime        |
| exit 137 alone                                 | termination cause unconfirmed; inspect process/container/kernel evidence | no metaspace or OOM attribution from status alone                |
| Kubernetes `OOMKilled` / matching OOM evidence | memory kill; correlate the affected cgroup/node and all domains          | container budget; a metaspace cap is only one possible guardrail |

Raising only MaxMetaspaceSize is not a general repair for class-space exhaustion. At startup,
HotSpot can reduce CompressedClassSpaceSize based on MaxMetaspaceSize and alignment, so changing
the overall cap can also change the effective class reservation. On Temurin 25.0.3+9 Windows,
`-XX:MaxMetaspaceSize=64m` changed effective CompressedClassSpaceSize from 1 GiB to 64 MiB.
Inspect both values after restart; neither can be inferred solely from exception wording.
The class space holds Klass metadata; applications that mint many dynamic
proxies (CGLIB, ByteBuddy, Hibernate) or many reflective classes exhaust it while the
metaspace total still looks comfortable.

## Sizing `MaxMetaspaceSize`

Apply this protocol when a new cap or capacity claim needs evidence. Existing measurements can
satisfy it; a supported narrow explanation or adequate current configuration needs no fresh soak.

1. Exercise every relevant regime: startup, warm-up, peak feature mix, runtime generation,
   rolling redeploy overlap and the longest expected uptime. A fixed 30-minute soak is not
   representative when distinct tenants, scripts or plugins accumulate over days.
2. Capture distributions and correlated peaks for non-class/class used and committed,
   loaders, loaded/unloaded classes, RSS and cgroup `memory.current`; use metaspace summaries
   at GC boundaries rather than treating them as a wall-clock sampler.
3. Explain the growth model. Loader retention, increasing distinct generator keys and normal
   warm-up require different remedies. A plateau is evidence only for the inputs observed.
4. Allocate headroom from measured high-water marks, uncertainty, fragmentation, redeploy
   overlap and the complete native-memory budget. There is no portable `× 1.5` constant.
5. Decide whether a JVM fail-fast limit improves recovery. A cap must leave cgroup headroom,
   yet a cap that is too low converts healthy variation into an avoidable outage.
6. Replay the same and adversarial regimes, then verify both capacity and lifecycle signals.

Never copy a value from another service. Framework graph, instrumentation, proxy generation,
JDK build, feature mix and redeploy model determine the class population; measure the target
artifact and deployment topology.

## The container rule

In a container, account explicitly for metaspace whether or not a cap is set. An effectively
unbounded limit lets metadata compete with heap, code cache, thread stacks, direct buffers and
native libraries; it does not prove that a loader leak will reach the kernel before a JVM
allocation failure. A derived cap can create an earlier, observable failure boundary, but it
does not reserve cgroup memory or protect against correlated native peaks. Preserve JFR/NMT,
class-loader statistics and cgroup evidence; a heap dump may help find loader retainers but is
not itself a metaspace-contents dump.

## Operational checklist

Select the checks relevant to the decision and reuse matching evidence. A missing capture limits
the claim that needs it; it does not invalidate independent observations or require every tool.

Before investigating:

- [ ] Heap, metadata and other native domains compared; multiple failures can coexist
- [ ] Symptom classified: named `OutOfMemoryError`, confirmed memory kill, or unexplained termination
- [ ] Effective `MaxMetaspaceSize`, `CompressedClassSpaceSize` and compressed-pointer mode recorded

While observing:

- [ ] `jcmd <pid> VM.metaspace` captured **before** any configuration change
- [ ] Time series correlates used/committed with classes, loaders, unloading, load and GC boundaries
- [ ] Non-class and class space read separately, including `waste`
- [ ] `jcmd <pid> VM.classloader_stats` captured if a loader leak is suspected

When validating the fix:

- [ ] The same measurement, under the same load, as at the start of the investigation
- [ ] Growth model is bounded for the tested cardinality, duration and redeploy scenarios
- [ ] If the fix was raising a ceiling against runtime class generation, that is recorded
      explicitly as mitigation — structural fixes may bound/cache generation, shorten loader
      lifetime, interpret rather than compile, reject excessive cardinality, or isolate tenants

[HotSpot JDK 25 metaspace ergonomics](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/memory/metaspace.cpp)
shows class reservation adjustment and GC high-water-mark policy. Defaults above are build
observations, not portable Java guarantees.

- [JDK 17 pointer ergonomics](https://github.com/openjdk/jdk/blob/jdk-17-ga/src/hotspot/share/runtime/arguments.cpp) — architecture-dependent compressed-pointer coupling and heap sizing.
- [JDK 25 flag lifecycle](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp) — obsolete-option handling and target-build checks.
- [JDK 25 metaspace granules](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/memory/metaspace/metaspaceSettings.hpp) — OS commitment granule versus chunk accounting.
- [Linux 6.10 cgroup memory events](https://www.kernel.org/doc/html/v6.10/admin-guide/cgroup-v2.html) — correlate memory-kill evidence with the affected hierarchy and interval.
