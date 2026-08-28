# jhsdb and core dump commands

Run the `jhsdb` from the same `$JAVA_HOME` that produced the process or the core. Everything
below assumes that.

## jhsdb modes

Available since JDK 9; one binary for what used to be separate tools.

```bash
jhsdb clhsdb  [--pid <pid> | --exe <exe> --core <core>]   # interactive command-line debugger
jhsdb hsdb    [--pid <pid> | --exe <exe> --core <core>]   # GUI equivalent of clhsdb
jhsdb jstack  [--pid <pid> | --exe <exe> --core <core>] [--mixed] [--locks]
jhsdb jmap    [--pid <pid> | --exe <exe> --core <core>] [--heap | --histo |
                                                        --binaryheap --dumpfile <f>]
jhsdb jinfo   [--pid <pid> | --exe <exe> --core <core>]
jhsdb debugd  [--pid <pid> | --exe <exe> --core <core>]   # remote debug server over RMI;
                                                          # check `jhsdb --help` on your build
```

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

On demand, without losing the process:

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

Automatically on crash, configured before the incident:

```bash
ulimit -c unlimited
echo "/tmp/core.%p" | sudo tee /proc/sys/kernel/core_pattern
# plus -XX:+CreateCoredumpOnCrash on the JVM
```

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

`jhsdb` gives Java objects and threads; GDB gives native registers and memory. A JNI crash
usually needs both.

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

Keep `hs_err_pid*.log` out of logrotate. A rotation config for the application's own logs
should not match it:

```
/var/log/myapp/*.log {
    rotate 7
    daily
    compress
    notifempty
}
```

That glob does match `hs_err_pid*.log` — narrow the pattern, or move crash artefacts to a
separate directory and upload them to durable storage before the service restarts.
