# Outputs, decorators and rotation

Read when configuring a file output that must survive production, or when a log is
missing, truncated or unparseable after a restart.

## Outputs

Three exist: `stdout` (the default), `stderr`, and `file=<filename>`.

`stdout` and `stderr` are outputs `#0` and `#1`. They can be silenced (`all=off`) but
**cannot be removed** — the JVM only deletes outputs with an index above 1.

Filename placeholders, expanded once at JVM start:

| Placeholder | Expands to        |
| ----------- | ----------------- |
| `%p`        | process id        |
| `%t`        | startup timestamp |
| `%hn`       | host name         |

`%hn` is **JDK 23+** — [JDK-8327410](https://bugs.openjdk.org/browse/JDK-8327410) "Add
hostname option for UL file names", integrated 2024-04-04; `HostnameFilenamePlaceholder`
is absent at `jdk-21+35` and `jdk-22+36`. On JDK 21 and 22 it is not an error: the token
is left literal in the filename, so the log lands in a file actually named `gc-%hn.log`.
`%p` and `%t` are available throughout. Executed on 25.0.3, `file=ph-%p-%t-%hn.log`
produced `ph-70276-2026-09-02_13-01-47-Kades.log` — `%t` is `YYYY-MM-DD_HH-MM-SS`, local
time.

`file=gc-%p-%t.log` is the answer to both "several JVMs on one host overwrite each other's
log" and "the restart archived away the log I wanted". In a container `%p` alone is not:
the process usually gets the same pid on every start, so it is `%t` that separates runs.

**The directory must exist.** A path whose directory is missing refuses the JVM at start:
`[error][logging] Error opening log file 'nodir/sub/gc.log': No such file or directory`,
`Initialization of output 'file=nodir/sub/gc.log' using options '(null)' failed.` on
stdout, `Invalid -Xlog option` on stderr, exit 1 (executed). A relative path resolves
against the process working directory, which in a container is whatever `WORKDIR` said.

**A file output needs a regular file.** With `filecount > 0` and an existing target that
is not a regular file, `LogFileOutput::initialize` fails with `Unable to log to file %s
with log file rotation: %s is not a regular file` — which is what `file=/dev/stdout` hits
on the default rotation settings (`logFileOutput.cpp` at `jdk-25+36`; not executed here,
no `/dev` on the verification host). The `stdout` output is the supported spelling.

## Decorators

Prepended to every line, **always in the order below, regardless of the order written** —
so `pid,uptime` and `uptime,pid` produce byte-identical output. A parser author who
assumes flag order is field order is wrong.

| Decorator      | Short | Prints                                                         | Executed, 25.0.3               |
| -------------- | ----- | -------------------------------------------------------------- | ------------------------------ |
| `time`         | `t`   | local date and time, ISO-8601, offset **without a colon**      | `2026-09-02T13:00:43.161-0300` |
| `utctime`      | `utc` | the same, in UTC                                               | `2026-09-02T16:00:43.161+0000` |
| `uptime`       | `u`   | seconds and millis since JVM start                             | `0.008s`                       |
| `timemillis`   | `tm`  | `System.currentTimeMillis()`                                   | `1788364843161ms`              |
| `uptimemillis` | `um`  | millis since JVM start                                         | `8ms`                          |
| `timenanos`    | `tn`  | `System.nanoTime()`                                            | `455976702913300ns`            |
| `uptimenanos`  | `un`  | nanos since JVM start                                          | `8071500ns`                    |
| `hostname`     | `hn`  | host name                                                      | `Kades`                        |
| `pid`          | `p`   | process id                                                     | `57700`                        |
| `tid`          | `ti`  | **OS thread id** — not `Thread.getId()`, not the JFR thread id | `40136`                        |
| `level`        | `l`   | message level                                                  | `info`                         |
| `tags`         | `tg`  | message tag-set, padded to the widest tag-set on the output    | `gc`                           |

The `-0300` offset is the ISO-8601 basic form; a parser written for `-03:00` rejects it.
`tid` matches the `nid` in a thread dump and the `tid:` in `os+thread` lines, which is how
a log line is joined to a thread.

Default: `uptime, level, tags`. `none` turns all decorations off — including the
timestamp, which makes the log unusable for anything time-based. The man page's own
example `-Xlog:gc=debug:file=gc.txt:none` hands you exactly that.

This table was verified on Temurin 25.0.3 and against the JDK 25 man page. The JDK 21
decorator list was not independently verified.

Two consequences worth designing around:

- **Decorators attach to the output, not to the selection.** Two `-Xlog` arguments naming
  the same file leave every line with the last argument's decorators, so a downstream
  parser keyed on `^\[\d+\.\d+s\]\[info\]\[gc\]` can start matching zero lines while the
  log still looks well-formed to a human.
- **Third-party log parsers generally expect the default `uptime,level,tags`.** Adding
  `pid` or `hostname` for a log aggregator may break them. (Mechanism — no specific parser
  was tested.)

Adding `time` alongside `uptime` is usually worth it: one correlates with the incident
timeline, the other with process lifetime.

## Output options

| Option                       | Meaning                                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| `filecount=N`                | rotated files kept, **not counting the active file**; upper bound 1000                             |
| `filesize=N[K\|M\|G]`        | target byte size that triggers rotation                                                            |
| `foldmultilines=true\|false` | fold a multi-line event onto one line, escaping `\n` and doubling existing `\` so it is reversible |

Defaults: `filecount=5`, `filesize=20M`, `foldmultilines=false` — i.e. 100 MB of archived
history plus an active file of up to 20 MB: the disk bound per output is
`(filecount + 1) × filesize`, 120 MB at the defaults. The size suffix is case-insensitive
(`20m` executed). `filecount` above 1000 refuses the JVM with `Invalid option: filecount
must be in range [0, 1000]` (executed).

`filecount` and `filesize` are **file** options: on `stdout` or `stderr` they refuse the
JVM with `Invalid option 'filecount' for log output (stdout).` (executed). Only
`foldmultilines` applies to every output.

`foldmultilines=true` is safe for UTF-8 and may corrupt Shift-JIS or BIG5 output. It is
the fix for line-oriented collectors: an `exceptions` event is three lines, the
continuation lines carrying an empty decoration block, and folding writes it as one line
with literal `\n` (executed on `file=` and `stderr`).

## Rotation semantics

Naming: the active file keeps the configured name; rotated files get a suffix `.0`, `.1`,
… zero-padded to the digit width of `filecount - 1` (`"%s.%0*u"` in `logFileOutput.cpp`).
**The numbering starts at 0**, so `filecount=3` yields `x.log`, `x.log.0`, `x.log.1`,
`x.log.2` — four files on disk — and `filecount=11` yields `x.log.00` … `x.log.10`
(executed). A glob written for `.0`–`.9` misses the two-digit files.

Size is approximate. The man page says the target "isn't guaranteed to be exact"; JEP 158
bounds it: the file can overflow by at most the size of the last message written.

The two zeros mean different things, and confusing them destroys evidence:

| Setting                         | Behaviour                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------- |
| `filecount=0`                   | rotation **disabled**; the existing file is **truncated at startup**; `jcmd VM.log rotate` no-ops |
| `filesize=0` with `filecount>0` | never rotates automatically, but `jcmd VM.log rotate` works — the operator-triggered capture      |

`filecount=0` is the common misreading of "keep everything". The source truncates
explicitly (`os::ftruncate(...)` when `_file_count == 0` and the path is a regular file),
so the previous run's log is gone on every restart.

## Restart behaviour

Decided at output initialisation:

- **`filecount > 0`** — an existing file is **archived** into the next slot and a fresh
  active file is opened. **Every restart therefore consumes one rotation slot.** Three
  consecutive `java -Xlog:gc*:file=fc3.log::filecount=3 -version` runs left `fc3.log`,
  `fc3.log.0` and `fc3.log.1`. A crash-restart loop with the default `filecount=5` erases
  the entire history in five restarts.
- **`filecount = 0`** — the existing file is truncated and lost. Two consecutive runs left
  one file and no archives.
- The slot is chosen by `next_file_number`: the first number in `[0, filecount)` with no
  file on disk, and only once every number is taken, the one with the oldest modification
  time (`os::compare_file_modified_times`). So a gap in the sequence is filled before
  anything is overwritten, and after that the oldest goes.
- Removing a file output with `jcmd` and adding it back under the same name goes through
  the same initialisation: the file is archived into a slot and a fresh one opened
  (executed, `references/runtime-reconfiguration.md`).
- Special case: if the target is a FIFO or named pipe and `filecount` was left at its
  default, the JVM forces `filecount = 0` rather than rotate a pipe.

Measured on Temurin 25.0.3; the archiving code is the same at `jdk-25+36` as the behaviour
described.

**Design consequence.** For a diagnostic log that must survive an incident, pick one:
raise `filecount` well above the expected restart count, or put `%p`/`%t` in the filename
so restarts never collide. Leaving the defaults on a service that crash-loops means the
log is guaranteed to be gone by the time anyone reads it.
