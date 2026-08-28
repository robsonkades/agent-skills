# Diagnosing the I/O path

Every command here answers one question: _which syscalls is this process actually issuing?_
Everything else — throughput, CPU, latency — is downstream of that answer.

## Which syscalls dominate

```bash
strace -c -p $(pgrep java) -e trace=network 2>&1 | tail -20
```

Classic NIO shows many `epoll_wait` plus `read` and `write`. A process genuinely on io_uring
shows few `read`/`write` and many `io_uring_enter`.

## Confirming io_uring specifically

```bash
perf stat -p $(pgrep java) \
    -e syscalls:sys_enter_read,syscalls:sys_enter_write,syscalls:sys_enter_io_uring_enter \
    -- sleep 10
```

The `io_uring_enter` tracepoint is the load-bearing one. Counting only `read` and `write`
cannot distinguish "uses io_uring with traditional opcodes" from "does not use io_uring".

## Finding the ring file descriptors

```bash
for fd in /proc/$(pgrep java)/fdinfo/*; do
    grep -l "Sq" "$fd" 2>/dev/null && echo "$fd is io_uring"
done
```

The real `fdinfo` fields for a ring are CamelCase — `SqMask`, `SqHead`, `SqTail`, `CqHead`,
`CqMask`, `CqTail`. Grepping for `sq_` matches nothing and reads as "io_uring is not in use".

## Finding the io-wq workers

```bash
ps -eLo tid,comm | grep iou-wrk
```

Operations that cannot be completed without blocking are handed to the io-wq pool, whose
workers appear as separate kernel threads named `iou-wrk-*`. There is **no**
`/proc/<pid>/io_uring_workers` file; any recipe that cats one is wrong.

## The JFR blind spot

`jdk.SocketRead` and `jdk.SocketWrite` are emitted by instrumentation inside `java.net` and
`java.nio`. A Netty io_uring transport issues its own syscalls through JNI, below that layer.
A service on that transport therefore emits **no** socket events while doing heavy network I/O.
This is expected behaviour, not a broken agent — go back to `strace`, `perf` or `bpftrace` at
the syscall layer instead of trying to fix the JFR configuration.

## Correction table

| Tool              | Widely repeated wrong form         | Correct form                             |
| ----------------- | ---------------------------------- | ---------------------------------------- |
| `perf stat`       | counting only `read` / `write`     | add `syscalls:sys_enter_io_uring_enter`  |
| `fdinfo` grep     | `grep "sq_"`                       | `grep "Sq"`                              |
| io-wq workers     | `cat /proc/<pid>/io_uring_workers` | `ps -eLo tid,comm \| grep iou-wrk`       |
| JFR socket events | expected to cover all network I/O  | not applicable to Netty io_uring traffic |

## Evidence that a copy was actually eliminated

Compare the same counters before and after, on the same machine:

```bash
perf stat -p $(pgrep java) -- sleep 10
```

- **page-faults** falling by orders of magnitude on a file-serving path is the signature of
  `transferTo` replacing a read-then-write loop.
- **LLC-load-misses** high relative to loads points at frequent memory copying.
- CPU dropping while throughput rises is the outcome to claim; either one alone is not.

Report p50/p95/p99, not a mean or a total. Treat every absolute figure as belonging to the
environment that produced it.
