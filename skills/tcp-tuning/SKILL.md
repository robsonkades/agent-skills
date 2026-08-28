---
name: tcp-tuning
description: >
  The network stack under a JVM service: listen backlog and accept queues, Nagle and delayed
  ACK, socket buffer sizing against bandwidth-delay product, congestion control choice,
  keepalive and timeout alignment along the path, and diagnosing retransmissions and queue
  drops. Use when a small request/response protocol shows a stable ~40 ms latency floor,
  when a client throws BindException or EADDRNOTAVAIL under burst, when SYNs are dropped at
  peak, when one core saturates while the others idle on a multi-core server, when
  throughput plateaus far below a high bandwidth-delay link, when somaxconn was raised and
  nothing changed, when TIME_WAIT sockets accumulate, or when someone proposes switching to
  BBR or DCTCP. Does not cover host memory, CPU and signals (linux-for-jvm), the
  data-movement path itself (io-uring-and-zero-copy), or application-level connection reuse
  (connection-pool-sizing).
---

# TCP Tuning

## Purpose

Decide which layer a network symptom actually lives in — the socket options the application
sets, the kernel parameters of the host, or the path between the two endpoints — and change
only that one. Most TCP tuning goes wrong because a sysctl is raised on one side of a pair
whose effective value is the minimum of both, and the team concludes the parameter "does not
work".

The specific failures this prevents: raising `net.core.somaxconn` while the Java `listen()`
still asks for the JDK default; "fixing" TIME_WAIT by lowering `tcp_fin_timeout`, which
governs a different state entirely; and computing port exhaustion or throughput headroom from
numbers that describe the remedy rather than the default.

## Workflow

1. **Classify the symptom before touching anything.** Stable per-request latency on small
   writes points at Nagle and delayed ACK. Client-side connection errors under burst point at
   ephemeral port exhaustion. Dropped SYNs at peak point at backlog. One busy core points at a
   single `accept()`. Low throughput on a fat link points at a buffer ceiling.
2. **Measure the current state.** Connection counts by state, TIME_WAIT depth, a packet capture
   if Nagle is suspected, per-connection `cwnd` and retransmissions. Recipes are in
   `references/diagnosis-recipes.md`.
3. **Correlate before concluding.** TIME_WAIT depth against the connection rate over the same
   interval; the ~40 ms gap in the capture against small writes on sockets without
   `TCP_NODELAY`; a full SYN queue against the concurrency peak.
4. **Remedy at the cause.** Nagle is per socket. TIME_WAIT is fixed by persistent connections
   first, `tcp_tw_reuse` second, a wider port range third. Backlog needs the sysctl **and** the
   application `listen()`. Buffers need the ceiling raised, not autotuning "enabled".
5. **Confirm the setting actually took.** Read the option back from the socket, or observe the
   `setsockopt` call. A configured value is not an applied value.
6. **Persist in `/etc/sysctl.d/`**, never only `sysctl -w`, and re-measure the same counter you
   started from.

## Rules

- TIME_WAIT lasts **60 seconds on Linux, always** — `TCP_TIMEWAIT_LEN` is a kernel constant. It
  is not `2 × MSL`, not 120 s, and no `net.ipv4.*` parameter changes it.
- `net.ipv4.tcp_fin_timeout` governs FIN_WAIT_2, an orphaned-socket protection. Any plan that
  lowers it to shorten TIME_WAIT is wrong on its face.
- The default ephemeral port range is `32768 60999` — **28,232 ports**, not 64,511. That larger
  figure describes the widened range used as the fix; using it as the baseline understates the
  problem by more than double.
- Port exhaustion surfaces at the client as `BindException` / `EADDRNOTAVAIL` from `connect()`,
  before any SYN leaves the host. It is not "connection refused", and the remote service is not
  the suspect.
- Effective backlog is `min(net.core.somaxconn, backlog passed to listen())`. Pass it
  explicitly: `new ServerSocket(port, 1024)` or `bind(addr, 1024)`. Without that, the sysctl is
  inert.
- `net.core.somaxconn` defaults to 128 below kernel 5.4 and 4096 from 5.4 on. Read it with
  `sysctl`; do not quote 128 as universal.
- Receive-buffer autotuning (`tcp_moderate_rcvbuf`) has been on by default since kernel 2.6.17.
  Setting it to 1 changes nothing. The real limit is the ceiling — `tcp_rmem[2]` and
  `rmem_max` — measured against the link's BDP (`bandwidth × RTT`).
- Never compute throughput from the ~87 KB default of the `tcp_rmem` triple. With autotuning on,
  a long-lived connection grows past it; the ceiling is what caps it.
- `TCP_NODELAY` is a per-socket option with no global sysctl equivalent, and it is a decision
  per traffic type: on for small request/response and multiplexed protocols, off for bulk
  transfer where Nagle's batching lowers header overhead per byte.
- Nagle plus delayed ACK contributes up to **40 ms** of artificial latency to small
  request/response writes. That is the signature to look for in a capture.
- Quote BBR only from the primary source (Cardwell et al., ACM Queue, 2016): loss tolerance to
  ~5% at the model limit and near it to ~15%, and 2–25× against CUBIC measured on Google's B4.
  The circulating "40–100% at ~1% loss" claim is not in the paper.
- DCTCP needs the switches on the path marking ECN via RED. With `tcp_ecn=1` and
  `tcp_congestion_control=dctcp` set on hosts alone, behaviour is unchanged — that is not a
  host misconfiguration, it is half a contract.
- `SO_REUSEADDR` and `SO_REUSEPORT` solve different problems: relisten over a lingering socket
  versus scaling `accept()` across sockets. Neither addresses client-side port exhaustion.
- Every manually created socket sets both a connect timeout and `setSoTimeout`. A socket without
  them can block a thread indefinitely.
- Report network latency as p50/p99/p99.9. A mean hides the exact 40 ms tail these mechanisms
  produce.

## References

- [Sysctls and socket options](references/sysctl-and-socket-options.md) — the parameter table
  with real defaults and what each one actually governs, a starting `/etc/sysctl.d/` file, the
  BDP worked example, and the Java calls for backlog, `SO_REUSEPORT`, keepalive and timeouts.
  Read before changing any kernel parameter or writing socket setup code.
- [Diagnosis recipes](references/diagnosis-recipes.md) — the symptom-to-tool map and the exact
  commands for connection state, TIME_WAIT depth, Nagle capture analysis, RTT, retransmissions
  and congestion window. Read during an incident, or when confirming a change took effect.
