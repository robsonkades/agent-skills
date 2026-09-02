# Production baseline, container outputs and troubleshooting

Read when deciding what a service should log permanently and where the output should go,
when an `-Xlog` set in an environment variable is not the one that ran, or when a log that
should exist is missing, empty, truncated or unparseable.

Everything marked "executed" was run on Temurin 25.0.3 (Windows 11, x86-64); a 3-second
allocation workload driving about 80 young pauses, one run per row unless stated. Rates on
a real service differ by orders of magnitude — the columns say what a line _is_, so the
rate can be estimated from the workload.

## What to log always

| Selection          | One line per…                                | Executed: lines / bytes in 3 s | Cost class         | Why it is in the baseline                                                                    |
| ------------------ | -------------------------------------------- | ------------------------------ | ------------------ | -------------------------------------------------------------------------------------------- |
| `gc*`              | pause, ~16 lines each                        | 1291 / 95 KB (80 pauses)       | per pause, ~1.2 KB | the GC evidence; gc-log-analysis owns reading it                                             |
| `safepoint`        | safepoint                                    | 80 / 18 KB                     | per safepoint      | the only view of time-to-safepoint; silent when idle on JDK 23+ (no periodic safepoints)     |
| `gc+init`          | startup only                                 | 16 / 0.8 KB                    | startup            | heap geometry, region size, worker counts — already inside `gc*`                             |
| `os`, `pagesize`   | startup only                                 | 4 / 0.5 KB, 7 / 0.8 KB         | startup            | library loads, polling page, page size per heap and code heap                                |
| `os+container`     | startup only (Linux cgroup discovery)        | 0 here — Windows               | startup            | which CPU and memory limits the JVM saw; container-awareness reads it. Not executed here     |
| `arguments`        | startup only                                 | 5 / 0.3 KB                     | startup            | `jvm_args` and `java_command` as actually run — settles "which flags were live" after a fact |
| `jit+compilation`  | compilation task (`=debug` on JDK 21)        | 51 / 5.6 KB                    | per compilation    | tens of thousands of lines in a service's first minutes, then a trickle; recompile storms    |
| `class+load`       | class loaded                                 | 636 / 58 KB                    | per class          | thousands at startup; then a signal of churn (lambdas, proxies, hidden classes)              |
| `os+thread`        | thread start and exit                        | 90 / 9.4 KB                    | per thread         | cheap unless threads churn; then it is the churn detector                                    |
| `exceptions`       | throw that reaches the runtime, 3 lines each | 111 events (see below)         | per throw          | only in a service whose exception rate is known to be low                                    |
| `monitorinflation` | deflation audit and statistics               | 12 / 1.1 KB (at exit)          | per audit          | cheap at `info`; per-inflation detail is a `debug` decision                                  |

Everything in the table is `info`. The **cost classes that are not acceptable without a
time box** are the ones whose rate is the workload's own rate at a level below info:
`gc*=trace` cost a quarter of throughput on this machine (`references/async-and-cost.md`),
`all=debug` wrote 3.8 MB and `all=trace` 16.5 MB in three seconds, `gc+phases=debug` alone
wrote 8178 lines for 80 pauses.

**`exceptions` undercounts, by design of the JIT.** The tag fires when an exception passes
through the runtime. Once C1 or C2 has compiled a method that throws and catches within
itself, the throw is resolved inside compiled code and never reaches a log site. Executed:
the same 1-second workload produced 241 events under `-Xint` and 111 with the JIT on, the
later events attributed to `C1 compiled method` and none to C2. Read the tag as "exceptions
that crossed a frame the runtime had to unwind", not as an exception counter.

A baseline that has been proven on this JDK:

```
-Xlog:gc*,safepoint,os,pagesize,arguments:file=/var/log/app/jvm-%t.log:time,uptime,level,tags:filecount=10,filesize=50m
```

