# jhsdb and core dump commands

Run `jhsdb` from the same exact vendor/update/build that produced the process/core and keep
the matching executable, `libjvm`, dependent libraries and debug symbols/build IDs.
Everything below assumes that archived toolchain.

## jhsdb modes

Available since JDK 9; one binary for what used to be separate tools.

```bash
# modes and options as printed by `jhsdb --help` / `jhsdb <mode> --help` on JDK 25.0.3
jhsdb clhsdb  [--pid <pid> | --exe <exe> --core <core>]   # interactive command-line debugger
jhsdb hsdb    [--pid <pid> | --exe <exe> --core <core>]   # GUI equivalent of clhsdb
jhsdb jstack  [--pid <pid> | --exe <exe> --core <core>] [--mixed] [--locks]
jhsdb jmap    [--pid <pid> | --exe <exe> --core <core>] [--heap | --histo | --clstats |
                --finalizerinfo | --binaryheap --dumpfile <f> [--gz <1-9>]]
jhsdb jinfo   [--pid <pid> | --exe <exe> --core <core>]
jhsdb jsnap   [--pid <pid> | --exe <exe> --core <core>]   # performance counters (what jstat reads)
jhsdb debugd  ...                                         # remote debug server — deprecated on 25,
                                                          # as is --connect; do not build a runbook on it
```

`--binaryheap` against a core is the way to get an HPROF out of a process that no longer
exists; `--gz` compresses it inline. The result opens in MAT like any other dump
(heap-dump-analysis).

For every `--pid` form, treat SA attach as an exclusive invasive operation: it suspends the
target and the tool warns that detaching can leave the process hung. Drain it, prevent
concurrent debugger/attach use and plan restart. Prefer `--exe ... --core ...` whenever a
usable core exists.

`hsdb` gives the same navigation as `clhsdb` in a window — worth it when the exploration is
visual rather than scriptable.

### Thread stacks

```bash
jhsdb jstack --pid <pid>
jhsdb jstack --pid <pid> --mixed     # interleaves native C/C++ frames — useful for a JNI crash
jhsdb jstack --pid <pid> --locks     # includes java.util.concurrent lock state
jhsdb jstack --exe $(which java) --core core.<pid>
```

Unmounted virtual threads are absent from all of these. For a complete dump on a live
process:

```bash
jcmd <pid> Thread.dump_to_file -format=json threads.json
```

### Heap and flags

```bash
jhsdb jmap --pid <pid> --heap
jhsdb jmap --pid <pid> --histo
jhsdb jmap --pid <pid> --binaryheap --dumpfile heap.hprof
jhsdb jinfo --pid <pid>
```

## CLHSDB interactive commands

CLHSDB has no detailed man page; run `help` inside the session for your build's exact list
and syntax before relying on any of these.

```
clhsdb> where                              # stack trace of the current thread
clhsdb> where all                          # stack trace of every thread
clhsdb> threads                            # list all threads
clhsdb> thread <id>                        # select a thread
clhsdb> inspect <addr>                     # inspect the object at an address
clhsdb> print <addr>                       # print the object at an address
clhsdb> heap                               # heap summary
clhsdb> scanoops <start> <end> [<class>]   # scan an address range for objects
clhsdb> class <name>                       # find a loaded class by name
clhsdb> quit
```

## Generating a core dump

On demand, normally resuming rather than intentionally killing the process—but suspending it
for capture and consuming substantial memory/I/O:

```bash
sudo gcore -o core <pid>

gdb -p <pid>
(gdb) generate-core-file
(gdb) detach
(gdb) quit
```

Forcing a controlled crash — **this kills the process**, so only where a replica will be
recreated:

```bash
kill -ABRT <pid>
```

Automatically on crash, configured before the incident. `core_pattern` is host-wide and
should be managed durably by the node owner, not changed ad hoc during an application
incident:

```bash
ulimit -c unlimited
cat /proc/sys/kernel/core_pattern
cat /proc/self/coredump_filter
# plus -XX:+CreateCoredumpOnCrash on the JVM and a preconfigured destination/handler
```

In Kubernetes, `kernel.core_pattern` is a host-wide setting, not a per-container one: it
cannot be written from inside a pod, and a pipe pattern (`|/usr/lib/systemd/systemd-coredump …`)
runs its handler in the node's own namespace (`core(5)`), so the core lands in the node's
store — `coredumpctl` on the node — and not in any path the pod can see. Check before an
incident, from inside the container: `cat /proc/sys/kernel/core_pattern` for where cores go,
and `grep core /proc/self/limits` for whether the container's soft limit is `0`. A plain path
pattern is resolved in the crashing process's own mount namespace, so `/tmp/core.%p` inside
the container works only if that `/tmp` is a volume with room for the whole heap.

Also record `/proc/<pid>/coredump_filter`, `RLIMIT_CORE`, the handler's size/compression
limits and free space. A file can exist yet be truncated or omit mappings required by SA;
“core present” is not the same as “core complete.” Attach/capture additionally needs
ptrace permissions (`CAP_SYS_PTRACE`, Yama policy or equivalent) and matching credentials.

## Inspecting a core

```bash
jhsdb jstack --exe $(which java) --core /tmp/core.<pid>
jhsdb jmap   --exe $(which java) --core /tmp/core.<pid> --heap

gdb java /tmp/core.<pid>
(gdb) bt            # backtrace
(gdb) frame 3       # select a frame
(gdb) info reg      # registers
(gdb) x/10wx $rsp   # examine the stack
```

`jhsdb` gives Java objects and threads; GDB gives native registers and memory. Configure
GDB's `sysroot`/`solib-search-path` from the archived container/root filesystem and verify
build IDs before trusting symbols. JNI/FFM/Unsafe crashes usually need both views.

## Production JVM configured for crash analysis

```systemd
# /etc/systemd/system/java-app.service
[Unit]
Description=Java Application

[Service]
# Crash analysis: ErrorFile, HeapDumpOnOutOfMemoryError, CreateCoredumpOnCrash, NMT.
# Keep comments on their own line — a '#' inside a '\' continuation is not a comment.
ExecStart=/usr/bin/java \
  -Xmx4g -Xms4g \
  -XX:+UseG1GC \
  -XX:ErrorFile=/var/log/myapp/hs_err_pid%%p.log \
  -XX:+HeapDumpOnOutOfMemoryError \
  -XX:HeapDumpPath=/var/log/myapp/ \
  -XX:+CreateCoredumpOnCrash \
  -XX:NativeMemoryTracking=summary \
  -XX:+AlwaysPreTouch \
  -jar /app/myapp.jar

LimitCORE=infinity

Restart=on-failure
RestartSec=5
```

Keep `hs_err_pid*.log` out of generic log rotation. For example, this broad configuration
is unsafe because it does match the crash report:

```
/var/log/myapp/*.log {
    rotate 7
    daily
    compress
    notifempty
}
```

Narrow the pattern or move crash artefacts to a separate restricted directory. Upload them
encrypted to durable storage before restart cleanup and apply an explicit retention policy;
both core and hs_err can expose credentials, payloads, environment values and command-line
secrets.
