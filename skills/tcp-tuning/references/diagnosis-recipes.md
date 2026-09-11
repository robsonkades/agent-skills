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

| Question                                       | Tool                                                 | Layer               |
| ---------------------------------------------- | ---------------------------------------------------- | ------------------- |
| How many connections in each state?            | `ss -s`, `ss -tnp state <state>`                     | Kernel, aggregate   |
| Are Nagle and delayed ACK causing the delay?   | `tcpdump` plus Wireshark Time Sequence graph         | Packets on the wire |
| Is `TCP_NODELAY` really active on this socket? | `getOption()` in Java, or `strace -e setsockopt`     | Application/syscall |
| What is the real RTT to the destination?       | `hping3 -S` (TCP) or `ping` (ICMP approximation)     | Network             |
| Is the connection retransmitting?              | `ss -ti`; `nstat -az` for namespace totals           | Socket vs aggregate |
| How deep is TIME_WAIT right now?               | Successful `ss -Htn state time-wait` row count below | Kernel, aggregate   |

Select recipes for the actual hypothesis; this is not a mandatory full network audit. Keep
collector exit status and stderr with the output. Run standalone collector lines separately;
the last command's status does not validate every command in a displayed group.
A failed producer can be hidden by `ss | wc`,
`ping | tail` or a final `grep`; even `pipefail` does not make a printed partial count valid.
Inspect complete successful output before optional filtering. No matches and failed collection
are different outcomes, and neither establishes a disabled option or a zero counter by itself.

## Connection state

```bash
ss -s                                  # summary by state
ss -tnp                                # all TCP connections with owning process
netstat -s                              # retain full output and exit status before filtering
```

This Bash fragment counts only successful header-free snapshots; an empty successful snapshot
is zero. A collection failure retains its status and stderr instead of publishing a count.

```bash
(
    count_tcp_state() {
        local rows status
        if rows=$(ss -Htn state "$1"); then
            printf '%s' "$rows" | awk 'END { print NR }'
        else
            status=$?
            printf 'ss failed (status %s); count unavailable\n' "$status" >&2
            return "$status"
        fi
    }
    count_tcp_state time-wait || exit "$?"
    count_tcp_state established || exit "$?"
)
```

Compare TIME_WAIT depth against active-close rate and tuple scope using the host's own
`ip_local_port_range`, reserved ports and source addresses. Connections to different
destinations can reuse a local port, so `rate × 60` is a scenario estimate, not a host-wide
capacity equation.

## Catching Nagle in a capture

```bash
(
    umask 077
    : "${TCP_CAPTURE_IFACE:?Select the authorized capture interface}"
    capture_dir=$(mktemp -d "${TMPDIR:-/tmp}/tcp-capture.XXXXXXXXXX") || exit "$?"
    capture_status=0
    timeout --signal=INT --kill-after=5s 30s tcpdump -i "$TCP_CAPTURE_IFACE" \
        -s 128 -c 10000 -w "$capture_dir/capture.pcap" 'tcp port 8080' \
        2>"$capture_dir/tcpdump.stderr" || capture_status=$?
    printf 'Capture directory: %s\nCollector status: %s\n' "$capture_dir" "$capture_status"
    cat "$capture_dir/tcpdump.stderr" >&2
    exit "$capture_status"
)
```

Run only for an authorized target with an account/helper already permitted to capture. Select
the interface and filter for that question. The private directory must be writable by the
actual capture identity, including any configured tcpdump privilege drop; an approved capture
helper may need its own protected output location. Do not make it public or change privileges
to make this example work. Retain the path/status/stderr, inspect captured/dropped counts, and
apply the agreed evidence retention/cleanup policy after transfer or analysis.

GNU timeout status 124 marks its elapsed limit; available packets may still be useful partial
evidence. Status 0 can mean the packet limit completed. Other statuses need inspection, including
permission/startup failure or forced termination after the additional five-second grace. None
of these statuses alone proves capture completeness, no traffic, or absence of collector drops.