Put `gc*` in a file of its own when a parser consumes it — most GC parsers expect a log that
holds only `gc` tag-sets — and share one file when a human does. Keep `time` **and**
`uptime`: the first correlates with the incident timeline, the second with process lifetime.

## Where the output goes in a container

The rule "never log to stdout in a service" is a trade, not a law. Three destinations,
each right somewhere:

| Destination                 | Choose when                                                                                                                                             | What it costs                                                                                                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file=` on a mounted volume | a volume exists (emptyDir, PVC, hostPath) and a file tailer or a sidecar ships it, or the file is evidence to be copied off during an incident          | the directory must exist at start or the JVM refuses to start (executed); a relative path resolves against the process working directory; a file on the container's own layer dies with the pod |
| `stderr`                    | the application's stdout is a parsed stream (JSON logs) that UL lines would corrupt, and the collector labels lines by stream so UL can be routed apart | shares stderr with uncaught-exception stack traces and the `Picked up …` notices; no rotation, so the runtime's own log rotation is the bound; multi-line events need `foldmultilines=true`     |
| `stdout`                    | nothing parses the application's stdout line by line, or the pipeline already tolerates lines starting with `[`                                         | interleaves with application output; JEP 158 guarantees only that a UL line is written whole                                                                                                    |

Facts that decide between them:

- **The JVM's own `all=warning` baseline is on stdout regardless** of where the file output
  points. A pipeline that must keep stdout pristine has to move it with `-Xlog:disable`
  followed by `-Xlog:all=warning:stderr` (the man-page form; the re-route itself was not
  executed here) — and then owns every warning the JVM would otherwise have printed.
- **Multi-line events exist.** `exceptions` writes one event as three lines, the second and
  third prefixed with an empty decoration block `[                        ]`. A per-line
  collector turns them into three records, two without a tag. `foldmultilines=true` on the
  output writes the event as one line with literal `\n` (executed on `file=` and `stderr`):

  ```
  [0.019s][info][exceptions] Exception <a 'java/lang/IllegalStateException'{0x…}: x>\n thrown in interpreter method <…>\n at bci 70 for thread 0x… (main)
  ```

- **`file=/dev/stdout` is not a way to get stdout.** With the default `filecount=5`,
  `LogFileOutput::initialize` refuses a target that exists and is not a regular file:
  `Unable to log to file %s with log file rotation: %s is not a regular file`, and the JVM
  does not start (`logFileOutput.cpp` at `jdk-25+36`; not executed here — no `/dev` on the
  verification host). `filecount=0` removes the check, and with it every rotation. Use the
  `stdout` output instead.
- **Restart archiving depends on the filesystem, not on the flag.** A fresh container layer
  has no previous file, so nothing is archived and no slot is consumed; on a volume every
  restart consumes one, and a crash loop erases the history in `filecount` restarts.
  `%t` in the name sidesteps both cases; `%p` alone does not, since a container usually
  gets the same pid every start.
- **Evidence written inside the container is gone with the pod.** The capture order and the
  path that outlives the process are `incident-evidence-capture`'s; this skill only has to
  make sure the file exists to be copied.

## Where the `-Xlog` came from

Three environment variables inject options, and they sit on different sides of the command
line. Executed with a `gc=off` in the variable against a `gc` on the command line, and the
reverse:

| Source              | Read by                                              | Position                             | Winner on overlap | Notice, on stderr                     |
| ------------------- | ---------------------------------------------------- | ------------------------------------ | ----------------- | ------------------------------------- |
| `JDK_JAVA_OPTIONS`  | the `java` launcher only                             | prepended to the command line        | the command line  | `NOTE: Picked up JDK_JAVA_OPTIONS: …` |
| `JAVA_TOOL_OPTIONS` | the VM itself — every launcher, embedded JVMs, tools | processed before the command line    | the command line  | `Picked up JAVA_TOOL_OPTIONS: …`      |
| `_JAVA_OPTIONS`     | the VM itself; undocumented                          | processed **after** the command line | **the variable**  | `Picked up _JAVA_OPTIONS: …`          |

"Overlap" follows the same-output merge rule in `references/selection-syntax.md`: only the
tag-sets the later selection mentions are rewritten, so a base image's
`JAVA_TOOL_OPTIONS=-Xlog:gc*:file=…` survives a command-line `-Xlog:safepoint` and is
silenced by a command-line `-Xlog:gc*=off`; with `_JAVA_OPTIONS` the direction reverses.
The notices go to stderr, so a container pipeline that keeps only stdout never shows that a
variable was picked up at all. `jcmd <pid> VM.log list` prints what is actually in effect,
whatever the source.

## Symptom to cause

| Symptom                                                                                | Cause, in the order worth checking                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JVM does not start; stderr says `Invalid -Xlog option '…', see error log for details.` | the reason is on **stdout** as `[error][logging] …`: `Invalid tag 'x' in log selection.`, `Invalid level 'x' in log selection.`, `Invalid decorator 'x'.`, `Invalid tag '' in log selection.` (a `gc+*` spelling), `Invalid option 'filecount' for log output (stdout).` (file options on a console output), `Invalid option: filecount must be in range [0, 1000]`, `Error opening log file '…': No such file or directory` — all executed |
| JVM running, file exists, 0 bytes                                                      | the selection matched no tag-set (warning on stdout, not in the file); the tag-set fires below the level asked; a later `-Xlog` or `_JAVA_OPTIONS` turned it off; the file belongs to another process on the same name — `jcmd <pid> VM.log list` shows the effective selection per output                                                                                                                                                  |
| No file at all                                                                         | the JVM refused to start (see the first row); the path is relative and the working directory is not the one assumed; the file was inside a container that has been replaced                                                                                                                                                                                                                                                                 |
| Log appears on the console but not in the file                                         | two outputs are live: the `all=warning` stdout baseline, or a second `-Xlog:<sel>` without `file=` that went to stdout while the file got a different selection                                                                                                                                                                                                                                                                             |
| Previous run's log gone after a restart                                                | `filecount=0` truncates at start; with `filecount>0` it was archived — look in `.0`…`.N`; a crash loop exhausted the slots                                                                                                                                                                                                                                                                                                                  |
| Log stops mid-run, file is small                                                       | rotation: the history moved into the numbered files and the active file restarted; `jcmd VM.log rotate` by an operator; `VM.log disable` or `what=all=off` by an operator                                                                                                                                                                                                                                                                   |
| Lines missing while the log looks complete                                             | `-Xlog:async` in `drop` mode — `grep "messages dropped"`; each notice carries the count for its output                                                                                                                                                                                                                                                                                                                                      |
| Selection changed after a `jcmd VM.log` that only touched decorators                   | `VM.log output=… decorators=…` without `what=` re-selects `all=info` on that output (executed)                                                                                                                                                                                                                                                                                                                                              |
| Parser matches zero lines on a log that looks right                                    | a later `-Xlog` on the same output replaced the decorators; `time` prints the offset as `-0300`, without a colon; the tags field is padded to the widest tag-set on the output; multi-line events; `tid` is the OS thread id, not `Thread.getId()`                                                                                                                                                                                          |
| Disk full                                                                              | a `debug`/`trace` selection: the bound per output is `(filecount + 1) × filesize` — 120 MB at the defaults, per output, per JVM; `filecount=0` or `filesize=0` removes the bound                                                                                                                                                                                                                                                            |
| `jcmd` says `Unknown argument 'async' in diagnostic command`                           | async is command-line only; restart                                                                                                                                                                                                                                                                                                                                                                                                         |
| `jcmd … output=#2` does nothing or errors in a shell                                   | `#` starts a comment in `sh`; quote the argument                                                                                                                                                                                                                                                                                                                                                                                            |
| `-Xlog:jit+compilation` silent on JDK 21, works on 25                                  | the call sites moved from `debug` to `info` in JDK 25 (JDK-8356259); write `=debug` for both                                                                                                                                                                                                                                                                                                                                                |
