# jhsdb and core dump commands

Run `jhsdb` from the same exact vendor/update/build that produced the process/core and keep
the matching executable, `libjvm`, dependent libraries and debug symbols/build IDs.
Everything below assumes that archived toolchain, matching OS/architecture and supported
dump format. Shell examples are templates with placeholders, not an executable runbook.
`ARCHIVED_JAVA_HOME` below identifies the preserved target JDK, never whichever `java` happens
to be first on PATH. `TARGET_EXECUTABLE` identifies the archived executable that produced the
core: normally that JDK's `bin/java`, but possibly a native launcher embedding HotSpot.
Do not substitute the tool JVM's launcher for a different process executable. Core capture
examples are Linux-specific; help checks alone do not validate live attachment or
post-mortem readability on another OS.

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
exists when the core contains the needed heap/metadata and SA can traverse it; `--gz`
compresses it inline. Validate conversion completion and the resulting HPROF in MAT
(heap-dump-analysis).

For every `--pid` form, treat SA attach as an exclusive invasive operation: it suspends the
target and the tool warns that detaching can leave the process hung. Use an authorized,
capacity-safe isolation plan, prevent competing debugger use and prepare recovery. A client
timeout does not prove the target resumed; verify debugger/target state before escalation.
Prefer `--exe ... --core ...` whenever a
usable core exists.

`hsdb` gives the same navigation as `clhsdb` in a window — worth it when the exploration is
visual rather than scriptable.

### Thread stacks

```bash
jhsdb jstack --pid <pid>
jhsdb jstack --pid <pid> --mixed     # interleaves native C/C++ frames — useful for a JNI crash
jhsdb jstack --pid <pid> --locks     # includes java.util.concurrent lock state
"$ARCHIVED_JAVA_HOME/bin/jhsdb" jstack --exe "$TARGET_EXECUTABLE" --core /evidence/core.pid
```

