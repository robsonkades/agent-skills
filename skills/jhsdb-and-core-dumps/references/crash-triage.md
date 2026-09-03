# Crash triage

## Which artefact do you have

```
Java process died
├── hs_err_pid*.log exists
│   ├── read header: signal, VM fatal error, or CrashOnOutOfMemoryError
│   ├── usable core exists -> verify completeness/build IDs, then jhsdb + GDB
│   └── no core            -> inspect JVM flag, RLIMIT_CORE, core_pattern handler,
│                             coredump_filter, storage and handler limits
└── no hs_err
    ├── application/runtime log shows OutOfMemoryError -> normal Java OOM/termination path;
    │                                                    look for attempted heap dump
    └── exit 137 / abrupt loss -> SIGKILL hypothesis; distinguish cgroup/kernel OOM,
                                  orchestrator grace expiry and manual/node action externally
```

## hs_err anatomy

```
#  SIGSEGV (0xb) at pc=0x00007f1234567890, pid=12345, tid=12346
# JRE version: OpenJDK Runtime Environment Temurin-25.0.3+9 (build 25.0.3+9-LTS)
# Problematic frame:
# J 1234 c2 com.example.HotMethod.compute(I)I (42 bytes)
```

A crash forced by `-XX:+CrashOnOutOfMemoryError` has a different header — no signal,
`Internal Error (debug.cpp:…)` and `fatal error: OutOfMemory encountered: Java heap space`
(or `Metaspace`); everything below it is the same report.

The file is written in the order the JVM can still produce it, which is not the order
that repays reading. The sections as JDK 25.0.3 writes them, with the reading order in
the left column:

| Read | Block                  | Sections                                                                                                                                                                                                                                                                                     | What it settles                                                                                                                                     |
| ---- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Header                 | signal or `fatal error:` line, `Problematic frame`, whether a core was written                                                                                                                                                                                                               | Native crash, JVM assertion, or a forced OOM crash; the frame letter                                                                                |
| 2    | `S U M M A R Y`        | `Command Line`, `Host` (cores, memory, OS), `Time` with `elapsed time`                                                                                                                                                                                                                       | Flags actually in effect; a crash at `elapsed time: 0.0…` is a start-up problem, not load                                                           |
| 3    | `T H R E A D`          | `Current thread` (state, stack bounds), `Stack`, `Native frames`, `Java frames`, `Lock stack`; for a signal also `siginfo`, `Registers`, `Top of Stack`, `Instructions`                                                                                                                      | Where it was and what it held. Native frames on a `V`/`C` crash are the whole story                                                                 |
| 4    | `P R O C E S S` heap   | `Heap:` (per-generation occupancy), `Metaspace:` with `Usage`, `Virtual space`, `Chunk freelists`, the `CodeHeap` lines                                                                                                                                                                      | Whether memory was exhausted at the moment of death; code cache full                                                                                |
| 5    | `P R O C E S S` events | `Compilation events`, `Deoptimization events`, `Classes loaded`/`unloaded`, `Internal exceptions`, `VM Operations`, `Events`, and `GC Heap History` when present                                                                                                                             | What happened in the seconds before: a deopt storm, an `OutOfMemoryError` already thrown internally, a safepoint operation in flight                |
| 6    | `P R O C E S S` tail   | `Java Threads` and `Other Threads` (every thread, state and stack bounds), `Threads with active compile tasks`, `VM state`, `VM Mutex/Monitor`, `Dynamic libraries`, `VM Arguments`, `Logging`, `Environment Variables`, `Native Memory Tracking` (only with NMT on), `Periodic native trim` | Thread count against `ulimit -u`; a native library nobody expected; the last NMT decomposition                                                      |
| 7    | `S Y S T E M`          | `OS`, `CPU`, `Memory` (physical, free, swap), `vm_info`, and on Linux the `rlimit` line and a `container (cgroup) information` block                                                                                                                                                         | `CORE 0` explains a missing core; the cgroup block shows the limit the JVM saw — compare with `Memory:` and with the pod spec (container-awareness) |

The table was taken from a report generated on Windows; the `rlimit` and cgroup lines are
written by the Linux port and should be confirmed on a report from the target host.
Reading it in that order settles in minutes whether the artefact is a native crash, an
exhausted region, or a start-up misconfiguration — before any core is opened.

### Problematic frame letters

| Letter | Meaning                                                 | What it suggests                                                                                                 |
| ------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `J`    | JIT-compiled Java; the tier (C1/C2) is on the same line | Investigate compiler/runtime defect, prior native corruption and hardware; `-Xint` is a discriminator, not proof |
| `j`    | Interpreted bytecode                                    | Compilation is less likely causal; native/Unsafe corruption, runtime defect and hardware remain                  |
| `V`    | JVM internal                                            | JVM defect, corrupted VM state or hardware; compare failing address/stacks across cores and builds               |
| `v`    | JVM-generated stub                                      | Inspect stub purpose plus caller/native state; do not classify from the letter alone                             |
| `C`    | Native code                                             | Identify the actual library/build/symbol; JNI/FFM code is one possibility, not the only one                      |

