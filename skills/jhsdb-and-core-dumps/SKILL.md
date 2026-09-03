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

Extract state from a JVM that can no longer cooperate. Attach-based `jstack`, `jmap` and
`jcmd` ask the target JVM to execute diagnostic work, so they need a live, responsive
attach path; individual commands have different safepoint/handshake impact. The
Serviceability Agent reads HotSpot memory externally, live or from a core. Live SA attach
still suspends and can destabilize the target; core-file analysis is the safe post-mortem
mode.

The failure this prevents is arriving at the incident with no readable artefact. Automatic
core dumps need three independent settings to be right **before** the crash; hs_err is
routinely deleted by log rotation; and a `jhsdb` from a slightly different build reads the
wrong binary offsets and fails in ways that do not name their own cause.

## Workflow

1. **Triage the artefacts before touching a tool.** hs_err present? Core present?
   `OutOfMemoryError` in the application log? Nothing at all? Each combination points
   somewhere different, and the empty case is itself evidence.
2. **Read hs_err first, in this order.** Header (signal or `fatal error:` text and the
   problematic frame letter), `Current thread` state, `Native frames` / `Java frames`,
   `Heap:` and `Metaspace:`, then the `Events` sections (`Internal exceptions`,
   `Deoptimization events`, `GC Heap History`), `VM Arguments`, and the `S Y S T E M`
   block with rlimits and — on Linux — the cgroup limits. It is the cheapest artefact
   and it usually names the direction.
3. **If nothing exists, check the kernel.** `dmesg` and `journalctl -k` for an OOM kill
   before assuming an application bug.
4. **Capture a core with a real method** — `gcore`, GDB `generate-core-file`, or a
   deliberate fatal signal — and know which stops temporarily, which terminates, how
   `core_pattern` routes output, and what `coredump_filter` omits.
5. **Analyse with the matching build.** Run the `jhsdb` from the same `$JAVA_HOME` that
   produced the process or the core, then GDB for native registers and memory.
6. **Name the gaps in the evidence.** Unmounted virtual threads appear in neither
   `jstack` nor `jhsdb jstack`; say so rather than concluding from their absence.
7. **Size from measurement, not a rule of thumb.** Before concluding "the container was
   too small", recompute expected JVM memory from an NMT reading under load —
   jvm-memory-regions owns that budget.

## Rules

- Three artefacts, three mechanisms: a heap dump is a JVM concept (the Java object graph),
  a core dump is an OS concept (all mapped process memory), hs_err is text the JVM writes
  from a signal handler. Do not look for one where another exists.
- Run `jhsdb` from the **same exact vendor/update/build** as the target and retain its
  launcher, `libjvm`, dependent libraries and symbols. The SA reads HotSpot
  internals by binary offset via `VMStructs`, not through a stable API, so a different
  build of the same major version can misread offsets, throw
  `sun.jvm.hotspot.debugger.DebuggerException`, or exit quietly without naming the cause.
- `jcmd <pid> VM.native_memory summary` produces no core dump. It prints an NMT text report
  and requires `-XX:NativeMemoryTracking` on the target. There is no NMT path to a core
  dump.
- `gcore -o core <pid>` and GDB `generate-core-file` suspend the process while capturing
  and normally resume it afterwards; that pause, page pressure and debugger attach are
  production-impacting and the process may still need restart. `kill -ABRT <pid>`
  `kill -ABRT <pid>` **kills it**. Use the last one only where losing the process is
  acceptable — a redundant replica the orchestrator will recreate.
- Automatic core dumps on crash need all three of `ulimit -c` (not `0`),
  `/proc/sys/kernel/core_pattern` pointing somewhere with room, and
  `-XX:+CreateCoredumpOnCrash` (default `true` since JDK 9). Without the ulimit the flag
  does nothing, because the kernel writes the core, not the JVM. Under systemd this also
  means `LimitCORE=infinity`.
