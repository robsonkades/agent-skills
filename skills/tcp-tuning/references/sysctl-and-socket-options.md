# Sysctls and socket options

## Parameters, real defaults, and what each one governs

| Parameter                         | Default (recent kernel)                      | Governs                                                                         |
| --------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------- |
| `TCP_TIMEWAIT_LEN`                | 60 s, fixed — **no sysctl**                  | TIME_WAIT duration. Not configurable at all.                                    |
| `net.ipv4.tcp_fin_timeout`        | 60 s                                         | Time in FIN_WAIT_2 before a forced close. **Not TIME_WAIT.**                    |
| `net.ipv4.tcp_tw_reuse`           | 0 or 2, varies by distribution               | Reusing a TIME_WAIT port for a new **outbound** connection, timestamp-protected |
| `net.ipv4.ip_local_port_range`    | `32768 60999` (28,232 ports)                 | Ephemeral port range for outbound connections                                   |
| `net.core.somaxconn`              | 128 below kernel 5.4, 4096 from 5.4          | Ceiling on the accept backlog; effective only if `listen()` asks for as much    |
| `net.ipv4.tcp_max_syn_backlog`    | Scales with available memory                 | Half-open queue (SYN received, final ACK pending)                               |
| `net.core.rmem_max` / `wmem_max`  | Varies by distribution                       | Absolute ceiling on `SO_RCVBUF`/`SO_SNDBUF` set by the application              |
| `net.ipv4.tcp_rmem` / `tcp_wmem`  | `min default max`, e.g. `4096 87380 6291456` | Per-connection autotuning range; the third value is the real growth limit       |
| `net.ipv4.tcp_moderate_rcvbuf`    | **1 since kernel 2.6.17**                    | Receive autotuning. Already on; setting it changes nothing.                     |
| `net.ipv4.tcp_congestion_control` | `cubic`                                      | Active congestion control algorithm                                             |
| `net.ipv4.tcp_keepalive_time`     | 7200 s (2 h)                                 | Idle time before the first keepalive probe                                      |

## Worked example: the buffer ceiling against BDP

```
Link: 10 Gbps, RTT 20 ms
BDP = 10 Gbit/s x 0.020 s = 200 Mbit = 25 MB

With a tcp_rmem ceiling of 6 MB (a common value; the kernel derives it from RAM at
boot, so confirm with `sysctl net.ipv4.tcp_rmem` rather than assuming):
    6 MB / 0.020 s = 300 MB/s ~= 2.4 Gbps

Far better than the naive 87 KB / 20 ms ~= 4.35 MB/s, and still far below the link,
because 6 MB < 25 MB. Raising the ceiling is what moves this number; "enabling"
autotuning is not.
```

Ephemeral port exhaustion follows from the same style of arithmetic:

```
1000 outbound connections/s, no keep-alive, closed actively by this service.
Steady-state TIME_WAIT sockets = 1000/s x 60 s = 60,000
Ports actually available          = 60999 - 32768 + 1 = 28,232
28,232 < 60,000, so exhaustion arrives before steady state:
    28,232 / 1000 per s ~= 28 seconds of sustained burst.
```

## A starting `/etc/sysctl.d/99-java-tcp.conf`

```conf
# Buffers: raise the CEILING; autotuning handles the rest
net.core.rmem_max = 33554432
net.core.wmem_max = 33554432
net.ipv4.tcp_rmem = 4096 87380 33554432
net.ipv4.tcp_wmem = 4096 65536 33554432

# TIME_WAIT and ports
net.ipv4.tcp_tw_reuse = 1                    # safe reuse for OUTBOUND connections
net.ipv4.ip_local_port_range = 15000 61000   # ~46,000 ports
net.ipv4.tcp_fin_timeout = 30                # shortens FIN_WAIT_2 — does NOT affect TIME_WAIT

# Backlog — the Java listen() must ask for a matching value
net.core.somaxconn = 4096
net.ipv4.tcp_max_syn_backlog = 8192

# Keepalive
net.ipv4.tcp_keepalive_time = 60
net.ipv4.tcp_keepalive_intvl = 10
net.ipv4.tcp_keepalive_probes = 6
```

Apply with `sudo sysctl --system`. A value set only with `sysctl -w` is gone at reboot.

## The Java half

```java
// Backlog — explicit, or the JDK's modest internal default wins over somaxconn
ServerSocket serverSocket = new ServerSocket(port, 1024);
serverChannel.bind(new InetSocketAddress(port), 1024);

// Nagle, per socket — no global sysctl exists
socket.setTcpNoDelay(true);
channel.setOption(StandardSocketOptions.TCP_NODELAY, true);
bootstrap.childOption(ChannelOption.TCP_NODELAY, true);

// SO_REUSEPORT (Linux 3.9+) lives in the jdk.net module: add --add-modules jdk.net,
// or `requires jdk.net;` in module-info.java
channel.setOption(jdk.net.ExtendedSocketOptions.SO_REUSEPORT, true);

// Buffer override — must be set before connect/bind
socket.setReceiveBufferSize(4 * 1024 * 1024);
socket.setSendBufferSize(4 * 1024 * 1024);

// Timeouts on every manually created socket
Socket socket = new Socket();
socket.connect(new InetSocketAddress(host, 80), 3000);
socket.setSoTimeout(10_000);
```

`tcp_keepalive_time` at its 7200 s default detects a dead peer two hours late. Prefer an
application heartbeat — WebSocket ping/pong, or gRPC `keepAliveTime` / `keepAliveTimeout` /
`keepAliveWithoutCalls`.

## Choosing `TCP_NODELAY`

| Traffic                                               | Setting           | Why                                                              |
| ----------------------------------------------------- | ----------------- | ---------------------------------------------------------------- |
| Small request/response (REST, RPC, Redis, unary gRPC) | `true`            | Each message is complete; Nagle adds up to 40 ms for no batching |
| Bulk transfer of a large file                         | `false` (default) | Nagle coalesces small writes toward MSS, cutting header overhead |
| Streaming with writes already at MSS                  | irrelevant        | Nagle only holds a small write while an ACK is outstanding       |
| Multiplexed protocols (HTTP/2, gRPC streaming)        | `true`            | Per-stream latency dominates; frameworks already default to it   |
| WebSocket control frames                              | `true`            | Ping/pong should not wait 40 ms                                  |

## Congestion control

| Algorithm       | Congestion signal                  | Where it wins                        | Prerequisite                         |
| --------------- | ---------------------------------- | ------------------------------------ | ------------------------------------ |
| CUBIC (default) | Packet loss, cubic `cwnd` growth   | Wired high-BDP networks, general use | None                                 |
| BBR             | Measured bandwidth and minimum RTT | Networks with non-congestive loss    | `tcp_bbr` kernel module              |
| DCTCP           | ECN marks from switches, not loss  | Low-latency datacentre fabric        | Switches with RED configured to mark |
| Reno            | Packet loss                        | Simple, low-BDP networks             | None                                 |

```bash
sysctl net.ipv4.tcp_congestion_control            # what is active
sysctl net.ipv4.tcp_available_congestion_control  # what is loaded
sudo modprobe tcp_bbr && sudo sysctl -w net.ipv4.tcp_congestion_control=bbr
```

DCTCP's two host sysctls configure the **sender's** reaction to an ECN mark. If nothing on the
path marks, hosts behave as CUBIC with ECN never triggered. Confirm the switch configuration
before proposing it; it is a datacentre decision, not a host flag.