### Thread state

| State               | Meaning                        |
| ------------------- | ------------------------------ |
| `_thread_in_Java`   | Executing Java when it crashed |
| `_thread_in_vm`     | Inside JVM code                |
| `_thread_in_native` | In native code, via JNI        |

The `rlimit:` line reports `CORE` — reading `CORE 0` there explains a missing core dump
without any further investigation.

## Java `OutOfMemoryError` versus Linux OOM Killer

|                   | Java `OutOfMemoryError`                                                         | Linux OOM Killer                                     |
| ----------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Immediate action  | JVM throws; code may catch it or the process may terminate if uncaught          | Kernel sends uncatchable SIGKILL                     |
| hs_err written    | No for an ordinary thrown OOME; yes if `CrashOnOutOfMemoryError` turns it fatal | No                                                   |
| Heap dump written | Attempted for supported VM-raised OOMs when the flag/path/resources permit      | Not by the killed JVM                                |
| Application log   | Only if caught/uncaught handling or logging records it                          | May end abruptly; external runtime records may exist |
| Evidence          | Application log                                                                 | `dmesg`, `journalctl -k`, exit code 137 (128+9)      |

```bash
sudo dmesg | grep -i "out of memory"
sudo dmesg | grep -i "oom_kill"
sudo journalctl -k | grep -i "oom"

# Out of memory: Kill process 12345 (java) score 890 or sacrifice child
# Killed process 12345 (java) total-vm:8388608kB, anon-rss:6291456kB
```

SIGKILL cannot be intercepted by any handler. The JVM's handlers are registered for
SIGSEGV/SIGBUS/SIGILL/SIGFPE — signals that permit a handler — so an OOM kill terminates the
process before any JVM code runs. Absence of JVM artefacts is compatible with SIGKILL but
does not distinguish kernel OOM from a manual/orchestrator kill; correlate cgroup
`memory.events`/`oom_kill`, kernel journal and workload-orchestrator events.

## Before blaming the container limit

An OOM kill is a sizing conclusion only after the process's real footprint is known. Take
`jcmd <pid> VM.native_memory summary` from a surviving replica under representative load —
not once, at idle: Metaspace and code cache grow with process lifetime until they settle —
and compare its committed total, plus whatever NMT does not see, against the limit.
The per-region budget, the arithmetic and the RSS-versus-NMT gap are jvm-memory-regions.
When NMT was on, the `Native Memory Tracking:` section of an hs_err is that same reading
at the moment of death.

## Checklist

### Pre-crash, configured before any incident

- [ ] `-XX:ErrorFile=` points at a writable, persistent path — not an ephemeral container
      working directory — or `-XX:+ErrorFileToStderr` is set so the report reaches the log
      pipeline; `-XX:+ExtensiveErrorReports` where the extra sections are wanted and the
      slower report is acceptable
- [ ] `-XX:+CreateCoredumpOnCrash` enabled (default `true` since JDK 9 — confirm with
      `-XX:+PrintFlagsFinal`)
- [ ] `ulimit -c` set to `unlimited` or a sufficient value for the service process
- [ ] `/proc/sys/kernel/core_pattern` points somewhere with enough disk for a whole heap
      plus native memory
- [ ] `LimitCORE=infinity` in the systemd unit, where applicable
- [ ] The `jhsdb` from production's `$JAVA_HOME` is available and documented as the one to
      use — established now, not during the incident

### Capture, during or just after the crash

- [ ] hs_err preserved before any automatic log cleanup
- [ ] If no core was generated automatically and the process is alive but misbehaving:
      `gcore` or GDB `generate-core-file` — never `jcmd VM.native_memory summary`
- [ ] If no artefact exists at all: `dmesg` / `journalctl -k` for an OOM kill before
      assuming any other cause
- [ ] Time, approximate load and process uptime recorded

### Analysis

- [ ] hs_err read first: frame letter, thread state, heap section
- [ ] Variable `V`/`J` failures: native/Unsafe/FFM corruption, JVM build and hardware RAS
      evidence assessed rather than selecting one from the frame letter
- [ ] Core analysed with the correct `jhsdb` build for Java objects and threads, and GDB
      for native registers and memory
- [ ] If virtual threads are involved: unmounted ones are invisible to both `jstack` and
      `jhsdb jstack` — either `Thread.dump_to_file` was taken while alive, or the gap is
      documented
- [ ] Expected total memory recomputed from the real NMT decomposition before any
      container-sizing conclusion