For a relocated/container archive, apply the library-resolution setup under
[Archived Linux root filesystems](#archived-linux-root-filesystems) before the core command.

Normal SA thread listings omit unmounted virtual-thread stacks. On a live JDK 21+ target,
inspect support for this additional evidence source:

```bash
jcmd <pid> Thread.dump_to_file -format=json threads.json
```

It is not a simultaneous exhaustive snapshot of every possible virtual thread: creation/
termination races and thread-tracking configuration affect coverage. Preserve settings,
capture time and command completion; do not interpret missing threads as proof of absence.

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
clhsdb> where <id>                         # stack trace for a thread ID
clhsdb> where -a                           # traces for enumerated threads
clhsdb> threads                            # list enumerated threads, not all virtual tasks
clhsdb> thread <id>                        # print information for a thread
clhsdb> inspect <addr>                     # inspect the object at an address
clhsdb> print <addr>                       # print the object at an address
clhsdb> universe                           # heap information
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

Intentionally request abnormal termination under the default signal disposition. Use only
after target identity, authority and recovery capacity are established; core/hs_err output
is not guaranteed by sending SIGABRT:

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
must not be changed as an application-local setting (privileged access can affect the host).
A pipe pattern (`|/usr/lib/systemd/systemd-coredump …`)
runs its handler in the node's own namespace (`core(5)`), so the core lands in the node's
handler's chosen store — for systemd-coredump, inspect `coredumpctl` on the node. Other handlers
may route differently. Check before an
incident, from inside the container: `cat /proc/sys/kernel/core_pattern` for where cores go,
and `/proc/<target-pid>/limits` for the actual target's limits, not the diagnostic shell's.
The kernel ignores `RLIMIT_CORE` for piped handlers; collector limits still apply. A plain
path resolves in the crashing process's mount namespace and needs writable capacity;
persistent storage/export is additionally required to survive container replacement.

Also record `/proc/<pid>/coredump_filter`, `RLIMIT_CORE`, the handler's size/compression
limits and free space. A file can exist yet be truncated or omit mappings required by SA;
“core present” is not the same as “core complete.” Attach/capture additionally needs
ptrace permissions (`CAP_SYS_PTRACE`, Yama policy or equivalent) and matching credentials.

## Inspecting a core

```bash
"$ARCHIVED_JAVA_HOME/bin/jhsdb" jstack --exe "$TARGET_EXECUTABLE" --core /evidence/core.pid
"$ARCHIVED_JAVA_HOME/bin/jhsdb" jmap --exe "$TARGET_EXECUTABLE" --core /evidence/core.pid --heap

gdb "$TARGET_EXECUTABLE" /evidence/core.pid
(gdb) bt            # backtrace
(gdb) frame 3       # select a frame
(gdb) info reg      # registers
(gdb) x/10wx $rsp   # examine the stack
```

`jhsdb` gives Java objects and threads; GDB gives native registers and memory. Configure
GDB's `sysroot`/`solib-search-path` from the archived container/root filesystem and verify
build IDs before trusting symbols. JNI/FFM/Unsafe crashes usually need both views.

### Archived Linux root filesystems

Read this before the core commands when the target's paths differ from the analysis host.
`--exe` selects one executable; it does not remap the runtime loader or shared libraries.
In OpenJDK 25.0.3's Linux SA, `SA_ALTROOT` redirects those lookups to an archived root tree:

```bash
# Example layout; replace these paths with the actual preserved assets.
ARCHIVED_ROOTFS=/evidence/rootfs
ARCHIVED_JAVA_HOME="$ARCHIVED_ROOTFS/opt/jdk"
TARGET_EXECUTABLE="$ARCHIVED_JAVA_HOME/bin/java"
# For an embedded VM, use its actual executable, e.g. "$ARCHIVED_ROOTFS/app/launcher".
SA_ALTROOT="$ARCHIVED_ROOTFS" \
  "$ARCHIVED_JAVA_HOME/bin/jhsdb" jstack --exe "$TARGET_EXECUTABLE" --core /evidence/core.pid
```

Use that environment assignment for each SA core command needing remapping. Core and
`--exe` paths are opened directly in the analysis filesystem, so supply their accessible
archived paths, not paths interpreted relative to `SA_ALTROOT`. The host must also be able
to run the matching toolchain: this setting does not relocate the tool JVM's own loader.
Other builds/platforms need their own verified behavior.

For `/opt/jdk/lib/server/libjvm.so`, this implementation first tries the full path beneath
`SA_ALTROOT`, then progressively shorter suffixes, ending with `/libjvm.so` beneath that root.
The first successful open wins; it does not prove build identity. Preserve the original
directory layout, inspect resolved files and compare build IDs/hashes with captured deployment
provenance, especially if multiple versions share a basename. A missing file is an evidence
gap, not a reason to copy a convenient host library.

`SA_ALTROOT` is not a sandbox: ordinary path and symlink resolution still applies. Check
symlink targets in the working copy; an absolute symlink can resolve outside the archive.
Record actual resolution (using SA diagnostics or file-open tracing when needed) before
trusting recovered state. Resolve missing/mismatched assets before treating debugger errors
or implausible pointers as target corruption. GDB's `sysroot` is a separate configuration;
setting it does not configure SA.

## Production JVM configured for crash analysis

Illustrative unit fragment, not a complete production unit. Retain the service's existing
identity, resource settings, dependencies, sandboxing and restart policy; provision a writable
restricted evidence directory and validate storage/collector limits before adding these options.
NMT and heap-on-OOM have costs; enable only where evidence value justifies them. `%%p` escapes
systemd's percent expansion so HotSpot receives `%p`.

```systemd
# /etc/systemd/system/java-app.service
[Unit]
Description=Java Application

[Service]
# Crash analysis: ErrorFile, HeapDumpOnOutOfMemoryError, CreateCoredumpOnCrash, NMT.
# Keep comments on their own lines; inline '#' is not shell comment syntax.
ExecStart=/usr/bin/java \
  -XX:ErrorFile=/var/log/myapp/hs_err_pid%%p.log \
  -XX:+HeapDumpOnOutOfMemoryError \
  -XX:HeapDumpPath=/var/log/myapp/ \
  -XX:+CreateCoredumpOnCrash \
  -XX:NativeMemoryTracking=summary \
  -jar /app/myapp.jar

LimitCORE=infinity
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

## Sources

- [JDK 25 jhsdb](https://docs.oracle.com/en/java/javase/25/docs/specs/man/jhsdb.html) and target `clhsdb help` — supported modes and invasive live attachment.
- [OpenJDK 25.0.3 Linux SA path mapping](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3-ga/src/jdk.hotspot.agent/linux/native/libsaproc/libproc_impl.c) — `pathmap_open`, `SA_ALTROOT` and suffix fallback; implementation-specific behavior.
- [OpenJDK 25.0.3 Linux core reader](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3-ga/src/jdk.hotspot.agent/linux/native/libsaproc/ps_core.c) — direct core/executable opens and mapped loader/shared-library reads.
- [Linux core(5)](https://man7.org/linux/man-pages/man5/core.5.html) — routing, namespaces, limits and omitted mappings.
- [systemd syntax source](https://github.com/systemd/systemd/blob/v257/man/systemd.syntax.xml) — full comment lines and continuation handling.
