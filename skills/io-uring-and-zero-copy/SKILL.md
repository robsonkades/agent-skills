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
  ClassNotFoundException, when separating generic and io_uring-specific channel options, or when JFR
  reports no socket events from a service plainly doing network I/O. Does not cover owning
  and managing native memory (off-heap-memory), the host layer generally (linux-for-jvm), or
  network-stack tuning (tcp-tuning).
---

# io_uring and Zero-Copy

## Purpose

Separate the costs on the byte path: payload copies, syscall transitions, blocking, queueing,
page faults and protocol framing. `FileChannel.transferTo` permits the JDK to select an
optimized file-transfer path; `mmap` maps pages but is not globally "zero-copy"; io_uring
provides asynchronous submission/completion and batching opportunities, not automatic copy or
syscall elimination. Confusing those properties can add a native dependency without addressing
the measured bottleneck.

The second failure this prevents is the belief that stock OpenJDK `java.nio` reaches io_uring
on its own. Through JDK 25 it has no built-in io_uring transport or flag that enables one.
A custom channel provider or vendor implementation needs separate verification; the Java API
name alone does not identify its backend. Name and verify the native transport, FFM/JNI
binding or external component behind an "io_uring in Java" claim.

## Workflow

1. **Name the cost before naming the fix.** Reuse existing workload and runtime evidence; select
   profiles, syscall traces, CPU time per byte, memory bandwidth, queue depth or tail latency
   only as needed to resolve the decision. Retain a path that already meets requirements.
   Page faults or cache misses alone do not prove an application copy.
2. **Try the stable JDK transfer APIs first.** `transferTo`/`transferFrom` may use an optimized
   kernel path for supported channel pairs, but the contract does not promise `sendfile` or
   `splice`, and a call may transfer fewer bytes or zero. Loop correctly and measure the actual
   path. `FileChannel.map` is useful for mapped access; later parsing or socket writes may still
   copy data.
3. **Choose buffers for the boundary and lifetime.** Direct buffers can avoid staging copies in
   native I/O, but increase native-memory accounting, allocation and reclamation complexity.
   Heap buffers remain appropriate away from native boundaries and can win for small or
   short-lived data. Pool direct buffers on hot paths only with bounded ownership.
4. **Only then consider io_uring, and only via a named route.** Choose from
   `references/choosing-the-mechanism.md`, with a pinned kernel, native artifact and fallback.
5. **Pin one Netty era.** The 4.2 GA API and 4.1.x incubator API differ in spelling, package and
   bootstrap shape. Mixed source and dependencies can fail at compile time or at runtime.
6. **Guard availability and declare the fallback.** Check `IoUring.isAvailable()` before use,
   select matching io_uring, epoll or NIO channel classes, and expose the unavailability cause.
7. **Prove the change landed.** Re-measure the original bottleneck and load shape; use
   `references/diagnosing-the-io-path.md` to distinguish mechanism evidence from outcome evidence.

## Rules

- io_uring can amortize submission/completion transitions through batching and shared rings;
  ordinary operation still commonly uses `io_uring_enter`. Zero-copy is a separate property.
- Stock OpenJDK's `java.nio` and `java.net` have no built-in io_uring transport through 25.
  Do not invent an enabling flag or infer a custom provider's backend from its Java API.
- Ordinary socket and buffered-file I/O still copy payloads through kernel buffers. Direct
  file I/O can bypass the page cache, so `READ`/`WRITE` opcodes alone do not establish the copy
  path. `_ZC` sends and splice-style paths can avoid particular copies; registered buffers
  reduce registration/pinning overhead but do not by themselves make movement copy-free.
- `IORING_OP_SEND_ZC` is a Linux-kernel capability, not a JDK capability. Availability also
  depends on the native transport version, operation type and fallback behavior.
- For send-zero-copy, an initial CQE with `IORING_CQE_F_MORE` does not release the buffer:
  wait for the notification CQE marked `IORING_CQE_F_NOTIF`. Keep memory valid and unchanged
  until the operation's documented release point, including cancellation/shutdown. A zero-copy
  request can fall back to copying; a completion alone does not prove copy elimination.
- Do not impose a global ban on heap buffers. Prefer transfer APIs when their channel semantics
  fit; otherwise choose direct versus heap buffers from measured copy cost, buffer size,
  pooling, lifetime and native-memory limits.
- Against Netty 4.2 GA the API is `IoUring*` in `io.netty.channel.uring`, with
  `MultiThreadIoEventLoopGroup(IoUringIoHandler.newFactory())`. The all-caps `IOUring*` spelling
  belongs to the 4.1.x incubator line. Artifact version and spelling must match.
- `SO_BACKLOG` is declared by `ChannelOption` and inherited by `IoUringChannelOption` in
  Netty 4.2. Qualify it with `ChannelOption` for clarity; subclass-qualified access alone is
  not an API/linkage error or an io_uring-specific option.
- An `io_uring_enter` count records attempted calls, including failures; it does not prove
  payload operations completed. Active submission polling can also perform I/O without an
  enter call in the observed window. Correlate results, ring mode, operations and workload
  phase before attributing traffic, batching or copy reduction.
- Socket buffers and application watermarks jointly affect buffering, utilization and
  backpressure. Size them from bandwidth-delay product, concurrency, memory budget and latency
  objectives; "large for throughput, small for latency" is not a sufficient rule.
- Report throughput, CPU per unit of work and tail percentiles for I/O benchmarks. Preserve
  payload, concurrency, connection lifecycle and backpressure behavior between comparisons.
- Treat every throughput and CPU figure as environment-specific. Validate the fallback path and
  behavior under queue saturation, peer cancellation, shutdown and native-memory exhaustion.

Record the project's JDK/toolchain, resolved Netty/native versions, kernel/architecture and
container restrictions before selecting a route. This skill does not authorize upgrades or
relaxing sandbox policy. Return the supported bottleneck or specific evidence gap, selected or
retained mechanism/fallback, ownership contract and actual checks; distinguish source-supported
expectations from measured benefits.

## References

- [Choosing the mechanism](references/choosing-the-mechanism.md) — selection criteria, adoption
  costs, Netty API eras and a bootstrap whose transport and channel fallback agree.
- [Diagnosing the I/O path](references/diagnosing-the-io-path.md) — syscall, ring and outcome
  evidence, including what those signals cannot prove.
