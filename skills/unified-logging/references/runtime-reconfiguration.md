# Runtime reconfiguration with `jcmd VM.log`

Read when logging must change without a restart — enabling a selection during an incident,
silencing a noisy output, or forcing a rotation to capture a window.

Everything here was executed against a live JVM on Temurin 25.0.3.

## Syntax

```
jcmd <pid> help VM.log

VM.log
Lists current log configuration, enables/disables/configures a log output, or rotates all logs.

Impact: Low: No impact

Syntax : VM.log [options]

Options: (options must be specified using the <key> or <key>=<value> syntax)
	output : [optional] The name or index (#<index>) of output to configure. (STRING, no default value)
	output_options : [optional] Options for the output. (STRING, no default value)
	what : [optional] Configures what tags to log. (STRING, no default value)
	decorators : [optional] Configures which decorators to use. Use 'none' or an empty value to remove all. (STRING, no default value)
	disable : [optional] Turns off all logging and clears the log configuration. (BOOLEAN, no default value)
	list : [optional] Lists current log configuration. (BOOLEAN, no default value)
	rotate : [optional] Rotates all logs. (BOOLEAN, no default value)
```

Quote any argument containing `#`: in `sh` it starts a comment, so
`jcmd <pid> VM.log output=#2 what=all=off` reaches the JVM as `VM.log output=`. Write
`jcmd <pid> 'VM.log output=#2 what=all=off'`.

## Recipes

**Inspect first.** `jcmd <pid> VM.log list` prints the same tag, level and decorator lists
as `-Xlog:help` — so it also answers "which tags does this running JVM have" — followed by
the live configuration, one line per output. A JVM started with
`-Xlog:gc:file=rtA.log` shows:

```
Log output configuration:
 #0: stdout all=warning uptime,level,tags foldmultilines=false
 #1: stderr all=off uptime,level,tags foldmultilines=false
 #2: file=rtA.log all=off,gc=info uptime,level,tags foldmultilines=false,filecount=5,filesize=20480K,async=false
```

`async=…` is displayed per output but is read-only state (below); `(reconfigured)` is
appended to any output touched through `VM.log`. This listing is the only statement of
what is in effect — it reflects every `-Xlog`, whichever environment variable injected
it, and every `jcmd` since.

**Add a rotating file output:**

```
jcmd <pid> VM.log output=file=rt.log what=gc*=debug \
     decorators=uptime,level,tags output_options=filecount=3,filesize=1m
```

`VM.log list` then reports it as

```
#2: file=rt.log all=off,gc*=debug uptime,level,tags foldmultilines=false,filecount=3,filesize=1024K,async=false (reconfigured)
```

**Change decorators on an existing output — with `what=` repeated.** An omitted `what`
is not "leave the selection alone": it is the empty selection, which means `all=info`,
exactly as bare `-Xlog` does. Executed: `output=file=rt.log decorators=time,level` turned
`#3: file=rt.log all=off,gc*=debug …` into `#3: file=rt.log all=info time,level …`. The
correct form restates the selection:

```
jcmd <pid> VM.log output=file=rt.log what=gc*=debug decorators=time,level
```

**Stop one output.** There is no per-output `disable` verb — set it to `all=off`, which
removes the output and closes the file:

```
jcmd <pid> "VM.log output=file=a.log what=all=off"
```

Adding the same file back later runs the full output initialisation: the existing file is
archived into a rotation slot and a fresh, empty file opened (executed — `rtA.log` became
`rtA.log.0`, 107 bytes, with a 0-byte `rtA.log` beside it). A capture that is stopped and
resumed by name therefore lands in two files. An output that cannot be opened at runtime
reports `Error opening log file '…': No such file or directory` and
`Initialization of output '…' using options '(null)' failed.` in the `jcmd` reply and
leaves the JVM and the other outputs untouched (executed).

**Rotate on demand:** `jcmd <pid> VM.log rotate`. It rotates **all** outputs, not a named
one, and it no-ops on any output with `filecount=0`.

**Kill everything:** `jcmd <pid> VM.log disable` sets both `stdout` and `stderr` to
`all=off` and removes every file output. It also discards the `all=warning` baseline, so
JVM warnings and errors go silent. Restore it explicitly with
`jcmd <pid> VM.log output=stdout what=all=warning`.

## Limits — the "everything can be done at runtime" claim is not quite true

The man page states that everything specifiable on the command line is also specifiable
via `VM.log`. In practice:

- **`async` cannot be set at runtime.** `jcmd <pid> VM.log async=true` fails with
  `java.lang.IllegalArgumentException: Unknown argument 'async' in diagnostic command`,
  and `output_options=async=true` with `Invalid option 'async' for log output (…)` — the
  same rejection the command line gives `-Xlog:gc:file=x.log::async=true`. `-Xlog:async`
  is a command-line-only, process-wide decision; `VM.log list` reports it per output as
  read-only state. Turning async on requires a restart.
- **`decorators` is per output, not per selection** — the same limitation as the command
  line. Reconfiguring decorators rewrites them for every selection on that output.
- **`disable` is all-or-nothing.** There is no "disable output #2"; use `what=all=off`.
- **`rotate` is all-or-nothing** across outputs.
- **`stdout`/`stderr` can be silenced but never removed.**
- **Output indices are not stable.** Removing `#2` renumbers `#3` to `#2`. Addressing by
  index works, but **scripts must address outputs by name**.

Two further constraints, read from the source and from how `jcmd` works rather than
measured here:

- `LogConfiguration::configure_output` runs under `ConfigurationLock` and calls
  `AsyncLogWriter::flush()` before it installs the new decorators ("It is now safe to set
  the new decorators for the actual output", `logConfiguration.cpp` at `jdk-25+36`), so a
  `VM.log` call against a saturated async logger blocks until the buffer drains. The stall
  was not measured.
- `jcmd` needs the attach mechanism: same user as the target process, and not started with
  `-XX:+DisableAttachMechanism`.

The man page also states that diagnostic commands are exposed automatically as MBeans, so
JMX can drive the same reconfiguration. That path was not exercised — the exact object
name and signature are unconfirmed here.

## When to prefer a restart

Runtime reconfiguration is the right tool for a live incident and for a bounded capture.
It is the wrong tool for a permanent configuration: nothing persists across a restart, and
the flag that will actually run in production is the one in the startup script, which
still has to go through the verification workflow in the body.