In Wireshark: filter `tcp.port == 8080`, then look for a small packet followed by roughly 40 ms
of silence before the next segment. `Statistics -> TCP Stream Graphs -> Time Sequence` makes the
gap visible at a glance. A gap alone is not proof: correlate application write times,
outstanding unacknowledged bytes and the ACK that releases a queued small write. Capture
both directions; host offloads/capture placement can distort segment sizes. The bounded
Linux recipe requires GNU timeout, a chosen interface and protected output location;
even a truncated capture can contain payload or credentials. Inspect capture drops.

## Confirming a socket option actually applied

`ss -i` is not a reliable source here — do not rely on a `nodelay` field appearing in its default
output without checking it against the installed `iproute2`. Two evidence paths are:

```bash
sudo timeout --signal=INT --kill-after=5s 15s strace -f -e trace=setsockopt -p "$PID"
```

```java
boolean noDelay = channel.getOption(StandardSocketOptions.TCP_NODELAY);
```

Use one verified PID. Attachment can perturb the process and only sees calls made after
attachment: no observed setsockopt is not proof that the option is disabled. Check the
collector/timeout status, stderr and syscall result before filtering for TCP_NODELAY. Retain
the full trace output; a bounded interval with no matching call is still inconclusive.
The socket's current option is the stronger evidence. The Java line is a partial snippet with
an owned open SocketChannel and the StandardSocketOptions import, not a complete program.

## RTT

```bash
hping3 -S -p 80 -c 10 target-host    # RTT appears in the default output as rtt=
ping -c 100 target-host             # retain status/full output; ICMP is an approximation
```

`--tcp-timestamp` enables the TCP timestamp option and, in the referenced hping source, attempts
to estimate the remote timestamp frequency/uptime. It is not required for the ordinary `rtt=`
round-trip result. Check the installed tool's behavior; an uptime estimate is not an RTT measurement.

## Retransmissions and congestion window

```bash
sysctl net.ipv4.tcp_congestion_control  # default for new connections, not every live socket
nstat -az                             # cumulative totals; retain status before filtering
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

Use the items relevant to the incident and reuse adequate evidence; a narrow source/API answer
does not require every capture. An operational claim needs its corresponding observed data.

- [ ] The client error read literally first; local port/source/routing hypotheses separated
      from remote refusal and timeout with capture and socket-state evidence.
- [ ] TIME_WAIT depth collected and compared against the host's own port range and connection rate.
- [ ] Capture taken if Nagle is suspected, and repeated small-write/ACK timing correlated.
- [ ] `ss -ti` checked for retransmissions and an unexpectedly small `cwnd`.
- [ ] Kernel backlog **and** the Java `listen()` backlog checked together, never in isolation.
- [ ] Affected connection's congestion control confirmed, with namespace default recorded separately.
- [ ] Metrics match the objective; any tail distribution is supported by sample count, with
      timeout/error totals retained.

Sources: [ss options and TCP diagnostics](https://man7.org/linux/man-pages/man8/ss.8.html),
[Linux TCP defaults and queue settings](https://docs.kernel.org/networking/ip-sysctl.html),
[Bash pipeline status](https://www.gnu.org/software/bash/manual/html_node/Pipelines.html),
[GNU timeout](https://www.gnu.org/software/coreutils/manual/html_node/timeout-invocation.html),
[private temporary directories](https://www.gnu.org/software/coreutils/manual/html_node/mktemp-invocation.html),
and [tcpdump 4.99.5 capture/privilege options](https://github.com/the-tcpdump-group/tcpdump/blob/tcpdump-4.99.5/tcpdump.1.in).
The hping timestamp/RTT distinction is documented in its [manual at source revision 3547c769](https://github.com/antirez/hping/blob/3547c7691742c6eaa31f8402e0ccbb81387c1b99/docs/hping3.8).
These shell examples require the named Linux tools and permissions; isolated command stubs can
check status handling but cannot validate packet capture, Linux privileges or network behavior.
