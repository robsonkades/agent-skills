# Crash triage

## Which artefact do you have

```
Java process died
├── hs_err_pid*.log exists
│   ├── core dump exists  -> native crash with a core: read hs_err first,
│   │                        then jhsdb/GDB on the core for detail
│   └── no core dump      -> native crash without a core: fix ulimit -c and
│                            core_pattern before the next one
└── no hs_err
    ├── application log shows OutOfMemoryError -> Java OOM: heap dump path
    └── no log at all -> suspect a Linux OOM kill: dmesg / journalctl -k
```

## hs_err anatomy

```
#  SIGSEGV (0xb) at pc=0x00007f1234567890, pid=12345, tid=12346
# JRE version: OpenJDK Runtime Environment Temurin-25.0.1+9 (build 25.0.1+9)
# Problematic frame:
# J 1234 C2 com.example.HotMethod.compute(I)I (42 bytes)
```

Sections, in the order they repay reading: the problematic frame, thread state, Java stack
trace, heap summary, VM arguments, OS information and rlimits, then the crash instruction
disassembly.

### Problematic frame letters

| Letter | Meaning                                                 | What it suggests                                                                                                                     |
| ------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `J`    | JIT-compiled Java; the tier (C1/C2) is on the same line | Candidate JIT compiler bug — rare, worth reporting upstream if it reproduces and disappears under `-Xint`                            |
| `j`    | Interpreted bytecode                                    | No compilation involved, so more likely heap corruption from native code writing out of bounds, or a runtime bug independent of tier |
| `V`    | JVM internal                                            | A JVM bug — or, if the pattern varies randomly between crashes, hardware. Check EDAC/mcelog before blaming the application           |
| `v`    | JVM-generated stub                                      | Same neighbourhood as `V`                                                                                                            |
| `C`    | Native code                                             | JNI bug                                                                                                                              |

### Thread state

| State               | Meaning                        |
| ------------------- | ------------------------------ |
| `_thread_in_Java`   | Executing Java when it crashed |
| `_thread_in_vm`     | Inside JVM code                |
| `_thread_in_native` | In native code, via JNI        |

The `rlimit:` line reports `CORE` — reading `CORE 0` there explains a missing core dump
without any further investigation.

## Java `OutOfMemoryError` versus Linux OOM Killer

|                   | Java `OutOfMemoryError`                     | Linux OOM Killer                                |
| ----------------- | ------------------------------------------- | ----------------------------------------------- |
| Who kills it      | The JVM throws the exception                | The kernel sends SIGKILL                        |
| hs_err written    | No — not a fatal native signal              | No                                              |
| Heap dump written | Yes, with `-XX:+HeapDumpOnOutOfMemoryError` | Never                                           |
| Application log   | Stack trace visible                         | Process disappears silently                     |
| Evidence          | Application log                             | `dmesg`, `journalctl -k`, exit code 137 (128+9) |

```bash
sudo dmesg | grep -i "out of memory"
sudo dmesg | grep -i "oom_kill"
sudo journalctl -k | grep -i "oom"

# Out of memory: Kill process 12345 (java) score 890 or sacrifice child
# Killed process 12345 (java) total-vm:8388608kB, anon-rss:6291456kB
```

SIGKILL cannot be intercepted by any handler. The JVM's handlers are registered for
SIGSEGV/SIGBUS/SIGILL/SIGFPE — signals that permit a handler — so an OOM kill terminates the
process before any JVM code runs. Absence of every artefact is the evidence.

## JVM memory decomposition, for container sizing

Example with `-Xmx4g`:

| Component           | Order of magnitude | Note                                                                                        |
| ------------------- | ------------------ | ------------------------------------------------------------------------------------------- |
| Heap (`-Xmx`)       | 4 GB, fixed        | What you configured                                                                         |
| Metaspace           | ~0.5 GB            | Without `-XX:MaxMetaspaceSize` it grows with classes loaded — monitor, do not assume        |
| Direct Memory       | ~0.5 GB            | Capped at `-Xmx` by default, but real use depends on actual `ByteBuffer.allocateDirect`/NIO |
| Code Cache          | ~0.3 GB            | Grows with the diversity of hot methods                                                     |
| JVM overhead        | ~0.1 GB            | Native thread stacks, GC bookkeeping, JNI                                                   |
| **Beyond the heap** | **≈ 1.4 GB**       | The sum of the four above                                                                   |

Measure each component on your own application with `-XX:NativeMemoryTracking=summary`
(`jcmd <pid> VM.native_memory summary`), then add a safety margin — 10–20% is a starting
point, not a law — to absorb transient peaks such as a full GC that has not yet returned
pages to the OS.

Measuring once at idle is the trap: Metaspace and Code Cache grow with process lifetime
until they settle. Measure under representative load, after the process has run long enough.

## Checklist

### Pre-crash, configured before any incident

- [ ] `-XX:ErrorFile=` points at a writable, persistent path — not an ephemeral container
      working directory
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
- [ ] `V` frame with a random pattern across crashes: hardware checked (EDAC/mcelog) before
      an application bug is assumed
- [ ] Core analysed with the correct `jhsdb` build for Java objects and threads, and GDB
      for native registers and memory
- [ ] If virtual threads are involved: unmounted ones are invisible to both `jstack` and
      `jhsdb jstack` — either `Thread.dump_to_file` was taken while alive, or the gap is
      documented
- [ ] Expected total memory recomputed from the real NMT decomposition before any
      container-sizing conclusion
