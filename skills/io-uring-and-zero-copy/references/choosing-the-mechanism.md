# Choosing the mechanism

## Situation to solution

| Situation                                                    | Candidate                     | Validate before adopting                                                       |
| ------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------ |
| File-to-socket or file-to-file transfer                      | `transferTo` / `transferFrom` | channel pair, partial progress, fallback path and CPU per byte                 |
| Repeated/random access to a large file                       | `MappedByteBuffer`            | page-fault pattern, address-space/native-memory budget and unmapping lifecycle |
| Many asynchronous operations with transition/queue overhead  | Netty io_uring                | kernel/native compatibility, batching evidence, tail latency and fallback      |
| Application owns the native integration and FFM is permitted | FFM binding                   | JDK/API baseline, native-library permission, ABI, ownership and support burden |
| Tested native wrapper already exists                         | JNI wrapper                   | packaging, ABI matrix, native-memory safety and operational ownership          |
| Bottleneck is unknown                                        | No mechanism yet              | profile and trace the representative workload first                            |

Connection count alone is not a decision threshold. epoll can perform well at high connection
counts when few descriptors are active, while io_uring can help at lower counts when operation
mix, batching and storage/network behavior fit it.

## Three common JVM routes to io_uring

| Route | Where the binding lives                      | Adoption cost                                                                                   |
| ----- | -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Netty | `netty-transport-native-io_uring`            | Lowest when the application already uses a compatible Netty line                                |
| FFM   | Downcalls to `liburing` or direct kernel ABI | High: layouts, ownership, callbacks, errors and concurrency become application responsibilities |
| JNI   | Owned wrapper/library                        | High: native build, ABI matrix, packaging, lifetime and crash diagnostics                       |

These are common routes, not an exhaustive law: another library or sidecar can own the native
interface. An FFM binding to `liburing` avoids reproducing all of liburing, whereas direct
syscall bindings inherit more kernel-ABI coupling. Record which ABI is being supported.
FFM is final in JDK 22; older releases have different preview/incubator contracts. Inspect
the project's release settings and required native-access flags rather than silently upgrading
Java. FFM does not remove native code, Linux policy or seccomp restrictions, and many liburing
helpers are C inline functions rather than exported symbols; verify exports or supply an owned
shim instead of assuming every header function is directly callable.

For an owned binding, match CQEs to stable request identifiers such as `user_data`, not their
position in the completion queue. Submission order does not guarantee execution/completion order.
Do not overlap independent sends, or independent receives, on an ordered TCP stream without an
ordering mechanism; sending and receiving are independent directions. Serialize dependent work
or use supported linkage, preserving backpressure and the operation's buffer-release contract.
`IOSQE_IO_LINK` orders members of one chain within a submission batch, not other chains or later
submissions. Handle each result: errors and unexpected short I/O can break the chain and cancel
its unstarted remainder. A link neither completes missing bytes nor makes the batch atomic.
With an existing transport, verify its ordering contract before adding a parallel native path.

## JDK transfer APIs versus io_uring

| Property                      | `transferTo` / mapping                                                                   | io_uring transport                                                                       |
| ----------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Stable JDK API                | Yes                                                                                      | No built-in stock OpenJDK transport through JDK 25                                       |
| Eliminates payload copies     | May avoid specific copies; mapping alone does not guarantee an end-to-end copy-free path | Depends on the operation and buffering; zero-copy/direct-I/O paths need separate support |
| Amortizes syscall transitions | Not a general property                                                                   | Possible through batching/shared rings; workload- and implementation-dependent           |
| Portability                   | JDK API is portable; optimization is platform-dependent                                  | Linux-specific with kernel and native-library constraints                                |
| Failure surface               | Partial/zero transfer, fallback implementation, mapping faults/lifetime                  | Queue saturation, native ABI/artifact, unsupported opcodes, fallback and native memory   |

The `FileChannel` contract permits an implementation-specific optimized path; it does not
promise `sendfile(2)` or `splice(2)`. Correct code handles partial progress and validates the
actual implementation on its deployment JDK and operating system.
Track the returned byte count and advance the offset only by that amount. A zero return is
not necessarily EOF: do not spin indefinitely; use bounded readiness/retry or an explicit
buffered fallback appropriate to the channel. Preserve pending bytes and propagate failures.
Reject a raw file-transfer substitution when user-space TLS, compression or transformation is
required; prove any supported offload path separately. Keep the source range stable for the
transfer and any kernel-held references, rather than truncating/reusing it immediately.

