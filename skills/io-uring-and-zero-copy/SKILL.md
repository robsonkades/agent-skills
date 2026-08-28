---
name: io-uring-and-zero-copy
description: >
  Reducing the cost of moving bytes through a JVM process: sendfile and
  FileChannel.transferTo, mmap and MappedByteBuffer, direct versus heap buffers at the
  syscall boundary, io_uring's submission and completion model and the three routes a JVM
  can actually reach it by, and proving a copy was eliminated. Use when CPU saturates while
  a service streams files or proxies bytes, when a loop reads into a ByteBuffer only to
  write it straight back out, when someone claims java.nio uses io_uring underneath, when a
  Netty io_uring bootstrap fails at runtime with NoSuchMethodError or
  ClassNotFoundException, when SO_BACKLOG is set on IoUringChannelOption, or when JFR
  reports no socket events from a service plainly doing network I/O. Does not cover owning
  and managing native memory (off-heap-memory), the host layer generally (linux-for-jvm), or
  network-stack tuning (tcp-tuning).
---

# io_uring and Zero-Copy

## Purpose

Decide which of two independent costs you are actually paying — **CPU copies** or **syscall
count** — and apply the mechanism that removes that one. `sendfile`/`transferTo` and `mmap`
remove copies. io_uring removes syscalls. They are routinely confused, and the confusion is
expensive in one direction: a native dependency, a kernel floor and a JNI surface adopted to
fix a problem `transferTo` already solved with no dependency at all.

The second failure this prevents is the belief that `java.nio` reaches io_uring on its own.
It does not, in any JDK up to and including 25 — there is no `IoUringChannel`, no JVM flag,
no integrated JEP. Every "io_uring in Java" claim resolves to a third-party native transport,
a hand-written FFM binding, or your own JNI. If it fits none of those, the claim is wrong.

## Workflow

1. **Name the cost before naming the fix.** CPU copies show as saturated CPU, high page-fault
   and LLC-miss rates on a byte-moving path. Syscall cost shows as `epoll_wait`/`read`/`write`
   dominating `strace -c` under tens of thousands of connections. Measure; do not assume.
2. **Spend the JDK's free zero-copy first.** `FileChannel.transferTo`/`transferFrom` compile to
   `sendfile(2)`/`splice(2)`; `FileChannel.map` gives a `MappedByteBuffer` over `mmap(2)`. Both
   have existed since JDK 1.4, need no dependency, and cover the common file-to-socket and
   repeated-random-access cases outright.
3. **Fix the buffer at the boundary.** A heap `ByteBuffer` on an I/O path forces an extra
   heap-to-native copy before the syscall. Use `allocateDirect` there.
4. **Only then consider io_uring, and only via a named route.** Choose from the decision table
   in `references/choosing-the-mechanism.md` — not by preference for "pure Java".
5. **Pin one Netty era.** The 4.2 GA API and the 4.1.x incubator API differ in spelling,
   package and bootstrap shape. Mixing them fails at runtime, not at compile time.
6. **Guard availability and declare the fallback.** `IoUring.isAvailable()` before use, Epoll or
   NIO behind it, and `IoUring.unavailabilityCause()` in the log when it is false.
7. **Prove the change landed.** Re-measure the same counter you started from, and report
   percentiles — see `references/diagnosing-the-io-path.md`.

## Rules

- io_uring reduces **syscall count**; zero-copy reduces **CPU copies**. A system can have one
  without the other. Never justify one with evidence for the other.
- `java.nio` and `java.net` have no io_uring binding in any JDK through 25, and no flag turns
  one on. Reject any design note that assumes otherwise.
- Most common io_uring opcodes (`IORING_OP_READ`, `IORING_OP_WRITE`) still copy. Only the
  `_ZC` opcodes do not.
- `IORING_OP_SEND_ZC` is a **Linux kernel** opcode (~5.20/6.0). It has no JDK version
  requirement. What depends on library version is whether Netty exposes it, via
  `IoUringChannelOption.IO_URING_WRITE_ZERO_COPY_THRESHOLD`.
- Never `ByteBuffer.allocate` on a read/write path. `allocateDirect`, or `transferTo`, which
  needs no application buffer at all.
- Against Netty 4.2 GA the API is `IoUring*` (camelCase, package `io.netty.channel.uring`) with
  `MultiThreadIoEventLoopGroup(IoUringIoHandler.newFactory())`. `IOUringEventLoopGroup` and the
  all-caps `IOUring*` spelling belong to the 4.1.x incubator line. Artifact version and spelling
  must come from the same line.
- `SO_BACKLOG` is `ChannelOption.SO_BACKLOG`, valid on every Netty transport. It is not a field
  of `IoUringChannelOption`, and writing it there does not compile against the real class.
- Presence of `io_uring_enter` is the evidence that io_uring is in use. Absence of `epoll_wait`
  is not.
- Socket buffer size is a trade-off, not a default: large `SO_SNDBUF`/`SO_RCVBUF` for throughput,
  small buffers plus a tight `WriteBufferWaterMark` for latency. State which you chose and why.
- Report p50/p95/p99 for any I/O benchmark, never mean or total alone — the variance here comes
  from syscalls and the scheduler, which JMH neither removes nor measures.
- Treat every throughput and CPU figure as specific to the machine it was measured on. Do not
  carry numbers across environments.

## References

- [Choosing the mechanism](references/choosing-the-mechanism.md) — the situation-to-solution
  decision table, the three routes to io_uring with their real adoption costs, the 4.1-to-4.2
  Netty API migration map, and the actual fields of `IoUringChannelOption`. Read before adding
  any native I/O dependency or writing a Netty io_uring bootstrap.
- [Diagnosing the I/O path](references/diagnosing-the-io-path.md) — the commands that confirm
  which syscalls a live process is issuing, how to identify a ring file descriptor and its io-wq
  workers, and the corrections to the widely repeated wrong forms of each. Read when verifying
  that io_uring is actually in use, or that a copy was actually eliminated.
