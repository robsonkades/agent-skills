# Sysctls and socket options

## Parameters, real defaults, and what each one governs

| Parameter                         | Default (recent kernel)                | Governs                                                                         |
| --------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| `TCP_TIMEWAIT_LEN`                | Mainline 60 s implementation constant  | TIME_WAIT duration; check vendor implementation/reuse, no dedicated sysctl      |
| `net.ipv4.tcp_fin_timeout`        | 60 s                                   | Orphaned FIN_WAIT_2 lifetime; per-socket overrides exist. **Not TIME_WAIT.**    |
| `net.ipv4.tcp_tw_reuse`           | 0 or 2, varies by distribution         | Reusing a TIME_WAIT port for a new **outbound** connection, timestamp-protected |
| `net.ipv4.ip_local_port_range`    | `32768 60999` (28,232 ports)           | Ephemeral port range for outbound connections                                   |
| `net.core.somaxconn`              | 128 below kernel 5.4, 4096 from 5.4    | Accept backlog ceiling; raising it above the listener request adds no capacity  |
| `net.ipv4.tcp_max_syn_backlog`    | Scales with available memory           | Half-open queue (SYN received, final ACK pending)                               |
| `net.core.rmem_max` / `wmem_max`  | Varies by distribution                 | Ceiling on unprivileged application-requested `SO_RCVBUF`/`SO_SNDBUF`           |
| `net.ipv4.tcp_rmem` / `tcp_wmem`  | `min default max`; read each on target | TCP automatic buffer sizing bounds; explicit socket settings change this path   |
| `net.ipv4.tcp_moderate_rcvbuf`    | Mainline default 1                     | Receive autotuning; verify it is enabled on the target                          |
| `net.ipv4.tcp_congestion_control` | Kernel/config dependent, often `cubic` | Default for new connections; listener inheritance/socket overrides can differ   |
| `net.ipv4.tcp_keepalive_time`     | 7200 s (2 h)                           | Idle time before the first keepalive probe                                      |

## Worked example: the buffer ceiling against BDP

```
Link: 10 Gbps, RTT 20 ms
BDP = 10 Gbit/s x 0.020 s = 200 Mbit = 25 MB

If the effective advertised receive window were 6 MB (decimal):
    6 MB / 0.020 s = 300 MB/s ~= 2.4 Gbps

This is an ideal window/RTT bound, not predicted application throughput.
```

Do not substitute `tcp_rmem[2]` directly for that advertised window: socket memory includes
accounting overhead and is shared between buffering and flow control. Check actual scaled
windows, cwnd (usually in segments, multiply by MSS), application drain rate and loss.
6 MiB is 6,291,456 bytes, not 6,000,000. Explicit SO_RCVBUF disables Linux receive autotuning
for that socket; a fixed override can reduce throughput. Linux also doubles requested socket
buffer sizes for accounting. Larger ceilings are hypotheses, with a concurrent-socket memory
budget and before/after measurements, not guaranteed link utilization.

Ephemeral port exhaustion follows from the same style of arithmetic:

```
1000 outbound connections/s, no keep-alive, closed actively by this service.
Steady-state TIME_WAIT sockets = 1000/s x 60 s = 60,000
Candidate ports in this configured range = 60999 - 32768 + 1 = 28,232
For repeated connections from one source IP to the same destination, this predicts risk.
Reserved ports, other sockets and kernel tuple reuse alter the usable count; different
destinations can reuse local ports. Confirm with an experiment and socket counters.
```

## A scoped experiment

Read the relevant key in the application's network namespace, record its old value and
identify the limiting mechanism. Within authorized scope, change one setting in an isolated
or controlled canary environment and define rollback. For buffers, test automatic sizing
against a justified override; for backlog, measure accept throughput as well as queue depth.
Do not combine port reuse, FIN_WAIT_2, congestion control and buffer changes in one trial.
Only persist a supported result through the deployment's configuration mechanism.
`sysctl --system` reloads unrelated files too; it is not a scoped experiment command.

## The Java half

Partial Java 17+ setup fragments (imports from java.net, containing method handles IOException).
The owner must keep all I/O inside the lifetime or explicitly transfer ownership.

```java
try (Socket socket = new Socket()) {
    socket.setTcpNoDelay(true); // only after measuring the small-write path
    socket.setKeepAlive(true); // enables TCP probes, not an application deadline
    socket.connect(new InetSocketAddress(host, 80), 3000);
    socket.setSoTimeout(10_000); // each blocking read, not total request time
    // Perform bounded protocol I/O here; close also runs on failure.
}
```

