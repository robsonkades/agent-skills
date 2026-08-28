# Flag lifecycle matrix

Read at step 3, for any artefact containing JVM flags. Everything here is scoped to
JDK 21, 25 and 26; where JDK 27 is scheduled to change the answer it is marked as
scheduled, not as observed.

## The four states, and what the auditor sees

HotSpot's flag table (`special_jvm_flags` in `arguments.cpp`) gives every retired flag a
`deprecated_in`, `obsolete_in` and `expired_in` release. The states are not synonyms:

| State                       | Behaviour                               | Message on stderr                                                                          |
| --------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Deprecated**              | Starts; **the flag still takes effect** | `Option <X> was deprecated in version <V> and will likely be removed in a future release.` |
| **Obsolete**                | Starts; **the value is ignored**        | `Ignoring option <X>; support was removed in <V>`                                          |
| **Expired / never existed** | **JVM refuses to start**                | `Unrecognized VM option '<X>'` then `Error: Could not create the Java Virtual Machine.`    |

Two consequences the whole matrix rests on:

1. **Expired means deleted from the table.** The source requires expired options to be
   removed from `special_jvm_flags`, so a flag absent from that table _and_ from every
   `*_globals.hpp` is a startup failure — not a warning. That is how CMS, biased locking,
   `MaxPermSize` and `AggressiveOpts` behave on JDK 21/25/26 today.
2. **`-XX:+IgnoreUnrecognizedVMOptions` turns a hard failure into a silent no-op.** This
   is step 2 of the workflow and not step 3 for a reason: with it on the line, an expired
   flag produces no message at all, and the audit cannot tell an effective flag from a
   discarded one by reading text.

## Matrix

| Flag                                                                                                                                                                                | Deprecated     | Obsolete | Expired / removed | JDK 21                                  | JDK 25                                                   | JDK 26                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------- | ----------------- | --------------------------------------- | -------------------------------------------------------- | ---------------------------------------- |
| `-XX:+UseConcMarkSweepGC` and every `CMS*` flag                                                                                                                                     | 9              | 14       | 15                | refuses to start                        | refuses to start                                         | refuses to start                         |
| `-XX:+UseParallelOldGC`                                                                                                                                                             | 14             | 15       | 16                | refuses to start                        | refuses to start                                         | refuses to start                         |
| `-XX:+UseBiasedLocking`, `-XX:BiasedLockingStartupDelay`                                                                                                                            | 15             | 18       | 19                | refuses to start                        | refuses to start                                         | refuses to start                         |
| `-XX:PermSize`, `-XX:MaxPermSize`                                                                                                                                                   | —              | 8        | dropped in 17     | refuses to start                        | refuses to start                                         | refuses to start                         |
| `-XX:+AggressiveOpts`                                                                                                                                                               | 11             | 12       | 13                | refuses to start                        | refuses to start                                         | refuses to start                         |
| `-XX:+UseParNewGC`                                                                                                                                                                  |                | 10       |                   | refuses to start                        | refuses to start                                         | refuses to start                         |
| `-XX:+UseCGroupMemoryLimitForHeap`                                                                                                                                                  |                | 11       |                   | refuses to start                        | refuses to start                                         | refuses to start                         |
| `-XX:+PrintGCTimeStamps`, `PrintGCDateStamps`, `UseGCLogFileRotation`, `NumberOfGCLogFiles`, `GCLogFileSize`                                                                        | removed in 9   |          |                   | refuses to start                        | refuses to start                                         | refuses to start                         |
| `-XX:+UseContainerCpuShares`, `-XX:+PreferContainerQuotaForCPUCount`                                                                                                                | 19             | 20       | 21                | refuses to start                        | refuses to start                                         | refuses to start                         |
| `-XX:+ZGenerational`                                                                                                                                                                | 23             | 24       | dropped in 26     | product, default `false`                | starts, **warns, value ignored**                         | **refuses to start**                     |
| `-XX:LockingMode=n`                                                                                                                                                                 | 24             | 26       | 27                | EXPERIMENTAL, default `LM_LEGACY`       | starts, warns, still effective; default `LM_LIGHTWEIGHT` | starts, **warns, value ignored**         |
| `-XX:+UseCompressedClassPointers`                                                                                                                                                   | 25             | 26→27    | —                 | exists, default `true`                  | starts, **warns**, still effective                       | starts, warns; obsolete scheduled for 27 |
| `-XX:+PrintGCDetails`, `-XX:+PrintGC`, `-Xloggc:<file>`                                                                                                                             | help text only | —        | —                 | starts, warns, rewritten to `-Xlog:gc*` | same                                                     | same                                     |
| `-Xverify:none` / `-noverify`                                                                                                                                                       | 13             | —        | —                 | starts, warns                           | starts, warns                                            | starts, warns                            |
| `-Xdebug`                                                                                                                                                                           | 22             | —        | —                 | accepted silently                       | starts, warns                                            | starts, warns                            |
| `-XX:+ParallelRefProcEnabled`, `ParallelRefProcBalancingEnabled`, `PSChunkLargeArrays`, `MaxRAM`, `AggressiveHeap`, `NeverActAsServerClassMachine`, `AlwaysActAsServerClassMachine` | 26             | 27       | 28                | live                                    | live                                                     | starts, **warns**                        |
| ~18 `AdaptiveSize*` / `Tenured*` / `PretenureSizeThreshold` / `HeapMaximumCompactionInterval` Parallel knobs                                                                        |                | 26       | 27                | live                                    | live                                                     | starts, **warns, value ignored**         |
| `-XX:+UseGCOverheadLimit`                                                                                                                                                           | —              | —        | —                 | live, default `true`                    | live, default `true`                                     | live, default `true` in product builds   |

