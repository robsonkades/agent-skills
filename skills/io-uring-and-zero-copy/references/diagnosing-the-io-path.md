# Diagnosing the I/O path

Start with one explicitly selected PID. `pgrep java` can return multiple JVMs and silently mix
evidence. Capture the command line, cgroup/container and workload phase with the trace.

```bash
pid=12345
ps -fp "$pid"
```

## Which syscalls dominate

`trace=%network` includes socket calls such as `sendmsg`/`recvmsg` that a read/write-only
filter misses; it does not include `io_uring_enter`. Ask for the mechanisms being compared:

```bash
strace -f -c -p "$pid" \
  -e trace=%network,read,write,readv,writev,sendfile,splice,epoll_wait,epoll_pwait,io_uring_enter
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

These are syscall-entry counts, including failed attempts. Inspect return/error information
and operation completions before claiming the ring performed payload I/O; an enter can just
wait or wake a poller. With `IORING_SETUP_SQPOLL`, an active kernel thread can consume
submissions while the application reaps completions from shared memory without entering the
kernel. A sleeping poller may still need an enter call to wake it. Zero observed enters therefore
does not exclude ring I/O. Check the configured ring mode and capture coverage, then correlate
operation/byte counts with the exact traffic interval and native-transport metrics/logs. These
counters alone establish neither batching efficiency nor copy elimination.

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
ps -eLo pid,tid,comm | awk '$1 == 12345'
```

io-wq workers may execute operations that would otherwise block. Their names and visibility vary
across kernel versions, and their presence does not mean every operation is blocking. If worker
growth or CPU is suspicious, correlate with operation types, filesystem/storage latency and
queue pressure. The listing selects only the target thread group; if a kernel exposes workers
elsewhere, establish their ring/process association separately. A global name match for
`iou-wrk` is not proof of ownership. There is no portable `/proc/<pid>/io_uring_workers` contract.

## JFR scope

JFR socket events instrument JDK networking paths; native transports can operate below or outside
those paths. Missing JFR socket events therefore can be an instrumentation-boundary issue, not
proof of no traffic. Use native-transport telemetry and kernel tracing, while retaining JFR for
Java allocation, scheduling, locks and surrounding request behavior.

## Evidence for copy reduction

Observe the mechanism and the outcome separately:

- A `sendfile`/`splice` trace or transport-specific zero-copy completion confirms that a
  candidate mechanism executed for those operations.
- For `SEND_ZC`, distinguish send completion from buffer-release notification. Check documented
  usage reporting (such as `IORING_SEND_ZC_REPORT_USAGE`) for copied fallback; observing a `_ZC`
  opcode or notification alone does not establish that those bytes avoided copying.
- CPU time and memory bandwidth per completed byte test whether the path became cheaper;
  state which processes, threads and counters are included.
- Throughput and p50/p95/p99 under matched payload, concurrency and backpressure test user-visible
  results.
- Allocation/native-memory telemetry checks whether the optimization merely moved cost into
  buffer pooling or retention.

For SQPOLL or io-wq, JVM-process CPU can fall while kernel pollers/workers consume the displaced
work. Include attributable CPU from those tasks over the same workload interval. Do not assume
`perf stat -p` for the JVM covers them. Where supported, ring `fdinfo` fields such as `SqThread`
can help identify the poller; verify the kernel and PID namespace. Pollers/workers can be shared
across rings: avoid double counting and distinguish total observed cost from an unproven per-ring
attribution. If that scope cannot be established, report the JVM-only result and missing coverage,
not a reduction in total CPU cost.

Page faults and LLC misses are supporting signals, not signatures of an eliminated copy. Mapping
can increase faults, cache behavior has many causes, and buffered I/O may be served from page
cache. Do not infer an end-to-end copy-free path from either counter alone.

## Troubleshooting flow

```text
Expected io_uring but see no io_uring_enter calls
    -> check SQPOLL mode, ring/completion evidence and trace coverage before inferring fallback
    -> verify loaded artifact, Netty era, kernel support and IoUring.unavailabilityCause()
    -> verify transport and channel classes agree
    -> if still unresolved, observe representative traffic within the authorized capture budget
    -> inspect fallback metrics/logs

Ring activity exists but CPU/latency does not improve
    -> compare completion/byte counts, queue depth and enter counts for the configured ring mode
    -> check payload copies, framing, TLS, allocation and io-wq work
    -> check saturation and backpressure rather than mechanism presence alone
    -> retain the simpler path when the validated outcome is neutral or worse
```

## Primary references

- [liburing setup and submission-polling contract](https://man7.org/linux/man-pages/man2/io_uring_setup.2.html)
- [liburing enter results and errors](https://man7.org/linux/man-pages/man2/io_uring_enter.2.html)
- [strace filters, returns and summary counts](https://man7.org/linux/man-pages/man1/strace.1.html)
- [perf stat process and thread selection](https://man7.org/linux/man-pages/man1/perf-stat.1.html)
- [Linux 6.6 ring fdinfo implementation](https://github.com/torvalds/linux/blob/v6.6/io_uring/fdinfo.c) — `SqThread` identifies the poller when available; inspect the deployed kernel's fields.
