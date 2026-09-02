---
name: unified-logging
description: >
  Constructing and verifying a HotSpot -Xlog configuration: tag-set versus wildcard
  selection, levels, decorators, outputs, rotation, async logging, `jcmd VM.log`, and
  pre-JDK-9 flag migration. Use when -Xlog produces an empty or zero-byte file, when a
  tag-set has to be chosen for a subsystem, when a log is missing or truncated after a
  restart, when a pre-JDK-9 flag such as -XX:+PrintGCDetails or -XX:+TraceClassLoading sits
  in a startup script, when a JVM refuses to start on an -Xlog option, when logging must be
  toggled without a restart, when asked what -Xlog costs, or where a container's log should
  go. Produces a log that exists and holds what was meant; does not interpret it — a GC log
  is gc-log-analysis, safepoints and time-to-safepoint are safepoints and pause-attribution,
  compilation output is compilation-and-inlining-logs and deoptimization, code cache is
  code-cache-segments, class loading is jvm-class-loading, CDS and AOT are
  startup-cds-crac-leyden, and application logging is structured-logging.
---

# Unified Logging

## Purpose

`-Xlog` fails in three different ways, and the two that matter are silent. A wrong tag
stops the JVM from starting, which is loud and cheap. A valid selection that matches no
tag-set warns **on stdout, never into the file you named**, exits 0, and leaves a 0-byte
file. A valid tag-set logged at a level where nothing fires warns not at all, and leaves
the same 0-byte file. Both silent cases are discovered during the incident the log was
supposed to explain.

This skill ends with a configuration that has been proven to emit the tag-set that was
intended, on the JDK that will actually run it.

## Scope

**Covers:** selection syntax, tag-set semantics, levels, decorators, outputs, rotation,
async logging, `jcmd VM.log`, legacy flag migration, and the cost of enabling logging.

**Does not cover:** what any log line means. Handing over a produced log is the end of
this skill's work — see the neighbours named in the description.

## Workflow

1. **Pin the JDK version before writing a flag.** The tag list, the level of the
   `jit+compilation` call sites and the accepted `-Xlog:async` spellings all differ
   between JDK 21 and JDK 25. A flag validated on the wrong JDK is worth nothing.
2. **Discover the tags on that JDK**: `java -Xlog:help`. This is the only correct source.
   A tag list read from `logTag.hpp` over-counts a shipped product build — eight tags in
   the JDK 25 header are `NOT_PRODUCT`/`DEBUG_ONLY` and are absent from `-Xlog:help`.
3. **Choose a tag-set, not a tag** (table below). A tag existing does not mean a tag-set
   of that one tag exists: `jit` is a real tag, and `-Xlog:jit` alone matches nothing.
4. **Prove it on stdout, before any `file=`:**
   `java -Xlog:<selection> -version`, watching **stdout**. This is the only step that
   surfaces `No tag set matches selection: …` and its up-to-five suggestions. Adding
   `file=` moves the log into the file and leaves this diagnostic on stdout, which a
   container log pipeline usually discards. A refused start is split the same way: stderr
   carries only `Invalid -Xlog option '…', see error log for details.`; the reason is the
   `[error][logging]` line on stdout.
5. **Prove it on a representative workload, with the file attached**, and assert the
   content, not the exit code: the file is non-empty **and** contains the tag-set. Match
   the tag-set with a trailing-space tolerance, `grep -E '\[gc,age[ ]*\]' gc.log`, never
   `wc -l` and never an exact `\[gc\]`: UL pads the tags field to the width of the widest
   tag-set on that output, so a `{gc}` line under `gc*` prints as `[gc     ]` and an
   exact-bracket grep returns zero hits on a log that is working. This is the only step
   that catches a real tag-set at a level where nothing fires — do not let the assertion
   itself manufacture the empty result it is checking for.
6. **Only now add the production shape**: `file=`, `filecount`, `filesize`, decorators,
   `async`. Then re-read step 5's assertion once more if a second `-Xlog` argument points
   at the same output — decorators belong to the output and the last argument silently
   rewrites them for everything already routed there.
7. **If async is on, grep the log for `messages dropped`** before drawing any conclusion
   from it, and before handing it to an analysis skill.

## Selection forms

`-Xlog[:[selections][:[output][:[decorators][:output-options]]]]`, where a selection is
`tag1[+tag2...][*][=level][,...]`. Every HotSpot call site carries an unordered tag-set of
one to five tags; a selection is matched against whole tag-sets, never against message
text.

