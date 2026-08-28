# Research brief — JVM flag reality matrix for `jvm-performance-review`

Compiled 2026-08-27. Scope: JDK 21 LTS → JDK 25 LTS, with JDK 26 (GA 2026-03-17) and
JDK 27 (Release Candidate; GA scheduled 2026-09-15) noted where they change the answer.

**Evidence rules used here.** Every claim carries a URL. Where a number exists in a
primary source but the source does not state build/hardware/workload, the number is
quoted _with that gap called out_. Where no source was found, the item is in
§F UNRESOLVED rather than filled from recall.

Primary sources leaned on throughout:

- `src/hotspot/share/runtime/arguments.cpp` — the `special_jvm_flags` table, the
  authoritative record of deprecated/obsolete/expired flags and the exact releases.
- `src/hotspot/share/runtime/globals.hpp` and `src/hotspot/share/gc/shared/gc_globals.hpp`
  — flag existence, default value, and flag kind (product / DIAGNOSTIC / EXPERIMENTAL).
- openjdk.org JEPs.
- The `java`, `jcmd`, `jfr` man pages for JDK 25 on docs.oracle.com.

---

## 0. The mechanism the whole matrix rests on

HotSpot's flag lifecycle has four named states, defined in a comment block directly above
the table. Quoting the source
(<https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp#L505-L513>):

> When the JDK version reaches `deprecated_in` limit, the JVM will process this flag on
> the command-line as usual, but will issue a warning.
> When the JDK version reaches `obsolete_in` limit, the JVM will continue accepting this flag on
> the command-line, while issuing a warning and **ignoring the flag value**.
> Once the JDK version reaches `expired_in` limit, the JVM will **flatly refuse to admit the
> existence of the flag**.

Concretely, what the auditor sees on stderr:

| State                       | Observable behaviour                   | Exact message                                                                                                             | Source                                                                                                                         |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Deprecated**              | Starts, flag still takes effect        | `Option <X> was deprecated in version <V> and will likely be removed in a future release.`                                | [arguments.cpp#L898-L901](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp#L898-L901)     |
| **Obsolete**                | Starts, **flag silently does nothing** | `Ignoring option <X>; support was removed in <V>`                                                                         | [arguments.cpp#L1131-L1135](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp#L1131-L1135) |
| **Expired / never existed** | **JVM refuses to start**               | `Unrecognized VM option '<X>'` (+ a "Did you mean" fuzzy match), then `Error: Could not create the Java Virtual Machine.` | [arguments.cpp#L1163-L1178](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp#L1163-L1178) |

Two consequences that matter for an audit:

1. **Expired ≡ removed from the table.** The source comment mandates
   "All expired options should be removed from the table"
   ([arguments.cpp#L521](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp#L521)).
   So a flag _absent_ from `special_jvm_flags` **and** absent from every `*_globals.hpp`
   is a startup failure, not a warning. That is how CMS, biased locking, `MaxPermSize`
   and `AggressiveOpts` behave on JDK 21/25/26 today.
2. **`-XX:+IgnoreUnrecognizedVMOptions` converts a hard failure into a silent no-op**
   ([arguments.cpp#L1168-L1170](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp#L1168-L1170),
   [#L3414-L3419](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp#L3414-L3419)).
   **Audit rule: if `-XX:+IgnoreUnrecognizedVMOptions` is on the command line, you cannot
   trust that any other flag on that line is taking effect.** This is the single highest-value
   thing to look for in a JVM_OPTS blob, because it is exactly the flag someone adds when a
   copied JDK-8 option started refusing to boot.

---

## A. The obsolete-advice catalogue

All rows verified by reading the `special_jvm_flags` table at each GA tag.

### A.1 Summary table

| Flag                                                                                                                           | Deprecated in                       | Obsolete in                                     | Expired / removed from table | JDK 21                                     | JDK 25                                                                    | JDK 26                                        |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ----------------------------------------------- | ---------------------------- | ------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------------- |
| `-XX:+UseConcMarkSweepGC` (and all `CMS*` flags)                                                                               | 9                                   | 14                                              | 15                           | **refuses to start**                       | refuses to start                                                          | refuses to start                              |
| `-XX:+UseParallelOldGC`                                                                                                        | 14                                  | 15                                              | 16                           | **refuses to start**                       | refuses to start                                                          | refuses to start                              |
| `-XX:+UseBiasedLocking`, `-XX:BiasedLockingStartupDelay`                                                                       | 15                                  | 18                                              | 19                           | **refuses to start**                       | refuses to start                                                          | refuses to start                              |
| `-XX:PermSize`, `-XX:MaxPermSize`                                                                                              | —                                   | 8                                               | removed from table in 17     | **refuses to start**                       | refuses to start                                                          | refuses to start                              |
| `-XX:+AggressiveOpts`                                                                                                          | 11                                  | 12                                              | 13                           | **refuses to start**                       | refuses to start                                                          | refuses to start                              |
| `-XX:+ZGenerational`                                                                                                           | 23                                  | 24                                              | removed from table in 26     | product flag, **default `false`**          | starts, **warns, value ignored**                                          | **refuses to start**                          |
| `-XX:LockingMode=n`                                                                                                            | 24                                  | 26                                              | 27                           | EXPERIMENTAL flag, default `LM_LEGACY` (1) | starts, warns (deprecated), still effective; default `LM_LIGHTWEIGHT` (2) | starts, **warns, value ignored**              |
| `-XX:+UseGCOverheadLimit`                                                                                                      | —                                   | —                                               | —                            | exists, default `true`                     | exists, default `true`                                                    | exists, default `true` in product builds      |
| `-XX:+PrintGCDetails` / `-XX:+PrintGC`                                                                                         | (soft-deprecated in flag help only) | —                                               | —                            | exists, warns, maps to `-Xlog:gc*`         | same                                                                      | same                                          |
| `-Xloggc:<file>`                                                                                                               | —                                   | —                                               | —                            | exists, warns, maps to `-Xlog:gc:<file>`   | same                                                                      | same                                          |
| `-XX:+PrintGCTimeStamps`, `-XX:+PrintGCDateStamps`, `-XX:+UseGCLogFileRotation`, `-XX:NumberOfGCLogFiles`, `-XX:GCLogFileSize` | removed in 9                        |                                                 |                              | **refuses to start**                       | refuses to start                                                          | refuses to start                              |
| `-XX:+UseParNewGC`                                                                                                             |                                     | removed in 10                                   |                              | **refuses to start**                       | refuses to start                                                          | refuses to start                              |
| `-XX:+UseCGroupMemoryLimitForHeap`                                                                                             |                                     | removed in 11                                   |                              | **refuses to start**                       | refuses to start                                                          | refuses to start                              |
| `-Xverify:none` / `-noverify`                                                                                                  | 13                                  | —                                               | —                            | starts, warns                              | starts, warns                                                             | starts, warns                                 |
| `-Xdebug`                                                                                                                      | 22                                  | —                                               | —                            | accepted silently                          | starts, warns                                                             | starts, warns                                 |
| `-XX:+UseContainerCpuShares`, `-XX:+PreferContainerQuotaForCPUCount`                                                           | 19                                  | 20                                              | 21                           | **refuses to start**                       | refuses to start                                                          | refuses to start                              |
| `-XX:+UseCompressedClassPointers`                                                                                              | 25                                  | 26 (JDK 25 table said 26; JDK 26 table says 27) | —                            | exists, default `true`                     | starts, **warns (deprecated)**, still effective                           | starts, warns; obsolete_in=27 in the 26 table |

### A.2 Row-by-row provenance

**CMS — `-XX:+UseConcMarkSweepGC`.**
Deprecated in JDK 9 by [JEP 291](https://openjdk.org/jeps/291) (Status: Delivered, Release 9);
the JDK 11 table records `{ "UseConcMarkSweepGC", JDK_Version::jdk(9), undefined, undefined }`
([jdk-11+28 arguments.cpp#L528](https://github.com/openjdk/jdk/blob/jdk-11%2B28/src/hotspot/share/runtime/arguments.cpp#L528)).
Removed in JDK 14 by [JEP 363](https://openjdk.org/jeps/363) (Delivered, Release 14); the JDK 14
table moves it plus ~60 `CMS*` flags to `{ undefined, jdk(14), jdk(15) }`
([jdk-14+36 arguments.cpp#L548-L607](https://github.com/openjdk/jdk/blob/jdk-14%2B36/src/hotspot/share/runtime/arguments.cpp#L548-L607)).
By JDK 15 they are gone from the table entirely
([jdk-15+36 arguments.cpp](https://github.com/openjdk/jdk/blob/jdk-15%2B36/src/hotspot/share/runtime/arguments.cpp) — no `UseConcMarkSweepGC` entry).
**Therefore on JDK 21/25/26 the flag is unrecognized and the JVM will not start.** Same for
`-XX:CMSInitiatingOccupancyFraction`, `-XX:+CMSParallelRemarkEnabled`, `-XX:+CMSScavengeBeforeRemark`
and every other `CMS*` option — these appear constantly in JDK-8-era tuning posts.

**`-XX:+UseParallelOldGC`.**
Deprecated in JDK 14 by [JEP 366](https://openjdk.org/jeps/366) ("Deprecate the ParallelScavenge +
SerialOld GC Combination", Delivered, Release 14). Table entry at JDK 14/15:
`{ "UseParallelOldGC", jdk(14), jdk(15), jdk(16) }`
([jdk-15+36 arguments.cpp#L555](https://github.com/openjdk/jdk/blob/jdk-15%2B36/src/hotspot/share/runtime/arguments.cpp#L555)).
Absent from the JDK 16 table onward. **JDK 21/25/26: unrecognized, refuses to start.**
Note the trap: what JEP 366 deprecated was `-XX:-UseParallelOldGC` (the _disabling_ form,
selecting the ParallelScavenge+SerialOld combination). `-XX:+UseParallelGC` remains fully
supported and always uses the parallel old collector; someone carrying
`-XX:+UseParallelGC -XX:+UseParallelOldGC` from JDK 8 will fail to boot for the second flag.

**Biased locking — `-XX:+UseBiasedLocking`, `-XX:BiasedLockingStartupDelay`.**
Deprecated and disabled by default in JDK 15 via [JEP 374](https://openjdk.org/jeps/374)
("Deprecate and Disable Biased Locking", Delivered, Release 15). The table at JDK 15 read
`{ jdk(15), jdk(16), jdk(17) }`
([jdk-15+36#L528-L529](https://github.com/openjdk/jdk/blob/jdk-15%2B36/src/hotspot/share/runtime/arguments.cpp#L528-L529)),
but the obsolete/expire dates were **pushed out by two releases** — JDK 16, 17 and 18 all
record `{ jdk(15), jdk(18), jdk(19) }`
([jdk-18+37#L551-L552](https://github.com/openjdk/jdk/blob/jdk-18%2B37/src/hotspot/share/runtime/arguments.cpp#L551-L552)).
Gone from the JDK 19 table. **JDK 21/25/26: unrecognized, refuses to start.**
This matters because the widely repeated "biased locking was removed in JDK 15" is wrong on
both counts: JDK 15 only _disabled and deprecated_ it, and the flag stayed _accepted_ through
JDK 18.

**`-XX:PermSize` / `-XX:MaxPermSize`.**
PermGen itself was removed in JDK 8 (JEP 122). The flags were kept as obsolete-but-accepted
for an unusually long time: `{ undefined, jdk(8), undefined }` — i.e. obsolete with **no
expiry date** — surviving in the table through JDK 16
([jdk-16+36#L540-L541](https://github.com/openjdk/jdk/blob/jdk-16%2B36/src/hotspot/share/runtime/arguments.cpp#L540-L541)).
They were dropped from the table in JDK 17 (no `PermSize` match in
[jdk-17+35 arguments.cpp](https://github.com/openjdk/jdk/blob/jdk-17%2B35/src/hotspot/share/runtime/arguments.cpp)).
So the behaviour flipped from "warns and ignores" (JDK 8–16) to "refuses to start" (JDK 17+)
with no deprecation cycle in between. **JDK 21/25/26: refuses to start.**

**`-XX:+AggressiveOpts`.**
`{ "AggressiveOpts", jdk(11), jdk(12), jdk(13) }`
([jdk-11+28#L541](https://github.com/openjdk/jdk/blob/jdk-11%2B28/src/hotspot/share/runtime/arguments.cpp#L541)).
**JDK 21/25/26: unrecognized, refuses to start.**
Distinguish it from `-XX:+AggressiveHeap`, which is a _different_ flag that still exists —
default `false`, deprecated in **JDK 26**
([jdk-26-ga arguments.cpp#L545](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/runtime/arguments.cpp#L545),
[jdk-26-ga gc_globals.hpp#L276-L278](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/gc/shared/gc_globals.hpp#L276-L278)),
scheduled obsolete in 27 and expired in 28.

**`-XX:+ZGenerational` — the one that changes behaviour three times.**

| Release | State                                                                                                                                                | Source                                                                                                                                                                                                                                                                                 |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 21      | Product flag, **default `false`**. Generational ZGC shipped as opt-in by [JEP 439](https://openjdk.org/jeps/439) (Delivered, Release 21).            | [jdk-21-ga gc_globals.hpp#L128-L129](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/hotspot/share/gc/shared/gc_globals.hpp#L128-L129)                                                                                                                                               |
| 23      | Default flipped to `true`; non-generational mode deprecated by [JEP 474](https://openjdk.org/jeps/474) (Delivered, Release 23).                      | [jdk-23+37 gc_globals.hpp#L121-L122](https://github.com/openjdk/jdk/blob/jdk-23%2B37/src/hotspot/share/gc/shared/gc_globals.hpp#L121-L122)                                                                                                                                             |
| 24      | Non-generational mode removed by [JEP 490](https://openjdk.org/jeps/490) (Delivered, Release 24); flag becomes **obsolete**.                         | table entry `{ "ZGenerational", jdk(23), jdk(24), undefined }`                                                                                                                                                                                                                         |
| 25      | Still obsolete: **starts, prints `Ignoring option ZGenerational; support was removed in 24.0`, has no effect.**                                      | [jdk-25-ga arguments.cpp#L546](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp#L546)                                                                                                                                                             |
| 26      | Entry **deleted** from `special_jvm_flags`, and no declaration remains in `gc_globals.hpp` or `z_globals.hpp` ⇒ **unrecognized ⇒ refuses to start.** | [jdk-26-ga arguments.cpp#L528-L582](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/runtime/arguments.cpp#L528-L582) (no entry); [jdk-26-ga gc_globals.hpp](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/gc/shared/gc_globals.hpp) (no declaration) |

This is the flag most likely to be sitting in a 2023-vintage ZGC config and to survive a
21→25 upgrade unnoticed (it only warns) and then **break the 25→26 upgrade**.
See §F for the one caveat on the JDK 26 claim.

**`-XX:LockingMode` — values, defaults, support.**
Values, from the flag's own help text:
`0 = LM_MONITOR` (monitors only), `1 = LM_LEGACY` (monitors + legacy stack-locking),
`2 = LM_LIGHTWEIGHT` (monitors + new lightweight locking).

| Release | Flag kind                                                                                            | Default                  | Notes                                                                                                                                     | Source                                                                                                                                                                                                                                                       |
| ------- | ---------------------------------------------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 21      | `EXPERIMENTAL` — needs `-XX:+UnlockExperimentalVMOptions`                                            | `LM_LEGACY` (1)          |                                                                                                                                           | [jdk-21-ga globals.hpp#L1973-L1978](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/hotspot/share/runtime/globals.hpp#L1973-L1978)                                                                                                                         |
| 22      | product                                                                                              | `LM_LEGACY` (1)          |                                                                                                                                           | [jdk-22+36 globals.hpp#L1988-L1993](https://github.com/openjdk/jdk/blob/jdk-22%2B36/src/hotspot/share/runtime/globals.hpp#L1988-L1993)                                                                                                                       |
| 23      | product                                                                                              | **`LM_LIGHTWEIGHT` (2)** |                                                                                                                                           | [jdk-23+37 globals.hpp#L1963-L1968](https://github.com/openjdk/jdk/blob/jdk-23%2B37/src/hotspot/share/runtime/globals.hpp#L1963-L1968)                                                                                                                       |
| 24      | product, marked `(Deprecated)`; `LM_MONITOR` and `LM_LEGACY` each individually marked `(Deprecated)` | `LM_LIGHTWEIGHT` (2)     | Deprecation lands with [JEP 491](https://openjdk.org/jeps/491) (virtual threads no longer pinned by `synchronized`), Delivered Release 24 | [jdk-24+36 globals.hpp#L1944-L1949](https://github.com/openjdk/jdk/blob/jdk-24%2B36/src/hotspot/share/runtime/globals.hpp#L1944-L1949)                                                                                                                       |
| 25      | same as 24                                                                                           | `LM_LIGHTWEIGHT`         | table: `{ jdk(24), jdk(26), jdk(27) }`                                                                                                    | [jdk-25-ga arguments.cpp#L535](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp#L535)                                                                                                                                   |
| 26      | **obsolete** — accepted, warned, value ignored; declaration gone from `globals.hpp`                  | n/a                      | expires in 27                                                                                                                             | [jdk-26-ga arguments.cpp#L537](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/runtime/arguments.cpp#L537); no `LockingMode` in [jdk-26-ga globals.hpp](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/runtime/globals.hpp) |
| 27      | **expired** ⇒ will refuse to start                                                                   |                          |                                                                                                                                           | same table entry, `expired_in = 27`                                                                                                                                                                                                                          |

Which values are still supported: on JDK 25, all three parse, but `LM_MONITOR` is rejected
at startup on architectures where it is not fully implemented
([jdk-25-ga arguments.cpp#L1854-L1860](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp#L1854-L1860)),
and on 32-bit builds `LM_LEGACY` is force-upgraded to `LM_LIGHTWEIGHT` with a warning
([#L1839-L1846](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp#L1839-L1846)).
Also on JDK 25, enabling `-XX:+UseCompactObjectHeaders` forces `LockingMode=LM_LIGHTWEIGHT`
([#L3773-L3775](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp#L3773-L3775)).
From JDK 26 the flag is inert; from JDK 27 it is fatal. **Any advice to set `-XX:LockingMode=1`
to "restore old locking behaviour" is already a no-op on 26 and a boot failure on 27.**

**`-XX:+UseGCOverheadLimit` and friends.**
Still a real product flag on all three releases. JDK 21/25 default `true`
([jdk-25-ga gc_globals.hpp#L417-L428](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/shared/gc_globals.hpp#L417-L428)).
JDK 26 changes the declared default to the macro `falseInDebug`
([jdk-26-ga gc_globals.hpp#L362](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/gc/shared/gc_globals.hpp#L362)) —
and `falseInDebug` expands to `true` in non-ASSERT (product) builds
([globals_shared.hpp#L45-L53](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/runtime/globals_shared.hpp#L45-L53)),
so **production behaviour on JDK 26 is unchanged: still on**. The policy it implements
(`GCTimeLimit=98`, `GCHeapFreeLimit=2`) is documented in the JDK 25 `java` man page:
throws `OutOfMemoryError` if >98% of time is in GC and <2% of the heap is recovered
(<https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html>, `-XX:+UseGCOverheadLimit`).
Turning it _off_ is a classic mistake: it converts a fast, diagnosable OOM into an
indefinite GC-thrash death spiral.

**Pre-JDK-9 GC logging.**
`-XX:+PrintGC` and `-XX:+PrintGCDetails` still exist as product flags in JDK 21/25/26 with
help text "Deprecated, use `-Xlog:gc`/`-Xlog:gc*` instead"
([jdk-26-ga gc_globals.hpp#L429-L436](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/gc/shared/gc_globals.hpp#L429-L436)).
They start the JVM, emit `-XX:+PrintGCDetails is deprecated. Will use -Xlog:gc* instead.`
via the `gc` log tag, and are internally rewritten to unified logging
([jdk-25-ga arguments.cpp#L3447-L3466](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp#L3447-L3466)).
`-Xloggc:<file>` behaves the same way
([#L2594-L2598](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp#L2594-L2598)).
But the _companions_ people copy alongside them — `PrintGCTimeStamps`, `PrintGCDateStamps`,
`UseGCLogFileRotation`, `NumberOfGCLogFiles`, `GCLogFileSize` — have **no declaration anywhere
in JDK 25** (verified: no match in `gc_globals.hpp`, `globals.hpp`, or `arguments.cpp` at
jdk-25-ga) and therefore refuse to start. A JDK-8 GC-logging block is one of the most reliable
ways to make a modern JVM fail to boot.

**Experimental-gated flags relevant to performance (JDK 25).**
`-XX:+UnlockExperimentalVMOptions` is itself an `EXPERIMENTAL` flag, default `false`
([jdk-25-ga globals.hpp#L180](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/globals.hpp#L180)).
Performance-relevant flags behind it in JDK 25:
`UseEpsilonGC` ([gc_globals.hpp#L115](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/shared/gc_globals.hpp#L115)),
`ReferencesPerThread` (#L207), the `WorkStealing*` family (#L247-257),
`hashCode` ([globals.hpp#L766](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/globals.hpp#L766)),
`TrustFinalNonStaticFields` (#L1783), `AlwaysAtomicAccesses` (#L1869),
`UseFastUnorderedTimeStamps` (#L1945), `CodeCacheSegmentSize` / `CodeEntryAlignment` (#L1504, #L1510),
`StringDeduplication*` table-sizing flags (#L1837-1856).
Audit rule: `-XX:+UnlockExperimentalVMOptions` in a production command line is a finding in
itself — it is unsupported surface, it changes meaning between releases (`LockingMode` was
experimental in 21 and product in 22), and it is frequently left behind after the flag it was
unlocking became a product option (e.g. `UseCompactObjectHeaders`, which per
[JEP 519](https://openjdk.org/jeps/519) no longer needs it as of JDK 25).

**Other commonly-copied JDK-8-era flags that are now fatal.** Verified absent from JDK 25
`globals.hpp`/`gc_globals.hpp`/`arguments.cpp`: `-XX:+UseParNewGC` (removed JDK 10),
`-XX:+UseCGroupMemoryLimitForHeap` (removed JDK 11 — superseded by `UseContainerSupport`),
`-XX:+UseAutoGCSelectPolicy`, `-XX:+UseFastAccessorMethods`, `-XX:+UseSplitVerifier`.
Also expired: `-XX:+UseContainerCpuShares` and `-XX:+PreferContainerQuotaForCPUCount`
(`{ jdk(19), jdk(20), jdk(21) }`,
[jdk-20+36 arguments.cpp#L552-L553](https://github.com/openjdk/jdk/blob/jdk-20%2B36/src/hotspot/share/runtime/arguments.cpp#L552-L553)) —
so any container-CPU tuning advice mentioning cpu **shares** is dead on JDK 21+.

**Two forward-looking rows an auditor should already flag (JDK 26 deprecations):**
`ParallelRefProcEnabled`, `ParallelRefProcBalancingEnabled`, `PSChunkLargeArrays`, `MaxRAM`,
`AggressiveHeap`, `NeverActAsServerClassMachine`, `AlwaysActAsServerClassMachine` are all
`{ jdk(26), jdk(27), jdk(28) }`
([jdk-26-ga arguments.cpp#L541-L547](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/runtime/arguments.cpp#L541-L547)).
`-XX:+ParallelRefProcEnabled` in particular is an extremely widely copied G1 flag — it is
**already the ergonomic default** whenever `ParallelGCThreads > 1`
([jdk-25-ga g1Arguments.cpp#L225-L227](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/g1/g1Arguments.cpp#L225-L227),
same in `parallelArguments.cpp#L94-L96`), so setting it explicitly buys nothing today and
becomes a warning on JDK 26.
JDK 26 also obsoletes ~18 `AdaptiveSize*` / `Tenured*` / `PretenureSizeThreshold` /
`HeapMaximumCompactionInterval` Parallel-GC tuning knobs
([jdk-26-ga arguments.cpp#L563-L581](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/runtime/arguments.cpp#L563-L581)) —
these accept-and-ignore on 26 and expire in 27.

---

## B. Flags that exist but are near-always a mistake in production

Format for each: **what it spends / what it buys / what measurement proves it helped.**
Where the evidence is weak, that is stated.

### B.1 `-XX:TieredStopAtLevel=1` in a long-running server

**Mechanism (sourced).** HotSpot's compilation levels are
`0 = interpreter`, `1 = C1 (simple, no profiling)`, `2 = C1 + invocation/backedge counters`,
`3 = C1 + counters + MDO`, `4 = C2 or JVMCI`
([jdk-25-ga compilerDefinitions.hpp#L56-L63](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/compiler/compilerDefinitions.hpp#L56-L63)).
`TieredStopAtLevel=1` therefore means: **C2 never runs, and C1 does not even collect profiles.**
Every method is capped at unprofiled C1 code for the life of the process.

**Spends:** peak throughput permanently — no inlining decisions from profile data, no escape
analysis, no loop optimisations, no C2 intrinsics beyond what C1 emits.
**Buys:** faster time-to-first-request and lower compiler CPU/memory during startup. It also
shrinks the default code cache: `ReservedCodeCacheSize` is 240 MB with tiered compilation and
48 MB without (<https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html>,
`-XX:ReservedCodeCacheSize`).

**Honesty note:** `-XX:TieredStopAtLevel` is **not documented in the JDK 25 `java` man page** at
all — it appears only in the list of flags that suppress "Client VM emulation" mode. There is
no OpenJDK-published benchmark quantifying the throughput loss. I found no primary source with
a number; see §F. Treat this as a mechanism-level finding, not a number-level one.

**Measurement that would prove it helped:** a before/after of (a) time from process start to
first successful request, and (b) steady-state throughput and p99 after ≥10 minutes of the
production request mix, on the same hardware. If only (a) was measured, the change is unproven.
If the goal is startup and the process is long-lived, the JDK-25-native answer is the AOT cache
([JEP 483](https://openjdk.org/jeps/483)) or CDS, not disabling C2.

### B.2 `-Xmx` set equal to the container memory limit

**Spends:** the entire non-heap budget. The JVM's RSS is heap **plus** metaspace, code cache,
GC control structures, thread stacks, direct byte buffers, JIT compiler arenas, symbol/string
tables, and the C library's malloc arenas — all of which are outside `-Xmx` (the full list is
the NMT category set: `Java Heap, Class, Thread, Thread Stack, Code, GC, GCCardSet, Compiler,
JVMCI, Internal, Other, Symbol, Native Memory Tracking, Shared class space, Arena Chunk,
Tracing, Logging, Statistics, Arguments, Module, Safepoint, Synchronization, Serviceability,
Metaspace, String Deduplication, Object Monitors` —
[jdk-25-ga memTag.hpp#L32-L61](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/nmt/memTag.hpp#L32-L61)).
**Buys:** nothing. The kernel OOM-kills the container; the JVM never gets a chance to throw
`OutOfMemoryError` or write a heap dump.
**Measurement that would prove a heap number is right:** `jcmd <pid> VM.native_memory summary`
(with `-XX:NativeMemoryTracking=summary` set at startup) taken at steady state, giving the
actual non-heap committed total, plus the peak heap-after-full-GC from the GC log. Headroom =
observed non-heap committed + margin. Without an NMT summary, any `-Xmx` in a container is a guess.

### B.3 `-XX:MaxRAMPercentage` pushed to 90+

Same non-heap argument as B.2, plus a **second, non-obvious effect specific to this flag**:

Setting `MaxRAMPercentage` (or `MinRAMPercentage`, `InitialRAMPercentage`, `MaxRAM`) sets
`override_coop_limit = true` in `Arguments::set_heap_size`. When that is set and the resulting
heap exceeds the compressed-oops range, the JVM **disables compressed oops** instead of
capping the heap:

```
if (reasonable_max > max_coop_heap) {
  if (FLAG_IS_ERGO(UseCompressedOops) && override_coop_limit) {
    ... "UseCompressedOops and UseCompressedClassPointers have been disabled due to
         max heap ... Please check the setting of MaxRAMPercentage ..."
    FLAG_SET_ERGO(UseCompressedOops, false);
  } else {
    reasonable_max = MIN2(reasonable_max, max_coop_heap);   // default path: cap instead
  }
}
```

([jdk-25-ga arguments.cpp#L1520-L1546](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp#L1520-L1546);
confirmed by the man page: "Specifying this option disables automatic use of compressed oops
if the combined result … is larger than the range of memory addressable by compressed oops",
<https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html>, `-XX:MaxRAMPercentage`).

So on a large machine, `-XX:MaxRAMPercentage=90` can silently turn 32-bit references into
64-bit ones, **increasing** live-set size. The message is logged under the `aot` log tag in
JDK 25, so it is easy to miss.
**Measurement:** `jfr view heap-configuration` reports `usesCompressedOops` and
`compressedOopsMode` from the `jdk.GCHeapConfiguration` event
([view.ini `jvm.heap-configuration`](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/jdk.jfr/share/classes/jdk/jfr/internal/query/view.ini)),
or `jcmd <pid> VM.flags` / `-Xlog:gc+heap+coops=info`. Any `MaxRAMPercentage` above ~50 on a
host with >64 GB should be checked against that field.

### B.4 `-XX:+UseNUMA` set without a NUMA topology — **the common advice is wrong**

On Linux the JVM **self-disables** NUMA support when the topology does not warrant it:

```
if (!Linux::libnuma_init())                    disable_numa("Failed to initialize libnuma", true);
else if (Linux::numa_max_node() < 1)           disable_numa("Only a single NUMA node is available", false);
else if (Linux::is_bound_to_single_mem_node()) disable_numa("The process is bound to a single NUMA node", true);
else if (Linux::mem_and_cpu_node_mismatch())   disable_numa("The process memory and cpu node configuration does not match", true);
```

([jdk-25-ga os_linux.cpp#L4463-L4473](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/os/linux/os_linux.cpp#L4463-L4473)),
with `disable_numa` doing `FLAG_SET_ERGO(UseNUMA, false); FLAG_SET_ERGO(UseNUMAInterleaving, false);`
and logging only if the user asked for NUMA explicitly (#L4514-L4527).

So in a single-node container, `-XX:+UseNUMA` is a **no-op, not a hazard**. Two real caveats:

1. If NUMA survives, the JVM also turns on `UseNUMAInterleaving` by default (#L4497-L4499),
   which _does_ change allocation policy for non-NUMA-aware allocations.
2. With ParallelGC + `UseNUMA` + `UseLargePages` on a platform that cannot commit large pages,
   the JVM disables `UseAdaptiveSizePolicy` and `UseAdaptiveNUMAChunkSizing` with a warning
   (#L4501-L4512) — a genuine, silent behaviour change.
3. **ZGC turns `UseNUMA` on by default already**, on JDK 21, 24, 25 and 26
   ([jdk-25-ga zArguments.cpp#L124-L129](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/z/zArguments.cpp#L124-L129);
   [jdk-21-ga zArguments.cpp#L117-L120](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/hotspot/share/gc/z/zArguments.cpp#L117-L120)),
   so writing `-XX:+UseNUMA` next to `-XX:+UseZGC` is pure noise.

**Measurement:** `-Xlog:os=info` prints
`UseNUMA is enabled and invoked in '<membind|interleave>' mode. Heap will be configured using
NUMA memory nodes: …` when it takes effect (#L4485-L4492), and `NUMA support disabled: <reason>`
when it does not. That one log line settles the question.

### B.5 `-XX:+AlwaysPreTouch`

**What it does (sourced).** "Requests the VM to touch every page on the Java heap after
requesting it from the operating system and before handing memory out to the application.
By default, this option is disabled and all pages are committed as the application uses the
heap space." (<https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html>).
Implementation: `os::pretouch_memory` writes one relaxed atomic zero-add per page
([jdk-25-ga os.cpp#L2322-L2344](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/os.cpp#L2322-L2344)),
invoked from `virtualspace.cpp` on _expansion_
([#L188-L199](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/memory/virtualspace.cpp#L188-L199))
and parallelised across GC workers by `PretouchTask`
([pretouchTask.cpp#L60-L85](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/shared/pretouchTask.cpp#L60-L85),
chunk size from `PreTouchParallelChunkSize`).

**Spends:** wall-clock at startup and RSS immediately equal to the committed heap. Because the
pretouch hangs off _commit_, the startup cost scales with the **initially committed heap
(`-Xms` / `InitialHeapSize`), not `-Xmx`** — and it recurs on every heap expansion.
**Buys:** removes first-touch page-fault latency (and, with `-XX:+UseTransparentHugePages`,
khugepaged stalls) from the application's critical path, moving it into startup.
**When it is actively wrong:** with `-Xms` ≪ `-Xmx` it does not do what people think — the
heap is still pretouched incrementally as it grows, i.e. during traffic. Its useful form is
`-Xms == -Xmx` plus `AlwaysPreTouch`. In a container it also means the pod's RSS jumps to the
full heap at startup, which interacts badly with a memory request set from observed steady-state RSS.

**Measurement that would prove it helped:** p99 during the first N minutes after deploy,
compared with and without, on the same `-Xms`/`-Xmx`; plus startup-to-ready time to price the
cost. No OpenJDK-published number exists for the pretouch throughput; do not quote one.

### B.6 Explicit `-XX:ParallelGCThreads` / `-XX:ConcGCThreads` without a measurement

The ergonomic defaults are well-defined and CPU-count-aware; overriding them without data
usually just breaks the CPU-count coupling. Rules, from source:

- **Parallel and G1 — `ParallelGCThreads`:**
  `ncpus` if `ncpus ≤ 8`, else `8 + (ncpus − 8) × 5/8`, where `ncpus =
os::initial_active_processor_count()`
  ([jdk-25-ga workerPolicy.cpp#L14-L46](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/shared/workerPolicy.cpp),
  `nof_parallel_worker_threads(5, den, 8)`; the denominator comes from
  `VM_Version::parallel_worker_threads_denominator()`).
- **G1 — `ConcGCThreads`:** `max((ParallelGCThreads + 2) / 4, 1)`
  ([jdk-25-ga g1Arguments.cpp#L121-L123, #L189-L194](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/g1/g1Arguments.cpp#L121-L123)).
  G1 also sets `G1ConcRefinementThreads = ParallelGCThreads` (#L186).
- **ZGC — `ParallelGCThreads`:** `max(min(ceil(ncpus × 0.60), heap-derived cap), 1)`;
  **`ConcGCThreads`:** `max(min(ceil(ncpus × 0.25), heap-derived cap), 1)`, where the cap keeps
  workers from using >2% of the max heap during relocation
  ([jdk-25-ga zHeuristics.cpp#L74-L105](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/z/zHeuristics.cpp#L74-L105)).
- `UseDynamicNumberOfGCThreads` defaults to `true`
  ([gc_globals.hpp#L130](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/shared/gc_globals.hpp#L130)),
  so `ParallelGCThreads` is a _maximum_, not a fixed count — the JVM already scales down at runtime.
- Setting either to `0` is a hard startup failure for G1 and ZGC
  (`"The flag -XX:+UseG1GC can not be combined with -XX:ParallelGCThreads=0"`, g1Arguments.cpp#L167-L170;
  equivalents in zArguments.cpp#L60-L62 and #L104-L106).

**Spends:** if set too low, longer pauses and (for G1/ZGC) a concurrent cycle that can lose the
race with allocation → to-space exhaustion / allocation stalls. If set too high, GC threads
compete with application threads for a CFS quota.
**Buys:** only meaningful when the container's CPU quota is _not_ what the JVM detects, and
even then `-XX:ActiveProcessorCount` is the correct lever, because it fixes GC threads, JIT
compiler threads, `ForkJoinPool.commonPool` and the virtual-thread scheduler in one place
(<https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html>, `-XX:ActiveProcessorCount`).
**Measurement:** GC pause distribution before/after (`jfr view gc-pauses`, which reports
min/median/avg/P90/P95/P99/P99.9/max over `jdk.GCPhasePause`) **and** GC CPU time
(`jfr view gc-cpu-time`, over `jdk.GCCPUTime`: user/system/real). Changing thread counts
without both numbers cannot be evaluated — you have traded pause time against CPU and measured
only one side.

### B.7 `-XX:+DisableExplicitGC` vs `-XX:+ExplicitGCInvokesConcurrent`

Both default `false`
([jdk-25-ga gc_globals.hpp#L154-L156, #L485-L486](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/shared/gc_globals.hpp#L154)).

**What `DisableExplicitGC` breaks — direct byte buffer reclamation.** This is provable from
the JDK source, not folklore. `java.nio.Bits.reserveMemory` is the allocation path for every
`ByteBuffer.allocateDirect`. When the `MaxDirectMemorySize` budget is exhausted it:

1. waits for reference processing, retrying;
2. **calls `System.gc()`** — the comment is literally `// trigger VM's Reference processing`;
3. enters an exponential-backoff retry loop;
4. throws `OutOfMemoryError("Cannot reserve N bytes of direct buffer memory …")`.
   ([jdk-25-ga Bits.java, `reserveMemory`](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/share/classes/java/nio/Bits.java))

With `-XX:+DisableExplicitGC` (`"Ignore calls to System.gc()"`), step 2 does nothing, so any
workload whose direct-buffer high-water mark approaches `MaxDirectMemorySize` — Netty without
pooled/unpooled tuning, NIO file channels, some JDBC and Kafka clients — will throw
`OutOfMemoryError: Direct buffer memory` under load that would previously have recovered.

**`ExplicitGCInvokesConcurrent` is the correct lever** when the problem is that a library's
`System.gc()` causes a stop-the-world full GC: it turns the request into a concurrent
collection instead of suppressing it. The man page scopes it to G1
("can be enabled only with the `-XX:+UseG1GC` option",
<https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html>); the flag help says
"effective only when using concurrent collectors".

**Measurement that identifies the actual culprit before touching either flag:**
`jfr view blocked-by-system-gc`, which is defined as
`SELECT startTime, duration, stackTrace FROM SystemGC WHERE invokedConcurrent = 'false'
ORDER BY duration DESC LIMIT 25`
([view.ini `jvm.blocked-by-system-gc`](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/jdk.jfr/share/classes/jdk/jfr/internal/query/view.ini)).
`jdk.SystemGC` is enabled in **both** `default.jfc` and `profile.jfc`
([default.jfc](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/jdk.jfr/share/conf/jfr/default.jfc)),
so this costs nothing extra. It gives you the _stack trace of the caller_. That view is new in
JDK 25 (absent from the JDK 21 `view.ini`); on JDK 21 query the `jdk.SystemGC` event directly.
**If nobody has produced that stack trace, `-XX:+DisableExplicitGC` is not a supportable
recommendation** — you are suppressing a symptom whose source you have not identified, and the
source may be `Bits.reserveMemory` itself.

### B.8 `-Xss` changed to fix a `StackOverflowError`

**Defaults** (<https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html>, `-Xss`,
cross-checked against `os_cpu/*/globals_*.hpp`):
Linux/x64 1024 KB, Linux/AArch64 2048 KB, macOS/x64 1024 KB, macOS/AArch64 2048 KB,
Windows "depends on virtual memory" (`ThreadStackSize` is `define_pd_global(intx, ThreadStackSize, 0)`
on Windows, i.e. use the system default —
[jdk-25-ga globals_windows_x86.hpp#L35](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/os_cpu/windows_x86/globals_windows_x86.hpp#L35);
Linux/x64 is `1024`, Linux/AArch64 `2040`).

**Spends:** the increase is _per platform thread_, and it is reserved address space that
becomes RSS as the stack is touched. It is charged to the NMT `Thread Stack` category, i.e.
**outside `-Xmx`** — so raising `-Xss` in a memory-limited container moves the failure from
`StackOverflowError` to OOMKill.
**Buys:** deeper recursion. That is all.
**The correctness objection:** a `StackOverflowError` in a server almost always means unbounded
recursion or a pathological framework proxy/interceptor chain. Raising `-Xss` converts a fast,
localised failure into a slower one at a larger depth.
**Virtual-thread wrinkle (JDK 21+):** virtual thread stacks are _not_ platform stacks —
"The stacks of virtual threads are stored in Java's garbage-collected heap as stack chunk
objects. The stacks grow and shrink as the application runs … to accommodate stacks of depth up
to the JVM's configured platform thread stack size."
([JEP 444](https://openjdk.org/jeps/444)). So `-Xss` bounds virtual-thread depth but the memory
comes out of the _heap_, not thread stacks. JEP 444 additionally states: "A current limitation
of virtual threads is that the G1 GC does not support humongous stack chunk objects. If a
virtual thread's stack reaches half the region size, which could be as small as 512 KB, then a
`StackOverflowError` might be thrown." — i.e. on G1, raising `-Xss` may not actually raise the
achievable virtual-thread depth. (Whether that limitation still holds on JDK 25 is **UNRESOLVED**, §F.)
**Measurement:** the actual stack trace at the point of overflow — depth and the repeating
frame cycle. `-XX:MaxJavaStackTraceDepth=0` (unlimited) or a heap dump of the failing thread.
If the trace shows a repeating frame, `-Xss` is the wrong fix regardless of the value.

---

## C. Current defaults an auditor must know

### C.1 Collector selected by ergonomics — the server-class-machine rule

Identical code in JDK 21, 25 and 26. When no collector flag is given:

```
if (os::is_server_class_machine())  →  G1        (UseG1GC)
else                                →  Serial    (UseSerialGC)
```

([jdk-25-ga gcConfig.cpp `select_gc_ergonomically`](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/shared/gcConfig.cpp);
byte-identical in [jdk-21-ga](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/hotspot/share/gc/shared/gcConfig.cpp)
and [jdk-26-ga](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/gc/shared/gcConfig.cpp)).

`os::is_server_class_machine()`
([jdk-25-ga os.cpp#L1927-L1962](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/os.cpp#L1927-L1962);
same logic at [jdk-21-ga os.cpp#L1710-L1743](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/hotspot/share/runtime/os.cpp#L1710-L1743)
and [jdk-26-ga os.cpp#L1929-L1962](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/runtime/os.cpp#L1929-L1962)):

1. `-XX:+NeverActAsServerClassMachine` → `false` (short-circuit). `-XX:+AlwaysActAsServerClassMachine` → `true`.
2. Otherwise, **both** must hold:
   - `os::active_processor_count() >= 2`, **and**
   - `os::physical_memory() >= 2 GB − 256 MB = 1792 MB`.
3. Additionally, on platforms where `VM_Version::logical_processors_per_package() > 1` (x86 with
   hyper-threading reported via CPUID —
   [vm_version_x86.cpp#L869-L872](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/cpu/x86/vm_version_x86.cpp#L869-L872);
   the abstract default is 1), it further requires
   `active_processor_count() / logical_processors_per_package() >= 2`.

The 1792 MB figure is independently confirmed by [JEP 523](https://openjdk.org/jeps/523):
"testing showed that Serial had significant advantages … in constrained environments with a
single CPU or less than 1792 MB of physical memory. We therefore adjusted the JVM's GC selection
algorithm to choose Serial in such environments."

**Audit consequences.** A container with `cpu: 1` (or `<1792 MiB` memory) silently gets
**SerialGC**, not G1 — one of the highest-frequency real causes of "our small pods have terrible
p99". Clause 3 makes this worse on hyper-threaded x86: a 2-vCPU container can compute
`physical_packages = 2/2 = 1 < 2` and fall to Serial despite having 2 vCPUs. Never assume the
collector; read it.

**JDK 27 changes this entirely.** [JEP 523](https://openjdk.org/jeps/523) ("Make G1 the Default
Garbage Collector in All Environments", Status: Closed/Delivered, Release 27): "If you do not
specify a garbage collector on the command line then the JVM will always select G1, regardless
of the number of processors and the available physical memory." JDK 27 is in Release Candidate
with GA scheduled **2026-09-15** (<https://openjdk.org/projects/jdk/27/>). So the server-class
rule above is true for 21/25/26 and false from 27.

### C.2 Default `-Xmx` and how `MaxRAMPercentage` interacts

`Arguments::set_heap_size`
([jdk-25-ga arguments.cpp#L1455-L1560](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp)):

```
override_coop_limit = any of {MaxRAMPercentage, MinRAMPercentage, InitialRAMPercentage, MaxRAM}
                      set explicitly

if override_coop_limit:  phys_mem = MaxRAM if set, else os::physical_memory()   # and MaxRAM := physical
else:                    phys_mem = min(os::physical_memory(), MaxRAM)          # MaxRAM default = 128 GB

if -Xmx not given:
    reasonable_min = phys_mem * MinRAMPercentage / 100          # MinRAMPercentage default 50.0
    reasonable_max = phys_mem * MaxRAMPercentage / 100          # MaxRAMPercentage default 25.0
    if reasonable_min < MaxHeapSize(default 96 MB):             # "small physical memory"
        reasonable_max = reasonable_min                          #   → 50% of RAM
    else:
        reasonable_max = max(reasonable_max, MaxHeapSize)        #   → at least 96 MB
    reasonable_max = min(reasonable_max, ErgoHeapSizeLimit) if that flag is set
    reasonable_max = limit_heap_by_allocatable_memory(reasonable_max)
    if UseCompressedOops:
        if reasonable_max > max_coop_heap:
            if ergonomic coops and override_coop_limit: disable compressed oops   # see B.3
            else:                                        reasonable_max = min(…, max_coop_heap)
```

**The rule, stated for an auditor:**

- Default max heap = **25% of available RAM**, where "available RAM" is
  `min(physical-or-container-limit, 128 GB)` **unless** you set any of the RAM percentage flags
  or `MaxRAM`, in which case the 128 GB cap disappears and the base becomes the true available
  memory. So on a 256 GB host, defaults give ≈32 GB; `-XX:MaxRAMPercentage=25` gives ≈64 GB.
  (`MaxRAM` platform default 128 GB for C2/server builds, 4 GB for C1-only, 1 GB with no
  compiler / client-emulation —
  [jdk-25-ga compiler_globals_pd.hpp](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/compiler/compiler_globals_pd.hpp);
  man page: "the maximum amount of available memory to the JVM process or 128 GB, whichever is lower".)
- On **small** memory (where 50% of RAM < 96 MB, i.e. RAM < ~192 MB), the heap is
  `MinRAMPercentage` = **50% of RAM** instead. The man page describes this as "for small heaps.
  A small heap is a heap of approximately 125 MB."
- `-Xms` default = `InitialRAMPercentage` = **1.5625%** of the same base, floored at
  `OldSize + NewSize` and capped at max heap
  ([arguments.cpp initial-heap block](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp);
  man page confirms 1.5625).

**JDK 26 diffs (both confirmed in source):**

- The **128 GB `MaxRAM` cap is gone**: `MaxRAM` becomes `product(uint64_t, MaxRAM, 0, "(Deprecated) …")`
  and `set_heap_size` does `FLAG_SET_ERGO(MaxRAM, os::physical_memory())` when it is default
  (1 GB instead, in client-emulation mode)
  ([jdk-26-ga gc_globals.hpp#L271-L274](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/gc/shared/gc_globals.hpp#L271-L274),
  [jdk-26-ga arguments.cpp `set_heap_size`](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/runtime/arguments.cpp)).
  **A 21/25 → 26 upgrade on a >128 GB host therefore roughly doubles or more the default max heap.**
- `InitialRAMPercentage` default drops from **1.5625 → 0.0**
  ([jdk-26-ga gc_globals.hpp#L294](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/gc/shared/gc_globals.hpp#L294)),
  i.e. default `-Xms` is now the `OldSize + NewSize` floor rather than a fraction of RAM.
- `MaxRAM` and `AggressiveHeap` are deprecated in 26 (obsolete 27, expired 28).

### C.3 Default GC thread counts

See §B.6 for the formulas and sources. Summary:

| Collector | `ParallelGCThreads`                         | `ConcGCThreads`                                                                                   |
| --------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Serial    | n/a (single-threaded)                       | n/a                                                                                               |
| Parallel  | `ncpus ≤ 8 ? ncpus : 8 + (ncpus−8)×5/8`     | n/a                                                                                               |
| G1        | same as Parallel                            | `max((ParallelGCThreads+2)/4, 1)`; `G1ConcRefinementThreads = ParallelGCThreads`                  |
| ZGC       | `max(min(⌈ncpus×0.60⌉, 2%-of-heap cap), 1)` | `max(min(⌈ncpus×0.25⌉, 2%-of-heap cap), 1)`, further split into `ZYoungGCThreads`/`ZOldGCThreads` |

`ncpus` is `os::initial_active_processor_count()`, i.e. the **container-aware** count (§E).
`UseDynamicNumberOfGCThreads=true` means these are ceilings. Identical formulas in JDK 21/25/26
(verified for `workerPolicy.cpp` and `g1Arguments.cpp` at all three tags).

### C.4 Compressed oops / compressed class pointers

- `UseCompressedOops` is a 64-bit-only flag whose declared default is `false`, set to `true`
  **ergonomically** when `max(MaxHeapSize, InitialHeapSize, MinHeapSize) <= max_heap_for_compressed_oops()`
  ([jdk-25-ga arguments.cpp `set_use_compressed_oops`](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp#L1425-L1442)).
- The threshold: `OopEncodingHeapMax = (2^32) << LogMinObjAlignmentInBytes` — with the default
  `ObjectAlignmentInBytes = 8` that is **32 GB**, minus a null-page displacement
  ([arguments.cpp#L1405-L1422](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp#L1405-L1422)).
  Man page: "By default this range is 32 GB." Raising `ObjectAlignmentInBytes` extends it
  ("heap size limit = 4GB × ObjectAlignmentInBytes") at the cost of inter-object padding.
- **So: default heap ≤ 32 GB ⇒ compressed oops ON; above ⇒ OFF.** The `-Xmx31g` folk rule is a
  correct-for-the-wrong-reason approximation of this.
- `UseCompressedClassPointers` default `true` on 64-bit in JDK 21 and 25
  ([jdk-25-ga globals.hpp#L127](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/globals.hpp#L127)).
  **It is deprecated in JDK 25** (`{ "UseCompressedClassPointers", jdk(25), jdk(26), undefined }`,
  [jdk-25-ga arguments.cpp#L536-L538](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp#L536-L538)),
  so `-XX:-UseCompressedClassPointers` on JDK 25 prints a deprecation warning. In the JDK 26
  table the obsoletion was pushed to 27
  ([jdk-26-ga arguments.cpp#L539](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/runtime/arguments.cpp#L539)),
  and the flag declaration moved into the main globals block marked `"(Deprecated) Use 32-bit class pointers."`
  ([jdk-26-ga globals.hpp#L1397-L1398](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/runtime/globals.hpp#L1397-L1398)).

### C.5 Compact object headers — a live default change across 24→27

| Release | State                                                                               | Source                                                                                                                                                          |
| ------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 24      | Experimental; needs `-XX:+UnlockExperimentalVMOptions -XX:+UseCompactObjectHeaders` | [JEP 450](https://openjdk.org/jeps/450)                                                                                                                         |
| 25      | Product feature, **default `false`**; `-XX:+UseCompactObjectHeaders` alone          | [JEP 519](https://openjdk.org/jeps/519); [jdk-25-ga globals.hpp#L131](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/globals.hpp#L131) |
| 26      | Still **default `false`**                                                           | [jdk-26-ga globals.hpp#L127](https://github.com/openjdk/jdk/blob/jdk-26-ga/src/hotspot/share/runtime/globals.hpp#L127)                                          |
| 27      | **Default `true`**                                                                  | [JEP 534](https://openjdk.org/jeps/534) "Compact Object Headers by Default", Closed/Delivered, Release 27                                                       |

Numbers published in JEP 519 and repeated in JEP 534: "In one setting, the SPECjbb2015 benchmark
uses 22% less heap space and 8% less CPU time. In another setting, the number of garbage
collections done by SPECjbb2015 is reduced by 15%, with both the G1 and Parallel collectors.
A highly parallel JSON parser benchmark runs in 10% less time."
**Caveat that must travel with these numbers: the JEPs give no JDK build, hardware, heap size or
SPECjbb configuration for "one setting" / "another setting".** They are directionally useful and
citation-worthy as OpenJDK's own claim; they are not a number you can promise a specific
application. JEP 450 states the design bound instead, which is more usable: "Should not introduce
more than 5% throughput or latency overheads on the target 64-bit platforms, and only in
infrequent cases."

On JDK 25, `-XX:+UseCompactObjectHeaders` has two automatic side effects worth knowing:
it forces `LockingMode = LM_LIGHTWEIGHT`
([arguments.cpp#L3773-L3775](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/arguments.cpp#L3773-L3775))
and it requires `UseCompressedClassPointers`.

### C.6 Default `-Xss` per platform

Linux/x64 **1024 KB**; Linux/AArch64 **2048 KB** (`ThreadStackSize` pd default `2040`);
macOS/x64 1024 KB; macOS/AArch64 2048 KB; Windows: system default (pd value `0`).
Sources: <https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html> (`-Xss` and
`-XX:ThreadStackSize`), cross-checked against
[globals_linux_x86.hpp#L33](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/os_cpu/linux_x86/globals_linux_x86.hpp#L33),
[globals_linux_aarch64.hpp#L39](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/os_cpu/linux_aarch64/globals_linux_aarch64.hpp#L39),
[globals_windows_x86.hpp#L35](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/os_cpu/windows_x86/globals_windows_x86.hpp#L35).
Note the x64→AArch64 doubling: **the same `-Xss`-less deployment uses twice the per-thread stack
reservation on Graviton/Ampere as on x86**, which matters for thread-heavy services in a fixed
memory limit.

### C.7 Other defaults worth having in the matrix

| Flag                                                | Default (JDK 21 / 25 / 26)                                         | Source                                                                                                                                                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ReservedCodeCacheSize`                             | 240 MB tiered; 48 MB with `-XX:-TieredCompilation`                 | [java man page](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html)                                                                                                                                           |
| `SegmentedCodeCache`                                | on when tiered **and** `ReservedCodeCacheSize ≥ 240 MB`            | same                                                                                                                                                                                                                          |
| `TieredCompilation`                                 | `true`                                                             | same                                                                                                                                                                                                                          |
| `NativeMemoryTracking`                              | `off` in product builds (`DEBUG_ONLY("summary") NOT_DEBUG("off")`) | [globals.hpp#L584](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/globals.hpp#L584)                                                                                                                  |
| `AlwaysPreTouch`                                    | `false`                                                            | [gc_globals.hpp#L181](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/shared/gc_globals.hpp#L181)                                                                                                          |
| `UseNUMA`                                           | `false`, but forced `true` by ZGC                                  | [globals.hpp#L197](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/globals.hpp#L197); [zArguments.cpp](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/z/zArguments.cpp#L124-L129) |
| `DisableExplicitGC` / `ExplicitGCInvokesConcurrent` | both `false`                                                       | [gc_globals.hpp#L154, #L485](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/shared/gc_globals.hpp)                                                                                                        |
| `UseContainerSupport`                               | `true` (Linux)                                                     | [globals_linux.hpp#L47](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/os/linux/globals_linux.hpp#L47)                                                                                                             |
| `ActiveProcessorCount`                              | `-1` (auto)                                                        | [gc_globals.hpp#L297](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/shared/gc_globals.hpp)                                                                                                               |
| `TrimNativeHeapInterval`                            | `0` (disabled); **exists from JDK 22**, absent in JDK 21           | [globals.hpp#L1974](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/globals.hpp#L1974); verified absent at jdk-21-ga                                                                                  |
| `ObjectAlignmentInBytes`                            | 8                                                                  | [java man page](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html)                                                                                                                                           |
| `GCTimeRatio` (G1)                                  | 12 (≈8% GC overhead goal)                                          | [g1Arguments.cpp#L196-L201](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/gc/g1/g1Arguments.cpp#L196-L201)                                                                                                  |

---

## D. The "missing measurement" catalogue

Design note for the skill: every entry names **one artefact**, the **exact command**, what it
**discriminates between**, and — the part that lets the skill refuse the premise — what its
**absence** means.

All `jfr view` names below are verified against
[jdk-25-ga view.ini](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/jdk.jfr/share/classes/jdk/jfr/internal/query/view.ini);
the JDK-21 availability column comes from diffing that file against
[jdk-21-ga view.ini](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/jdk.jfr/share/classes/jdk/jfr/internal/query/view.ini).
Views present in 25 but **not** 21: `cpu-time-hot-methods`, `cpu-time-statistics`,
`deprecated-methods-for-removal`, `method-calls`, `method-timing`, `native-library-failures`,
`blocked-by-system-gc`, `gc-parallel-phases`, `jdk-agents`. Everything else listed here exists in both.

Baseline recording (cheap, both templates enable everything below except `jdk.CPUTimeSample`):

```
-XX:StartFlightRecording=settings=default,maxsize=256m,filename=/tmp/app.jfr,dumponexit=true
```

`default.jfc` selections: `gc=normal`, `allocation-profiling=low`, `method-profiling=normal`,
`memory-leaks=types`. `profile.jfc`: `gc=detailed`, `allocation-profiling=medium`,
`method-profiling=high`, `memory-leaks=stack-traces`
([default.jfc#L997-L1176](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/jdk.jfr/share/conf/jfr/default.jfc),
[profile.jfc#L996-L1175](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/jdk.jfr/share/conf/jfr/profile.jfc)).
**Consequence:** `memory-leaks-by-site` needs stack traces, so it needs `settings=profile` or an
explicit `jdk.OldObjectSample#stackTrace=true` — `default` records the event _without_ stacks.

### D.1 "p99 spiked"

**Cheapest discriminating evidence:** the GC pause distribution and the safepoint distribution
side by side.

```
jfr view gc-pauses  app.jfr      # SUM/COUNT/MIN/MEDIAN/AVG/P90/P95/P99/P999/MAX over jdk.GCPhasePause
jfr view safepoints app.jfr      # jdk.SafepointBegin + jdk.SafepointEnd: time-to-safepoint vs safepoint duration
```

Both events are on in `default.jfc` (`jdk.GCPhasePause` under the `gc-enabled-normal` condition;
`jdk.SafepointBegin` unconditionally). Equivalent without JFR: `-Xlog:gc,safepoint`
(documented in the `java` man page's Unified Logging examples).

**What it discriminates.** If p99(GCPhasePause) is comparable to the p99 regression, it is GC
pause. If safepoint _duration_ is small but time-to-safepoint (`SafepointBegin`→`SafepointEnd`
gap in the view) is large, it is a thread that will not reach a safepoint — a counted loop, JNI,
or a page-fault stall — not GC. If both are small, the latency is **not in the JVM's pause
machinery at all** and no flag will fix it.
**Absence means:** with no pause distribution you cannot distinguish "GC pauses" from "the pool
is exhausted" from "the downstream got slower". An audit that recommends a GC flag here is
guessing; the correct output is a refusal plus this command.

### D.2 "high CPU"

**Cheapest discriminating evidence:** GC CPU time versus application CPU time — not a profile.

```
jfr view gc-cpu-time app.jfr     # jdk.GCCPUTime: SUM(userTime), SUM(systemTime), SUM(realTime), COUNT
jfr view hot-methods  app.jfr    # jdk.ExecutionSample, top frames
```

Then, only if GC CPU is small and the profile is uninformative (native/JNI-heavy), escalate to
CPU-time sampling — new in JDK 25, [JEP 509](https://openjdk.org/jeps/509), Linux only,
**experimental and disabled in both `default.jfc` and `profile.jfc`** (verified: `enabled=false`
for `jdk.CPUTimeSample` in both files at jdk-25-ga):

```
java -XX:StartFlightRecording=jdk.CPUTimeSample#enabled=true,jdk.CPUTimeSample#throttle=20ms,filename=cpu.jfr …
jfr view cpu-time-hot-methods cpu.jfr
```

JEP 509 documents why this matters: the classic `ExecutionSample` "only samples threads that are
currently executing Java code and not native code called from Java code", may fail silently, and
"selects only a subset of threads for sampling at each interval". `jdk.CPUTimeSamplesLost`
reports drops. Default throttle `500/s`; `profile.jfc` preconfigures `10ms` but leaves the event off.

**What it discriminates.** GC-CPU ≫ app-CPU → allocation rate or heap sizing, and §D.6 applies.
GC-CPU small, one frame dominant → application hot path. GC-CPU small, profile flat →
context-switching / lock contention (`jfr view contention-by-site`, `jdk.JavaMonitorEnter`,
on in `default.jfc`) or **CFS throttling** (§E, `jfr view container-cpu-throttling`).
**Absence means:** "high CPU" without a GC-CPU-vs-app-CPU split cannot be attributed. In
particular you cannot tell CPU _saturation_ from CPU _throttling_, and those have opposite fixes.

### D.3 "OOMKilled"

**Cheapest discriminating evidence:** an NMT summary at steady state, plus the container limit.

```
# at startup:
-XX:NativeMemoryTracking=summary
# at steady state, before the kill:
jcmd <pid> VM.native_memory summary scale=MB
jcmd <pid> VM.native_memory baseline        # then, later:
jcmd <pid> VM.native_memory summary.diff scale=MB
```

(`VM.native_memory` options `summary|detail|baseline|summary.diff|detail.diff|statistics|scale`,
<https://docs.oracle.com/en/java/javase/25/docs/specs/man/jcmd.html>.)
If NMT was not enabled at startup, `jcmd` replies literally `Native memory tracking is not enabled`
([nmtDCmd.cpp#L75](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/nmt/nmtDCmd.cpp#L75))
— **NMT cannot be turned on at runtime.** The fallback with no restart is
`jfr view native-memory-committed app.jfr` (`jdk.NativeMemoryUsage`, on in `default.jfc` under
`gc-enabled-normal`) which gives committed-by-category over time without the startup flag.
Linux-only extras: `jcmd <pid> System.map` / `System.dump_map` (annotated process memory map) and
`jcmd <pid> System.native_heap_info` (`malloc_info(3)`), all documented in the jcmd man page.

**What it discriminates.** Heap committed ≈ container limit → `-Xmx` too large (B.2/B.3).
Heap modest but `Thread`/`Thread Stack` large → thread explosion or a raised `-Xss` (B.8).
`Class`/`Metaspace` growing → classloader leak. `Internal`/`Other` growing → direct byte buffers
or a native library. Nothing in NMT growing while RSS grows → glibc malloc arena fragmentation
(see `System.native_heap_info` and `-XX:TrimNativeHeapInterval`, JDK 22+).
**Absence means:** an OOMKill with no NMT summary and no memory map is un-attributable, and
lowering `-Xmx` is a coin flip — if the growth is in metaspace or native, shrinking the heap makes
the crash arrive sooner while masking the real leak.

### D.4 "slow startup"

**Cheapest discriminating evidence:** split the wall-clock into class loading, JIT and application.

```
jfr view longest-class-loading app.jfr      # jdk.ClassLoad
jfr view compiler-statistics   app.jfr
jfr view container-cpu-throttling app.jfr   # jdk.ContainerCPUThrottling — see below
-Xlog:class+load:file=cl.log -Xlog:startuptime
```

**The measurement people skip:** CFS throttling during startup. `jdk.ContainerCPUThrottling`
(`SELECT LAST(cpuElapsedSlices), LAST(cpuThrottledSlices), LAST(cpuThrottledTime)`) is enabled
unconditionally in `default.jfc`. A pod with a low CPU _limit_ is throttled hardest exactly during
startup, when the JIT compiler threads and classloading want CPU. That looks like "slow startup"
and is fixed by CPU limits or `-XX:ActiveProcessorCount`, not by `TieredStopAtLevel=1`.
**What it discriminates.** Throttled slices high → CPU limit. Class-load time dominant → CDS/AOT
cache territory ([JEP 483](https://openjdk.org/jeps/483)). Compiler statistics dominant with no
throttling → genuine warmup. Application frames dominant → it is your `@PostConstruct`, not the JVM.
**Absence means:** without the throttling counters you cannot distinguish "the JVM is slow" from
"the JVM was given 200 millicores", and every JVM-side flag recommendation is unfounded.

### D.5 "memory leak suspected"

**Cheapest discriminating evidence:** heap occupancy _after full GC_ over time — a single number
per GC, not a heap dump.

```
-Xlog:gc:file=gc.log:time,uptime,level,tags     # read "Pause Full ... 4000M->3900M(8000M)"
jfr view memory-leaks-by-site app.jfr            # jdk.OldObjectSample — needs stack traces
```

`jdk.OldObjectSample` is enabled in `default.jfc` but with `memory-leaks=types`, i.e. **without
stack traces**; `memory-leaks-by-site` selects `stackTrace.topApplicationFrame` and therefore
needs `settings=profile` (`memory-leaks=stack-traces`) or
`jdk.OldObjectSample#stackTrace=true` (verified in default.jfc#L1168-L1177 vs profile.jfc#L1167-L1176).
Escalate only then to `jcmd <pid> GC.class_histogram` (Impact: **High**) or
`jcmd <pid> GC.heap_dump -gz=1 -parallel=N file` (Impact: High, forces a full GC unless `-all`)
— both per the jcmd man page.
**What it discriminates.** Monotonically rising post-full-GC occupancy → a real leak.
Flat post-full-GC occupancy with rising _peak_ → allocation-rate/heap-sizing, not a leak.
Rising RSS with flat heap → native (§D.3).
**Absence means:** a leak claim with no post-full-GC occupancy series is unfalsifiable. A heap
dump alone shows what is _in_ the heap, not whether it is _growing_ — it cannot distinguish a leak
from a large-but-stable cache.

### D.6 "GC is the problem"

**Cheapest discriminating evidence:** the collector actually in use, the heap configuration, and
GC CPU — in that order, before any tuning.

```
jcmd <pid> VM.flags                       # what the JVM actually chose (not what you passed)
jfr view gc-configuration    app.jfr      # jdk.GCConfiguration
jfr view heap-configuration  app.jfr      # jdk.GCHeapConfiguration: initialSize, minSize, maxSize,
                                          #   usesCompressedOops, compressedOopsMode
jfr view gc-cpu-time         app.jfr
jfr view gc-pauses           app.jfr
jfr view allocation-by-site  app.jfr      # jdk.ObjectAllocationSample (on in default.jfc)
```

**What it discriminates.** Step 1 alone resolves a large fraction of cases: it reveals SerialGC
selected by ergonomics (§C.1), compressed oops disabled by `MaxRAMPercentage` (§B.3), an obsolete
flag being ignored (§A), or thread counts derived from the wrong CPU count (§E). Only if the
collector and heap are as intended does the pause/CPU/allocation triage begin.
**Absence means:** "GC is the problem" with no `VM.flags` output is not a diagnosis — you do not
yet know which collector is running. **This is the single strongest premise-refusal in the skill:
no `VM.flags`, no GC recommendation.**

### D.7 Cross-cutting: what the artefact must contain before any flag is recommended

1. `jcmd <pid> VM.flags` (or `-XX:+PrintFlagsFinal` at startup) — the _effective_ configuration.
2. `jcmd <pid> VM.command_line` — the flags actually passed, so obsolete/ignored ones show up.
3. `java -version` — the exact build, because §A and §C answers change by release.
4. The SLO the change is meant to serve, expressed as a percentile and a threshold.
   Missing any of 1–4 ⇒ the audit output is the missing measurement, not a flag.

---

## E. Container correctness

### E.1 cgroup v1 vs v2 detection

`UseContainerSupport` defaults to `true` on Linux
([globals_linux.hpp#L47-L48](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/os/linux/globals_linux.hpp#L47-L48));
the man page confirms it is Linux-only and on by default
(<https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html>, `-XX:-UseContainerSupport`).

Detection reads three procfs files
([cgroupSubsystem_linux.cpp#L69-L73, #L269-L330, #L376-L440, #L539-L550](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/os/linux/cgroupSubsystem_linux.cpp)):

- `/proc/cgroups` — v1 controller/hierarchy enumeration;
- `/proc/self/cgroup` — this process's cgroup paths;
- `/proc/self/mountinfo` — where the controllers are mounted, and whether the filesystem is
  `cgroup2` or `cgroup`.
  The comment at #L269 states the decision: "If cgroups v2 is enabled, open
  `/sys/fs/cgroup/cgroup.controllers`. If not, open `/proc/cgroups`." Failure paths set
  `INVALID_CGROUPS_V2` (#L299) or log "Mount point for cgroupv2 not found in /proc/self/mountinfo" (#L550).

Files actually read for limits:

|                    | cgroup v1                                | cgroup v2                          |
| ------------------ | ---------------------------------------- | ---------------------------------- |
| memory limit       | `memory.limit_in_bytes`                  | `memory.max`                       |
| memory usage       | `memory.usage_in_bytes`                  | `memory.current`                   |
| RSS / cache        | `memory.stat` keys `rss` / `cache`       | `memory.stat` keys `anon` / `file` |
| CPU quota / period | `cpu.cfs_quota_us` / `cpu.cfs_period_us` | both fields of `cpu.max`           |

Sources: [cgroupV1Subsystem_linux.cpp#L159-L332](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/os/linux/cgroupV1Subsystem_linux.cpp),
[cgroupV2Subsystem_linux.cpp#L105-L259](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/os/linux/cgroupV2Subsystem_linux.cpp).

There is a hierarchy-walk adjustment (`CgroupUtil::adjust_controller`) that climbs the cgroup
path looking for the _lowest_ memory limit, and logs
`"Cgroup memory controller path at '%s' seems to have moved to '%s', detected limits won't be accurate"`
when it sees a `../` in the path
([cgroupUtil_linux.cpp#L27-L60](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/os/linux/cgroupUtil_linux.cpp#L27-L60)) —
a real failure mode when a container is live-migrated or the cgroup is renamed under it.

**The one command that settles all of this:** `-Xlog:os+container=trace`
(named explicitly in the man page under `-XX:-UseContainerSupport`), or
`java -XshowSettings:system` — "Linux only: Shows host system or container configuration and
continues" (man page, `-XshowSettings`). At runtime, `jfr view container-configuration` reports
`containerType, cpuSlicePeriod, cpuQuota, cpuShares, effectiveCpuCount, memorySoftLimit,
memoryLimit, swapMemoryLimit, hostTotalMemory` from `jdk.ContainerConfiguration`
([view.ini](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/jdk.jfr/share/classes/jdk/jfr/internal/query/view.ini)).

### E.2 How a CPU quota becomes `ActiveProcessorCount`

```
int CgroupUtil::processor_count(CgroupCpuController* cpu_ctrl, int host_cpus) {
  int limit_count = host_cpus;                 // host_cpus = os::Linux::active_processor_count() (sched_getaffinity)
  int quota  = cpu_ctrl->cpu_quota();
  int period = cpu_ctrl->cpu_period();
  int quota_count = 0;
  if (quota > -1 && period > 0) quota_count = ceilf((float)quota / (float)period);
  if (quota_count != 0) limit_count = quota_count;
  return MIN2(host_cpus, limit_count);
}
```

([jdk-25-ga cgroupUtil_linux.cpp#L4-L24](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/os/linux/cgroupUtil_linux.cpp#L4-L24),
called from [cgroupSubsystem_linux.cpp#L633-L653](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/os/linux/cgroupSubsystem_linux.cpp#L633-L653);
the result is cached with `OSCONTAINER_CACHE_TIMEOUT`.)

**The rule:** `ActiveProcessorCount = min(cpus_from_sched_getaffinity, ceil(cpu_quota / cpu_period))`.

Two consequences an auditor must internalise:

1. **`ceil`, not `floor`.** A Kubernetes `limits.cpu: 1500m` (quota 150000 / period 100000)
   gives **2**, not 1. A `limits.cpu: 100m` gives **1**.
2. **cpu _shares_ are no longer used.** The doc comment above `active_processor_count` still
   mentions "cgroup cpu shares" as an input, but the code path does not read it — and
   `-XX:+UseContainerCpuShares` / `-XX:+PreferContainerQuotaForCPUCount` were deprecated in
   JDK 19, obsoleted in 20, **expired in 21**
   ([jdk-20+36 arguments.cpp#L552-L553](https://github.com/openjdk/jdk/blob/jdk-20%2B36/src/hotspot/share/runtime/arguments.cpp#L552-L553)).
   **So on JDK 21+, a Kubernetes `requests.cpu` with no `limits.cpu` gives the JVM the full host
   CPU count** — which sizes GC threads, JIT compiler threads and `ForkJoinPool.commonPool` for a
   machine the pod will never get, and produces heavy CFS throttling. Any advice referencing
   cpu-shares behaviour is pre-JDK-19 and wrong.

`-XX:ActiveProcessorCount=n` overrides this and, per the man page, "is honored even if
`UseContainerSupport` is not enabled".

Verified identical across JDK 21, 25 and 26 for `is_server_class_machine` and the
quota→count formula; no behavioural change found in this area across the range.

### E.3 Why RSS exceeds heap, and what the non-heap contributors are

RSS = Java heap **+** every NMT category listed in §B.2 **+** things NMT does not track (the C
library's own allocator overhead and fragmentation, `mmap`s made by native libraries, the
executable and mapped files).

The categories, verbatim from
[jdk-25-ga memTag.hpp#L32-L61](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/nmt/memTag.hpp#L32-L61):
`Java Heap, Class, Thread, Thread Stack, Code, GC, GCCardSet, Compiler, JVMCI, Internal, Other,
Symbol, Native Memory Tracking, Shared class space, Arena Chunk, Test, Tracing, Logging,
Statistics, Arguments, Module, Safepoint, Synchronization, Serviceability, Metaspace,
String Deduplication, Object Monitors, Unknown`.

The ones that actually move in production: `Thread Stack` (thread count × `-Xss`),
`Class`/`Metaspace` (classloaders, proxies, generated classes), `Code` (JIT output; capped by
`ReservedCodeCacheSize`, default 240 MB tiered), `GC` and `GCCardSet` (remembered sets — heap-size
dependent), `Compiler` (transient C2 arenas, can spike), `Internal`/`Other` (direct byte buffers).

**The untracked residual.** On glibc, per-thread malloc arenas fragment and are not returned to
the OS promptly; `jcmd <pid> System.native_heap_info` calls `malloc_info(3)` to expose this
(jcmd man page, Linux only), and `jcmd <pid> System.trim_native_heap` / the
`-XX:TrimNativeHeapInterval=<ms>` flag ("Interval, in ms, at which the JVM will trim the native
heap … A value of 0 (default) disables … only supported on Linux with GNU C Library (glibc)",
[java man page](https://docs.oracle.com/en/java/javase/25/docs/specs/man/java.html)) address it.
**`TrimNativeHeapInterval` does not exist on JDK 21** (verified absent from
[jdk-21-ga globals.hpp](https://github.com/openjdk/jdk/blob/jdk-21-ga/src/hotspot/share/runtime/globals.hpp),
present from jdk-22+36 onward) — so this remediation is only available on JDK 22+.

### E.4 What `-XX:NativeMemoryTracking=summary` costs, and how to read it

**Cost, per Oracle's own troubleshooting guide** (JDK 25 edition,
<https://docs.oracle.com/en/java/javase/25/troubleshoot/diagnostic-tools.html>):

> Enabling NMT will result in a **5-10 percent** JVM performance drop, and memory usage for NMT
> adds **2 machine words to all malloc memory as a malloc header**. NMT memory usage is also
> tracked by NMT.

**Caveats that must travel with that number:** Oracle states it identically for `summary` and
`detail` and gives **no benchmark, build, hardware or workload**. It is the vendor's published
figure and nothing more. The guide's own sample output shows NMT's self-cost as a real line item:
`Native Memory Tracking (reserved=539KB, committed=539KB) (tracking overhead=530KB)` — i.e. the
per-malloc-header cost, not the 5–10%, is what shows up in the report.

**Operational facts:**

- NMT **must be enabled at JVM startup**; it cannot be turned on later. `jcmd <pid> VM.native_memory`
  on a JVM started without it prints `Native memory tracking is not enabled`
  ([nmtDCmd.cpp#L75](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/nmt/nmtDCmd.cpp#L75)),
  and `detail`-only sub-commands print `Detail tracking is not enabled` (#L182).
- Default is `off` in product builds
  ([globals.hpp#L584](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/runtime/globals.hpp#L584)).
- **Reading it:** every line has `reserved` (address space) and `committed` (backed memory).
  **Only `committed` correlates with RSS.** `reserved` for the Java heap is `-Xmx`-shaped and
  routinely dwarfs RSS; quoting reserved numbers is the most common misreading. Use
  `baseline` → workload → `summary.diff` to see _growth_ rather than absolute size
  (jcmd man page, `VM.native_memory` options).
- `scale=MB` is worth always passing; the default scale is KB.
- **Without the startup flag there is still an option:** `jfr view native-memory-committed`
  (`SELECT type, FIRST(committed), AVG(committed), LAST(committed), MAX(committed) FROM
NativeMemoryUsage GROUP BY type ORDER BY MAX DESC`) and `native-memory-reserved`.
  `jdk.NativeMemoryUsage` is enabled in `default.jfc` under `gc-enabled-normal`, so a JFR
  recording gives committed-by-category over time at no extra configuration and without NMT's
  5–10% claim. This is the cheaper first move and the skill should prefer it.

### E.5 Container diffs across 21 → 25 → 26

No behavioural differences found in cgroup detection, the quota→`ActiveProcessorCount` formula,
`UseContainerSupport` default, or `is_server_class_machine` between jdk-21-ga, jdk-25-ga and
jdk-26-ga (all four verified by reading the source at each tag). The container-relevant changes
in the window are:

- **JDK 21:** `UseContainerCpuShares` / `PreferContainerQuotaForCPUCount` expire (cpu-shares logic gone).
- **JDK 22:** `TrimNativeHeapInterval` appears.
- **JDK 26:** the 128 GB `MaxRAM` cap is removed and `InitialRAMPercentage` default becomes 0.0
  (§C.2) — this _is_ a container-visible change on large hosts.
- **JDK 27 (RC, GA 2026-09-15):** G1 becomes the default in all environments
  ([JEP 523](https://openjdk.org/jeps/523)), removing the small-container→Serial surprise.

---

## F. UNRESOLVED

Items I could not verify to primary-source standard. **The skill must not assert these.**

1. **`-XX:+ZGenerational` on JDK 26 — refuses to start.** Derived, not directly documented.
   The evidence is: (a) the entry is absent from `special_jvm_flags` in jdk-26-ga
   `arguments.cpp`; (b) no declaration remains in jdk-26-ga `gc_globals.hpp` or `z_globals.hpp`;
   (c) the documented behaviour for an undeclared, untabled flag is `Unrecognized VM option`.
   I did **not** find a JDK 26 release note or JBS issue stating the removal explicitly, and I
   did not run a JDK 26 JVM. Confidence high, but the skill should phrase it as "verified against
   the jdk-26-ga source; confirm with `java -XX:+ZGenerational -version` on your build."
   Note the asymmetry with JDK 25, where it is _definitely_ only a warning.

2. **`-XX:TieredStopAtLevel=1` throughput cost — no number exists.** No OpenJDK JEP, release note
   or man-page statement quantifies the peak-throughput loss. The flag is not even documented in
   the JDK 25 `java` man page except as a `NeverActAsServerClassMachine` suppressor. Any
   percentage found in a blog post is unattributable. Ship the mechanism (§B.1), not a number.

3. **`-XX:+AlwaysPreTouch` cost — no published figure.** The mechanism is fully sourced
   (one atomic write per page, parallelised across GC workers, on commit). The wall-clock cost
   is entirely a function of page size, heap size, memory bandwidth and whether THP is in play.
   No OpenJDK-published measurement found.

4. **JEP 519 / 534 compact-object-header numbers lack context.** "22% less heap space and 8% less
   CPU time" (SPECjbb2015), "15% fewer GCs", "JSON parser 10% less time" are OpenJDK's own claims
   but carry no JDK build, hardware, heap size or benchmark configuration. Quote them only as
   "OpenJDK reports, without stating hardware or configuration".

5. **JEP 444's G1 humongous-stack-chunk limitation** ("if a virtual thread's stack reaches half
   the region size, which could be as small as 512 KB, then a `StackOverflowError` might be
   thrown") is stated for **JDK 21**. I could not verify whether it still holds on JDK 25/26 —
   the JEP text is not revised per-release and I found no JBS confirmation of a fix.

6. **`VM_Version::parallel_worker_threads_denominator()`** — I confirmed
   `calc_parallel_worker_threads()` calls `nof_parallel_worker_threads(5, den, 8)` but did not
   verify that `den == 8` on every architecture. The 5/8 fraction is stated in the source comment
   ("on a 72 cpu machine and a chosen fraction of 5/8 use 8 + (72 − 8) × (5/8) == 48 worker
   threads") and is correct for the platforms that comment describes; treat non-x86 as unverified.

7. **`jdk.ContainerCPUThrottling` availability on JDK 21.** The
   `environment.container-cpu-throttling` view name exists in jdk-21-ga `view.ini`, but I did not
   verify that the underlying event is enabled in JDK 21's `default.jfc` (I checked only jdk-25-ga's).

8. **Windows and macOS specifics.** Everything in §E is Linux-only by construction
   (`UseContainerSupport` is a Linux flag). The default `-Xss` on Windows is "depends on virtual
   memory" and I did not resolve it to a number.

9. **JDK 27 (RC) details.** JEP 523 and JEP 534 are marked Closed/Delivered against Release 27,
   and GA is scheduled 2026-09-15, but JDK 27 has not shipped as of 2026-08-27. Anything about 27
   should be phrased as scheduled, not as observed behaviour.
