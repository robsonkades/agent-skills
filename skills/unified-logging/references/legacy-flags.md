# Migrating pre-JDK-9 flags

Read when a pre-JDK-9 logging flag appears in a startup script, or when a JVM fails to
start on an unrecognised `-XX:+Print…` or `-XX:+Trace…` option.

## Three outcomes, not two

Behaviour on Temurin 25.0.3, one `java <flag> -version` per row, exit code captured:

| Flag                             | Outcome                                                                                        | Exit                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------- |
| `-XX:+PrintGC`                   | works, deprecated: `-XX:+PrintGC is deprecated. Will use -Xlog:gc instead.`                    | 0                    |
| `-XX:+PrintGCDetails`            | works, deprecated: `… Will use -Xlog:gc* instead.`                                             | 0                    |
| `-Xloggc:x.log`                  | works, deprecated: `… Will use -Xlog:gc:x.log instead.`                                        | 0                    |
| `-XX:+PrintCompilation`          | works, **not deprecated, not unified logging** — a live product flag                           | 0                    |
| `-XX:+PrintGCTimeStamps`         | **removed**: `Unrecognized VM option`                                                          | 1                    |
| `-XX:+PrintTenuringDistribution` | removed                                                                                        | 1                    |
| `-XX:+PrintReferenceGC`          | removed                                                                                        | 1                    |
| `-XX:+PrintAdaptiveSizePolicy`   | removed                                                                                        | 1                    |
| `-XX:+UseGCLogFileRotation`      | removed                                                                                        | 1                    |
| `-XX:+TraceClassLoading`         | removed                                                                                        | 1                    |
| `-XX:+PrintSafepointStatistics`  | removed                                                                                        | 1                    |
| `-XX:+TraceSafepoint`            | removed                                                                                        | 1                    |
| `-XX:+PrintInlining`             | exists, but is `diagnostic` — needs `-XX:+UnlockDiagnosticVMOptions` **before it** on the line | 1 without the unlock |

A removed flag is not a degraded log; it is a JVM that does not start. That is the whole
risk in a stale startup script.

**The three survivors behave identically on JDK 21, 25 and 26** — the deprecation-and-alias
code in `arguments.cpp` is byte-for-byte the same at `jdk-21+35`, `jdk-25+36` and
`jdk-26+35`. A JDK 21 → 25 → 26 upgrade therefore changes nothing here; anything that was
going to break broke before JDK 21.

## When each stopped working

| Flag family                                                                                                                                                    | Deprecated | Obsoleted                        | Removed                                                   | Source                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------- |
| The aliased `Trace*` set (`TraceClassLoading`, `TraceClassUnloading`, `TraceExceptions`, …)                                                                    | JDK 9      | JDK 16                           | JDK 17                                                    | JDK-8256718 / JDK-8257118, release note JDK-8257429             |
| `PrintSafepointStatistics*`                                                                                                                                    | JDK 11     | JDK 12                           | JDK 13                                                    | JDK-8191421 / JDK-8191422, JDK-8198720                          |
| `PrintGC`, `PrintGCDetails`, `-Xloggc:`                                                                                                                        | JDK 9      | still not obsoleted as of JDK 26 | —                                                         | `arguments.cpp` at `jdk-26+35`, confirmed by execution          |
| `PrintGCTimeStamps`, `PrintTenuringDistribution`, `PrintReferenceGC`, `PrintAdaptiveSizePolicy`, `UseGCLogFileRotation`, `NumberOfGCLogFiles`, `GCLogFileSize` | JDK 9      | —                                | **removed before JDK 21** — exact release not established | execution on JDK 25; man page calls them "no longer recognized" |

The last row is deliberately imprecise. These flags are verifiably gone on JDK 25 and the
man page declares the runtime set unrecognised, but the JBS issue that obsoleted the GC
ones was not located. **Do not state a removal release for them** — "removed before JDK 21;
the JVM refuses to start" is the safe wording.