| Written        | Reads as                           | `{gc}` | `{gc,age}` | `{gc,age,ergo}` | `{safepoint}` | `{gc,safepoint}` |
| -------------- | ---------------------------------- | ------ | ---------- | --------------- | ------------- | ---------------- |
| `gc`           | exact `{gc}`                       | yes    | no         | no              | no            | no               |
| `gc+age`       | exact `{gc,age}`                   | no     | yes        | no              | no            | no               |
| `gc*`          | any superset of `{gc}`             | yes    | yes        | yes             | no            | yes              |
| `gc,safepoint` | exact `{gc}` ∪ exact `{safepoint}` | yes    | no         | no              | yes           | **no**           |

The comma is a union of independent selections, each with its own level
(`gc*=info,safepoint*=off`), and it deliberately excludes the intersection. The wildcard
binds to the whole preceding combination: `gc+class*` means "at least `gc` and `class`".

A level is a **threshold, not an equality**: `=debug` selects debug and everything more
severe, so a `gc=debug` file legitimately contains info lines. Levels are `off, trace,
debug, info, warning, error`.

## The three failure modes

| Input                                                                                       | JVM              | Exit | Diagnostic                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------- | ---------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unknown tag, level or decorator (`gcc`, `=verbose`, `::foobar`), or the `gc+*` spelling     | refuses to start | 1    | **on stdout**: `[error][logging] Invalid tag 'gcc' in log selection.` / `Invalid level 'verbose' in log selection.` / `Invalid decorator 'foobar'.` / `Invalid tag '' in log selection.`; stderr gets only `Invalid -Xlog option '…', see error log for details.` |
| Output cannot be initialised (directory missing, `filecount` on `stdout`, `filecount=1001`) | refuses to start | 1    | **on stdout**: `Error opening log file '…': No such file or directory` / `Invalid option 'filecount' for log output (stdout).` / `filecount must be in range [0, 1000]`, then `Initialization of output '…' … failed.`                                            |
| Valid tags, no matching tag-set (`gc+jit`)                                                  | starts           | 0    | `[warning][logging] No tag set matches selection` **on stdout only**                                                                                                                                                                                              |
| Valid tag-set, nothing fires at that level (`gc+age` at info)                               | starts           | 0    | **none at all** — empty file, no warning                                                                                                                                                                                                                          |

Verified by execution on Temurin 25.0.3; the wording of the diagnostics on JDK 21 is not
verified, but the split is structural. The two loud rows share one shape: stderr names the
option, stdout names the reason. The symptom-to-cause table is in
`references/production-and-troubleshooting.md`.

## Rules

- **Defaults are two different things.** With no `-Xlog` at all the JVM runs
  `all=warning:stdout:uptime,level,tags`. Bare `-Xlog` means `all=info:stdout` with the
  same decorators. Your `-Xlog` is added alongside the warning baseline, not instead of it.
- **`-Xlog:disable` clears the warning/error baseline too.** After it, JVM warnings and
  errors are silent unless explicitly re-enabled. Use it only when that is the intent.
- **The output destination is a decision, not a rule.** `file=` on a mounted volume when
  one exists; `stderr` when the application's stdout is a parsed stream and the collector
  labels lines by stream; `stdout` only when nothing parses it line by line. UL writes
  each line whole (JEP 158) and nothing more; `exceptions` events span three lines unless
  `foldmultilines=true`; `file=/dev/stdout` with rotation on refuses to start; and the
  `all=warning` baseline stays on stdout whatever the file says. The table is in
  `references/production-and-troubleshooting.md`.
- **A baseline exists that costs nothing measurable at `info`**: `gc*`, `safepoint`, and
  the startup-only tags `os`, `pagesize`, `arguments`. Everything at `debug` or `trace` is
  a time-boxed capture, not configuration — `gc*=trace` took a quarter of throughput on the
  one machine measured. Per-tag rates and the proven flag are in the same reference.
- **Rotation is not optional, and its defaults are not "keep everything":**
  `filecount=5, filesize=20M`, so `(filecount + 1) × filesize` = 120 MB on disk per output
  once the slots fill. `filecount=0` means no rotation
  **and truncate the existing file at startup** — it destroys the previous run's log and
  also disables manual rotation. To keep a file until an operator asks for a rotation, use
  `filesize=0` with `filecount>0`.
- **Every JVM restart archives the active file and consumes a rotation slot.** A crash
  loop erases the history in `filecount` restarts. Put `%p` (pid) or `%t` (start
  timestamp) in the filename when several JVMs share a host or restarts are expected.