For a path that uses direct file I/O, verify filesystem support, alignment, buffered fallback
and coherency requirements separately. A Java direct `ByteBuffer` does not itself enable
`O_DIRECT`; neither registration nor an opcode establishes the entire copy path. `O_DIRECT`
alone also provides no `O_SYNC` durability guarantee. Preserve the application's persistence
and concurrent-access contract rather than adopting direct I/O merely for a zero-copy label.

## Netty API era map

| 4.1.x incubator (`IOUring*`) | 4.2 GA (`IoUring*`, `io.netty.channel.uring`)                |
| ---------------------------- | ------------------------------------------------------------ |
| `IOUringEventLoopGroup`      | `MultiThreadIoEventLoopGroup(IoUringIoHandler.newFactory())` |
| `IOUringServerSocketChannel` | `IoUringServerSocketChannel`                                 |
| `IOUringSocketChannel`       | `IoUringSocketChannel`                                       |
| `IOUringChannelOption`       | `IoUringChannelOption`                                       |
| `IOUring.isAvailable()`      | `IoUring.isAvailable()`                                      |

Mixed source and dependencies may be rejected by compilation or may fail during linkage/class
loading. Resolve the dependency tree and BOM; do not diagnose every mismatch as a runtime-only
problem.

## Bootstrap with a coherent fallback

Partial Netty 4.2 configuration: requires matching transport classes/native artifacts on the
classpath, the usual imports and an application logger. `isAvailable()` handles native transport
availability, not an absent Java class that fails linkage before the check.

```java
EventLoopGroup group;
Class<? extends ServerChannel> serverChannel;

if (IoUring.isAvailable()) {
    group = new MultiThreadIoEventLoopGroup(IoUringIoHandler.newFactory());
    serverChannel = IoUringServerSocketChannel.class;
} else if (Epoll.isAvailable()) {
    log.warn("io_uring unavailable", IoUring.unavailabilityCause());
    group = new MultiThreadIoEventLoopGroup(EpollIoHandler.newFactory());
    serverChannel = EpollServerSocketChannel.class;
} else {
    log.warn("native transports unavailable; using NIO");
    group = new MultiThreadIoEventLoopGroup(NioIoHandler.newFactory());
    serverChannel = NioServerSocketChannel.class;
}

new ServerBootstrap()
    .group(group)
    .channel(serverChannel)
    .option(ChannelOption.SO_BACKLOG, 4096)
    .childOption(ChannelOption.TCP_NODELAY, true);
```

The example deliberately pairs each event-loop implementation with its matching channel. Tune
thread counts and backlog from saturation, accept-queue and latency evidence rather than CPU
count alone. This form shares the selected group for accept and child channels. If separate
accept/worker groups are required, both must use compatible handlers. The owning component must
close bound/accepted channels and call `shutdownGracefully()` on every created group on startup
failure and shutdown; await termination off the event loop. Binding and child handlers are omitted.

## Channel options are versioned API

`SO_BACKLOG` is declared on `ChannelOption` and inherited through `IoUringChannelOption`;
`ChannelOption.SO_BACKLOG` makes its generic origin clear. io_uring-specific
options, including any zero-copy threshold, vary by Netty release and operation support. Inspect
the exact dependency version and generated API docs before configuring them; do not copy a field
list from another Netty era. When zero-copy is enabled, test unsupported-kernel fallback,
completion ownership and delayed buffer reuse.

## Primary references

- [Netty 4.2 options and inherited fields](https://netty.io/4.2/api/io/netty/channel/uring/IoUringChannelOption.html)
- [FileChannel transfer contract, JDK 25](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/channels/FileChannel.html)
- [FFM final API, JEP 454](https://openjdk.org/jeps/454)
- [liburing send-zero-copy completion contract](https://man7.org/linux/man-pages/man3/io_uring_prep_send_zc.3.html)
- [io_uring request ordering and completion correlation](https://man7.org/linux/man-pages/man7/io_uring.7.html)
- [Linked requests and failure semantics](https://man7.org/linux/man-pages/man2/io_uring_enter.2.html) — `IOSQE_IO_LINK`.
- [Linux direct-file-I/O contract and restrictions](https://man7.org/linux/man-pages/man2/open.2.html) — `O_DIRECT` and NOTES, when that file mode is actually involved.
- [JDK 25 custom selector-provider contract](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/nio/channels/spi/SelectorProvider.html) and [stock OpenJDK 25 Linux selector provider](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/java.base/linux/classes/sun/nio/ch/DefaultSelectorProvider.java) — distinguish the standard API from the deployed native backend.
