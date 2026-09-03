# Metaspace flags and the sizing protocol

## Measured defaults (OpenJDK 25, via `PrintFlagsFinal`)

| Flag                              | Default                           | What it actually is                                                                                           |
| --------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `-XX:MetaspaceSize`               | 22020096 bytes (≈ 21.0 MB)        | Threshold that triggers the first metaspace-driven collection — **not** a size cap                            |
| `-XX:MaxMetaspaceSize`            | 18446744073709551615 (`SIZE_MAX`) | Overall commitment limit on this build; effectively unbounded by default                                      |
| `-XX:MinMetaspaceFreeRatio`       | 40                                | Minimum % free after a metaspace collection, below which metaspace expands                                    |
| `-XX:MaxMetaspaceFreeRatio`       | 70                                | Maximum % free above which metaspace may shrink                                                               |
| `-XX:MinMetaspaceExpansion`       | 327680 bytes (320 KB)             | Minimum increment per expansion                                                                               |
| `-XX:MaxMetaspaceExpansion`       | 5439488 bytes (≈ 5.19 MB)         | Maximum increment per expansion                                                                               |
| `-XX:CompressedClassSpaceSize`    | 1073741824 bytes (1024 MB)        | Requested reservation/limit for compressed class metadata; verify the effective value                         |
| `-XX:+UseCompressedClassPointers` | `true` (`lp64_product`)           | Independent of `UseCompressedOops`; stays `true` above a 32 GB heap. Deprecated in JDK 25, obsolete in JDK 27 |

**`-XX:MetaspaceExpansionSize` does not exist.** `java -XX:MetaspaceExpansionSize=5m -version`
answers `Unrecognized VM option 'MetaspaceExpansionSize=5m'. Did you mean
'MinMetaspaceExpansion=<value>'?`. Material that quotes it as a single expansion-increment
flag is wrong; there are two flags, both listed above.

**`-XX:MetaspaceReclaimPolicy` is gone on 25.** The JEP 387 flag (`balanced` / `aggressive` /
`none`) is absent from `-XX:+PrintFlagsFinal` on 25.0.3; guides written for JDK 16–21 still
quote it. Metaspace commits and uncommits in 64 KB granules (`commit_granule_bytes: 65536`
in `VM.metaspace basic`), which is the unit `committed` moves in.

**`CompressedClassSpaceSize` has a floor.** `-XX:CompressedClassSpaceSize=1m` starts with
`CompressedClassSpaceSize adjusted from user input 1048576 bytes to 16777216 bytes`, so a
value under 16 MB is silently raised — a "tiny class space" experiment is not testing what it
claims.

## Which ceiling does the error name?

| Symptom                                    | Failed domain / next check                                   | Relevant control                                                 |
| ------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `OutOfMemoryError: Metaspace`              | overall metadata allocation; confirm usage and unloading     | `MaxMetaspaceSize`, only after diagnosing growth                 |
| `OutOfMemoryError: Compressed class space` | compressed class metadata reservation                        | `CompressedClassSpaceSize` and class cardinality/lifetime        |
| exit 137 / Kubernetes `OOMKilled`          | cgroup or node kill; inspect `memory.events` and all domains | container budget; a metaspace cap is only one possible guardrail |

Raising `MaxMetaspaceSize` against a `Compressed class space` error has no effect whatsoever.
The class space holds Klass metadata; applications that mint many dynamic
proxies (CGLIB, ByteBuddy, Hibernate) or many reflective classes exhaust it while the
metaspace total still looks comfortable.

## Sizing `MaxMetaspaceSize`

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

Before investigating:

- [ ] Heap confirmed healthy — otherwise the hypothesis is not metaspace
- [ ] Symptom classified: `OutOfMemoryError` with a message, or a silent `OOMKilled`
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