- Size the destination from representative mapped/resident state, sparse-file behavior,
  `coredump_filter`, compression and retention. Worst-case planning approaches heap plus
  native mappings, but core size is not a fixed `-Xmx + constant` formula.
- Set `-XX:ErrorFile=` to a writable, persistent path — not a container's ephemeral working
  directory — and exclude `hs_err_pid*.log` from log rotation. It is the most valuable
  artefact of a crash and the most commonly deleted. Where no persistent path exists,
  `-XX:+ErrorFileToStderr` (or `ErrorFileToStdout`) writes the whole report to the
  stream the log pipeline already captures, so a pod that is replaced seconds after the
  crash still leaves its hs_err in the log store.
- A `-XX:+CrashOnOutOfMemoryError` crash is an hs_err whose header reads
  `fatal error: OutOfMemory encountered: <region>` with an `Internal Error (debug.cpp…)`
  line, not a signal — do not hunt for a native bug in it. Which of `Exit…`/`Crash…` to
  run is decided in jvm-memory-regions.
- Read the problematic-frame letter: `J` is JIT-compiled (the tier is on the same line),
  `j` interpreted, `V` a JVM internal, `v` a JVM-generated stub, `C` native code. A crash
  in `V` with a pattern that varies between crashes keeps several hypotheses alive:
  native/Unsafe/FFM corruption, a JVM defect and hardware. Check all three with native
  provenance, reproduction across builds/`-Xint`, EDAC/RAS evidence and core inspection.
- `jhsdb jstack`, including `--mixed` and `--locks`, inherits the classic `jstack` blindness
  to **unmounted virtual threads** — both enumerate from threads, and an unmounted virtual
  thread's stack lives as a `StackChunk`/`Continuation` on the Java heap. Use
  `jcmd <pid> Thread.dump_to_file -format=json` while the process is still alive; against a
  core there is no equivalent, and that gap must be stated, not glossed over.
- SIGKILL cannot be handled, so a Linux OOM kill produces no JVM hs_err/core and may leave
  no application log. Exit code 137 means SIGKILL—not its cause; manual kill, orchestrator
  grace-time expiry and node action look identical. Confirm an OOM kill from cgroup/kernel/
  orchestrator evidence rather than treating absence plus 137 as a signature.
- Never enter `#` comments inside a systemd `ExecStart=` line continuation. Comments are
  only recognised at the start of a line, so one placed inside a `\` continuation becomes
  part of the value.
- `-XX:+AlwaysPreTouch` is not an anti-swap flag. It moves initial heap-page population to
  startup, raising startup time and RSS sooner; it can reduce later first-touch faults but
  cannot guarantee absence of faults, reclaim or swapping.
- Total JVM memory is `-Xmx` plus every non-heap region. Measure it with NMT under
  representative load — not once, at idle, and not with a generic "+500 MB to 1 GB". The
  per-region budget and the NMT reading are jvm-memory-regions; with NMT on, the hs_err
  itself carries a `Native Memory Tracking:` section with the last known decomposition.
- Record the time, approximate load and process uptime alongside the artefacts. A dump
  without that context supports far fewer conclusions.
- Treat cores and hs_err as secrets: cores contain heap/native plaintext, keys and tokens;
  hs_err can contain command lines and environment values. Encrypt, restrict, hash for
  provenance and expire them under incident-data policy.

## References

- [Crash triage](references/crash-triage.md) — the artefact decision tree, the hs_err
  section map as JDK 25 writes it with the reading order, frame letters and thread states,
  the Java `OutOfMemoryError` versus Linux OOM Killer comparison, and the pre-crash /
  capture / analysis checklist. Read when a process has died and you are deciding what
  happened.
- [jhsdb and core dump commands](references/jhsdb-commands.md) — every `jhsdb` mode and its
  arguments, CLHSDB interactive commands, core generation with `gcore`, GDB and
  `kill -ABRT`, GDB inspection of a core, and a production JVM configured for crash
  analysis. Read when capturing or inspecting a dump.
