# Commands and container permissions

## JFR

```bash
# Continuous rolling buffer — the configuration every production JVM should have.
# On JDK 25 the documented form uses ':' after the flag name; '=' is still accepted.
java -XX:StartFlightRecording:name=continuous,maxsize=512m,maxage=4h,settings=default,disk=true \
     -jar app.jar

# Fixed-duration recording from startup (lab work, startup investigations):
java -XX:StartFlightRecording:duration=60s,filename=app.jfr,settings=profile -jar app.jar

# Attach to a running process:
jcmd <pid> JFR.start name=diag settings=profile duration=5m filename=diag.jfr

# Snapshot the buffer without stopping the recording — this is the incident command:
jcmd <pid> JFR.dump name=continuous filename=/tmp/incident-$(date +%Y%m%d-%H%M%S).jfr

jcmd <pid> JFR.check           # active recordings
jcmd <pid> JFR.stop name=diag  # stop a named recording
```

`default.jfc`: 20 ms sampler, 20 ms blocking thresholds, 150 allocation samples/s, "typically
less than 1 % overhead" by its own description. `profile.jfc`: 10 ms sampler, 10 ms
thresholds, 300/s, "typically around 2 %". Both leave `jdk.CPUTimeSample` **off**; enable it
with `jdk.CPUTimeSample#enabled=true` on the command line (Linux only).

The retained window lives in the repository as chunk files (default `maxchunksize` 12 MB),
pruned by `maxage`/`maxsize`; `JFR.dump` assembles them into the `.jfr`. Put it on a
volume — `-XX:FlightRecorderOptions:repository=/mnt/diagnostics` — because the directory is
removed when the JVM exits. For a batch job that should print its own summary,
`report-on-exit=hot-methods` (repeatable) writes a view to stdout at shutdown.

## JFR analysis without a GUI

Servers and containers rarely have a GUI, which is exactly where incidents happen.

```bash
jfr summary recording.jfr          # event counts — always the first command
jfr metadata recording.jfr         # fields available per event

jfr view hot-methods recording.jfr          # top methods by ExecutionSample + NativeMethodSample
jfr view cpu-time-hot-methods recording.jfr # the same from jdk.CPUTimeSample, if it was on
jfr view contention-by-site recording.jfr   # contention by call site
jfr view latencies-by-type recording.jfr    # every duration event, ranked — the first look
jfr view gc-pauses recording.jfr            # pauses; gc-pause-phases for the breakdown
jfr view socket-reads-by-host recording.jfr # network reads by host; socket-writes-by-host
jfr view pinned-threads recording.jfr       # jdk.VirtualThreadPinned, threshold permitting
jfr view container-cpu-throttling recording.jfr
jfr help view                               # the full list; `jfr view all-views <file>` runs them all

# the same views against a running JVM with a recording on — no dump, no file (JDK 21+)
jcmd <pid> JFR.view hot-methods             # last 10 minutes by default (maxage=10m, maxsize=32MB)
jcmd <pid> JFR.view maxage=1h latencies-by-type

jfr print --events jdk.JavaMonitorEnter --stack-depth 32 recording.jfr
jfr print --events jdk.ThreadPark --json recording.jfr | jq '.recording.events[0]'
```

In JMC, read **Automated Analysis** first — it already points at anomalies — then the tab
it pointed to. Going straight to Method Profiling is the usual way to spend half an hour on
the wrong graph.

## Custom JFR events

```java
@Label("Order Processing")
@Category({"Business", "Orders"})
@Threshold("10 ms")   // without this, commit() records EVERY time the event is enabled
@StackTrace(false)    // the stack trace is the most expensive field
public class OrderEvent extends Event {
    @Label("Order ID")   int orderId;
    @Label("Stage")      String stage;
}
```

`@Threshold` is what makes a business event viable on a hot path: you pay for constructing
the event, not for recording it. JDK 25 adds `@Throttle` (rate limiting for very
high-frequency events) and `@Contextual` (fields that contextualise other events on the
same thread).

Guard field population with `event.isEnabled()` so a disabled event costs nothing.

## async-profiler

```bash
VER=4.5
curl -L "https://github.com/async-profiler/async-profiler/releases/download/v${VER}/async-profiler-${VER}-linux-x64.tar.gz" | tar xz
cd "async-profiler-${VER}-linux-x64"   # asprof, jfrconv, lib/libasyncProfiler.so
```

```bash
asprof -d 30 -f cpu.html <pid>                        # CPU, interactive HTML flame graph
asprof -e alloc --alloc 512k -d 60 -f alloc.html <pid> # allocation
asprof -e wall -t -d 60 -f wall.html <pid>             # wall clock, per thread
asprof -e lock --lock 1ms -d 60 -f lock.html <pid>     # lock contention

# CPU and wall clock in ONE session (Linux, 3.0+), separated at conversion time
asprof -e cpu --wall 100ms -d 60 -o jfr -f prof.jfr <pid>
jfrconv -o flamegraph -s runnable prof.jfr oncpu.html
jfrconv -o flamegraph -s sleeping prof.jfr offcpu.html
jfrconv -o flamegraph --lock     prof.jfr lock.html
jfrconv -o flamegraph --cpu-time jfr-recording.jfr cpu.html   # from JFR jdk.CPUTimeSample (JEP 509)

asprof -d 60 <pid> | head -30                          # flat text profile to stdout
asprof -d 60 -o collapsed -f stacks.collapsed <pid>     # for differential tooling

# As a startup agent — captures from the first instruction, no attach needed
java -agentpath:/opt/async-profiler/lib/libasyncProfiler.so=start,event=cpu,file=cpu.html \
     -jar app.jar
```

Reading the flat text output: `samples` decides whether the line can be trusted, `percent`
decides whether it is worth optimising.

## Container permissions, in order of preference

```bash
# On a Linux host, for the 'perf' engine:
sudo sysctl -w kernel.perf_event_paranoid=1
sudo sysctl -w kernel.kptr_restrict=0

# In a container — the primary blocker is the seccomp profile barring perf_event_open:
# 1) allow the syscall
docker run --security-opt seccomp=unconfined --cap-add SYS_ADMIN ...

# 2) fdtransfer: a privileged helper opens the descriptors and hands them over
asprof --fdtransfer -e cpu -d 60 -f cpu.html <pid>

# 3) no privilege at all: the ctimer engine (no kernel stacks)
asprof -e ctimer -d 60 -f cpu.html <pid>
```

`--privileged` is not the documented recommendation and is usually unacceptable in
production. `-e ctimer` solves most container cases with no privilege; the only loss is
kernel stacks.

## Production readiness checklist

- [ ] Continuous JFR configured, `maxage` longer than overnight human response time
- [ ] `disk=true` with `-XX:FlightRecorderOptions:repository=` on a volume that has guaranteed
      space, so `JFR.dump` and a post-mortem `jfr assemble` have something to read
- [ ] `jcmd` available inside the container or host where the JVM runs
- [ ] `JFR.dump` runbook written **and tested outside an incident**
- [ ] Analysis tooling available to whoever is on call (JMC, or `jfr view` in a terminal)
- [ ] async-profiler installed and tested with the environment's real permissions
- [ ] If the application uses virtual threads, the runbook uses `Thread.dump_to_file`
      rather than `jstack`
