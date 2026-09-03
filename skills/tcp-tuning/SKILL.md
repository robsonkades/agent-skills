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

1. **Generate competing hypotheses before touching anything.** Small-write latency can involve
   Nagle/delayed ACK; local connect failures can involve ports, source addresses or routing;
   dropped SYNs can involve several path queues; one busy core can involve accept, RSS/RPS,
   event-loop affinity or application work. Each needs its own evidence.
2. **Measure the current state.** Connection counts by state, TIME_WAIT depth, a packet capture
   if Nagle is suspected, per-connection `cwnd` and retransmissions. Recipes are in
   `references/diagnosis-recipes.md`.
3. **Correlate before concluding.** TIME_WAIT depth against the connection rate over the same
   interval; the ~40 ms gap in the capture against small writes on sockets without
   `TCP_NODELAY`; a full SYN queue against the concurrency peak.
4. **Remedy at the cause.** Connection reuse usually reduces churn first. Changes to
   `tcp_tw_reuse`, port ranges, bind addresses, backlog or buffers affect different mechanisms
   and security/operational boundaries; choose only after proving which bound was hit.
5. **Confirm the setting actually took.** Read the option back from the socket, or observe the
   `setsockopt` call. A configured value is not an applied value.
6. **Persist in `/etc/sysctl.d/`**, never only `sysctl -w`, and re-measure the same counter you
   started from.

## Rules

- Mainline Linux uses a 60-second `TCP_TIMEWAIT_LEN` implementation constant rather than a
  TIME_WAIT sysctl. Verify the running kernel/vendor tree; reuse can make a tuple available
  sooner without changing what `tcp_fin_timeout` means.
- `net.ipv4.tcp_fin_timeout` governs FIN_WAIT_2, an orphaned-socket protection. Any plan that
  lowers it to shorten TIME_WAIT is wrong on its face.
- Mainline's common default ephemeral range is `32768 60999`, but distributions and operators
  change it. Read `ip_local_port_range`, reserved ports, bind addresses and current sockets.
  Capacity is per usable source-address/port and destination tuple behavior, not one global
  28,232-connection ceiling.
- `BindException` / `EADDRNOTAVAIL` before a SYN is consistent with local ephemeral-port or
  source-address exhaustion, but routing, an unavailable explicit bind address and namespace
  configuration can produce related errors. Prove it with tuple/state counts and packet capture.
- The completed-connection accept queue is capped by the requested `listen()` backlog and
  kernel policy such as `somaxconn` (with implementation rounding/accounting). Pass it
  explicitly: `new ServerSocket(port, 1024)` or `bind(addr, 1024)`. Without that, the sysctl is
  inert.
- `net.core.somaxconn` defaults to 128 below kernel 5.4 and 4096 from 5.4 on. Read it with
  `sysctl`; do not quote 128 as universal.
- Receive-buffer autotuning is commonly enabled. `tcp_rmem[2]` governs TCP autotuning's
  receive maximum, while `net.core.rmem_max`/`wmem_max` govern application-requested socket
  buffers; do not collapse them into one ceiling. Effective throughput also depends on
  congestion window, window scaling, loss and sender behavior, not BDP alone.
- Never compute throughput from the ~87 KB default of the `tcp_rmem` triple. With autotuning on,
  a long-lived connection grows past it; the ceiling is what caps it.
- `TCP_NODELAY` is a per-socket option with no global sysctl equivalent. Decide from actual
  write sizes/cadence and protocol framing; bulk paths usually batch in user space or use
  zero-copy, so leaving Nagle on is not an automatic win.
- Nagle/delayed-ACK interaction can create a repeatable delay (often tens of milliseconds on
  specific stacks). Only packet timing plus socket-option evidence distinguishes it from RTT,
  scheduling, application batching or proxy timers.
- Treat BBR as a versioned congestion-control implementation, not a universal speedup.
  BBRv1/v2/later revisions, pacing support, RTT fairness, policers and workload mix differ.
  Reproduce against the deployed kernel and path with throughput, RTT distribution, loss and
  fairness; published results are evidence for their experiment, not yours.
- DCTCP needs an ECN-capable path with appropriately configured marking/AQM. With `tcp_ecn=1` and
  `tcp_congestion_control=dctcp` set on hosts alone, behaviour is unchanged — that is not a
  host misconfiguration, it is half a contract.
- `SO_REUSEADDR` and `SO_REUSEPORT` solve different problems: relisten over a lingering socket
  versus scaling `accept()` across sockets. Neither addresses client-side port exhaustion.
- Every externally dependent blocking operation needs a deadline budget. For a client socket,
  that usually means connect and read timeouts; server/listener and non-blocking channels have
  different APIs. Align application deadlines with retries, proxies and load balancers.
- Report a latency distribution with enough samples for the claimed percentile and retain
  timeout/error counts. p99.9 from a few hundred requests is noise; a mean alone hides tails.

## References

- [Sysctls and socket options](references/sysctl-and-socket-options.md) — the parameter table
  with real defaults and what each one actually governs, a starting `/etc/sysctl.d/` file, the
  BDP worked example, and the Java calls for backlog, `SO_REUSEPORT`, keepalive and timeouts.
  Read before changing any kernel parameter or writing socket setup code.
- [Diagnosis recipes](references/diagnosis-recipes.md) — the symptom-to-tool map and the exact
  commands for connection state, TIME_WAIT depth, Nagle capture analysis, RTT, retransmissions
  and congestion window. Read during an incident, or when confirming a change took effect.