- **Decorators are a property of the output, not of the selection.** Two `-Xlog` arguments
  naming the same file: the later decorator list wins for lines already routed there,
  silently. Decorator order is fixed by the framework, so `pid,uptime` and `uptime,pid`
  produce byte-identical output.
- **`-Xlog:async` is a restart-only decision.** `jcmd VM.log async=true` is rejected as an
  unknown argument, and `async=true` as an output option is `Invalid option 'async'` on the
  command line and in `jcmd`. Everything else about an output can be changed at runtime —
  but **always pass `what=` to `VM.log`**: `output=… decorators=…` alone re-selects
  `all=info` on that output, silently replacing whatever it logged.
- **Three environment variables inject `-Xlog`, on different sides of the command line.**
  `JDK_JAVA_OPTIONS` and `JAVA_TOOL_OPTIONS` lose to the command line on an overlapping
  tag-set; `_JAVA_OPTIONS` beats it. The `Picked up …` notices are on stderr.
  `jcmd <pid> VM.log list` is the only statement of what is in effect.
- **Do not quote an overhead percentage.** No citable published benchmark of UL overhead
  exists. The cost is dominated by message rate and by the selection: on one machine,
  `gc*` and `gc*=debug` sat inside run-to-run noise, `all=info` cost 7% and `gc*=trace`
  25% of throughput, and async recovered most of the latter. Those are observations with a
  method attached (`references/async-and-cost.md`), not figures to repeat. If a number is
  needed, measure it on the target and report the method.
- **Pre-JDK-9 flags split three ways**, unchanged across JDK 21, 25 and 26. `-XX:+PrintGC`,
  `-XX:+PrintGCDetails` and `-Xloggc:` still work as deprecated aliases with a warning.
  Most of the rest (`PrintGCTimeStamps`, `PrintTenuringDistribution`, `PrintReferenceGC`,
  `PrintAdaptiveSizePolicy`, `UseGCLogFileRotation`, the `Trace*` family,
  `PrintSafepointStatistics`) were removed before JDK 21 and the **JVM refuses to start**.
  `-XX:+PrintCompilation` is neither: it is a live product flag that is not unified
  logging at all.
- **Ask rather than guess** when the target JDK version, the subsystem of interest, or
  whether the log is for a one-off capture or permanent production configuration is
  unstated. Each changes the answer.

## References

- [Selection syntax and finding the right tag-set](references/selection-syntax.md) — how
  multiple `-Xlog` arguments merge or override, how to go from "I want to see X" to a
  tag-set, the JDK 21→25→26 tag deltas, and the worked `jit` versus `compilation` case
  including the JDK 21/25 level change. Read when choosing what to log, or when a
  selection produced nothing, too much, or the wrong thing.
- [Outputs, decorators and rotation](references/outputs-and-rotation.md) — the full
  decorator table, output options, exact rotation and restart-archiving semantics, and
  filename placeholders. Read when configuring a file output that must survive production,
  or when a log is missing, truncated or unparseable after a restart.
- [Runtime reconfiguration with jcmd](references/runtime-reconfiguration.md) — `VM.log`
  syntax, recipes for adding, silencing and rotating an output on a live JVM, and the six
  things it cannot do. Read when logging must change without a restart.
- [Async logging and cost](references/async-and-cost.md) — `-Xlog:async` by JDK version,
  `drop` versus `stall`, `AsyncLogBufferSize`, how dropped messages are reported, and one
  single-machine measurement with its full method. Read when logging sits on a hot path,
  when message volume is high, or when asked whether `-Xlog` is expensive.
- [Legacy flag migration](references/legacy-flags.md) — the removed / deprecated / alive
  classification and the official mapping tables from GC and runtime flags to `-Xlog`.
  Read when a pre-JDK-9 flag appears in a startup script or a JVM fails to start on an
  unrecognised `-XX:+Print…` or `-XX:+Trace…` option.
- [Production, containers and troubleshooting](references/production-and-troubleshooting.md)
  — what to log always with the per-tag rate and cost class, the `exceptions` undercount
  under the JIT, the file / `stderr` / `stdout` decision for a container, the
  `JDK_JAVA_OPTIONS` / `JAVA_TOOL_OPTIONS` / `_JAVA_OPTIONS` precedence, and the
  symptom-to-cause table. Read when writing the permanent configuration for a service,
  when the log that ran is not the one that was written, or when a log is missing, empty
  or unparseable and the cause is not yet known.
