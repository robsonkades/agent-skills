# Diagnosis recipes

## From symptom to suspect

```
High but stable latency on every small request ...... Nagle + delayed ACK
Local connect errors under burst ..................... ports/source address/routing
SYNs dropped at peak ................................ backlog (kernel and/or listen())
One core pinned, the others idle, multi-core host ... no SO_REUSEPORT, single accept()
Low throughput on a high bandwidth-delay link ....... autotuning ceiling below BDP
```

## Which tool answers which question

| Question                                       | Tool                                             | Layer               |
| ---------------------------------------------- | ------------------------------------------------ | ------------------- |
| How many connections in each state?            | `ss -s`, `ss -tnp state <state>`                 | Kernel, aggregate   |
| Are Nagle and delayed ACK causing the delay?   | `tcpdump` plus Wireshark Time Sequence graph     | Packets on the wire |
| Is `TCP_NODELAY` really active on this socket? | `getOption()` in Java, or `strace -e setsockopt` | Application/syscall |
| What is the real RTT to the destination?       | `hping3 -S` (TCP) or `ping` (ICMP approximation) | Network             |
| Is the connection retransmitting?              | `ss -ti`, `nstat -az \| grep retrans`            | Kernel, per socket  |
| How deep is TIME_WAIT right now?               | `ss -tn state time-wait \| wc -l`                | Kernel, aggregate   |

## Connection state

```bash
ss -s                                  # summary by state
ss -tnp                                # all TCP connections with owning process
ss -tn state time-wait | wc -l         # TIME_WAIT depth
ss -tnp state established | wc -l
netstat -s | grep -E "retransmit|error|timeout"
```

Compare TIME_WAIT depth against active-close rate and tuple scope using the host's own
`ip_local_port_range`, reserved ports and source addresses. Connections to different
destinations can reuse a local port, so `rate × 60` is a scenario estimate, not a host-wide
capacity equation.

## Catching Nagle in a capture

```bash
sudo tcpdump -i eth0 -w /tmp/capture.pcap 'port 8080' &
# run the workload
kill %1
```

In Wireshark: filter `tcp.port == 8080`, then look for a small packet followed by roughly 40 ms
of silence before the next segment. `Statistics -> TCP Stream Graphs -> Time Sequence` makes the
gap visible at a glance.

## Confirming a socket option actually applied

`ss -i` is not a reliable source here — do not rely on a `nodelay` field appearing in its default
output without checking it against the installed `iproute2`. Two forms that do work:

```bash
strace -f -e trace=setsockopt -p $(pgrep -f MyApp) 2>&1 | grep -i TCP_NODELAY
```

```java
boolean noDelay = channel.getOption(StandardSocketOptions.TCP_NODELAY);
```

The socket itself is the source of truth.

## RTT

```bash
hping3 -S -p 80 -c 10 target-host    # RTT appears in the default output as rtt=
ping -c 100 target-host | tail -2    # ICMP, a different layer — an approximation
```

`--tcp-timestamp` only enables the RFC 7323 timestamp option on the outgoing packet. It does not
measure latency and is not needed to read the RTT.

## Retransmissions and congestion window

```bash
sysctl net.ipv4.tcp_congestion_control
nstat -az | grep -i retrans
ss -ti                                # per-connection cwnd, rtt, retrans
```

An abnormally small `cwnd` alongside a retransmission count that climbs points at loss on the
path. Confirm which algorithm is active before blaming it for anything.

## Incident checklist

- [ ] The client error read literally first; local port/source/routing hypotheses separated
      from remote refusal and timeout with capture and socket-state evidence.
- [ ] TIME_WAIT depth collected and compared against the host's own port range and connection rate.
- [ ] Capture taken if Nagle is suspected, and repeated small-write/ACK timing correlated.
- [ ] `ss -ti` checked for retransmissions and an unexpectedly small `cwnd`.
- [ ] Kernel backlog **and** the Java `listen()` backlog checked together, never in isolation.
- [ ] Active congestion control confirmed by `sysctl` before it is blamed.
- [ ] Latency reported as p50/p99/p99.9, never a mean or a total.
