# Thread dump interpretation

## Collect both Java 25 views

```bash
# Platform-thread HotSpot dump with synchronization detail.
jcmd <pid> Thread.print -l

# Tracked platform and virtual threads, thread containers and stacks.
jcmd <pid> Thread.dump_to_file -format=json dump.json
```

`Thread.print`/`jstack` does not enumerate virtual threads, although a mounted virtual-thread stack
can appear under its carrier on the examined HotSpot build. The simple JSON dump is designed for
large thread populations and structured containers and does no automatic deadlock detection.
The inspected 25.0.3 format includes per-thread timestamps/state, `blockedOn`, `waitingOn`,
`parkBlocker`, `monitorsOwned` and carrier fields where applicable. Inspect the actual schema and
lock identity/owner model; fields may be absent and object identifiers are not a universal resource
ownership graph. Neither view should be called “complete” without stating the question.

Collection is diagnostic work with operational cost. `Thread.dump_to_file` impact scales with thread
count and its output file must be protected. Confirm attach permission, container PID namespace,
available disk and overwrite policy. Capture timestamp and runtime version embedded in the output.
Use a new absolute target path in the JVM's filesystem namespace; a relative `dump.json` is
resolved by the target JVM, which may have a different working directory/container mount.
The shell examples use Bash/jq; adapt quoting for the current shell without changing the filter.

## Consistency model

The all-thread/simple dump is not one stop-the-world snapshot; threads have collection timestamps.
Do not construct a causal ordering from adjacent JSON entries. Traditional HotSpot collection gives
a stronger instantaneous platform-thread view but excludes virtual threads and still represents only
one moment.

Compare repeated dumps by normalized stack signature, container, operation and age. Identical stacks
strengthen a stuck hypothesis only when the interval exceeds expected service time and progress
counters are flat. Line-number/JIT/native-frame differences can make equivalent waits appear changed.

## Aggregate large dumps

First inspect the schema instead of assuming a fixed JSON path:

```bash
jq '.threadDump | keys' dump.json
jq '.threadDump.threadContainers[0]' dump.json
```

Then group by container and top application/wait frame. Keep full stacks for the largest and oldest
groups; a top-frame-only count can merge unrelated resources all parked in `LockSupport.park`.

```bash
jq -r '.threadDump.threadContainers[]
  | .container as $container
  | .threads[]?
  | [$container, (.stack[0] // "<no-stack>")] | @tsv' dump.json \
  | sort | uniq -c | sort -rn
```

JSON schema and field shape are JDK artifacts, not an eternal shell API. Pin scripts to supported JDK
versions and test them against fixture dumps. The diagnostic MXBean contract permits some or all
virtual threads, so compare expected lifecycle counts with dump counts.

## Read platform lock evidence

A traditional dump can name monitor/ownable-synchronizer owners and HotSpot can print a detected
Java-level deadlock. Verify each edge:

```text
thread A waits for lock X owned by B
thread B waits for lock Y owned by A
```

A stable parked stack without an ownership edge is a wait, not a proven deadlock. Conditions,
semaphores, futures, queues, latches, I/O and non-owning synchronizers require application state to
identify who can make progress. `StampedLock` has no owner model; remote resources are outside the
JVM graph.

For virtual threads, Java 25 `ThreadMXBean` and automatic platform deadlock detection are explicitly
insufficient. Instrument logical resource/owner IDs or reproduce with controlled synchronization.

## Structured containers

The JSON dump records thread containers and parent/owner relationships, so named Java 25 preview
`StructuredTaskScope` instances can expose a task hierarchy. Use the scope's
`Configuration.withName` through the configuration function passed to `open`, and a
useful thread factory name. The hierarchy shows lifetime and location; it does not prove why a child
has not stopped.

An owner in `close` with children still running suggests cancellation cleanup is waiting. Confirm
whether interruption was delivered/observed and whether the provider call supports cancellation.

## Scheduler evidence (Java 24+)

