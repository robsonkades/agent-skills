# Diagnosis recipes

## From symptom to suspect

```
High but stable latency on every small request ...... Nagle/ACK, RTT, batching or proxy timer
Local connect errors under burst ..................... ports/source address/routing
SYNs dropped at peak ................................ SYN/accept queues, NIC or path drops
One core pinned, the others idle, multi-core host ... accept, RSS/RPS, event loop or application
Low throughput on a high bandwidth-delay link ....... window, cwnd, loss, CPU or sender limits
```

## Which tool answers which question

| Question                                       | Tool                                             | Layer               |
| ---------------------------------------------- | ------------------------------------------------ | ------------------- |
| How many connections in each state?            | `ss -s`, `ss -tnp state <state>`                 | Kernel, aggregate   |
| Are Nagle and delayed ACK causing the delay?   | `tcpdump` plus Wireshark Time Sequence graph     | Packets on the wire |
| Is `TCP_NODELAY` really active on this socket? | `getOption()` in Java, or `strace -e setsockopt` | Application/syscall |
| What is the real RTT to the destination?       | `hping3 -S` (TCP) or `ping` (ICMP approximation) | Network             |
| Is the connection retransmitting?              | `ss -ti`; `nstat -az` for namespace totals       | Socket vs aggregate |
| How deep is TIME_WAIT right now?               | `ss -Htn state time-wait \| wc -l`               | Kernel, aggregate   |

## Connection state

```bash
ss -s                                  # summary by state
ss -tnp                                # all TCP connections with owning process
ss -Htn state time-wait | wc -l        # no header counted
ss -Htn state established | wc -l
netstat -s | grep -E "retransmit|error|timeout"
```

Compare TIME_WAIT depth against active-close rate and tuple scope using the host's own
`ip_local_port_range`, reserved ports and source addresses. Connections to different
destinations can reuse a local port, so `rate × 60` is a scenario estimate, not a host-wide
capacity equation.

## Catching Nagle in a capture

```bash
sudo timeout --signal=INT 30s tcpdump -i eth0 -s 128 -c 10000 -w /tmp/capture.pcap 'tcp port 8080'
```

In Wireshark: filter `tcp.port == 8080`, then look for a small packet followed by roughly 40 ms
of silence before the next segment. `Statistics -> TCP Stream Graphs -> Time Sequence` makes the
gap visible at a glance. A gap alone is not proof: correlate application write times,
outstanding unacknowledged bytes and the ACK that releases a queued small write. Capture
both directions; host offloads/capture placement can distort segment sizes. The bounded
Linux recipe requires GNU timeout, a chosen interface and protected output location;
even a truncated capture can contain payload or credentials. Inspect capture drops.

## Confirming a socket option actually applied

`ss -i` is not a reliable source here — do not rely on a `nodelay` field appearing in its default
output without checking it against the installed `iproute2`. Two forms that do work:

```bash
sudo timeout --signal=INT 15s strace -f -e trace=setsockopt -p "$PID" 2>&1 | grep -i TCP_NODELAY
```

```java
boolean noDelay = channel.getOption(StandardSocketOptions.TCP_NODELAY);
```

Use one verified PID. Attachment can perturb the process and only sees calls made after
attachment: no observed setsockopt is not proof that the option is disabled. Check the
syscall result. The socket's current option is the stronger evidence.

## RTT

```bash
hping3 -S -p 80 -c 10 target-host    # RTT appears in the default output as rtt=
ping -c 100 target-host | tail -2    # ICMP, a different layer — an approximation
```

`--tcp-timestamp` only enables the RFC 7323 timestamp option on the outgoing packet. It does not
measure latency and is not needed to read the RTT.

## Retransmissions and congestion window

```bash
sysctl net.ipv4.tcp_congestion_control  # default for new connections, not every live socket
nstat -az | grep -i retrans
ss -ti                                # per-connection cwnd, rtt, retrans
```

Read the affected connection's algorithm in `ss -ti` (or TCP_CONGESTION), not only the
namespace default; listener inheritance and per-socket overrides matter. Sample `nstat -az`
twice over a known interval: it reports cumulative namespace counters, not a request's loss
rate. A retransmission increase is consistent with loss but also reordering/spurious recovery;
small cwnd can reflect startup or idle restart. Correlate both endpoints and queue counters.

For backlog hypotheses, compare `ss -ltn` listener queues and requested backlog with
`ss -Htn state syn-recv` and interval deltas of TcpExtListenOverflows/ListenDrops and syncookie
counters. SYN cookies can hide pressure from the visible SYN queue; a snapshot is insufficient.

## Incident checklist

- [ ] The client error read literally first; local port/source/routing hypotheses separated
      from remote refusal and timeout with capture and socket-state evidence.
- [ ] TIME_WAIT depth collected and compared against the host's own port range and connection rate.
- [ ] Capture taken if Nagle is suspected, and repeated small-write/ACK timing correlated.
- [ ] `ss -ti` checked for retransmissions and an unexpectedly small `cwnd`.
- [ ] Kernel backlog **and** the Java `listen()` backlog checked together, never in isolation.
- [ ] Affected connection's congestion control confirmed, with namespace default recorded separately.
- [ ] Latency distribution supported by sample count, with timeout/error totals retained.

Sources: [ss options and TCP diagnostics](https://man7.org/linux/man-pages/man8/ss.8.html),
[Linux TCP defaults and queue settings](https://docs.kernel.org/networking/ip-sysctl.html).
