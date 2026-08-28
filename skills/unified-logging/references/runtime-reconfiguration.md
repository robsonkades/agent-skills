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
Options:
    output         : name or index (#<index>) of the output to configure   (STRING)
    output_options : options for the output                                (STRING)
    what           : what tags to log                                      (STRING)
    decorators     : which decorators to use; 'none' or empty removes all  (STRING)
    disable        : turn off all logging and clear the configuration      (BOOLEAN)
    list           : list the current log configuration                    (BOOLEAN)
    rotate         : rotate all logs                                       (BOOLEAN)
```

## Recipes

**Inspect first.** `jcmd <pid> VM.log list` prints the live configuration plus the same
tag, level and decorator lists as `-Xlog:help` — so it also answers "which tags does this
running JVM have". On a JVM started with no logging flags it shows the baseline:

```
#0: stdout all=warning uptime,level,tags foldmultilines=false
```

**Add a rotating file output:**

```
jcmd <pid> VM.log output=file=rt.log what=gc*=debug \
     decorators=uptime,level,tags output_options=filecount=3,filesize=1m
```

`VM.log list` then reports it as

```
#2: file=rt.log all=off,gc*=debug uptime,level,tags foldmultilines=false,filecount=3,filesize=1024K,async=false (reconfigured)
```

**Stop one output.** There is no per-output `disable` verb — set it to `all=off`, which
removes the output and closes the file:

```
jcmd <pid> "VM.log output=file=a.log what=all=off"
```

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
  `java.lang.IllegalArgumentException: Unknown argument 'async' in diagnostic command`.
  `-Xlog:async` is a command-line-only decision; `VM.log list` reports it per output as
  read-only state. Turning async on requires a restart.
- **`decorators` is per output, not per selection** — the same limitation as the command
  line. Reconfiguring decorators rewrites them for every selection on that output.
- **`disable` is all-or-nothing.** There is no "disable output #2"; use `what=all=off`.
- **`rotate` is all-or-nothing** across outputs.
- **`stdout`/`stderr` can be silenced but never removed.**
- **Output indices are not stable.** Removing `#2` renumbers `#3` to `#2`. Addressing by
  index works, but **scripts must address outputs by name**.

Two further constraints, reasoned from the source and from how `jcmd` works rather than
measured here:

- Reconfiguration takes the configuration lock and forces an `AsyncLogWriter::flush()`
  before swapping decorators or outputs, so a `VM.log` call against a saturated async
  logger blocks until the buffer drains. The stall was not measured.
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
