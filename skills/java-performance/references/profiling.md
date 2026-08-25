# Profiling recipes

## async-profiler

CPU profile, 30 seconds, flame graph output:

```bash
asprof -d 30 -e cpu -f /tmp/cpu.html <pid>
```

Wall-clock profile — use when threads are waiting rather than burning CPU:

```bash
asprof -d 30 -e wall -f /tmp/wall.html <pid>
```

Allocation profile, reported in bytes:

```bash
asprof -d 30 -e alloc -f /tmp/alloc.html <pid>
```

Run CPU and wall-clock profiles together and compare. A method that is large in the
wall profile and small in the CPU profile is waiting, not computing — and no amount
of CPU optimisation will help it.

### Inside a container

The profiler must see the same PID namespace as the JVM. Either run it in the same
container, or use `--fdtransfer` when attaching across namespaces. Perf events also
need `perf_event_paranoid` low enough, which many orchestrators do not grant by
default; `-e ctimer` avoids that requirement at some loss of accuracy.

## JFR

```bash
jcmd <pid> JFR.start name=diag settings=profile duration=60s filename=/tmp/diag.jfr
jfr summary /tmp/diag.jfr
jfr view hot-methods /tmp/diag.jfr
```

JFR costs less than a sampling profiler and is safe to leave running in production.
It is the right first instrument when the problem is intermittent and you need to
catch it rather than reproduce it.
