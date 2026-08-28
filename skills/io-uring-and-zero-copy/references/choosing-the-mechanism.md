# Choosing the mechanism

## Situation to solution

| Situation                                                  | Use                                        |
| ---------------------------------------------------------- | ------------------------------------------ |
| Serving static files, proxying raw bytes                   | `transferTo` / `transferFrom`              |
| Repeated or random access to one large file                | `MappedByteBuffer` via `FileChannel.map`   |
| 100K+ connections, syscalls dominating `strace -c`         | Netty io_uring — route (a)                 |
| Environment forbids third-party native binaries            | FFM binding — route (b), accept the upkeep |
| A tested C wrapper over `liburing` already exists in-house | Own JNI — route (c)                        |
| Unsure whether syscalls are the bottleneck at all          | Measure first; choose nothing yet          |

The first two rows need no dependency and no minimum kernel. Exhaust them before reading on.

## The only three routes to io_uring from a JVM

| Route | Where the binding lives                                                 | Adoption cost                                                              |
| ----- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| (a)   | Netty `netty-transport-native-io_uring` — C compiled against `liburing` | Low: swap `EventLoopGroup` and `Channel`, keep the rest of the pipeline    |
| (b)   | Your own `java.lang.foreign` downcalls (JEP 454, final in JDK 22)       | High: you reimplement what `liburing` does, kernel struct layouts included |
| (c)   | Your own JNI wrapper plus `.so`                                         | High: native build, multiplatform packaging and memory lifetime are yours  |

There is no fourth route. Route (b)'s binary layouts (`io_uring_sqe`, `io_uring_cqe`,
`io_uring_params`) are defined by the kernel and have gained fields between kernel versions, so
the binding needs review on kernel upgrades — that coupling is why (a) is the default.

## JDK-native zero-copy versus io_uring

| Property                       | `transferTo` / `MappedByteBuffer` | io_uring (a/b/c)                      |
| ------------------------------ | --------------------------------- | ------------------------------------- |
| Part of the JDK, no dependency | Yes                               | No                                    |
| Reduces CPU copies             | Yes (`sendfile` / `mmap`)         | Only with the `_ZC` opcodes           |
| Reduces syscall count          | No — still one syscall per call   | Yes — this is the whole point         |
| Minimum kernel                 | None                              | Linux 5.1; 6.0-era for zero-copy send |
| Stable public JDK API          | Yes, since JDK 1.4                | None exists                           |

## Netty API era map

Mixing these two columns is the most common failure, and it surfaces at runtime as
`NoSuchMethodError` or `ClassNotFoundException`, never at compile time.

| 4.1.x incubator (`IOUring*`) | 4.2 GA (`IoUring*`, `io.netty.channel.uring`)                |
| ---------------------------- | ------------------------------------------------------------ |
| `IOUringEventLoopGroup`      | `MultiThreadIoEventLoopGroup(IoUringIoHandler.newFactory())` |
| `IOUringServerSocketChannel` | `IoUringServerSocketChannel`                                 |
| `IOUringSocketChannel`       | `IoUringSocketChannel`                                       |
| `IOUringChannelOption`       | `IoUringChannelOption`                                       |
| `IOUring.isAvailable()`      | `IoUring.isAvailable()`                                      |

If the project is deliberately pinned to a 4.1.x release, the all-caps spelling is correct
_for that version_. Confirm which era you are on against the BOM before writing a line.

## Bootstrap with the fallback in place

```java
EventLoopGroup group;
if (IoUring.isAvailable()) {
    group = new MultiThreadIoEventLoopGroup(
        Runtime.getRuntime().availableProcessors(), IoUringIoHandler.newFactory());
} else {
    log.warn("io_uring unavailable: {}", IoUring.unavailabilityCause().getMessage());
    group = Epoll.isAvailable()
        ? new MultiThreadIoEventLoopGroup(EpollIoHandler.newFactory())
        : new MultiThreadIoEventLoopGroup(NioIoHandler.newFactory());
}

new ServerBootstrap().group(bossGroup, group)
    .channel(IoUringServerSocketChannel.class)
    .option(ChannelOption.SO_BACKLOG, 4096)            // generic, not IoUringChannelOption
    .childOption(IoUringChannelOption.TCP_FASTOPEN, 5) // this one is io_uring-specific
    .childOption(ChannelOption.TCP_NODELAY, true);
```

One event loop per CPU is a starting point to validate under load, not a rule.

## The real fields of `IoUringChannelOption`

`TCP_CORK`, `TCP_NOTSENT_LOWAT`, `TCP_KEEPIDLE`, `TCP_KEEPINTVL`, `TCP_KEEPCNT`,
`TCP_USER_TIMEOUT`, `IP_FREEBIND`, `IP_TRANSPARENT`, `TCP_FASTOPEN`, `TCP_DEFER_ACCEPT`,
`TCP_QUICKACK`, `MAX_DATAGRAM_PAYLOAD_SIZE`, `IO_URING_BUFFER_GROUP_ID`,
`IO_URING_WRITE_ZERO_COPY_THRESHOLD`, `IP_MULTICAST_ALL`.

`SO_BACKLOG` is absent from that list because it is a generic socket option valid on every
Netty transport. `IO_URING_WRITE_ZERO_COPY_THRESHOLD` is the write size above which Netty
switches to `IORING_OP_SEND_ZC`.
