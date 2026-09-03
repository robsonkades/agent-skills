# Choosing the mechanism

## Situation to solution

| Situation                                                   | Candidate                     | Validate before adopting                                                       |
| ----------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| File-to-socket or file-to-file transfer                     | `transferTo` / `transferFrom` | channel pair, partial progress, fallback path and CPU per byte                 |
| Repeated/random access to a large file                      | `MappedByteBuffer`            | page-fault pattern, address-space/native-memory budget and unmapping lifecycle |
| Many asynchronous operations with transition/queue overhead | Netty io_uring                | kernel/native compatibility, batching evidence, tail latency and fallback      |
| Third-party native artifact is prohibited                   | FFM binding                   | whether binding `liburing` is acceptable; ABI, ownership and support burden    |
| Tested native wrapper already exists                        | JNI wrapper                   | packaging, ABI matrix, native-memory safety and operational ownership          |
| Bottleneck is unknown                                       | No mechanism yet              | profile and trace the representative workload first                            |

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

## JDK transfer APIs versus io_uring

| Property                      | `transferTo` / mapping                                                                   | io_uring transport                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Stable JDK API                | Yes                                                                                      | No JDK-native transport through JDK 25                                                     |
| Eliminates payload copies     | May avoid specific copies; mapping alone does not guarantee an end-to-end copy-free path | Ordinary reads/writes copy; selected zero-copy/splice operations may avoid specific copies |
| Amortizes syscall transitions | Not a general property                                                                   | Possible through batching/shared rings; workload- and implementation-dependent             |
| Portability                   | JDK API is portable; optimization is platform-dependent                                  | Linux-specific with kernel and native-library constraints                                  |
| Failure surface               | Partial/zero transfer, fallback implementation, mapping faults/lifetime                  | Queue saturation, native ABI/artifact, unsupported opcodes, fallback and native memory     |

The `FileChannel` contract permits an implementation-specific optimized path; it does not
promise `sendfile(2)` or `splice(2)`. Correct code handles partial progress and validates the
actual implementation on its deployment JDK and operating system.

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
    .group(bossGroup, group)
    .channel(serverChannel)
    .option(ChannelOption.SO_BACKLOG, 4096)
    .childOption(ChannelOption.TCP_NODELAY, true);
```

The example deliberately pairs each event-loop implementation with its matching channel. Tune
thread counts and backlog from saturation, accept-queue and latency evidence rather than CPU
count alone. Ensure `bossGroup` follows the same lifecycle and shutdown policy.

## Channel options are versioned API

`SO_BACKLOG` is a generic `ChannelOption`, not an `IoUringChannelOption`. io_uring-specific
options, including any zero-copy threshold, vary by Netty release and operation support. Inspect
the exact dependency version and generated API docs before configuring them; do not copy a field
list from another Netty era. When zero-copy is enabled, test unsupported-kernel fallback,
completion ownership and delayed buffer reuse.
