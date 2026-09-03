# Incident triage and observability

## Minimum evidence

Capture exact JDK/vendor/build and CPU/container limits, lifecycle metrics, resource waits, scheduler
or executor state, repeated thread views, and a time-aligned JFR/profile before tuning. Thread and
stack artifacts can contain sensitive paths/context; secure their storage and retention.

Use:

```bash
# Platform threads, locks and platform deadlock detection.
jcmd <pid> Thread.print -l

# Tracked platform and virtual threads/containers on Java 21+.
jcmd <pid> Thread.dump_to_file -format=json threads.json
```

The second is not a globally simultaneous snapshot and the Java 25 MXBean contract permits only some
virtual threads depending on tracking/runtime support. Traditional output excludes virtual threads.
See `concurrency-diagnostics` for exact interpretation.

## Scheduler evidence (Java 24+)

`VirtualThreadSchedulerMXBean` exposes estimated pool, mounted and queued counts plus target
parallelism. Correlate:

| Scheduler/CPU shape                                        | Candidate interpretation                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------ |
| queued rises, CPU saturated/throttled, CPU-heavy VT stacks | CPU demand exceeds effective capacity                        |
| pool grows above parallelism, file/native waits visible    | compensation/capture; identify blocking API                  |
| pin events plus queued rise/latency                        | pinning may constrain carriers; inspect native/foreign stack |
| many parked VTs, scheduler queue low                       | cheap waiting; inspect protected resource/queue age instead  |
| live/retained VTs rise after caller timeout                | cancellation/admission leak                                  |

Counts are estimates and may return `-1`; use trends and application progress.

## JFR event selection

Potential signals include virtual-thread pin/submit-failure/start/end, monitor enter/wait, park,
socket/file I/O and thread sleep. Inspect the active recording configuration: event availability,
enablement and thresholds vary. Absence under a threshold is censored evidence.

JDK 24+ monitor usage no longer pins because of JEP 491. A `jdk.JavaMonitorEnter` contention event is
still relevant for latency even though it is not a pin. Remaining pin stacks should identify native
or foreign-function execution; confirm impact with scheduler queue and completion latency.

## Profile choice

CPU profile answers where scheduled CPU went. Wall-clock profile can expose elapsed time in locks,
I/O and other waits when the profiler supports the target/runtime. Compare both over the same load
window. Low CPU does not mean no bottleneck; high CPU does not distinguish useful computation from
spin/contention.

## Symptom trees

### Latency rose after virtual-thread migration

```text
Did useful CPU saturate/throttle?
  yes -> profile CPU; bound/isolate CPU-heavy phases
  no  -> did dependency/resource in-flight or wait rise?
          yes -> restore resource-local admission/deadline
          no  -> did retained thread/task/context state rise?
                  yes -> inspect ThreadLocal/captured state and queueing
                  no  -> compare provider/JFR wall evidence and deployment changes
```

### Scheduler queue grows

```text
CPU-ready virtual threads dominate?
  yes -> CPU capacity/parallelism problem
  no  -> pin/native/foreign or carrier-capturing operation visible?
          yes -> update/isolate operation; validate impact
          no  -> check CPU quota, scheduler configuration, submit failures and runtime defects
```

### Shutdown hangs

```text
Which owner accepted each remaining task?
  -> was interruption/cancellation delivered?
  -> did the task observe it?
  -> does provider cancellation release the resource?
  -> is executor close waiting orderly without a bounded external grace policy?
```

## Avoid evidence destruction

Do not first raise scheduler parallelism, expand connection/thread pools, add retries or rewrite
`synchronized`. Those changes alter queueing and wait evidence. Capture the baseline, state a predicted
signal change, make one reversible intervention, and validate useful progress plus resource recovery.

## References

- [Java 25 virtual threads](https://docs.oracle.com/en/java/javase/25/core/virtual-threads.html)
- [Java 25 `VirtualThreadSchedulerMXBean`](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.management/jdk/management/VirtualThreadSchedulerMXBean.html)
- [JEP 491](https://openjdk.org/jeps/491)
