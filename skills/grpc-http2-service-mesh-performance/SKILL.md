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

Record the exact client/server/proxy versions, transport implementation, topology, request and
response sizes, unary/streaming shape, channel and connection counts, concurrent streams, flow-
control windows, TLS connection age, retries/hedges, offered and completed work, and per-hop
latency/CPU/memory. Preserve a direct-path control where possible.

## Workflow

1. Draw `call -> channel -> transport connection -> HTTP/2 stream -> proxy hops -> backend`.
   Count each object; never use the terms interchangeably.
2. Locate the limit: application admission, executor/event loop, stream concurrency, connection
   or stream window, socket/network, proxy, or backend.
3. Compare aligned per-hop evidence. A smaller Protobuf payload can reduce encoding and bytes but
   cannot establish that proxy policy or connection churn became cheaper.
4. Check effective configuration from protocol negotiation, runtime metrics or proxy config dump.
   A configuration key accepted by a framework or CRD is not evidence that it changed behavior.
5. Change one layer and validate useful completion, tail latency, errors, retries, CPU and memory.

## Decision rules

- Reuse long-lived channels by default. Create a pool only after one connection/event-loop path is
  shown to bottleneck or routing requires more independent connections; size it from evidence.
- Increasing maximum concurrent streams does not create connection flow-control credit, event-loop
  CPU or backend capacity. Identify which limit is binding first.
- Flow-control tuning follows bandwidth-delay product and observed stalls. Larger windows consume
  memory per active stream/connection and can worsen overload.
- A long-lived HTTP/2 connection through an L4 balancer can pin many calls to one backend. Route
  connection distribution to `load-balancing-and-routing`; adding streams to that connection does
  not rebalance it.
- Treat TLS handshake cost separately from steady-state record protection. Connection churn,
  certificate rotation and session resumption determine how often the expensive path occurs.
- Combine application and proxy retries into one attempt budget. Never retry or hedge a possibly
  committed non-idempotent operation without a durable idempotency contract.
- A mesh is justified by security and policy as well as latency. Measure its marginal cost and
  compare sidecar, node/ambient and direct paths without silently discarding required controls.

## Evidence and output

For a material recommendation report evidence, direct observation, inference, alternative
hypotheses, the predicted metric change and a rollback trigger. Missing direct-path or effective-
configuration evidence makes the verdict inconclusive, not favourable.

## References

- [HTTP/2 and gRPC mechanics](references/http2-and-grpc.md) — read when diagnosing stream stalls,
  channel pools, flow control or Netty execution.
- [Service-mesh cost and policy composition](references/service-mesh.md) — read when a proxy,
  mTLS, outlier detection or mesh retry participates in the path.
