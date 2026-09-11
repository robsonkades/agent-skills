# Connection lifetime and why L4 pins load

Connection placement can concentrate application work without a transport error. Establish
the connection/work distribution before attributing a hot replica to this mechanism.

## The mechanism

For the TCP flow-balancing case, an L4 balancer selects a backend per **connection** to receive
the bytes. Once the connection exists, every byte on it goes to that backend for the connection's
lifetime.

- **HTTP/1.1 without keep-alive** — one request per connection, so request and connection
  counts align for that workload; equal counts still need not mean equal cost.
- **HTTP/1.1 with keep-alive** — a client's connection carries many sequential requests, so
  load follows per-connection work. Many independent connections can distribute that work
  adequately; an idle timeout does not recycle a connection that stays busy.
- **HTTP/2 and gRPC** — one connection can multiplex many concurrent streams, and clients often
  keep a small pool or one channel/subchannel connection for long periods. Ten thousand calls
  from one connection are one L4 balancing decision. Client policy, resolver and connection
  pool determine whether there are additional decisions.

So a gRPC client whose channel establishes one TCP connection to a Kubernetes `ClusterIP`
sends calls on that connection to one pod. Scaling replicas does not move an existing flow;
new connections may choose new endpoints. The same transport property applies to L4 data
planes regardless of iptables, IPVS, nftables, eBPF or cloud implementation.

Two aggravating cases:

- **Scale-up can deliver little during the observation window.** New pods receive traffic
  from new connections only when eligible under the actual policy. Existing clients may
  hold existing connections, so a new pod can sit at
  approximately zero request rate while the fleet is overloaded.
- **A rollout redistributes wrongly.** When pods are replaced one at a time, every client
  displaced by pod 1 reconnects to whichever endpoints are eligible at that instant. The result can be a
  lopsided assignment that persists until connections or placement change.

## Investigating it — the metric comparison

Compare two per-pod series over the same window and eligible pool. Restrict both to the target
workload and cluster; retain the actual namespace/cluster/endpoint identity labels. The metric
and label names below are illustrative, not a guarantee of what the deployed exporter emits:

```promql
# Requests actually served, per pod
sum by (cluster, namespace, pod) (rate(http_server_requests_seconds_count[5m]))

# Connections held, per pod (any established-connection gauge your stack exposes)
sum by (cluster, namespace, pod) (tomcat_connections_current) # or proxy per-endpoint cx_active
```

The signature is **request rate skewed by multiples while connection counts are within a few
of each other** — or, in the extreme, one connection per client and one client dominating.
Ratios worth writing down:

- Capacity-normalized max/median and top-endpoint work share across pods. Do not use a
  universal threshold or max/min when one new/idle pod has zero traffic.
- Request rate divided by connection count per pod. If that number varies by an order of
  magnitude, connections are not equivalent units of load. Confirm per-connection work,
  protocol, routing/locality and endpoint capacity before attributing skew to L4 placement.

CPU per pod is a weaker signal in the same direction — it also moves for reasons unrelated to
routing, so use it as corroboration, not proof of a routing cause.

## The four fixes

| Fix                                              | What it does                                                                          | What it costs                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **L7 proxy in the path** (ingress, mesh sidecar) | Terminates/parses HTTP/2 and can route new requests or streams                        | Possible extra hop/queue, CPU, failure domain and TLS/trust decisions; a streaming RPC remains one unit     |
| **Client-side balancing**                        | The client resolves eligible endpoints and picks per call; no extra hop               | Every participating client needs compatible discovery, policy and health support                            |
| **Max connection age on the server**             | Initiates connection replacement; client policy decides refresh and backend selection | Reconnect/stream interruption cost; jitter reduces synchronized churn, and the same backend may be selected |
| **More connections per client**                  | Several independent flows give an L4 hop more selection opportunities                 | More sockets/TLS state; balance depends on per-connection work, affinity and the eligible pool              |

Choose among these only when the current deployment misses its contract. L7 or client-side
balancing provides finer routing control when its policy/operational cost fits. Connection
age can initiate replacement for new work, but does not guarantee better placement or bound
the remaining stream lifetime, and can cause handshake storms. More connections or the
existing L4 deployment may be entirely adequate with independent work and measured balance.

## The Java settings that matter

**gRPC client (grpc-java).** The default load-balancing policy is `pick_first`: it uses a
reachable resolved address rather than spreading calls across all addresses. Per-call
balancing needs a resolver exposing the intended endpoint pool and a supported spreading
policy; that pool need not include every pod in the fleet.

```java
// Conceptual: discovery must expose the intended pool AND an effective spreading policy.
ManagedChannel channel = ManagedChannelBuilder
        .forTarget("dns:///payments-headless.svc.cluster.local:9090") // inspect published endpoints
        .defaultLoadBalancingPolicy("round_robin") // fallback; inspect service config/provider
        .usePlaintext() // only where transport security is supplied or explicitly unnecessary
        .build();
```

- For a selector-based **headless** Service (`clusterIP: None`), DNS can expose pod addresses
  rather than service virtual IPs. Inspect EndpointSlices, readiness and
  `publishNotReadyAddresses`: a published address is not proof of application readiness.
  A normal Service resolves service VIPs (potentially IPv4 and IPv6), not the pod pool;
  `round_robin` over those VIPs does not provide direct per-RPC pod selection.