Use `jdk.management.VirtualThreadSchedulerMXBean` rather than inferring carriers from names:

Partial Java 24+ snippet: import `java.lang.management.ManagementFactory`; custom runtime
images must include `jdk.management`. The getters below are observational; do not call
`setParallelism` merely to collect evidence. Treat `-1` as unknown, not a negative queue size
or a value to replace silently with zero.

```java
var scheduler = ManagementFactory.getPlatformMXBean(
        jdk.management.VirtualThreadSchedulerMXBean.class);
long queued = scheduler.getQueuedVirtualThreadCount();
int poolSize = scheduler.getPoolSize();
int mounted = scheduler.getMountedVirtualThreadCount();
int parallelism = scheduler.getParallelism();
```

Parallelism is the target; mounted/queued are estimates, while pool/mounted/queued may be `-1`.
Separate reads are not an atomic snapshot and do not count normally unmounted parked work.
Interpret trends with CPU saturation, blocked/pinned event stacks and useful completion rate.
Pool size above target may be compensation/capture behavior, not
by itself a fault.

## JFR and profiles

Before reading absence, inspect the actual recording's enabled events, thresholds, stack settings
and collection interval. `jfr summary` reports recorded counts and metadata describes schemas;
neither alone proves which events were enabled. Preserve the recording configuration and inspect
`jdk.ActiveSetting` when available. Monitor contention, monitor wait, park, socket/file I/O and virtual-thread events
answer different questions. A park event does not identify a lock owner; a pin event does not say the
operation caused the service SLO breach.

Pair profiles:

- CPU samples: what consumed scheduled CPU;
- wall samples: where elapsed time accumulated;
- JFR duration events: selected operations that crossed configured thresholds;
- application metrics/traces: which business/resource identity was affected.

Use the profiler version's documented syntax and validate virtual-thread support. Sampling every
virtual-thread start/end can be expensive at very high creation rates.

## Programmatic dumps

Java 21+ HotSpot exposes:

Partial Java snippet with a `java.lang.management.ManagementFactory` import and a new absolute
path string named `absoluteNewPath`; `jdk.management` must be present. Execute against the
intended JVM, not an unrelated diagnostic helper whose threads differ from the service's.

```java
var diagnostic = ManagementFactory.getPlatformMXBean(
        com.sun.management.HotSpotDiagnosticMXBean.class);
diagnostic.dumpThreads(absoluteNewPath,
        com.sun.management.HotSpotDiagnosticMXBean.ThreadDumpFormat.JSON);
```

The path must be absolute and not already exist; the default MXBean implementation may throw
`UnsupportedOperationException`. The contract guarantees all platform threads and may include some
or all virtual threads. Treat output as sensitive and rotate/delete under an explicit retention
policy.

## References

- [Java 25 virtual-thread dumps](https://docs.oracle.com/en/java/javase/25/core/virtual-threads.html#GUID-3A106A77-892E-4C64-B6D1-2938EE24E09B)
- [Java 25 `HotSpotDiagnosticMXBean.dumpThreads`](<https://docs.oracle.com/en/java/javase/25/docs/api/jdk.management/com/sun/management/HotSpotDiagnosticMXBean.html#dumpThreads(java.lang.String,com.sun.management.HotSpotDiagnosticMXBean.ThreadDumpFormat)>)
- [Java 25 `ThreadMXBean`](https://docs.oracle.com/en/java/javase/25/docs/api/java.management/java/lang/management/ThreadMXBean.html)
- [Java 25 `VirtualThreadSchedulerMXBean`](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.management/jdk/management/VirtualThreadSchedulerMXBean.html)
- [Java 25 `StructuredTaskScope.Configuration` (preview)](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/concurrent/StructuredTaskScope.Configuration.html)
- [Pinned Java 25.0.3+9 thread-dump fields and collection](https://github.com/openjdk/jdk25u/blob/jdk-25.0.3%2B9/src/java.base/share/classes/jdk/internal/vm/ThreadDumper.java)
