---
name: jhsdb-and-core-dumps
description: >
  Post-mortem inspection of a dead or hung JVM: reading hs_err, producing a usable core
  dump, the jhsdb modes (jstack, jmap, jinfo, clhsdb, hsdb) against a core or a live
  process, and the build and symbol requirements that make a dump readable. Use when a
  process died and left an hs_err_pid file, when jstack or jcmd hangs against a wedged JVM,
  when a container disappeared with exit code 137 and no log, when a crash points at a J/V/C
  frame, when jhsdb reports DebuggerException or nonsensical pointers, or when someone
  proposes generating a core dump with `jcmd VM.native_memory summary`. Does not cover heap
  dumps and retention analysis (heap-dump-analysis), why the process died at the host level
  (linux-for-jvm), or which memory region the failure was in (jvm-memory-regions).
---

# jhsdb And Core Dumps

## Purpose

Extract state from a JVM that can no longer cooperate. `jstack`, `jmap` and `jcmd` ask the
target JVM to produce the report itself over the Attach API, which needs it alive,
responsive and able to reach a safepoint. `jhsdb` asks nothing: the Serviceability Agent
reads the target's memory from outside, live or from a core file, which is why it still
works on a wedged process and on a corpse.

The failure this prevents is arriving at the incident with no readable artefact. Automatic
core dumps need three independent settings to be right **before** the crash; hs_err is
routinely deleted by log rotation; and a `jhsdb` from a slightly different build reads the
wrong binary offsets and fails in ways that do not name their own cause.

## Workflow

1. **Triage the artefacts before touching a tool.** hs_err present? Core present?
   `OutOfMemoryError` in the application log? Nothing at all? Each combination points
   somewhere different, and the empty case is itself evidence.
2. **Read hs_err first.** Problematic frame letter, thread state, heap summary, VM
   arguments, rlimits. It is the cheapest artefact and it usually names the direction.
3. **If nothing exists, check the kernel.** `dmesg` and `journalctl -k` for an OOM kill
   before assuming an application bug.
4. **Capture a core with a real method** — `gcore`, GDB `generate-core-file`, or
   `kill -ABRT` — and know which of the three kills the process.
5. **Analyse with the matching build.** Run the `jhsdb` from the same `$JAVA_HOME` that
   produced the process or the core, then GDB for native registers and memory.
6. **Name the gaps in the evidence.** Unmounted virtual threads appear in neither
   `jstack` nor `jhsdb jstack`; say so rather than concluding from their absence.
7. **Size from measurement, not a rule of thumb.** Recompute expected JVM memory from the
   NMT decomposition before any conclusion about container limits.

## Rules

- Three artefacts, three mechanisms: a heap dump is a JVM concept (the Java object graph),
  a core dump is an OS concept (all mapped process memory), hs_err is text the JVM writes
  from a signal handler. Do not look for one where another exists.
- Run the `jhsdb` from inside the **same `$JAVA_HOME`** as the target. The SA reads HotSpot
  internals by binary offset via `VMStructs`, not through a stable API, so a different
  build of the same major version can misread offsets, throw
  `sun.jvm.hotspot.debugger.DebuggerException`, or exit quietly without naming the cause.
- `jcmd <pid> VM.native_memory summary` produces no core dump. It prints an NMT text report
  and requires `-XX:NativeMemoryTracking` on the target. There is no NMT path to a core
  dump.
- `gcore -o core <pid>` and GDB `generate-core-file` leave the process running;
  `kill -ABRT <pid>` **kills it**. Use the last one only where losing the process is
  acceptable — a redundant replica the orchestrator will recreate.
- Automatic core dumps on crash need all three of `ulimit -c` (not `0`),
  `/proc/sys/kernel/core_pattern` pointing somewhere with room, and
  `-XX:+CreateCoredumpOnCrash` (default `true` since JDK 9). Without the ulimit the flag
  does nothing, because the kernel writes the core, not the JVM. Under systemd this also
  means `LimitCORE=infinity`.
- Size the core-dump destination for the whole heap plus native memory, not for a log file.
- Set `-XX:ErrorFile=` to a writable, persistent path — not a container's ephemeral working
  directory — and exclude `hs_err_pid*.log` from log rotation. It is the most valuable
  artefact of a crash and the most commonly deleted.
- Read the problematic-frame letter: `J` is JIT-compiled (the tier is on the same line),
  `j` interpreted, `V` a JVM internal, `v` a JVM-generated stub, `C` native code. A crash
  in `V` with a pattern that varies randomly between crashes is a reason to check hardware
  (EDAC, mcelog) before blaming the application.
- `jhsdb jstack`, including `--mixed` and `--locks`, inherits the classic `jstack` blindness
  to **unmounted virtual threads** — both enumerate from threads, and an unmounted virtual
  thread's stack lives as a `StackChunk`/`Continuation` on the Java heap. Use
  `jcmd <pid> Thread.dump_to_file -format=json` while the process is still alive; against a
  core there is no equivalent, and that gap must be stated, not glossed over.
- SIGKILL cannot be handled, so a Linux OOM kill produces no hs_err, no core dump and no
  application log. Total absence of artefacts plus exit code 137 is the signature; confirm
  in `dmesg`.
- Never enter `#` comments inside a systemd `ExecStart=` line continuation. Comments are
  only recognised at the start of a line, so one placed inside a `\` continuation becomes
  part of the value.
- `-XX:+AlwaysPreTouch` is not an anti-swap flag. It trades slower startup — every heap page
  touched at once — for the absence of page-fault jitter at runtime. It does nothing about
  swapping.
- Total JVM memory is `-Xmx` plus Metaspace, Direct Memory, Code Cache and JVM overhead.
  Measure each with `-XX:NativeMemoryTracking=summary` under representative load and after
  the process has run long enough for Metaspace and Code Cache to settle — not once, at
  idle, and not with a generic "+500 MB to 1 GB".
- Record the time, approximate load and process uptime alongside the artefacts. A dump
  without that context supports far fewer conclusions.

## References

- [Crash triage](references/crash-triage.md) — the artefact decision tree, hs_err anatomy
  with frame letters and thread states, the Java `OutOfMemoryError` versus Linux OOM Killer
  comparison, the JVM memory decomposition table, and the pre-crash / capture / analysis
  checklist. Read when a process has died and you are deciding what happened.
- [jhsdb and core dump commands](references/jhsdb-commands.md) — every `jhsdb` mode and its
  arguments, CLHSDB interactive commands, core generation with `gcore`, GDB and
  `kill -ABRT`, GDB inspection of a core, and a production JVM configured for crash
  analysis. Read when capturing or inspecting a dump.