[JDK-8257429](https://bugs.openjdk.org/browse/JDK-8257429), the release note for the
`Trace*` set, states the general rule:

> "When Unified Logging was added in Java 9, a number of tracing flags were deprecated and
> mapped to their unified logging equivalent. These flags are now obsolete and will no
> longer be converted automatically to enable unified logging. To continue getting the same
> logging output, you must explicitly replace the use of these flags with their unified
> logging equivalent."

## GC flags → `-Xlog`

From the JDK 25 man page, "Convert GC Logging Flags to Xlog":

| Legacy flag                          | `-Xlog` equivalent            | Note                                           |
| ------------------------------------ | ----------------------------- | ---------------------------------------------- |
| `PrintGC`                            | `-Xlog:gc`                    | —                                              |
| `PrintGCDetails`                     | `-Xlog:gc*`                   | —                                              |
| `PrintGCTimeStamps`                  | not applicable                | timestamps are a decorator now                 |
| `PrintGCDateStamps`                  | not applicable                | date stamps are a decorator now                |
| `PrintGCID`                          | not applicable                | GC id is always logged                         |
| `PrintGCCause`                       | not applicable                | cause is always logged                         |
| `PrintTenuringDistribution`          | `-Xlog:gc+age*=level`         | `debug` for the useful part, `trace` for all   |
| `PrintAdaptiveSizePolicy`            | `-Xlog:gc+ergo*=level`        | `debug` for most, `trace` for all              |
| `PrintHeapAtGC`                      | `-Xlog:gc+heap=trace`         | —                                              |
| `PrintReferenceGC`                   | `-Xlog:gc+ref*=debug`         | old flag only had effect with `PrintGCDetails` |
| `PrintGCApplicationStoppedTime`      | `-Xlog:safepoint`             | no longer separated from concurrent time       |
| `PrintGCApplicationConcurrentTime`   | `-Xlog:safepoint`             | same tag as the above                          |
| `PrintGCTaskTimeStamps`              | `-Xlog:gc+task*=debug`        | —                                              |
| `PrintStringDeduplicationStatistics` | `-Xlog:gc+stringdedup*=debug` | —                                              |
| `G1PrintHeapRegions`                 | `-Xlog:gc+region=trace`       | —                                              |
| `GCLogFileSize`                      | `filesize=` output option     | see correction below                           |
| `NumberOfGCLogFiles`                 | `filecount=` output option    | see correction below                           |
| `UseGCLogFileRotation`               | not applicable                | rotation is on by default                      |

**Correction to the official table.** It maps `GCLogFileSize` and `NumberOfGCLogFiles` to
"no configuration available" / "not applicable", which reads as "you have lost the
capability". You have not: the replacements are the `filesize=` and `filecount=` output
options. The table means only that they are no longer JVM flags.

Note the several rows mapping to `gc+age*`, `gc+ergo*`, `gc+ref*` — these are wildcards on
a two-tag combination, matching supersets of `{gc, age}` and so on, not exact matches.

## Runtime flags → `-Xlog`

From the same page, "Convert Runtime Logging Flags to Xlog", prefaced with: "These legacy
flags are no longer recognized and will cause an error if used directly."

| Legacy flag                 | `-Xlog` equivalent                        |
| --------------------------- | ----------------------------------------- |
| `TraceClassLoading`         | `-Xlog:class+load=level` (info / debug)   |
| `TraceClassUnloading`       | `-Xlog:class+unload=level` (info / trace) |
| `TraceClassLoadingPreorder` | `-Xlog:class+preorder=debug`              |
| `TraceClassResolution`      | `-Xlog:class+resolve=debug`               |
| `TraceClassInitialization`  | `-Xlog:class+init=info`                   |
| `TraceClassPaths`           | `-Xlog:class+path=info`                   |
| `TraceLoaderConstraints`    | `-Xlog:class+loader+constraints=info`     |
| `TraceClassLoaderData`      | `-Xlog:class+loader+data=level`           |
| `TraceExceptions`           | `-Xlog:exceptions=info`                   |
| `VerboseVerification`       | `-Xlog:verification=info`                 |
| `TraceSafepointCleanupTime` | `-Xlog:safepoint+cleanup=info`            |
| `TraceSafepoint`            | `-Xlog:safepoint=debug`                   |
| `TraceMonitorInflation`     | `-Xlog:monitorinflation=debug`            |
| `TraceRedefineClasses`      | `-Xlog:redefine+class*=level`             |

Also: `-verbose:class` is equivalent to `-Xlog:class+load=info,class+unload=info`.

Every replacement in both tables still goes through the verification workflow in the body.
The mapping tells you the tag-set; it does not tell you that this JDK logs anything at that
level.

## `-XX:+PrintCompilation` is the odd one out

It is not removed and it is not unified logging. It remains a product flag on JDK 25 and
writes its own format to stdout, bypassing the framework entirely: no tags, no decorators,
no `file=`, no rotation, no async, and no `jcmd` control. The UL replacement is
`-Xlog:jit+compilation` on JDK 25+ or `-Xlog:jit+compilation=debug` on JDK 21 — see
`references/selection-syntax.md` for why the level differs.

[JDK-8356259](https://bugs.openjdk.org/browse/JDK-8356259) states the intent: the `jit*`
selections "serve as convenient replacements for `-XX:+PrintCompilation`,
`-XX:+PrintInlining`, etc. … because UL can be forwarded to file, their format can be
adjusted, and they can be handled asynchronously". The original RFE for that path,
[JDK-8172285](https://bugs.openjdk.org/browse/JDK-8172285), shipped in JDK 10.
