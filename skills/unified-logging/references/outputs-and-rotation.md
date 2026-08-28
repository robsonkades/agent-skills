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

`%hn` is **JDK 23+** (`HostnameFilenamePlaceholder` is absent at `jdk-21+35` and
`jdk-22+36`). On JDK 21 and 22 it is not an error: the token is left literal in the
filename, so the log lands in a file actually named `gc-%hn.log`. `%p` and `%t` are
available throughout.

`file=gc-%p-%t.log` is the answer to both "several JVMs on one host overwrite each other's
log" and "the restart archived away the log I wanted".

## Decorators

Prepended to every line, **always in the order below, regardless of the order written** —
so `pid,uptime` and `uptime,pid` produce byte-identical output. A parser author who
assumes flag order is field order is wrong.

| Decorator      | Short | Prints                                            |
| -------------- | ----- | ------------------------------------------------- |
| `time`         | `t`   | current date and time, ISO-8601                   |
| `utctime`      | `utc` | the same, in UTC                                  |
| `uptime`       | `u`   | seconds and millis since JVM start, e.g. `6.567s` |
| `timemillis`   | `tm`  | `System.currentTimeMillis()`                      |
| `uptimemillis` | `um`  | millis since JVM start                            |
| `timenanos`    | `tn`  | `System.nanoTime()`                               |
| `uptimenanos`  | `un`  | nanos since JVM start                             |
| `hostname`     | `hn`  | host name                                         |
| `pid`          | `p`   | process id                                        |
| `tid`          | `ti`  | thread id                                         |
| `level`        | `l`   | message level                                     |
| `tags`         | `tg`  | message tag-set                                   |

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

Defaults: `filecount=5`, `filesize=20M`, `foldmultilines=false` — i.e. 100 MB of history
before the oldest slot is reused.

`foldmultilines=true` is safe for UTF-8 and may corrupt Shift-JIS or BIG5 output.

## Rotation semantics

Naming: the active file keeps the configured name; rotated files get a suffix `.0`, `.1`,
… zero-padded to the digit width of `filecount - 1`. **The numbering starts at 0**, so
`filecount=3` yields `x.log`, `x.log.0`, `x.log.1`, `x.log.2` — four files on disk.

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
- The slot to reuse is chosen by comparing file modification times, so the oldest is
  overwritten.
- Special case: if the target is a FIFO or named pipe and `filecount` was left at its
  default, the JVM forces `filecount = 0` rather than rotate a pipe.

Measured on Temurin 25.0.3; the archiving code is the same at `jdk-25+36` as the behaviour
described.

**Design consequence.** For a diagnostic log that must survive an incident, pick one:
raise `filecount` well above the expected restart count, or put `%p`/`%t` in the filename
so restarts never collide. Leaving the defaults on a service that crash-loops means the
log is guaranteed to be gone by the time anyone reads it.
