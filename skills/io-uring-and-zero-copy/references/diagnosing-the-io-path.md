# Diagnosing the I/O path

Start with one explicitly selected PID. `pgrep java` can return multiple JVMs and silently mix
evidence. Capture the command line, cgroup/container and workload phase with the trace.

```bash
pid=12345
ps -fp "$pid"
```

## Which syscalls dominate

`trace=network` does not include `io_uring_enter`. Ask for the mechanisms being compared:

```bash
strace -f -c -p "$pid" \
  -e trace=read,write,readv,writev,sendfile,splice,epoll_wait,epoll_pwait,io_uring_enter
```

Tracing perturbs the process, and counts do not reveal bytes, batching efficiency or latency by
themselves. Use a bounded representative interval and pair results with application throughput.
Traditional NIO may show epoll and socket operations; io_uring activity shows
`io_uring_enter`, but mixed paths and fallbacks are normal.

## Confirming ring activity at lower overhead

Available tracepoint names depend on kernel/perf packaging; list them before recording:

```bash
perf list | grep -E 'io_uring|sys_enter_(read|write)'
perf stat -p "$pid" \
  -e syscalls:sys_enter_read,syscalls:sys_enter_write,syscalls:sys_enter_io_uring_enter \
  -- sleep 10
```

An `io_uring_enter` count proves some ring activity. It does not prove all reads/writes use the
ring, that submissions are well batched, or that payload copies were removed. Correlate counts
with the exact traffic interval and native-transport metrics/logs.

## Finding ring descriptors

```bash
for fd in /proc/12345/fdinfo/*; do
    grep -q '^Sq' "$fd" 2>/dev/null && echo "$fd"
done
```

Ring `fdinfo` exposes fields such as `SqMask`, `SqHead`, `SqTail`, `CqHead`, `CqMask` and
`CqTail` on supporting kernels. Field availability is kernel-version-dependent. A snapshot
identifies a ring but not ownership of each operation; sample queue movement under load.

## io-wq workers

```bash
ps -eLo pid,tid,comm | awk '$1 == 12345 || $3 ~ /iou-wrk/'
```

io-wq workers may execute operations that would otherwise block. Their names and visibility vary
across kernel versions, and their presence does not mean every operation is blocking. If worker
growth or CPU is suspicious, correlate with operation types, filesystem/storage latency and
queue pressure. There is no portable `/proc/<pid>/io_uring_workers` contract.

## JFR scope

JFR socket events instrument JDK networking paths; native transports can operate below or outside
those paths. Missing JFR socket events therefore can be an instrumentation-boundary issue, not
proof of no traffic. Use native-transport telemetry and kernel tracing, while retaining JFR for
Java allocation, scheduling, locks and surrounding request behavior.

## Evidence for copy reduction

Observe the mechanism and the outcome separately:

- A `sendfile`/`splice` trace or transport-specific zero-copy completion confirms that a
  candidate mechanism executed for those operations.
- CPU time and memory bandwidth per transferred byte test whether the path became cheaper.
- Throughput and p50/p95/p99 under matched payload, concurrency and backpressure test user-visible
  results.
- Allocation/native-memory telemetry checks whether the optimization merely moved cost into
  buffer pooling or retention.

Page faults and LLC misses are supporting signals, not signatures of an eliminated copy. Mapping
can increase faults, cache behavior has many causes, and buffered I/O may be served from page
cache. Do not infer an end-to-end copy-free path from either counter alone.

## Troubleshooting flow

```text
Expected io_uring but see no ring activity
    -> verify loaded artifact, Netty era, kernel support and IoUring.unavailabilityCause()
    -> verify transport and channel classes agree
    -> exercise real traffic while tracing
    -> inspect fallback metrics/logs

Ring activity exists but CPU/latency does not improve
    -> compare operations per io_uring_enter and queue depth
    -> check payload copies, framing, TLS, allocation and io-wq work
    -> check saturation and backpressure rather than mechanism presence alone
    -> retain the simpler path when the validated outcome is neutral or worse
```