- DNS refresh and re-resolution depend on grpc-java resolver, JVM DNS caching, service config
  and connectivity events. Verify endpoint-update latency experimentally; a headless record
  existing in DNS does not prove an established channel has adopted it.
- `defaultLoadBalancingPolicy` is a fallback; resolver-provided service config may override
  it. Verify effective policy/provider support. The application owns channel shutdown and
  bounded termination; do not create one channel per request.
- Locality and endpoint eligibility must be implemented by the actual resolver/client policy;
  bypassing a Service VIP with direct pod connections does not automatically reproduce that
  Service's proxy traffic policy. Verify the intended reachable/eligible pool on each path.

**gRPC server (grpc-java, transport-specific builder).** Maximum connection age/grace can
initiate graceful connection replacement (GOAWAY behavior is transport/protocol specific).
Verify reconnect, re-resolution and streaming-call behavior with the deployed version. Jitter
is normally built into or should surround fleet-wide age policy; avoid synchronized churn.
Age alone is not a total drain deadline: grace can allow existing RPCs to continue, while
finite grace can cancel unfinished RPCs.

**JDK `java.net.http.HttpClient`.** It prefers HTTP/2 by default, with negotiation/fallback
depending on the path, and pools connections per origin. Its knobs are **idle** timeouts
(system property `jdk.httpclient.keepalive.timeout`,
in seconds — verify the value and unit on your JDK), and an idle timeout never recycles a
_busy_ connection. The cited JDK 25 settings also expose an HTTP/2 idle-timeout override,
`jdk.httpclient.keepalive.timeout.h2`, but no maximum connection-age setting. Server GOAWAY or
an L7 hop can help; an application can also rotate an owned client with bounded overlap.
JDK 21+ provides client shutdown/termination APIs, but rotation must drain response bodies
and in-flight calls and cannot guarantee selection of a different backend. Measure reconnect
cost and avoid per-request client construction.

**Spring's HTTP clients.** Whether you get HTTP/2 depends on the underlying client library and
its configuration; a stack that negotiates HTTP/1.1 with keep-alive has the milder version of
this problem, not none of it. Establish which protocol is actually in use before reasoning
about skew — check the negotiated protocol on a real connection rather than the configuration.

## Anti-patterns

- Treating a Kubernetes `ClusterIP` as a per-RPC balancer merely because it carries gRPC.
- Assuming replica scale-up moves established flows or guarantees timely work distribution
  without new eligible connections.
- Enabling `sessionAffinity: ClientIP` to fix skew. It can preserve placement across new
  connections until affinity expiry or endpoint changes, making imbalance more persistent.
- Adding a client-side retry to fix a hot replica. The retry rides the same pinned connection
  unless the policy ejects/reselects a subchannel; it may also multiply unsafe effects.
- Setting a max connection age with no jitter, so every client in the fleet reconnects on the
  same second.

## Streaming and rollout edge cases

- A unary RPC is a routable L7 unit; a bidirectional stream lasting hours is one routing unit
  until reconnect. Weighted canaries therefore may see very different connection, stream and
  message shares.
- GOAWAY tells the peer to stop opening streams on that connection and identifies the last
  stream that might have been processed; streams above that boundary can be retried on a new connection.
  Existing streams do not migrate, and an unfinished stream at or below the boundary can
  have an ambiguous outcome. Let the client/protocol and operation contract decide retry;
  GOAWAY does not itself require DNS refresh or a different backend. Bound stream lifetime
  or design application-level resume when rollout requires it.
- Connection pooling across tenants can create unfairness and shared head-of-line/flow-control
  effects. Conversely per-tenant channels can exhaust sockets, TLS state and memory.
- Endpoint locality/zone routing intentionally creates unequal raw pod counts. Evaluate SLO,
  network cost and capacity within each eligible locality before calling it skew.

## Primary references

- [RFC 9113: HTTP/2 connection and stream model](https://www.rfc-editor.org/rfc/rfc9113)
- [gRPC load balancing](https://grpc.io/blog/grpc-load-balancing/)
- [grpc-java `ManagedChannelBuilder`](https://grpc.github.io/grpc-java/javadoc/io/grpc/ManagedChannelBuilder.html)
- [grpc-java 1.72 Netty server age/grace](https://github.com/grpc/grpc-java/blob/v1.72.0/netty/src/main/java/io/grpc/netty/NettyServerBuilder.java) — transport-specific jitter and grace behavior; inspect the deployed builder.
- [Kubernetes virtual IPs and service proxies](https://kubernetes.io/docs/reference/networking/virtual-ips/)
- [Kubernetes DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/) — address families, headless discovery and readiness publication.
- [Java 25 HttpClient](https://docs.oracle.com/en/java/javase/25/docs/api/java.net.http/java/net/http/HttpClient.html) — lifecycle APIs introduced in JDK 21.
- [Java 25 HTTP client properties](https://docs.oracle.com/en/java/javase/25/docs/api/java.net.http/module-summary.html) — idle timeout units and HTTP/2 override.