## Rows that need more than a table cell

**CMS.** Deprecated by JEP 291 (JDK 9), removed by JEP 363 (JDK 14) together with ~60
`CMS*` companions, gone from the table in JDK 15. `-XX:CMSInitiatingOccupancyFraction`,
`-XX:+CMSParallelRemarkEnabled` and `-XX:+CMSScavengeBeforeRemark` all fail the same way.
This block appears constantly in JDK-8-era tuning posts, so it is the highest-frequency
cause of "our new base image will not boot".

**`-XX:+UseParallelOldGC` — read the trap.** JEP 366 deprecated the _disabling_ form,
`-XX:-UseParallelOldGC`, which selected ParallelScavenge + SerialOld. `-XX:+UseParallelGC`
remains fully supported and always uses the parallel old collector. A line carrying
`-XX:+UseParallelGC -XX:+UseParallelOldGC` from JDK 8 fails to boot on the _second_ flag
only, which makes the error message look unrelated to the collector choice.

**Biased locking — correct the folklore.** "Biased locking was removed in JDK 15" is wrong
on both counts. JDK 15 (JEP 374) only _disabled and deprecated_ it; the obsolete and expire
dates were then pushed out by two releases, so the flag stayed **accepted through JDK 18**
and disappeared from the table in JDK 19. If someone dates a config by "we removed the
biased-locking flag when we went to 15", the config is younger than they think.

**`-XX:PermSize` / `-XX:MaxPermSize`.** PermGen went in JDK 8, but the flags were kept
obsolete-but-accepted with _no expiry date_ through JDK 16, then dropped from the table in
JDK 17. So the behaviour flipped straight from "warns and ignores" to "refuses to start"
with no deprecation cycle. A container that ran fine on 11 and dies on 17+ with a message
about an unrecognized option is usually this.

**`-XX:+AggressiveOpts` is not `-XX:+AggressiveHeap`.** The first expired in JDK 13. The
second still exists, default `false`, and is deprecated in JDK 26 (obsolete 27, expired
28). Do not report one as the other.