An explicit receive-window request above 64 KiB must precede client connect or the
ServerSocket's bind; send/receive hints are not universally immutable after connection.
Read actual values back. Configure a listener before bind, for example
`new ServerSocket(port, 1024)` when only backlog is needed. Java treats backlog semantics
as implementation-specific; correlate the Linux listener's observed queue.
For SO_REUSEPORT, use supportedOptions on each unbound ServerSocketChannel and set it before
bind; Linux group membership requires compatible bind/ownership settings. An unsupported
option needs an explicit decision: use a single-listener fallback only if it meets the required
contract; otherwise fail clearly or select a supported design. Do not silently claim parallel accepts.

With SO_KEEPALIVE enabled, 7200 seconds is normally the idle delay before the first probe,
not the detection time; interval/probe count and TCP_USER_TIMEOUT affect failure detection.
Without that option the global keepalive timings do nothing for the socket. Application
heartbeats can detect a different failure (peer processing health); coordinate gRPC ping
policy with the server to avoid excessive-ping disconnects. Neither mechanism bounds a
whole request or guarantees that a timed-out remote operation stopped.

## Choosing `TCP_NODELAY`

| Traffic                                           | Setting                                          | Why                                                                            |
| ------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Small request/response with tiny dependent writes | test `true`                                      | Avoid Nagle/ACK stalls if the framework has not already set it                 |
| Bulk transfer of a large file                     | usually irrelevant after batching/zero-copy      | Measure segment sizes and CPU, do not rely on Nagle as the batcher             |
| Streaming with MSS-sized application writes       | inspect actual packetization                     | Write sizes do not prove no queued short segment after framing/coalescing      |
| Multiplexed protocols (HTTP/2, gRPC streaming)    | inspect effective setting; test if relevant      | Shared connection framing, flush policy and latency/batching objectives matter |
| WebSocket control frames                          | test `true` for a demonstrated small-write stall | Control-frame budgets and framework flush behavior determine the need          |

An application write is not a TCP segment boundary: framing, TLS, coalescing, MSS changes and
offloads can change the observed shape. Nagle's small-segment decision depends on queued data
and acknowledgements, not the protocol name. Preserve intentional batching that meets the
contract, and do not assume every framework/backend sets the same default. NODELAY does not
remove application buffering, flow/congestion limits or the path RTT.

## Congestion control

These are candidate environments for comparison, not promised wins. Kernel build/module
availability, algorithm revision, pacing and the actual workload determine the result.

| Algorithm             | Congestion signal                                 | Candidate comparison                | Prerequisite                                                             |
| --------------------- | ------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| CUBIC (often default) | Loss/ECN, cubic `cwnd` growth                     | General-purpose baseline to compare | Kernel support                                                           |
| BBR                   | Measured bandwidth and minimum RTT                | Networks with non-congestive loss   | Built-in support or an available `tcp_bbr` module; check revision/pacing |
| DCTCP                 | Fraction of ECN-marked bytes; also reacts to loss | Controlled datacentre fabric        | Compatible ECN negotiation and fabric marking                            |
| Reno                  | Packet loss                                       | Simple, low-BDP networks            | None                                                                     |

```bash
sysctl net.ipv4.tcp_congestion_control            # default for new connections
sysctl net.ipv4.tcp_available_congestion_control  # currently registered built-ins/loaded modules
ss -ti                                         # affected connection's algorithm
```

DCTCP's host settings configure the sender's reaction to ECN marking. Without compatible ECN
negotiation and path marking, the intended feedback loop does not exist; do not assume a
specific fallback congestion control without checking the kernel. Confirm marks in packet
evidence before proposing it as a datacentre-wide change.

The available list is not an inventory of every unloaded module the kernel could support.
Mainline Linux 6.12 declares BBR as a tristate option, so it may be built in or modular.
Inspect the actual build and algorithm revision; reading this example does not authorize a
module load or host-wide default change.

Primary contracts inspected: [Linux IP sysctls](https://docs.kernel.org/networking/ip-sysctl.html),
[Linux TCP socket behavior](https://man7.org/linux/man-pages/man7/tcp.7.html),
[DCTCP requirements](https://docs.kernel.org/networking/dctcp.html), and
[Java 25 Socket API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/net/Socket.html).
For listener ownership and heartbeat policy, see
[Linux socket options](https://man7.org/linux/man-pages/man7/socket.7.html),
[Java ServerSocket](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/net/ServerSocket.html)
and [gRPC keepalive](https://grpc.io/docs/guides/keepalive/).
The Java baseline contracts are also documented by [Java 17 Socket](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/net/Socket.html)
and [ServerSocketChannel](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/nio/channels/ServerSocketChannel.html).
For the implementation distinctions above, see [Linux 6.12 BBR build options](https://github.com/torvalds/linux/blob/v6.12/net/ipv4/Kconfig)
and [TCP send/Nagle decisions](https://github.com/torvalds/linux/blob/v6.12/net/ipv4/tcp_output.c).
Unversioned Linux documentation tracks a moving kernel; these versioned examples do not replace
checking defaults and support on the deployed build or authorize an upgrade.
