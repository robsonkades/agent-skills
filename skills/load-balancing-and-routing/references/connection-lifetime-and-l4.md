# Connection lifetime and why L4 pins load

The single most common load-balancing bug in a modern JVM fleet. It has no error message.

## The mechanism

An L4 balancer makes exactly one decision per **connection**: which backend receives the
bytes. Once the connection exists, every byte on it goes to that backend for the connection's
lifetime.

- **HTTP/1.1 without keep-alive** — one request per connection, so connection balancing _is_
  request balancing. This is the world the L4 defaults were designed for.
- **HTTP/1.1 with keep-alive** — a client's connection carries many sequential requests, so
  load follows connection counts. With many clients and a bounded idle timeout this usually
  averages out.
- **HTTP/2 and gRPC** — one connection multiplexes many concurrent streams, and clients are
  built to keep exactly one connection per origin open indefinitely. Ten thousand requests per
  second from one client is one balancing decision, made once, at connection setup.

So a gRPC client with a single channel behind a Kubernetes `ClusterIP` Service sends **all**
of its traffic to one pod. Scaling to ten replicas changes nothing: the connection does not
move, and no new balancing decision is ever made. The same applies to any L4 hop — a cloud
network load balancer, kube-proxy in iptables or IPVS mode, a TCP proxy.

Two aggravating cases:

- **Scale-up delivers nothing.** New pods receive traffic only from connections created after
  they became ready. Existing clients hold existing connections, so a new pod can sit at
  approximately zero request rate while the fleet is overloaded.
- **A rollout redistributes wrongly.** When pods are replaced one at a time, every client
  displaced by pod 1 reconnects to whichever pods are ready at that instant. The result is a
  stable, lopsided assignment that persists until the next rollout.

## Proving it — the metric comparison

Compare two per-pod series over the same window:

```promql
# Requests actually served, per pod
sum by (pod) (rate(http_server_requests_seconds_count[5m]))

# Connections held, per pod (any established-connection gauge your stack exposes)
sum by (pod) (tomcat_connections_current)      # or the mesh/proxy's per-endpoint cx_active
```

The signature is **request rate skewed by multiples while connection counts are within a few
of each other** — or, in the extreme, one connection per client and one client dominating.
Ratios worth writing down:

- `max(request rate) / min(request rate)` across pods. Round-robin on cheap uniform requests
  sits near 1.1; the multiplexing failure shows 3–50.
- Request rate divided by connection count per pod. If that number varies by an order of
  magnitude, connections are not equivalent units of load, and connection balancing cannot
  work.

CPU per pod is a weaker signal in the same direction — it also moves for reasons unrelated to
routing, so use it as corroboration, not evidence.

## The four fixes

| Fix                                              | What it does                                                                             | What it costs                                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **L7 proxy in the path** (ingress, mesh sidecar) | Terminates HTTP/2, balances per request, and can retry and route on headers              | One extra hop of latency and CPU; a component to configure and operate; TLS termination decisions         |
| **Client-side balancing**                        | The client resolves all endpoints and picks per request; no extra hop                    | Every client needs discovery, a policy and health state — a polyglot or third-party caller cannot         |
| **Max connection age on the server**             | Server sends GOAWAY after an age; the client reconnects, re-resolves and lands elsewhere | Periodic reconnect cost, and connection storms unless the age is jittered; rebalancing is coarse and slow |
| **More connections per client**                  | Several connections per origin, so an L4 hop gets several decisions to make              | Approximate at best; a small client population still skews badly. A mitigation, not a fix                 |

Prefer the first two. Connection age is the right _supplement_ to either — it caps how long a
bad assignment can persist — and on its own it converts a permanent skew into a periodic one.

## The Java settings that matter

**gRPC client (grpc-java).** The default load-balancing policy is `pick_first`: it picks one
address and stays there. Per-request balancing requires both a resolver that returns every
endpoint and a policy that spreads across them.

```java
// Conceptual: client-side balancing needs all endpoints AND a spreading policy.
ManagedChannel channel = ManagedChannelBuilder
        .forTarget("dns:///payments-headless.svc.cluster.local:9090")  // headless: all pod IPs
        .defaultLoadBalancingPolicy("round_robin")                     // pick_first would pin
        .usePlaintext()
        .build();
```

- A **headless** Kubernetes Service (`clusterIP: None`) is what makes DNS return pod IPs
  rather than the single virtual IP. Pointing a `round_robin` policy at a normal ClusterIP
  resolves to one address and balances nothing.
- DNS is resolved and re-resolved by the channel, not once at startup, but re-resolution is
  driven by connection events. A membership change is picked up when connections churn — which
  is the argument for a max connection age even here.

**gRPC server (grpc-java, Netty transport).** `maxConnectionAge` with `maxConnectionAgeGrace`
makes the server issue GOAWAY after the age and then close after the grace period, so clients
reconnect through the balancer again. Jitter it across replicas, or every client reconnects
simultaneously.

**JDK `java.net.http.HttpClient`.** It negotiates HTTP/2 by default and pools connections per
origin. Its knobs are **idle** timeouts (system property `jdk.httpclient.keepalive.timeout`,
in seconds — verify the value and unit on your JDK), and an idle timeout never recycles a
_busy_ connection. There is no client-side maximum connection **age**: on a steadily loaded
HTTP/2 connection, nothing on the client side will ever move it. If you need recycling on this
client, it has to come from the server's GOAWAY or from an L7 hop.

**Spring's HTTP clients.** Whether you get HTTP/2 depends on the underlying client library and
its configuration; a stack that negotiates HTTP/1.1 with keep-alive has the milder version of
this problem, not none of it. Establish which protocol is actually in use before reasoning
about skew — check the negotiated protocol on a real connection rather than the configuration.

## Anti-patterns

- Putting gRPC behind a Kubernetes `ClusterIP` and treating the Service as a load balancer.
- Fixing skew by raising replica count. The connections do not move; the new pods stay idle
  and the bill grows.
- Enabling `sessionAffinity: ClientIP` to "make routing more predictable". It makes the
  pinning stronger and permanent.
- Adding a client-side retry to fix a hot replica. The retry rides the same pinned connection
  and lands on the same overloaded pod.
- Setting a max connection age with no jitter, so every client in the fleet reconnects on the
  same second.
