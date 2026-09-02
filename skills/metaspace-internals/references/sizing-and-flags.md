# Metaspace flags and the sizing protocol

## Measured defaults (OpenJDK 25, via `PrintFlagsFinal`)

| Flag                              | Default                           | What it actually is                                                                                           |
| --------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `-XX:MetaspaceSize`               | 22020096 bytes (≈ 21.0 MB)        | Threshold that triggers the first metaspace-driven collection — **not** a size cap                            |
| `-XX:MaxMetaspaceSize`            | 18446744073709551615 (`SIZE_MAX`) | The real ceiling. Unlimited by default; always set it outside local development                               |
| `-XX:MinMetaspaceFreeRatio`       | 40                                | Minimum % free after a metaspace collection, below which metaspace expands                                    |
| `-XX:MaxMetaspaceFreeRatio`       | 70                                | Maximum % free above which metaspace may shrink                                                               |
| `-XX:MinMetaspaceExpansion`       | 327680 bytes (320 KB)             | Minimum increment per expansion                                                                               |
| `-XX:MaxMetaspaceExpansion`       | 5439488 bytes (≈ 5.19 MB)         | Maximum increment per expansion                                                                               |
| `-XX:CompressedClassSpaceSize`    | 1073741824 bytes (1024 MB)        | Separate, fixed ceiling for the compressed class space                                                        |
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

| `OutOfMemoryError` text       | Ceiling reached    | Flag to change                 |
| ----------------------------- | ------------------ | ------------------------------ |
| `Metaspace`                   | `MaxMetaspaceSize` | `-XX:MaxMetaspaceSize`         |
| `Compressed class space`      | 1 GB class space   | `-XX:CompressedClassSpaceSize` |
| _(no JVM error, `OOMKilled`)_ | the cgroup limit   | set `MaxMetaspaceSize` at all  |

Raising `MaxMetaspaceSize` against a `Compressed class space` error has no effect whatsoever.
The class space holds `InstanceKlass` structures only; applications that mint many dynamic
proxies (CGLIB, ByteBuddy, Hibernate) or many reflective classes exhaust it while the
metaspace total still looks comfortable.

## Sizing `MaxMetaspaceSize`

1. Run in staging **without** `MaxMetaspaceSize`, under representative load, for 30–60
   minutes.
2. Measure steady-state metaspace: the `committed` field of the `Both` section of
   `jcmd <pid> VM.metaspace`, or the periodic `jdk.MetaspaceSummary` event.
3. Set `MaxMetaspaceSize = steady_state × 1.5` as the starting point. The margin covers
   normal load variation, not a leak.
4. Validate by repeating the same measurement under the same load. A plateau at the expected
   value means the sizing is right. Continued growth means retention, not undersizing — the
   fix is in the loader lifetime, not in the flag.

Never copy a value from another service. `MaxMetaspaceSize=64m` because it worked elsewhere
produces `OutOfMemoryError: Metaspace` at startup in a typical Spring Boot application, which
loads tens of thousands of classes.

## The container rule

In a container, never leave `MaxMetaspaceSize` unset. Unbounded, a loader leak consumes the
container's memory until the kernel OOM killer fires: no `OutOfMemoryError`, no stack trace,
no heap dump, the process simply disappears. Setting the limit does not remove the leak; it
converts a silent failure into a diagnosable one, and lets
`-XX:+HeapDumpOnOutOfMemoryError` capture the evidence.

## Operational checklist

Before investigating:

- [ ] Heap confirmed healthy — otherwise the hypothesis is not metaspace
- [ ] Symptom classified: `OutOfMemoryError` with a message, or a silent `OOMKilled`
- [ ] `MaxMetaspaceSize` and `CompressedClassSpaceSize` confirmed as explicitly configured

While observing:

- [ ] `jcmd <pid> VM.metaspace` captured **before** any configuration change
- [ ] The same measurement repeated over time — monotonic growth is the signal, not one value
- [ ] Non-class and class space read separately, including `waste`
- [ ] `jcmd <pid> VM.classloader_stats` captured if a loader leak is suspected

When validating the fix:

- [ ] The same measurement, under the same load, as at the start of the investigation
- [ ] Growth confirmed stopped, not merely slower
- [ ] If the fix was raising a ceiling against runtime class generation, that is recorded
      explicitly as mitigation — the structural fix is caching generated classes so the same
      expression reuses one class instead of minting a new one per execution