**`-XX:+ZGenerational` — the row that changes three times.** Opt-in product flag defaulting
to `false` in 21 (JEP 439); default flipped to `true` in 23 with non-generational mode
deprecated (JEP 474); non-generational mode removed in 24 (JEP 490) and the flag made
obsolete; in 25 it still **starts and only warns**; in 26 the entry is gone from the table
and no declaration remains, so it is unrecognized. This is the flag most likely to sit in
a 2023-vintage ZGC config, survive a 21→25 upgrade unnoticed because it only warns, and
then break the 25→26 upgrade. The JDK 26 behaviour is derived from the jdk-26-ga source,
not from a release note — report it as "verified against the source; confirm on your build
with `java -XX:+ZGenerational -version`".

**`-XX:LockingMode`.** Values are `0 = LM_MONITOR`, `1 = LM_LEGACY`, `2 = LM_LIGHTWEIGHT`.
Experimental in 21 (needs `-XX:+UnlockExperimentalVMOptions`), product from 22, default
flipped to `LM_LIGHTWEIGHT` in 23, deprecated in 24 alongside JEP 491, obsolete in 26,
expired in 27. On JDK 25 `LM_MONITOR` is rejected at startup on architectures where it is
not fully implemented, 32-bit builds force `LM_LEGACY` up to `LM_LIGHTWEIGHT` with a
warning, and `-XX:+UseCompactObjectHeaders` forces `LM_LIGHTWEIGHT` regardless.
**Any advice to set `-XX:LockingMode=1` to "restore the old locking behaviour" is already
a no-op on 26 and a boot failure on 27.**

**`-XX:+UseGCOverheadLimit` — do not let anyone turn it off.** Live on all three releases,
default `true`. JDK 26 declares the default via the `falseInDebug` macro, which expands to
`true` in product builds, so production behaviour on 26 is unchanged. The policy it
implements (`GCTimeLimit=98`, `GCHeapFreeLimit=2`) throws `OutOfMemoryError` when more than
98% of time is spent in GC and less than 2% of the heap is recovered. Disabling it converts
a fast, diagnosable OOM into an indefinite GC-thrash death spiral, which is a P3 finding
every time it appears.

**Pre-JDK-9 GC logging is a mixed trap.** `-XX:+PrintGC`, `-XX:+PrintGCDetails` and
`-Xloggc:<file>` still exist, warn, and are internally rewritten to unified logging. Their
usual companions — `PrintGCTimeStamps`, `PrintGCDateStamps`, `UseGCLogFileRotation`,
`NumberOfGCLogFiles`, `GCLogFileSize` — have no declaration anywhere in JDK 25 and refuse
to start. So a copied JDK-8 GC-logging block half-works and half-kills the JVM, and the
half that kills it is the rotation configuration.

**`-XX:+ParallelRefProcEnabled` — correct the folklore.** It is **already the ergonomic
default whenever `ParallelGCThreads > 1`**, for both G1 and Parallel. Setting it explicitly
buys nothing today and becomes a deprecation warning on JDK 26. It is one of the most
widely copied G1 flags, so expect it, and report it as P4 with that reason rather than as
harmless.

## `-XX:+UnlockExperimentalVMOptions` is itself a finding

Its presence in a production command line is a P3/P4 finding independent of what it
unlocks:

- it exposes unsupported surface whose meaning changes between releases (`LockingMode` was
  experimental in 21 and product in 22);
- it is routinely left behind after the flag it was unlocking became a product option —
  `-XX:+UseCompactObjectHeaders` no longer needs it as of JDK 25 (JEP 519).

Performance-relevant flags still gated behind it in JDK 25 include `UseEpsilonGC`,
`ReferencesPerThread`, the `WorkStealing*` family, `hashCode`,
`TrustFinalNonStaticFields`, `AlwaysAtomicAccesses`, `UseFastUnorderedTimeStamps`,
`CodeCacheSegmentSize`, `CodeEntryAlignment` and the `StringDeduplication*` table-sizing
flags.
