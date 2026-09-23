---
name: grpc-http2-service-mesh-performance
description: >
  Diagnosing and designing the performance of gRPC and HTTP/2 communication paths, including
  channel, connection and stream topology, flow control, serialization, Netty event loops, TLS
  connection churn and service-mesh proxy cost. Use when multiplexed traffic is skewed or stalls,
  a channel pool or HTTP/2 setting is proposed, mesh overhead consumes a material latency or CPU
  budget, or retries exist in both client and proxy. API semantics belong to
  rpc-and-api-contracts; TCP behavior to tcp-tuning; routing ownership to
  load-balancing-and-routing.
---

# gRPC, HTTP/2 and Service-Mesh Performance

## Purpose

Separate four costs that are often reported as one: payload encoding, HTTP/2 transport, RPC
semantics, and proxy/mesh policy. A change in one layer does not prove that another improved.

## Investigation contract

Start with the required useful-completion, latency or resource outcome and the incident/optimization
decision. Reuse available contracts, configuration and measurements; ask only for unresolved facts
that change that decision. Select the evidence relevant to the affected path, and preserve an adequate
configuration when it already meets the goal. Missing evidence can justify a bounded next check.

Record relevant client/server/proxy versions, transport implementation, topology, request and
response sizes, unary/streaming shape, channel and connection counts, concurrent streams, flow-
control windows, TLS connection age, retries/hedges, offered and completed work, and per-hop
latency/CPU/memory. Preserve a direct-path control where possible.

Inspect the project's Java toolchain, resolved grpc-java/Netty artifacts (including shaded versus
unshaded transport), native TLS provider and deployed proxy version before naming knobs or defaults.
This skill has no executable Java baseline; protocol contracts do not authorize dependency/JDK
upgrades, and generic gRPC guidance does not establish a Java transport's exact behavior.

## Workflow

1. Draw `call -> channel -> transport connection -> HTTP/2 stream -> proxy hops -> backend`.
   Count each object; never use the terms interchangeably. A retry creates another attempt, which
   may fail locally before an HTTP/2 stream is allocated. A terminating proxy has separate
   downstream/upstream connections, settings and flow control.
2. Locate the limit: application admission, executor/event loop, stream concurrency, connection
   or stream window, socket/network, proxy, or backend.
3. Compare aligned per-hop evidence. A smaller Protobuf payload can reduce encoding and bytes but
   cannot establish that proxy policy or connection churn became cheaper.
4. Check effective configuration from protocol negotiation, runtime metrics or proxy config dump.
   A configuration key accepted by a framework or CRD is not evidence that it changed behavior.
5. When a change is justified, change one layer and validate useful completion, tail latency, errors,
   retries, CPU and memory. Preserve incident evidence without delaying necessary authorized mitigation.

## Decision rules

- Reuse long-lived channels by default. Create a pool only after one connection/event-loop path is
  shown to bottleneck or routing requires more independent connections; size it from evidence.
- Increasing maximum concurrent streams does not create connection flow-control credit, event-loop
  CPU or backend capacity. Identify which limit is binding first.
- Flow-control tuning follows bandwidth-delay product and observed stalls. Larger windows permit
  more outstanding DATA and can worsen overload; credit is not a measurement of allocated
  memory. Identify receiver, direction and hop before changing a window.
- A long-lived HTTP/2 connection through an L4 balancer can pin many calls to one backend. Route
  connection distribution to `load-balancing-and-routing`; adding streams to that connection does
  not rebalance it.
- Treat TLS handshake cost separately from steady-state record protection. Connection churn,
  certificate rotation and session resumption determine how often the expensive path occurs.
- Combine application and proxy retries into one attempt budget. For possibly committed effects,
  require actual repeat-safe conditional/idempotent protection or resolve the outcome authoritatively
  before reissuing; unresolved outcomes stay unknown. `idempotency` owns effect protection and
  `retries-and-backoff` owns retry policy.
- A mesh is justified by security and policy as well as latency. Measure its marginal cost and
  compare sidecar, node/ambient and direct paths without silently discarding required controls.

## Evidence and output

For a material recommendation report evidence, direct observation, inference, alternative
hypotheses, the predicted metric change and a rollback trigger. Missing direct-path or effective-
configuration evidence makes the verdict inconclusive, not favourable.
Scope that uncertainty: missing a direct control prevents causal mesh-overhead attribution, but
does not invalidate a directly observed exhausted window or executor queue. Continue independent
diagnosis. Compare end-to-end distributions; adding/subtracting per-hop p99 values does not
produce a request's critical-path latency.
Report the retained or changed policy, remaining uncertainty and what would change the decision.
Stop when the goal is supported or the next observation costs more than its decision value; a
supported no-change result does not require a tuning campaign.

## References

- [HTTP/2 and gRPC mechanics](references/http2-and-grpc.md) — read when diagnosing stream stalls,
  channel pools, flow control, deadline expiry or Netty execution.
- [Service-mesh cost and policy composition](references/service-mesh.md) — read when a proxy,
  mTLS, outlier detection or mesh retry participates in the path.
